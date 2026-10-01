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
    this.tireCircumference = 2 * Math.PI * this.tireRadius;
    this.configureVehicle();
    this.speedKmh = 0; // Signed road velocity: reverse is negative.
    this.brakeInput = 0;
    this.accumulator = 0;
    this.atShiftCooldown = 0;
    this.lastShiftMessage = '';
    this.resetShift();
  }

  configureVehicle() {
    const profile = VEHICLE_PROFILES[this.engine.config.id];
    this.vehicleMass = profile.mass;
    this.dragArea = profile.dragArea;
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
  }

  reject(message) {
    this.lastShiftMessage = message;
    return false;
  }

  calcRPMFromSpeed(gear, speedKmh) {
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive);
    return Math.abs(speedKmh) / 3.6 / this.tireCircumference * 60 * ratio;
  }

  calcSpeedFromRPM(gear, rpm) {
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive);
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
    if (!Number.isInteger(gear) || gear < -1 || gear > 6) return this.reject('無效檔位');
    if (gear === 0) return true;
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
      while (gear < 6 && this.calcRPMFromSpeed(gear, this.speedKmh) > this.engine.redlineRPM * 0.85) gear++;
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
    this.shiftDuration = this.mode === 'at' ? 0.32 : 0.24;
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
    if (this.currentGear >= 6) return false;
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
    if (this.shiftState === 'locked' && rpm >= redline * (0.42 + 0.48 * throttle ** 1.4) && gear < 6) gear++;
    else if (gear > 1 && (rpm < redline * 0.26 || Math.abs(this.speedKmh) < 8
      || (throttle > 0.88 && rpm < redline * 0.48))) gear--;
    if (gear !== this.currentGear && this.startShift(gear)) this.atShiftCooldown = 0.7;
  }

  roadResistance() {
    const velocity = this.speedKmh / 3.6;
    return 0.5 * 1.225 * this.dragArea * velocity * velocity
      + this.vehicleMass * (9.81 * 0.014 + this.brakeInput * 10.5);
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
    const ratio = Math.abs(this.gearRatios[gear] * this.finalDrive);
    const direction = Math.sign(gear);
    const mass = this.vehicleMass * 1.035;
    const reflectedInertia = mass * (this.tireRadius / ratio) ** 2;
    const wheelRPM = this.calcRPMFromSpeed(gear, this.speedKmh);
    const slip = (e.rpm - wheelRPM) / RPM_PER_RAD;
    const roadTorque = this.roadResistance() * this.tireRadius / ratio;
    const gripTorque = this.vehicleMass * 9.81 * 0.95 * this.tireRadius / ratio;
    // Simplified traction control: reduce source torque rather than clipping
    // vehicle speed or adding energy after the clutch locks.
    if (e.netTorque > gripTorque) {
      e.combustionTorque -= e.netTorque - gripTorque;
      e.netTorque = gripTorque;
    }
    // Resolve the last part of slip over a short compliance interval. This
    // tapers the synchronizing torque before lock-up instead of dropping from
    // peak friction to holding torque in one frame.
    const syncTime = Math.abs(slip * RPM_PER_RAD) < 0.5 ? dt : Math.max(dt, 0.045);
    const required = (slip / syncTime + (e.netTorque - pump) / e.inertia
      - (turbine - roadTorque) / reflectedInertia) / (1 / e.inertia + 1 / reflectedInertia);
    const torque = clamp(required, -capacity, Math.min(capacity, Math.max(0, gripTorque - turbine)));
    this.transmittedTorque = torque + turbine;
    this.moveVehicle(dt, this.transmittedTorque * ratio / this.tireRadius * direction, mass);
    e.advanceStep(dt, { loadTorque: torque + pump });
    this.clutchEngagement = capacity ? Math.min(1, Math.abs(torque) / (e.dynoData.maxTorque * 1.8)) : 0;
    const matching = this.calcRPMFromSpeed(gear, this.speedKmh);
    const locked = capacity > 0 && matching > e.idleRPM * 1.08 && Math.abs(e.rpm - matching) < 0.01;
    // Only remove floating point round-off after the torque solver synchronizes.
    if (locked) e.rpm = matching;
    return locked;
  }

  stepShift(dt, throttle) {
    const e = this.engine;
    const peak = e.dynoData.maxTorque;
    this.shiftElapsed += dt;
    this.shiftTimer = Math.max(0, this.shiftDuration - this.shiftElapsed);
    const releaseTime = this.mode === 'at' ? 0.055 : 0.040;
    const release = smoothstep(clamp(this.shiftElapsed / releaseTime, 0, 1));
    const recovering = this.shiftRecovery > 0;
    const recovery = recovering ? smoothstep(clamp(this.shiftRecovery / 0.09, 0, 1)) : 0;
    this.shiftEnvelope = release * (1 - recovery);
    const targetRPM = Math.max(e.idleRPM, this.calcRPMFromSpeed(this.targetGear, this.speedKmh));
    const needsBlip = targetRPM > e.rpm + 40;
    const blip = clamp((targetRPM - e.rpm) * e.inertia / RPM_PER_RAD / 0.12
      / Math.max(1, e.torqueAtRPM(e.rpm)), 0, 1);
    // Ignition cut on upshift: during shift, torque cuts sharply to create an audible cut & crisp drop
    const commandedThrottle = recovering ? throttle : needsBlip ? blip : throttle * (1 - release);
    e.prepareStep(dt, commandedThrottle, { torqueScale: recovering ? 0.25 + recovery * 0.75
      : needsBlip ? 1 : Math.max(0, 1 - release * 0.98) });
    let locked = false;
    if (this.shiftElapsed < releaseTime && this.previousGear !== 0) {
      locked = this.couple(dt, this.previousGear, peak * 2 * (1 - release));
    } else {
      this.currentGear = this.targetGear;
      // Fast, athletic clutch engagement curve
      const engagement = smoothstep(clamp((this.shiftElapsed - releaseTime) / 0.09, 0, 1));
      const antiStall = clamp((e.rpm - e.idleRPM * 0.7) / (e.idleRPM * 0.5), 0, 1);
      // Higher clutch pull capacity so RPM drops cleanly and crisply into the new gear ratio
      const capacity = peak * (this.mode === 'at' ? 2.0 : 2.5) * engagement * antiStall
        * (needsBlip ? 0.3 : 1);
      locked = this.couple(dt, this.currentGear, capacity);
      const atLowSpeed = targetRPM <= e.idleRPM * 1.1 && e.rpm < e.idleRPM * 1.2;

      // Trigger crisp shift pop right when the new gear catches
      if (this.shiftPopPending && (locked || this.shiftElapsed >= releaseTime + 0.045)) {
        e.createPop('shift', 1.35);
        this.shiftPopPending = false;
      }

      if (!recovering && (locked || atLowSpeed || this.shiftElapsed > 0.8)) this.shiftRecovery = dt;
    }
    if (recovering) this.shiftRecovery += dt;
    if (this.shiftRecovery >= 0.09) {
      this.shiftState = locked ? 'locked' : 'launching';
      this.clutchCapacity = peak * 1.8;
      this.lockup = locked ? 1 : 0;
      if (this.shiftPopPending) {
        e.createPop('shift', 1.35);
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
    e.prepareStep(dt, throttle, { idleLoad: this.mode === 'at' ? this.pumpTorque : 0 });
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
        const stallRPM = Math.max(e.idleRPM * 1.9, e.redlineRPM * 0.24);
        const map = converterCharacteristics(speedRatio);
        const creepScale = throttle < 0.02 ? clamp((6 - Math.abs(this.speedKmh)) / 3, 0, 1) : 1;
        pump = e.torqueAtRPM(stallRPM) * (e.rpm / stallRPM) ** 2 * map.capacity
          * (1 - this.lockup) * creepScale;
        const ratio = Math.abs(this.gearRatios[this.currentGear] * this.finalDrive);
        const gripTorque = this.vehicleMass * 9.81 * 0.95 * this.tireRadius / ratio;
        pump = Math.min(pump, gripTorque / map.torqueRatio);
        turbine = pump * map.torqueRatio;
        capacity = peak * 2 * this.lockup;
      } else {
        const antiStall = clamp((e.rpm - e.idleRPM * 0.7) / (e.redlineRPM * 0.24), 0, 1);
        const engaged = throttle > 0.02 || wheelRPM > e.idleRPM * 1.2;
        const requested = engaged && this.brakeInput < 0.1 ? peak * 1.8 * antiStall : 0;
        const maxChange = peak * 6 * dt;
        this.clutchCapacity += clamp(requested - this.clutchCapacity, -maxChange, maxChange);
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
    while (this.accumulator + 1e-10 >= PHYSICS_STEP) {
      this.step(PHYSICS_STEP, throttle);
      pops.push(...this.engine.popEvents);
      this.accumulator -= PHYSICS_STEP;
    }
    return { mode: this.mode, gearDisplay: this.getGearDisplay(), currentGear: this.currentGear,
      speedKmh: Math.round(Math.abs(this.speedKmh)), signedSpeedKmh: this.speedKmh,
      gearRatio: Math.abs(this.gearRatios[this.currentGear]), shiftEnvelope: this.shiftEnvelope,
      isShifting: this.shiftState === 'shifting', isUpshift: this.isUpshift, message: this.lastShiftMessage,
      engine: this.engine.snapshot(pops) };
  }
}
