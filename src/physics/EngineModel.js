import { ENGINE_CONFIGS } from './EngineConfigurations.js';
import { EXHAUST_MODELS } from '../audio/ExhaustModels.js';

export const PHYSICS_STEP = 1 / 240;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const RPM_PER_RAD = 60 / (2 * Math.PI);

// Illustrative torque curves, not measured dyno data. Telemetry and wheel forces
// use the same calculation, including fuel cuts and internal losses.
export class EngineModel {
  constructor(configId = 'i4_flat', exhaustId = 'akrapovic', random = Math.random) {
    this.random = random;
    this.exhaust = EXHAUST_MODELS[exhaustId] || EXHAUST_MODELS.akrapovic;
    this.isIgnitionOn = false;
    this.rpm = 0;
    this.crankAngle = 0;
    this.rodToCrankRatio = 3.5;
    this.exhaustHeat = 0;
    this.time = 0;
    this.eventId = 0;
    this.setConfig(configId);
  }

  resetCombustion() {
    this.throttle = 0;
    this.manifoldThrottle = 0;
    this.prevThrottle = 0;
    this.overrunTime = 0;
    this.overrunLoad = 0;
    this.popEvents = [];
    this.isRevLimiting = false;
    this.isRevLimitingCut = false;
    this.revLimiterBounceTimer = 0;
    this.netTorque = 0;
    this.combustionTorque = 0;
    this.currentEngineDrag = 0;
  }

  setRunning(running) {
    this.isIgnitionOn = Boolean(running);
    this.resetCombustion();
    if (running) this.rpm = Math.max(this.rpm, this.idleRPM);
    for (const cyl of this.cylinderStates) {
      cyl.isFiring = false;
      cyl.sparkTimer = 0;
    }
  }

  setConfig(configId) {
    this.config = ENGINE_CONFIGS[configId] || ENGINE_CONFIGS.i4_flat;
    this.displacement = this.config.defaultDisplacement;
    this.idleRPM = this.config.defaultIdleRPM;
    this.redlineRPM = this.config.defaultRedlineRPM;
    this.rpm = this.isIgnitionOn ? this.idleRPM : 0;
    this.resetCombustion();
    this.cylinderStates = this.config.firingAngles.map((firingOffset, index) => ({
      index, firingOffset, phaseAngle: 0, stroke: 'intake', pistonPos: 0,
      isFiring: false, sparkTimer: 0, intakeValve: 0, exhaustValve: 0,
      gasPressure: 1.0, blowdownPulse: 0, gasTorque: 0
    }));
    this.dynoData = this.calculateDynoCurve();
  }

  setExhaust(id) {
    if (!EXHAUST_MODELS[id]) return;
    this.exhaust = EXHAUST_MODELS[id];
    this.dynoData = this.calculateDynoCurve();
  }

  setDisplacement(value) {
    if (!Number.isFinite(Number(value))) return;
    this.displacement = clamp(Number(value), this.config.minDisplacement, this.config.maxDisplacement);
    this.dynoData = this.calculateDynoCurve();
  }

  setRedlineRPM(value) {
    if (!Number.isFinite(Number(value))) return;
    this.redlineRPM = clamp(Number(value), 3000, 20000);
    this.idleRPM = Math.min(this.idleRPM, this.redlineRPM - 1000);
    this.dynoData = this.calculateDynoCurve();
  }

  get inertia() {
    // Crank, flywheel and connected accessories, in kg m². Throttle response
    // changes manifold filling, not the physical inertia of the crankshaft.
    return this.config.flywheelInertia + 0.025 + this.displacement / 1000 * 0.045;
  }

  torqueAtRPM(rpm) {
    const peak = this.displacement / 1000 * 102 * this.exhaust.backpressureTorqueMod;
    const fraction = Math.max(0, rpm) / this.redlineRPM;
    const breathing = 0.56 + 0.44 * Math.exp(-0.5 * ((fraction - 0.65) / 0.32) ** 2);
    // Blend exhaust tuning continuously; a threshold here used to make torque
    // jump as the engine crossed 65% of redline.
    const blend = clamp((fraction - 0.45) / 0.35, 0, 1);
    const topEnd = 1 + (this.exhaust.backpressureHpMod - 1) * blend * blend * (3 - 2 * blend);
    return peak * breathing * topEnd;
  }

  calculateDynoCurve() {
    const points = [];
    for (let rpm = 500; rpm <= this.redlineRPM; rpm += 250) {
      const torque = this.torqueAtRPM(rpm);
      points.push({ rpm, torque, hp: torque * rpm / 7127 });
    }
    const torquePeak = points.reduce((a, b) => b.torque > a.torque ? b : a);
    const hpPeak = points.reduce((a, b) => b.hp > a.hp ? b : a);
    return { points, maxTorque: Math.round(torquePeak.torque), maxTorqueRPM: torquePeak.rpm,
      maxHp: Math.round(hpPeak.hp), maxHpRPM: hpPeak.rpm };
  }

  getCurrentDynoOutput() {
    const torque = this.isIgnitionOn ? Math.max(0, this.netTorque) : 0;
    return { torque: Math.round(torque), hp: Math.round(torque * this.rpm / 7127),
      maxHp: this.dynoData.maxHp, maxTorque: this.dynoData.maxTorque };
  }

  createPop(kind, intensity = 1) {
    if (!this.isIgnitionOn || this.exhaust.id === 'oem') return;
    const rpmEnergy = clamp((this.rpm - this.idleRPM) / (this.redlineRPM - this.idleRPM), 0, 1);
    const loadEnergy = kind === 'shift'
      ? Math.max(0.7, this.manifoldThrottle, this.prevThrottle)
      : Math.max(this.manifoldThrottle, this.overrunLoad);
    const strength = intensity * this.exhaust.popIntensity
      * (0.35 + 0.65 * rpmEnergy) * (0.55 + 0.45 * loadEnergy);
    const flameChance = kind === 'shift'
      ? this.exhaust.flameSpitChance * (0.6 + 0.4 * rpmEnergy)
      : this.exhaust.flameSpitChance * (0.3 + 0.7 * rpmEnergy);
    this.popEvents.push({ id: ++this.eventId, timestamp: this.time,
      intensity: strength, exhaustId: this.exhaust.id,
      flameIntensity: strength * this.exhaust.flameScale * (kind === 'shift' ? 1.3 : 1),
      flameDuration: this.exhaust.flameDuration * (kind === 'shift' ? 1.15 : 1),
      hasFlame: this.random() < flameChance,
      isLimiterPop: kind === 'limiter', kind });
  }

  // Compute combustion before the drivetrain uses its torque in this substep.
  prepareStep(dt, throttleInput, { torqueScale = 1, idleLoad = 0 } = {}) {
    this.time += dt;
    this.popEvents = [];
    this.throttle = this.isIgnitionOn ? clamp(throttleInput, 0, 1) : 0;
    const fillRate = this.throttle >= this.manifoldThrottle ? 8 + this.config.revResponseSpeed * 2 : 18;
    this.manifoldThrottle += (this.throttle - this.manifoldThrottle) * (1 - Math.exp(-dt * fillRate));
    if (this.isIgnitionOn && this.prevThrottle - this.throttle > 0.3 && this.rpm > this.idleRPM * 2.2) {
      this.overrunTime = this.exhaust.overrunDuration;
      this.overrunLoad = this.manifoldThrottle;
      if (this.random() < this.exhaust.popChance) this.createPop('overrun', 1.15);
    }
    this.prevThrottle = this.throttle;
    if (this.overrunTime > 0) {
      this.overrunTime = Math.max(0, this.overrunTime - dt);
      if (this.throttle < 0.1 && this.random() < 1 - Math.exp(-this.exhaust.crackleRate * dt)) {
        this.createPop('overrun', (0.55 + this.random() * 0.45)
          * (0.4 + 0.6 * this.overrunTime / this.exhaust.overrunDuration));
      }
    } else this.overrunLoad = 0;
    if (!this.isIgnitionOn || this.throttle < 0.15 || this.rpm < this.redlineRPM * 0.88) {
      this.isRevLimiting = false;
      this.revLimiterBounceTimer = 0;
    } else if (this.rpm >= this.redlineRPM) {
      this.isRevLimiting = true;
    }
    let cyclicCut = false;
    if (this.isRevLimiting) {
      const previousCycle = Math.floor(this.revLimiterBounceTimer * 18);
      this.revLimiterBounceTimer += dt;
      if (Math.floor(this.revLimiterBounceTimer * 18) > previousCycle) this.createPop('limiter', 0.85);
      cyclicCut = (this.revLimiterBounceTimer * 18) % 1 < 0.58;
    }
    this.isRevLimitingCut = this.isIgnitionOn && (cyclicCut || this.rpm >= this.redlineRPM);
    const liters = this.displacement / 1000;
    const rpmFraction = this.rpm / this.redlineRPM;
    const friction = 4 + 13 * rpmFraction;
    const pumping = (1 - this.manifoldThrottle) * (5 + 15 * rpmFraction);
    this.currentEngineDrag = liters * (friction + pumping)
      * this.config.engineBrakeFactor * Math.min(1, this.rpm / 300);
    const drag = this.currentEngineDrag;
    const available = this.torqueAtRPM(this.rpm);
    this.combustionTorque = this.isIgnitionOn && !this.isRevLimitingCut
      ? (available + drag) * this.manifoldThrottle * torqueScale : 0;
    let idleTorque = 0;
    if (this.isIgnitionOn && !this.isRevLimitingCut && this.rpm < this.idleRPM + 100) {
      idleTorque = Math.max(0, drag + idleLoad - this.combustionTorque
        + (this.idleRPM - this.rpm) * this.inertia * 12 / RPM_PER_RAD);
    }
    this.netTorque = this.combustionTorque + idleTorque - drag;
  }

  advanceStep(dt, { coupledRPM, loadTorque = 0 } = {}) {
    if (Number.isFinite(coupledRPM)) this.rpm = Math.max(0, coupledRPM);
    else {
      this.rpm = Math.max(0, this.rpm + (this.netTorque - loadTorque) / this.inertia * RPM_PER_RAD * dt);
      if (!this.isIgnitionOn && this.rpm < 20) this.rpm = 0;
    }
    // Never independently clamp coupled RPM: it must match road speed and gear.
    const deltaDeg = this.rpm * 6 * dt;
    const previousAngle = this.crankAngle;
    this.crankAngle = (this.crankAngle + deltaDeg) % 720;
    let maxP = 1.0;
    const rc = 10.5;
    const Vc = 1 / (rc - 1);
    const manifoldP = 0.25 + 0.75 * this.manifoldThrottle;
    this.manifoldPressure = manifoldP.toFixed(2);

    for (const cyl of this.cylinderStates) {
      const angle = (this.crankAngle + cyl.firingOffset) % 720;
      const previous = (previousAngle + cyl.firingOffset) % 720;
      cyl.phaseAngle = angle;
      cyl.stroke = ['intake', 'compression', 'power', 'exhaust'][Math.floor(angle / 180)];
      cyl.intakeValve = angle < 180 ? Math.sin(angle / 180 * Math.PI) : 0;
      cyl.exhaustValve = angle >= 540 ? Math.sin((angle - 540) / 180 * Math.PI) : 0;
      const crossesSpark = Math.floor((previous + deltaDeg - 360) / 720) > Math.floor((previous - 360) / 720);
      cyl.sparkTimer = crossesSpark && this.isIgnitionOn && !this.isRevLimitingCut
        ? 0.04 : Math.max(0, cyl.sparkTimer - dt);
      cyl.isFiring = cyl.sparkTimer > 0;
      const rad = angle * Math.PI / 180;
      const l = this.rodToCrankRatio;
      cyl.pistonPos = (1 + l - Math.cos(rad) - Math.sqrt(l * l - Math.sin(rad) ** 2)) / 2;

      // Thermodynamic gas pressure PV^gamma & combustion heat release
      const V = Vc + cyl.pistonPos;
      let pCyl = 1.0;
      if (angle < 180) {
        pCyl = manifoldP;
      } else if (angle < 360) {
        pCyl = manifoldP * Math.pow((Vc + 1) / V, 1.33);
      } else if (angle < 540) {
        const sparkBoost = (this.isIgnitionOn && !this.isRevLimitingCut) ? (2.8 + 2.2 * this.manifoldThrottle) : 1.0;
        const pPeakTdc = manifoldP * Math.pow((Vc + 1) / Vc, 1.33) * sparkBoost;
        pCyl = pPeakTdc * Math.pow(Vc / V, 1.28);
      } else {
        const blowdownDecay = Math.exp(-(angle - 540) / 45);
        pCyl = 1.05 + 4.5 * blowdownDecay * Math.max(0.2, this.manifoldThrottle);
      }

      cyl.gasPressure = Number(pCyl.toFixed(1));
      cyl.blowdownPulse = Math.max(0, pCyl - 1.0) * cyl.exhaustValve;
      if (pCyl > maxP) maxP = pCyl;

      // Instantaneous crank geometric lever arm (piston force to crank torque)
      const lambda = 1 / this.rodToCrankRatio;
      const sinA = Math.sin(rad);
      const leverArm = sinA + (lambda * Math.sin(2 * rad)) / (2 * Math.sqrt(Math.max(0.01, 1 - lambda * lambda * sinA * sinA)));
      cyl.gasTorque = Number(((pCyl - 1.013) * (this.displacement / 1000 / this.cylinderStates.length) * 8.5 * leverArm).toFixed(1));
    }
    this.peakCylinderPressure = maxP.toFixed(1);

    const heatTarget = this.isIgnitionOn ? 0.1 + Math.min(1, this.rpm / this.redlineRPM) * 0.7 + this.manifoldThrottle * 0.2 : 0;
    this.exhaustHeat += (heatTarget - this.exhaustHeat) * (1 - Math.exp(-dt * 0.5));
  }

  snapshot(popEvents = this.popEvents) {
    return { rpm: this.rpm, redlineRPM: this.redlineRPM, idleRPM: this.idleRPM,
      isIgnitionOn: this.isIgnitionOn, crankAngle: this.crankAngle, throttle: this.throttle,
      manifoldThrottle: this.manifoldThrottle, dyno: this.getCurrentDynoOutput(),
      cylinderStates: this.cylinderStates, isRevLimiting: this.isRevLimiting,
      isRevLimitingCut: this.isRevLimitingCut, exhaustHeat: this.exhaustHeat, popEvents,
      manifoldPressure: this.manifoldPressure || (1.0).toFixed(2),
      peakCylinderPressure: this.peakCylinderPressure || (1.0).toFixed(1) };
  }
}
