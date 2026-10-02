import { ENGINE_CONFIGS } from './EngineConfigurations.js';
import { EXHAUST_MODELS } from '../audio/ExhaustModels.js';
import { InductionModel, ATMOSPHERE, chargeThermodynamics, steadyBoost } from './InductionModel.js';

export const PHYSICS_STEP = 1 / 240;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const RPM_PER_RAD = 60 / (2 * Math.PI);
const HP_RPM_PER_NM = 7120.91;

// Monotone cubic interpolation keeps factory peak anchors while avoiding a
// torque step (or overshoot) at a hand-estimated intermediate dyno point.
export function interpolateTorque(points, rpm) {
  if (rpm <= points[0][0]) return points[0][1] * clamp(rpm / points[0][0], 0, 1);
  const last = points.at(-1);
  if (rpm >= last[0]) return last[1] * Math.exp(-(rpm - last[0]) / Math.max(600, last[0] * 0.17));
  const slope = i => (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]);
  const tangent = i => {
    if (i === 0) return slope(0);
    if (i === points.length - 1) return slope(i - 1);
    const a = slope(i - 1), b = slope(i);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  };
  const index = points.findIndex((p, i) => i > 0 && p[0] >= rpm) - 1;
  const a = points[index], b = points[index + 1], width = b[0] - a[0];
  const t = (rpm - a[0]) / width;
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] + (t ** 3 - 2 * t ** 2 + t) * width * tangent(index)
    + (-2 * t ** 3 + 3 * t ** 2) * b[1] + (t ** 3 - t ** 2) * width * tangent(index + 1);
}

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

  resetCombustion(resetInduction = true) {
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
    this.lastBovTime = 0;
    this.prevTorqueScale = 1;
    this.torqueScale = 1;
    this.ignitionCut = false;
    this.bovEvents = [];
    if (resetInduction) {
      this.induction?.reset();
      this.boostPressure = this.turboSpool = this.superchargerSpool = 0;
      this.turboRPM = this.superchargerRPM = 0;
      this.manifoldPressure = '1.01';
    }
  }

  setRunning(running) {
    this.isIgnitionOn = Boolean(running);
    this.resetCombustion(false);
    if (!running) this.boostPressure = 0;
    if (running) this.rpm = Math.max(this.rpm, this.idleRPM);
    for (const cyl of this.cylinderStates) {
      cyl.isFiring = false;
      cyl.sparkTimer = 0;
    }
  }

  setConfig(configId) {
    this.config = ENGINE_CONFIGS[configId] || ENGINE_CONFIGS.i4_flat;
    this.powerPoints = this.config.torquePoints?.map(([rpm, torque]) => [rpm, torque * rpm]);
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

    // Forced Induction (NA, Turbo, Supercharger)
    this.forcedInduction = this.config.defaultInduction || 'na';
    this.maxBoost = this.config.defaultBoost || 0.8;
    this.turboSize = this.config.defaultTurboSize || 'small';
    this.induction = new InductionModel();
    this.boostPressure = 0; // current gauge boost pressure in bar
    this.turboSpool = 0; // 0 to 1
    this.superchargerSpool = 0;
    this.bovType = 'bov'; // Stock pressure relief; no-valve surge is a separate modification.
    this.bovEvents = [];

    this.dynoData = this.calculateDynoCurve();
  }

  setForcedInduction(type) {
    if (['na', 'turbo', 'supercharger'].includes(type)) {
      this.forcedInduction = type;
      this.induction.reset();
      this.boostPressure = this.turboSpool = this.superchargerSpool = 0;
      this.turboRPM = this.superchargerRPM = 0;
      this.bovEvents = [];
      this.manifoldPressure = '1.01';
      this.dynoData = this.calculateDynoCurve();
    }
  }

  setTurboSize(size) {
    if (!['small', 'large'].includes(size)) return;
    this.turboSize = size;
    this.induction.reset();
    this.boostPressure = this.turboSpool = this.superchargerSpool = 0;
    this.turboRPM = this.superchargerRPM = 0;
    this.bovEvents = [];
    this.manifoldPressure = '1.01';
    this.dynoData = this.calculateDynoCurve();
  }

  setMaxBoost(val) {
    if (Number.isFinite(Number(val))) {
      this.maxBoost = clamp(Number(val), 0.3, 3.0);
      this.dynoData = this.calculateDynoCurve();
    }
  }

  setBovType(type) {
    if (['bov', 'flutter'].includes(type)) {
      this.bovType = type;
    }
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
    this.redlineRPM = clamp(Number(value), this.config.minRedlineRPM || 2500, this.config.maxRedlineRPM || 18000);
    this.idleRPM = Math.min(this.idleRPM, this.redlineRPM - 1000);
    this.dynoData = this.calculateDynoCurve();
  }

  get inertia() {
    // Crank, flywheel and connected accessories, in kg m².
    // Small displacement engines have lightweight reciprocating mass and snap up quickly.
    // Large displacement engines have heavy pistons, massive counterweights, and heavy flywheels.
    const liters = this.displacement / 1000;
    const motorcycle = this.config.cylinders <= 4 && this.config.layout !== 'radial';
    const crank = motorcycle ? this.config.flywheelInertia * 0.30 + 0.004
      : this.config.flywheelInertia + 0.02;
    const reciprocating = Math.pow(liters, 1.1) * (motorcycle ? 0.009 : this.config.layout === 'radial' ? 0.055 : 0.024);
    return crank + reciprocating + (this.forcedInduction === 'supercharger' ? liters * 0.004 : 0);
  }

  torqueAtRPM(rpm) {
    if (this.config.torquePoints) {
      // Interpolating torque alone can invent a higher horsepower peak between
      // OEM anchors. Bound it with the independently monotone power curve;
      // both preserve the published torque and power points without rescaling.
      let torque = Math.min(interpolateTorque(this.config.torquePoints, rpm),
        interpolateTorque(this.powerPoints, rpm) / Math.max(1, rpm));
      const stockType = this.config.defaultInduction || 'na';
      const stockBoost = steadyBoost(this.config, stockType, this.config.defaultTurboSize || 'small',
        this.config.calibrationBoost ?? this.config.defaultBoost ?? 0, rpm);
      const thermo = chargeThermodynamics(stockBoost, stockType === 'supercharger' ? 0.68 : 0.72);
      // Published torque is already boosted. Recover an underlying naturally
      // aspirated curve before applying a user's actual dynamic induction state.
      const stockSC = stockType === 'supercharger'
        ? this.compressorTorque(rpm, this.config.defaultDisplacement, stockBoost) : 0;
      torque = (torque + stockSC) / Math.max(1, thermo.densityRatio - (stockType === 'turbo' ? stockBoost * 0.018 : 0));
      const fraction = rpm / (this.config.ratedPowerRPM || this.config.defaultRedlineRPM * 0.92);
      const blend = clamp((fraction - 0.4) / 0.55, 0, 1);
      const tuning = this.exhaust.backpressureTorqueMod
        + (this.exhaust.backpressureHpMod - this.exhaust.backpressureTorqueMod) * blend * blend * (3 - 2 * blend);
      return Math.max(0, torque * (this.displacement / this.config.defaultDisplacement) * tuning);
    }
    const specificTorque = (this.config && this.config.specificTorque) || 108;
    const peak = (this.displacement / 1000) * specificTorque * this.exhaust.backpressureTorqueMod;
    const fraction = Math.max(0, rpm) / this.redlineRPM;
    const peakRatio = (this.config && this.config.peakTorqueRpmRatio) || 0.65;
    const spread = (this.config && this.config.torqueSpread) || 0.32;
    const breathing = 0.56 + 0.44 * Math.exp(-0.5 * ((fraction - peakRatio) / spread) ** 2);
    // Blend exhaust tuning continuously; a threshold here used to make torque
    // jump as the engine crossed 65% of redline.
    const blend = clamp((fraction - 0.45) / 0.35, 0, 1);
    const topEnd = 1 + (this.exhaust.backpressureHpMod - 1) * blend * blend * (3 - 2 * blend);
    return peak * breathing * topEnd;
  }

  compressorTorque(rpm, displacement, boost) {
    const thermo = chargeThermodynamics(boost, 0.68);
    const flow = displacement / 1e6 * rpm / 120 * 0.9
      * (ATMOSPHERE + boost * 100000) / (287.05 * thermo.intakeTemperature);
    return flow * thermo.specificWork / Math.max(20, rpm / RPM_PER_RAD) / 0.94
      + displacement / 1000 * 0.65 * rpm / Math.max(1000, this.config.ratedPowerRPM || this.config.defaultRedlineRPM * 0.92);
  }

  steadyTorqueAtRPM(rpm) {
    const boost = steadyBoost(this.config, this.forcedInduction, this.turboSize, this.maxBoost, rpm, this.displacement);
    const thermo = chargeThermodynamics(boost, this.forcedInduction === 'supercharger' ? 0.68 : 0.72);
    const base = this.torqueAtRPM(rpm);
    return Math.max(0, base * (thermo.densityRatio - (this.forcedInduction === 'turbo' ? boost * 0.018 : 0))
      - (this.forcedInduction === 'supercharger' ? this.compressorTorque(rpm, this.displacement, boost) : 0));
  }

  calculateDynoCurve() {
    const points = [];
    const sampleRPMs = new Set([this.redlineRPM]);
    for (let rpm = 500; rpm <= this.redlineRPM; rpm += 100) sampleRPMs.add(rpm);
    for (const [rpm] of this.config.torquePoints || []) if (rpm >= 500 && rpm <= this.redlineRPM) sampleRPMs.add(rpm);
    for (const rpm of [...sampleRPMs].sort((a, b) => a - b)) {
      const torque = this.steadyTorqueAtRPM(rpm);
      points.push({ rpm, torque, hp: torque * rpm / HP_RPM_PER_NM });
    }
    const torquePeak = points.reduce((a, b) => b.torque > a.torque ? b : a);
    const hpPeak = points.reduce((a, b) => b.hp > a.hp ? b : a);
    return { points, maxTorque: Math.round(torquePeak.torque), maxTorqueRPM: torquePeak.rpm,
      maxHp: Math.round(hpPeak.hp), maxHpRPM: hpPeak.rpm };
  }

  getCurrentDynoOutput() {
    const torque = this.isIgnitionOn ? Math.max(0, this.netTorque) : 0;
    return { torque: Math.round(torque), hp: Math.round(torque * this.rpm / HP_RPM_PER_NM),
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

    // Calculate throttle release drop for overrun crackles and BOV / Flutter
    const throttleDrop = this.prevThrottle - this.throttle;

    if (this.isIgnitionOn && throttleDrop > 0.25 && this.rpm > this.idleRPM * 2.2) {
      this.overrunTime = this.exhaust.overrunDuration;
      this.overrunLoad = this.manifoldThrottle;
      if (this.random() < this.exhaust.popChance) this.createPop('overrun', 1.15);
    }
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
    const rpmFraction = this.rpm / this.config.defaultRedlineRPM;
    const friction = 4 + 13 * rpmFraction;
    const pumping = (1 - this.manifoldThrottle) * (5 + 15 * rpmFraction);
    this.currentEngineDrag = liters * (friction + pumping)
      * this.config.engineBrakeFactor * Math.min(1, this.rpm / 300);
    const drag = this.currentEngineDrag;

    this.torqueScale = clamp(torqueScale, 0, 1);
    this.ignitionCut = this.isRevLimitingCut || this.torqueScale < 0.12;
    const baseTorque = this.torqueAtRPM(this.rpm);
    const induction = this.induction.update(dt, {
      config: this.config, type: this.forcedInduction, size: this.turboSize,
      maxBoost: this.maxBoost, displacement: this.displacement, rpm: this.rpm,
      throttle: this.manifoldThrottle, pedalThrottle: this.throttle,
      torqueScale: this.isRevLimitingCut ? 0 : this.torqueScale,
      running: this.isIgnitionOn,
      baseTorque: baseTorque * chargeThermodynamics(this.induction.chargeBoost).densityRatio,
      bovType: this.bovType, time: this.time
    });
    this.bovEvents = induction.events;
    this.boostPressure = induction.boostPressure;
    this.turboRPM = this.induction.turboRPM;
    this.superchargerRPM = this.induction.superchargerRPM;
    this.turboSpool = clamp(this.turboRPM / (this.turboSize === 'large' ? 145000 : 190000), 0, 1);
    this.superchargerSpool = clamp(this.superchargerRPM / 24000, 0, 1);
    this.prevThrottle = this.throttle;
    this.prevTorqueScale = this.torqueScale;
    const boostLoss = this.forcedInduction === 'turbo' ? this.induction.chargeBoost * 0.018 : 0;
    const available = baseTorque * (induction.densityRatio - boostLoss);
    this.combustionTorque = this.isIgnitionOn && !this.isRevLimitingCut
      ? (available + drag) * this.manifoldThrottle * this.torqueScale : 0;
    this.currentEngineDrag += induction.shaftTorque;
    let idleTorque = 0;
    if (this.isIgnitionOn && !this.isRevLimitingCut && this.rpm < this.idleRPM + 100) {
      // Idle control admits additional air to carry accessory / clutch load,
      // but cannot produce more than the engine's full available torque.
      idleTorque = clamp(this.currentEngineDrag + idleLoad - this.combustionTorque
        + (this.idleRPM - this.rpm) * this.inertia * 12 / RPM_PER_RAD,
      0, Math.max(0, available + drag - this.combustionTorque));
    }
    this.netTorque = this.combustionTorque + idleTorque - this.currentEngineDrag;
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
    const manifoldP = this.induction.intakePressure / 100000;
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
        && !this.ignitionCut ? 0.04 : Math.max(0, cyl.sparkTimer - dt);
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
        const sparkBoost = (this.isIgnitionOn && !this.ignitionCut) ? (1 + (1.8 + 2.2 * this.manifoldThrottle) * this.torqueScale) : 1.0;
        const pPeakTdc = manifoldP * Math.pow((Vc + 1) / Vc, 1.33) * sparkBoost;
        pCyl = pPeakTdc * Math.pow(Vc / V, 1.28);
      } else {
        const blowdownDecay = Math.exp(-(angle - 540) / 45);
        pCyl = 1.05 + 4.5 * blowdownDecay * Math.max(0.2, this.manifoldThrottle);
      }
      // A stopped engine cannot indefinitely retain the schematic compression
      // peak calculated at a frozen crank angle; pressures settle to ambient.
      if (this.rpm < 1) pCyl = manifoldP;

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

  snapshot(popEvents = this.popEvents, bovEvents = this.bovEvents) {
    return { rpm: this.rpm, redlineRPM: this.redlineRPM, idleRPM: this.idleRPM,
      simTime: this.time, torqueScale: this.torqueScale, ignitionCut: this.ignitionCut,
      turboSize: this.turboSize, turboRPM: this.induction.turboRPM, superchargerRPM: this.induction.superchargerRPM,
      chargePressure: this.induction.chargePressure, intakePressure: this.induction.intakePressure,
      airFlow: this.induction.airFlow, exhaustEnergy: this.induction.exhaustEnergy,
      inductionLoad: this.manifoldThrottle, bypassOpening: this.induction.bypassOpening,
      displacement: this.displacement,
      forcedInduction: this.forcedInduction,
      boostPressure: Number(this.boostPressure.toFixed(2)),
      turboSpool: Number(this.turboSpool.toFixed(2)),
      bovType: this.bovType,
      bovEvents,
      isIgnitionOn: this.isIgnitionOn, crankAngle: this.crankAngle, throttle: this.throttle,
      manifoldThrottle: this.manifoldThrottle, dyno: this.getCurrentDynoOutput(),
      cylinderStates: this.cylinderStates, isRevLimiting: this.isRevLimiting,
      isRevLimitingCut: this.isRevLimitingCut, exhaustHeat: this.exhaustHeat, popEvents,
      manifoldPressure: this.manifoldPressure || (1.0).toFixed(2),
      peakCylinderPressure: this.peakCylinderPressure || (1.0).toFixed(1) };
  }
}
