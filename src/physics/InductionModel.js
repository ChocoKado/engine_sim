// Reduced-order induction model. Rotor energy and a finite charge-air reservoir
// resolve transients; compressor maps/efficiencies are representative estimates.
// Temperature/work relation: NASA Glenn, Compressor Thermodynamics.
export const ATMOSPHERE = 101325;
const AMBIENT_T = 298.15;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function chargeThermodynamics(boostBar, efficiency = 0.72, intercooler = 0.72) {
  const ratio = 1 + Math.max(0, boostBar) * 100000 / ATMOSPHERE;
  const compressorTemperature = AMBIENT_T * (1 + (ratio ** (2 / 7) - 1) / efficiency);
  const intakeTemperature = AMBIENT_T + (compressorTemperature - AMBIENT_T) * (1 - intercooler);
  return { densityRatio: ratio * AMBIENT_T / intakeTemperature,
    compressorTemperature, intakeTemperature, specificWork: 1005 * (compressorTemperature - AMBIENT_T) };
}

export function steadyBoost(config, type, size, boost, rpm, displacement = config.defaultDisplacement) {
  if (type === 'na' || rpm <= 0) return 0;
  const referenceRPM = config.ratedPowerRPM || config.defaultRedlineRPM * 0.92;
  if (type === 'supercharger') {
    // Positive displacement Roots/TVS: displaced volume per revolution tracks
    // engine demand. Leakage matters at low shaft speed; boost is not RPM/redline.
    return boost * clamp(1 - 240 / Math.max(240, rpm), 0, 1);
  }
  const matching = (displacement / config.defaultDisplacement) ** 0.35;
  const threshold = referenceRPM * (size === 'large' ? 0.48 : 0.26) / matching;
  const x = clamp((rpm - threshold * 0.60) / (threshold * 0.85), 0, 1);
  const onset = x * x * (3 - 2 * x);
  const highFlow = Math.max(0, rpm / referenceRPM - (size === 'large' ? 1.32 : 0.97));
  return boost * onset / (1 + highFlow * (size === 'large' ? 0.45 : 1.3));
}

export function superchargerDriveTorque(config, rpm, displacement, boost, throttle = 1) {
  if (rpm <= 0) return 0;
  const thermo = chargeThermodynamics(boost, 0.68);
  const demandVolume = displacement / 1e6 * rpm / ((config.cycleDegrees || 720) / 6) * 0.90;
  const vacuum = 0.72 * (1 - throttle) * clamp(rpm / 500, 0, 1);
  const manifoldPressure = ATMOSPHERE * (1 - vacuum) + boost * 100000 * throttle;
  const flow = demandVolume * manifoldPressure / (287.05 * thermo.intakeTemperature);
  const referenceRPM = config.ratedPowerRPM || config.defaultRedlineRPM * 0.92;
  return flow * thermo.specificWork / Math.max(rpm * Math.PI / 30, 20) / 0.94
    + displacement / 1000 * 0.65 * rpm / Math.max(1000, referenceRPM);
}

// Vacuum unloads a Roots/TVS blower at light load (Magnuson MOAB); Eaton also
// supports an electronic bypass. This estimated idle torque-reserve control
// opens that bypass if an extreme pulley/map extrapolation would consume the
// engine's useful low-speed output. It changes air pressure, never crank RPM or
// clutch reaction, and ignores ignition cuts: a turning blower still costs work.
// Both the steady dyno and dynamic reservoir use this same operating point.
export function superchargerBypass(config, rpm, displacement, nominalBoost, unboostedTorque, throttle = 1,
  idleRPM = config.defaultIdleRPM) {
  const vacuumBypass = clamp((0.40 - throttle) / 0.35, 0, 1);
  const lowSpeed = clamp((idleRPM * 2.2 - rpm) / (idleRPM * 0.9), 0, 1);
  if (vacuumBypass === 1 || lowSpeed === 0 || nominalBoost <= 0 || !(unboostedTorque > 0)) return vacuumBypass;
  const targetBoost = nominalBoost * (1 - vacuumBypass);
  const reserve = unboostedTorque * 0.85;
  const outputAtBoost = boost => unboostedTorque * chargeThermodynamics(boost, 0.68).densityRatio
    - superchargerDriveTorque(config, rpm, displacement, boost);
  if (outputAtBoost(targetBoost) >= reserve) return vacuumBypass;
  // Choose the best usable low-speed output rather than simply the first
  // pressure that stops a stall. A large pulley demand can otherwise leave
  // nearly all extra cylinder torque consumed by compressor work at launch.
  let low = 0, high = targetBoost;
  for (let iteration = 0; iteration < 16; iteration++) {
    const a = low + (high - low) / 3, b = high - (high - low) / 3;
    if (outputAtBoost(a) > outputAtBoost(b)) high = b; else low = a;
  }
  const unloaded = 1 - (low + high) / 2 / nominalBoost;
  return vacuumBypass + (unloaded - vacuumBypass) * lowSpeed;
}

export class InductionModel {
  constructor() { this.reset(); }
  reset() {
    this.rotorEnergy = 0;
    this.turboRPM = 0;
    this.superchargerRPM = 0;
    this.chargeBoost = 0;
    this.boostPressure = 0;
    this.airFlow = 0;
    this.shaftTorque = 0;
    this.bypassOpening = 1;
    this.exhaustEnergy = 0;
    this.surgeTime = 0;
    this.surgeDuration = 0;
    this.surgePhase = 0;
    this.ventTime = 0;
    this.previousThrottle = 0;
    this.eventCooldown = 0;
    this.intakePressure = ATMOSPHERE;
    this.chargePressure = ATMOSPHERE;
    this.intakeTemperature = AMBIENT_T;
  }

  update(dt, { config, type, size, maxBoost, displacement, rpm, throttle,
    pedalThrottle, torqueScale, running, baseTorque, unboostedTorque, idleRPM, bovType, time }) {
    this.eventCooldown = Math.max(0, this.eventCooldown - dt);
    const events = [];
    const liters = displacement / 1000;
    const omega = rpm * Math.PI / 30;
    const demandVolume = displacement / 1e6 * rpm / ((config.cycleDegrees || 720) / 6) * 0.90;
    const reservoirVolume = 0.0015 + displacement / 1e6 * 0.8;
    const nominalBoost = steadyBoost(config, type, size, maxBoost, rpm, displacement);
    const previousBoost = this.chargeBoost;
    const lift = (this.previousThrottle > 0.25 && pedalThrottle < this.previousThrottle - 0.08)
      || (this.previousThrottle >= 0.20 && pedalThrottle < 0.20);
    this.previousThrottle = pedalThrottle;
    const burning = running ? throttle * torqueScale : 0;
    this.exhaustEnergy = Math.max(0, baseTorque * omega * burning * 0.34);

    if (type === 'turbo') {
      this.superchargerRPM = 0;
      // Matched small/large rotating groups have different inertia and flow
      // capacity. Energy E=I*omega²/2 gives load-dependent spool-up, rather than
      // a universal fixed delay attached to the tachometer.
      const rotorInertia = (size === 'large' ? 0.000070 : 0.000022) * Math.max(0.4, liters / 3);
      const maxRotorRPM = size === 'large' ? 145000 : 190000;
      const maxOmega = maxRotorRPM * Math.PI / 30;
      const maxEnergy = 0.5 * rotorInertia * maxOmega * maxOmega;
      const targetSpool = Math.sqrt(clamp(nominalBoost / Math.max(0.2, maxBoost), 0, 1));
      const load = Math.pow(clamp(burning, 0, 1), 0.62);
      const targetEnergy = maxEnergy * targetSpool * targetSpool * load;
      const turbinePower = this.exhaustEnergy * 0.48;
      const compression = chargeThermodynamics(previousBoost);
      const compressorPower = this.airFlow * compression.specificWork;
      if (targetEnergy > this.rotorEnergy && targetEnergy > 1) {
        const acceleratingPower = Math.max(0, turbinePower - compressorPower * 0.24);
        // Implicit energy integration approaches the wastegate-regulated map
        // operating point without an overshoot or an RPM clamp injecting energy.
        this.rotorEnergy = (this.rotorEnergy + dt * acceleratingPower)
          / (1 + dt * acceleratingPower / targetEnergy);
      } else {
        const lossPower = compressorPower * (bovType === 'bov' ? 0.22 : 0.38)
          + this.rotorEnergy * (running ? 0.65 : 1.5);
        const excess = Math.max(0, this.rotorEnergy - targetEnergy);
        this.rotorEnergy = Math.max(0, this.rotorEnergy - Math.min(excess, lossPower * dt));
      }
      this.turboRPM = Math.sqrt(2 * this.rotorEnergy / rotorInertia) * 30 / Math.PI;
      const spool = clamp(this.turboRPM / maxRotorRPM, 0, 1.1);
      // Charge pipe remains pressurized on lift until a valve or surge vents it.
      // Closing the throttle does not instantaneously stop the compressor shaft.
      if (running && lift && previousBoost > 0.06 && this.eventCooldown === 0) {
        const duration = clamp(0.17 + previousBoost * 0.28 + reservoirVolume * 35, 0.22, 1.1);
        const pulseRate = clamp(8 + this.turboRPM / 14000, 8, 24);
        events.push({ type: bovType, timestamp: time, pressure: previousBoost,
          rotorRPM: this.turboRPM, duration, pulseRate,
          intensity: clamp(Math.sqrt(previousBoost) * 0.85, 0.12, 1.5) });
        this.eventCooldown = duration * 0.7;
        if (bovType === 'flutter') {
          this.surgeDuration = this.surgeTime = duration;
          this.surgePhase = 0;
        } else this.ventTime = duration;
      }
      const pressureHead = maxBoost * spool * spool;
      let targetPressure = pressureHead;
      let fillRate = demandVolume / reservoirVolume + 7;
      this.bypassOpening = 0;
      // The pressure-relief valve follows manifold vacuum. Event duration only
      // estimates the audible burst; it must not close the valve while the
      // throttle remains shut and the compressor is still spinning.
      if (bovType === 'bov' && (pedalThrottle < 0.20 || this.ventTime > 0)) {
        this.ventTime = Math.max(0, this.ventTime - dt);
        this.bypassOpening = 1;
        targetPressure = 0;
        fillRate = 34;
        if (pedalThrottle > 0.35) this.ventTime = 0;
      } else if (this.surgeTime > 0) {
        this.surgeTime = Math.max(0, this.surgeTime - dt);
        this.surgePhase += dt * (8 + this.turboRPM / 14000);
        const oscillation = 0.5 + 0.5 * Math.sin(this.surgePhase * Math.PI * 2);
        targetPressure = pressureHead * (0.18 + 0.60 * oscillation) * this.surgeTime / this.surgeDuration;
        fillRate = 24;
        // Compressor flow reversal adds damping on the compressor side, not an
        // arbitrary 60% instantaneous reduction to the shared turbine shaft.
        this.rotorEnergy *= Math.exp(-dt * (1.2 + oscillation * 2));
        if (pedalThrottle > 0.35) this.surgeTime = 0;
      } else if (pedalThrottle < 0.08) {
        targetPressure *= 0.25;
        fillRate = 7;
      }
      this.chargeBoost += (targetPressure - this.chargeBoost) * (1 - Math.exp(-dt * fillRate));
    } else if (type === 'supercharger') {
      this.rotorEnergy = this.turboRPM = 0;
      // A pulley ratio is a physical part; changing the rev limiter does not
      // change it. More boost means a smaller pulley / faster rotor.
      const pulleyRatio = 1.7 * Math.sqrt((1 + maxBoost) / 1.7);
      this.superchargerRPM = rpm * pulleyRatio;
      this.bypassOpening = running ? superchargerBypass(config, rpm, displacement, nominalBoost,
        unboostedTorque ?? baseTorque, throttle, idleRPM) : 1;
      const targetPressure = running ? nominalBoost * (1 - this.bypassOpening) : 0;
      this.chargeBoost += (targetPressure - this.chargeBoost) * (1 - Math.exp(-dt * 65));
      this.surgeTime = this.ventTime = 0;
    } else {
      this.rotorEnergy = this.turboRPM = this.superchargerRPM = this.chargeBoost = 0;
      this.surgeTime = this.ventTime = 0;
      this.bypassOpening = 1;
    }

    this.chargeBoost = clamp(this.chargeBoost, 0, maxBoost * 1.08);
    const thermo = chargeThermodynamics(this.chargeBoost, type === 'supercharger' ? 0.68 : 0.72);
    this.intakeTemperature = thermo.intakeTemperature;
    this.chargePressure = ATMOSPHERE + this.chargeBoost * 100000;
    const vacuum = 0.72 * (1 - throttle) * clamp(rpm / 500, 0, 1);
    this.intakePressure = ATMOSPHERE * (1 - vacuum) + this.chargeBoost * 100000 * throttle;
    this.boostPressure = Math.max(0, (this.intakePressure - ATMOSPHERE) / 100000);
    // A coasting crank still pumps air after ignition is switched off.
    this.airFlow = demandVolume * this.intakePressure / (287.05 * this.intakeTemperature);
    this.shaftTorque = type === 'supercharger' && rpm > 0
      ? superchargerDriveTorque(config, rpm, displacement, this.chargeBoost, throttle) : 0;
    return { densityRatio: thermo.densityRatio, shaftTorque: this.shaftTorque,
      boostPressure: this.boostPressure, events };
  }
}
