import { PHYSICS_STEP } from './EngineModel.js';
import { VEHICLE_PROFILES, converterCharacteristics } from './VehicleProfiles.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const smoothstep = v => v * v * (3 - 2 * v);
const RPM_PER_RAD = 60 / (2 * Math.PI);

export class Drivetrain {
  constructor(engine) {
    this.engine = engine;
    this.mode = 'at';
    this.currentGear = 0;
    this.atSelector = 'N';
    this.gearRatios = { '-1': -3.2, 0: 0, 1: 3.5, 2: 2.15, 3: 1.5, 4: 1.15, 5: 0.9, 6: 0.74 };
    this.finalDrive = 3.65;
    this.tireRadius = 0.33;
    this.configureVehicle();
    this.speedKmh = 0; // Signed road velocity: reverse is negative.
    this.brakeInput = 0;
    this.accumulator = 0;
    this.atShiftCooldown = 0;
    this.lastShiftMessage = '';
    this.resetShift();
  }

  configureVehicle() {
    const profile = VEHICLE_PROFILES[this.engine.config.id] || VEHICLE_PROFILES.i4_flat;
    this.vehicleMass = profile.mass;
    this.dragArea = profile.dragArea;
    this.tireRadius = profile.tireRadius || 0.33;
    this.finalDrive = profile.finalDrive || 3.65;
    this.primaryRatio = profile.primaryRatio || 1;
    this.driveEfficiency = profile.driveEfficiency || (this.engine.config.layout === "radial" ? 0.94 : profile.mass < 500 ? 0.965 : 0.94);
    this.vehicleProfile = profile;
    this.gearRatios = { ...profile.gearRatios };
    this.maxGear = Math.max(...Object.keys(this.gearRatios).map(Number).filter(g => g > 0));
    this.tireCircumference = 2 * Math.PI * this.tireRadius;
  }

  setVehicleMass(value) {
    if (Number.isFinite(Number(value))) this.vehicleMass = clamp(Number(value), 180, 3000);
  }

  resetShift() {
    this.shiftState = 'idle';
    this.shiftTimer = 0;
    this.shiftDuration = 0;
    this.targetGear = this.currentGear;
    this.clutchEngagement = 0;
    this.shiftEnvelope = 0;
    this.shiftPopPending = false;
    this.clutchCapacity = 0;
    this.lockup = 0;
    this.pumpTorque = 0;
    this.transmittedTorque = 0;
    this.shiftElapsed = 0;
    this.shiftRecovery = 0;
    this.shiftPhase = "idle";
    this.cutAmount = 0;
    this.isUpshift = false;
  }

  reject(message) {
    this.lastShiftMessage = message;
    return false;
  }

  calcRPMFromSpeed(gear, speedKmh) {
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive * this.primaryRatio);
    return Math.abs(speedKmh) / 3.6 / this.tireCircumference * 60 * ratio;
  }

  calcSpeedFromRPM(gear, rpm) {
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive * this.primaryRatio);
    return ratio ? rpm / ratio * this.tireCircumference / 60 * 3.6 : 0;
  }

  setMode(mode) {
    if (!['at', 'amt'].includes(mode)) return false;
    if (mode === this.mode) return true;
    this.mode = mode;
    this.currentGear = 0;
    this.atSelector = 'N';
    this.resetShift();
    this.lastShiftMessage = '';
    return true;
  }

  canSelectGear(gear) {
    if (!Number.isInteger(gear) || gear < -1 || gear > this.maxGear) return this.reject('無效檔位');
    if (gear === 0) return true;
    if (!this.gearRatios[gear]) return this.reject('此車型沒有倒檔');
    if ((gear < 0 && this.speedKmh > 1) || (gear > 0 && this.speedKmh < -1)) {
      return this.reject('請先煞停，再切換前進／倒檔');
    }
    if (this.calcRPMFromSpeed(gear, this.speedKmh) > this.engine.redlineRPM * 0.98) {
      return this.reject('此檔位會超轉，請先減速或選擇較高檔位');
    }
    return true;
  }

  setAtSelector(position) {
    if (this.mode !== 'at' || !['P', 'R', 'N', 'D'].includes(position)) return false;
    if (position === this.atSelector) return true;
    if (position === 'P' && Math.abs(this.speedKmh) > 0.5) return this.reject('請先煞停，再切入 P 檔');
    let gear = position === 'R' ? -1 : position === 'D' ? 1 : 0;
    if (position === 'D') {
      while (gear < this.maxGear && this.calcRPMFromSpeed(gear, this.speedKmh) > this.engine.redlineRPM * 0.85) gear++;
    }
    if (!this.startShift(gear)) return false;
    this.atSelector = position;
    if (position === 'P') this.speedKmh = 0;
    this.atShiftCooldown = 0.6;
    return true;
  }

  startShift(gear) {
    if (!this.canSelectGear(gear)) return false;
    if (this.shiftState === 'shifting' && gear !== 0) return false;
    this.lastShiftMessage = '';
    if (gear === 0) {
      this.currentGear = 0;
      this.resetShift();
      return true;
    }
    if (gear === this.currentGear) return true;
    if (Math.abs(this.speedKmh) < 1 || !this.engine.isIgnitionOn) {
      this.currentGear = gear;
      this.resetShift();
      this.shiftState = 'launching';
      return true;
    }
    this.shiftState = 'shifting';
    this.targetGear = gear;
    this.previousGear = this.currentGear;
    this.isUpshift = Math.abs(gear) > Math.abs(this.currentGear);
    this.shiftDuration = this.mode === 'at' ? 0.30 : 0.16;
    this.shiftTimer = this.shiftDuration;
    this.shiftElapsed = 0;
    this.shiftRecovery = 0;
    this.shiftPopPending = this.isUpshift
      && (this.engine.manifoldThrottle > 0.3 || this.engine.throttle > 0.3)
      && this.engine.rpm > this.engine.idleRPM * 1.8;
    return true;
  }

  setAmtGear(gear) { return this.mode === 'amt' && this.startShift(gear); }

  shiftUp() {
    if (this.mode === 'at' && this.atSelector !== 'D') return false;
    if (this.currentGear >= this.maxGear) return false;
    const result = this.startShift(this.currentGear + 1);
    if (result) this.atShiftCooldown = 1.2;
    return result;
  }

  shiftDown() {
    if (this.mode === 'at' && (this.atSelector !== 'D' || this.currentGear <= 1)) return false;
    if (this.currentGear <= -1) return false;
    const result = this.startShift(this.currentGear - 1);
    if (result) this.atShiftCooldown = 1.2;
    return result;
  }

  getGearDisplay() {
    if (this.mode === 'at') return this.atSelector === 'D' ? 'D' + this.currentGear : this.atSelector;
    return this.currentGear === -1 ? 'R' : this.currentGear === 0 ? 'N' : String(this.currentGear);
  }

  automaticShift(dt, throttle) {
    this.atShiftCooldown = Math.max(0, this.atShiftCooldown - dt);
    if (!this.engine.isIgnitionOn || this.mode !== 'at' || this.atSelector !== 'D'
      || this.shiftState === 'shifting' || this.atShiftCooldown > 0) return;
    const rpm = this.engine.rpm;
    const redline = this.engine.redlineRPM;
    let gear = this.currentGear;
    if (this.shiftState === 'locked' && rpm >= this.engine.idleRPM + (redline - this.engine.idleRPM) * (0.32 + 0.64 * throttle ** 1.4) && gear < this.maxGear) gear++;
    else if (gear > 1 && (rpm < redline * 0.26 || Math.abs(this.speedKmh) < 8
      || (throttle > 0.88 && rpm < redline * 0.48))) gear--;
    if (gear !== this.currentGear && this.startShift(gear)) this.atShiftCooldown = 0.7;
  }

  roadResistance() {
    const velocity = this.speedKmh / 3.6;
    return 0.5 * 1.225 * this.dragArea * velocity * velocity
      + this.vehicleMass * (9.81 * 0.014 + this.brakeInput * 12.0);
  }

  moveVehicle(dt, wheelForce, effectiveMass = this.vehicleMass * 1.035) {
    const velocity = this.speedKmh / 3.6;
    const direction = Math.sign(velocity) || Math.sign(wheelForce);
    const resistance = this.roadResistance();
    if (Math.abs(velocity) < 0.001 && Math.abs(wheelForce) <= resistance) {
      this.speedKmh = 0;
      return;
    }
    const next = velocity + (wheelForce - direction * resistance) / effectiveMass * dt;
    // Resistance stops the car; it cannot accelerate it in the opposite direction.
    this.speedKmh = direction && Math.sign(next) !== direction ? 0 : next * 3.6;
  }

  // Two inertias coupled by a capacity-limited friction torque. Solve the
  // relative velocity implicitly so engagement cannot overshoot or inject an
  // RPM jump. The exact same reaction torque accelerates the vehicle and slows
  // the crank. Hydraulic pump/turbine torques can differ during AT launch.
  couple(dt, gear, capacity, pump = 0, turbine = 0) {
    const e = this.engine;
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive * this.primaryRatio);
    const direction = Math.sign(gear);
    const mass = this.vehicleMass * 1.035;
    const reflectedInertia = mass * (this.tireRadius / ratio) ** 2 / this.driveEfficiency;
    const wheelRPM = this.calcRPMFromSpeed(gear, this.speedKmh);
    const slip = (e.rpm - wheelRPM) / RPM_PER_RAD;
    const roadTorque = this.roadResistance() * this.tireRadius / ratio / this.driveEfficiency;
    const velocity = Math.abs(this.speedKmh) / 3.6;
    const downforce = 0.5 * 1.225 * (this.dragArea * 0.5) * velocity * velocity;
    const maxTireForce = this.vehicleMass * 8.95 + downforce;
    const gripTorque = maxTireForce * this.tireRadius / ratio / this.driveEfficiency;
    // Simplified traction control: reduce source torque rather than clipping
    // vehicle speed or adding energy after the clutch locks.
    // Converter multiplication consumes part of the tyre torque allowance.
    // Ignoring turbine - pump let a boosted engine keep flaring at redline
    // after the converter had already reached the grip limit.
    const sourceGripTorque = Math.max(0, gripTorque - Math.max(0, turbine - pump));
    if (e.netTorque > sourceGripTorque) {
      e.combustionTorque -= e.netTorque - sourceGripTorque;
      e.netTorque = sourceGripTorque;
    }
    // Resolve the last part of slip over a short compliance interval. This
    // tapers the synchronizing torque before lock-up instead of dropping from
    // peak friction to holding torque in one frame.
    const shifting = this.shiftState === 'shifting';
    const compliance = shifting ? (this.mode === 'amt' ? 0.014 : 0.026) : 0.045;
    // At the end of a shift, solve the last few RPM as an actual clutch impulse
    // instead of waiting through a long exponential tail of tiny slip. Torque
    // remains capacity-limited and its reaction still acts on both inertias.
    const syncTime = Math.abs(slip * RPM_PER_RAD) < (shifting ? 5 : 0.5) ? dt : Math.max(dt, compliance);
    const required = (slip / syncTime + (e.netTorque - pump) / e.inertia
      - (turbine - roadTorque) / reflectedInertia) / (1 / e.inertia + 1 / reflectedInertia);
    const maxTractiveTorque = Math.max(0, gripTorque - turbine);
    const torque = clamp(required, -capacity, Math.min(capacity, maxTractiveTorque));
    this.transmittedTorque = torque + turbine;
    this.moveVehicle(dt, this.transmittedTorque * ratio / this.tireRadius * direction * this.driveEfficiency, mass);
    e.advanceStep(dt, { loadTorque: torque + pump });
    this.clutchEngagement = capacity ? Math.min(1, Math.abs(torque) / (e.dynoData.maxTorque * 1.8)) : 0;
    const matching = this.calcRPMFromSpeed(gear, this.speedKmh);
    const lockedTolerance = this.shiftState === 'locked' ? 0.35 : 0.015;
    const locked = capacity > 0 && matching > e.idleRPM * 1.08 && Math.abs(e.rpm - matching) < lockedTolerance;
    // Only remove floating point round-off after the torque solver synchronizes.
    if (locked) e.rpm = matching;
    return locked;
  }

  stepShift(dt, throttle) {
    const e = this.engine;
    const peak = e.dynoData.maxTorque;
    this.shiftElapsed += dt;
    this.shiftTimer = Math.max(0, this.shiftDuration - this.shiftElapsed);
    const releaseTime = this.mode === 'at' ? 0.045 : 0.018;
    const recoveryTime = this.mode === 'at' ? 0.09 : 0.07;
    const release = smoothstep(clamp(this.shiftElapsed / releaseTime, 0, 1));
    const recovering = this.shiftRecovery > 0;
    const recovery = recovering ? smoothstep(clamp(this.shiftRecovery / recoveryTime, 0, 1)) : 0;
    this.shiftEnvelope = release * (1 - recovery);
    const targetRPM = Math.max(e.idleRPM, this.calcRPMFromSpeed(this.targetGear, this.speedKmh));
    const needsBlip = targetRPM > e.rpm + 40;
    const blip = clamp((targetRPM - e.rpm) * e.inertia / RPM_PER_RAD / 0.12
      / Math.max(1, e.torqueAtRPM(e.rpm)), 0, 1);
    // Ignition cut on upshift: instantaneous torque reduction creating an unmistakable cut breakpoint
    // Ignition/torque intervention does not require closing the throttle.
    // Keep charge air and shaft sound continuous through a clutchless upshift.
    const commandedThrottle = needsBlip ? Math.max(throttle, blip) : throttle;
    const cutTorque = this.isUpshift ? (this.mode === 'amt' ? 0.06 : 0.40) : Math.max(0.25, 1 - release);
    this.shiftPhase = recovering ? 'recover' : this.shiftElapsed < releaseTime ? 'release' : 'synchronize';
    this.cutAmount = recovering ? (1 - recovery) * (1 - cutTorque) : 1 - cutTorque;
    e.prepareStep(dt, commandedThrottle, { torqueScale: recovering ? cutTorque + recovery * (1 - cutTorque)
      : needsBlip ? 1 : cutTorque });
    let locked = false;
    if (this.shiftElapsed < releaseTime && this.previousGear !== 0) {
      locked = this.couple(dt, this.previousGear, peak * 2 * (1 - release));
    } else {
      this.currentGear = this.targetGear;
      // Natural racing clutch bite: rapid progressive compliance curve into target gear
      const biteProgress = clamp((this.shiftElapsed - releaseTime) / 0.040, 0, 1);
      const biteCurve = 1 - Math.exp(-biteProgress * 4.0);
      const antiStall = clamp((e.rpm - e.idleRPM * 0.7) / (e.idleRPM * 0.5), 0, 1);
      const maxSafeTorque = (e.redlineRPM * 0.022 / RPM_PER_RAD) * e.inertia / dt;
      const nominalCapacity = peak * (this.mode === 'at' ? 3.0 : 4.0);
      const capacity = Math.min(nominalCapacity, maxSafeTorque) * (0.25 + 0.75 * biteCurve)
        * antiStall * (needsBlip ? 0.3 : 1);
      locked = this.couple(dt, this.currentGear, capacity);
      const atLowSpeed = targetRPM <= e.idleRPM * 1.1 && e.rpm < e.idleRPM * 1.2;

      // Trigger crisp shift pop right when the new gear catches
      if (this.shiftPopPending && (locked || this.shiftElapsed >= releaseTime + 0.038)) {
        e.createPop('shift', this.mode === 'amt' ? 1.35 : 0.65);
        this.shiftPopPending = false;
      }

      if (!recovering && (locked || atLowSpeed || this.shiftElapsed > 0.8)) this.shiftRecovery = dt;
    }
    if (recovering) this.shiftRecovery += dt;
    if (this.shiftRecovery >= recoveryTime) {
      this.shiftState = locked ? 'locked' : 'launching';
      this.clutchCapacity = peak * 1.8;
      this.lockup = locked ? 1 : 0;
      if (this.shiftPopPending) {
        e.createPop('shift', this.mode === 'amt' ? 1.15 : 0.55);
        this.shiftPopPending = false;
      }
      this.shiftEnvelope = 0;
      this.atShiftCooldown = Math.max(this.atShiftCooldown, 0.4);
    }
  }

  step(dt, throttle) {
    const e = this.engine;
    this.automaticShift(dt, throttle);
    if (e.isIgnitionOn && this.shiftState === 'shifting') {
      this.stepShift(dt, throttle);
      return;
    }
    this.shiftEnvelope = 0;
    this.shiftPhase = "idle";
    this.cutAmount = 0;
    e.prepareStep(dt, throttle, { idleLoad: this.mode === 'at' ? this.pumpTorque
      : this.shiftState === 'launching' ? Math.max(0, this.transmittedTorque) : 0 });
    if (!e.isIgnitionOn || this.currentGear === 0) {
      if (!e.isIgnitionOn) this.resetShift();
      this.clutchEngagement = 0;
      if (this.atSelector === 'P' && this.mode === 'at') this.speedKmh = 0;
      else this.moveVehicle(dt, 0);
      e.advanceStep(dt);
      return;
    }

    const peak = e.dynoData.maxTorque;
    const wheelRPM = this.calcRPMFromSpeed(this.currentGear, this.speedKmh);
    if (this.shiftState === 'locked' && wheelRPM > e.idleRPM * 1.12) {
      if (!this.couple(dt, this.currentGear, peak * 3)) {
        this.shiftState = 'launching';
        this.lockup = 0;
      }
      return;
    } else {
      this.shiftState = 'launching';
      let pump = 0, turbine = 0, capacity = 0;
      if (this.mode === 'at') {
        const speedRatio = wheelRPM / Math.max(1, e.rpm);
        const wantLock = speedRatio > 0.86 && e.rpm > e.idleRPM * 1.4;
        this.lockup = clamp(this.lockup + (wantLock ? dt / 0.35 : -dt / 0.18), 0, 1);
        const stallRPM = Math.max(e.idleRPM * 1.9,
          (e.config.ratedTorqueRPM || e.config.defaultRedlineRPM * 0.65) * 0.50);
        const map = converterCharacteristics(speedRatio);
        const creepScale = throttle < 0.02 ? clamp((6 - Math.abs(this.speedKmh)) / 3, 0, 1) : 1;
        pump = e.torqueAtRPM(stallRPM) * (e.rpm / stallRPM) ** 2 * map.capacity
          * (1 - this.lockup) * creepScale;
        const ratio = Math.abs(this.gearRatios[this.currentGear] * this.finalDrive * this.primaryRatio);
        const gripTorque = this.vehicleMass * 9.81 * 0.95 * this.tireRadius / ratio / this.driveEfficiency;
        pump = Math.min(pump, gripTorque / map.torqueRatio);
        turbine = pump * map.torqueRatio;
        capacity = peak * 2 * this.lockup;
      } else {
        const engaged = throttle > 0.02 || wheelRPM > e.idleRPM * 1.2;
        // Release part of the clutch load while the engine is below its useful
        // torque band. The old capacity curve could balance torque at idle
        // indefinitely, making full-throttle starts crawl for several seconds.
        const speedRatio = clamp(wheelRPM / Math.max(1, e.rpm), 0, 1);
        const idleBite = peak * 0.12 * clamp(throttle / 0.25, 0, 1);
        const torqueBudget = Math.max(idleBite, Math.max(0, e.netTorque) * (0.68 + 0.42 * speedRatio ** 2));
        const flareGuard = peak * 1.8 * clamp((e.rpm - e.config.defaultRedlineRPM * 0.52)
          / (e.config.defaultRedlineRPM * 0.25), 0, 1);
        const driveCapacity = throttle < 0.02 ? peak * 1.8 : Math.max(torqueBudget, flareGuard);
        const antiStall = clamp((e.rpm - e.idleRPM * 0.65) / (e.idleRPM * 0.35), 0, 1);
        const requested = engaged && this.brakeInput < 0.1 ? Math.min(peak * 1.8, driveCapacity) * antiStall : 0;
        const maxChange = peak * 6 * dt;
        this.clutchCapacity += clamp(requested - this.clutchCapacity, -maxChange, maxChange);
        // Anti-stall also limits residual capacity during pedal release. A
        // latched high capacity could drag the crank to zero while braking.
        this.clutchCapacity = Math.min(this.clutchCapacity, peak * 1.8 * antiStall);
        capacity = this.clutchCapacity;
      }
      this.pumpTorque = pump;
      if (this.couple(dt, this.currentGear, capacity, pump, turbine)) {
        this.shiftState = 'locked';
        this.lockup = 1;
        this.pumpTorque = 0;
      }
    }
  }

  update(dt, throttleInput, brakeInput) {
    const throttle = clamp(Number(throttleInput) || 0, 0, 1);
    this.brakeInput = clamp(Number(brakeInput) || 0, 0, 1);
    this.accumulator += clamp(Number(dt) || 0, 0, 0.25);
    const pops = [];
    const bovs = [];
    let frameCut = 0;
    let frameUpshift = false;
    while (this.accumulator + 1e-10 >= PHYSICS_STEP) {
      this.step(PHYSICS_STEP, throttle);
      if (this.shiftState === 'shifting' || this.cutAmount > 0) {
        frameCut = Math.max(frameCut, this.cutAmount);
        frameUpshift ||= this.isUpshift;
      }
      pops.push(...this.engine.popEvents);
      bovs.push(...this.engine.bovEvents);
      this.accumulator -= PHYSICS_STEP;
    }
    return { mode: this.mode, gearDisplay: this.getGearDisplay(), currentGear: this.currentGear,
      speedKmh: Math.round(Math.abs(this.speedKmh)), signedSpeedKmh: this.speedKmh,
      gearRatio: Math.abs(this.gearRatios[this.currentGear]), shiftEnvelope: this.shiftEnvelope,
      isShifting: this.shiftState === 'shifting' || frameCut > 0,
      isUpshift: this.isUpshift || frameUpshift, message: this.lastShiftMessage,
      vehicleMass: this.vehicleMass, maxGear: this.maxGear,
      shiftPhase: this.shiftPhase, cutAmount: Math.max(this.cutAmount, frameCut),
      shiftProgress: this.shiftState === "shifting" ? Math.min(1, this.shiftElapsed / Math.max(0.001, this.shiftDuration)) : 0,
      engine: this.engine.snapshot(pops, bovs) };
  }
}
