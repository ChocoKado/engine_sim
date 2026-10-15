const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => v * v * (3 - 2 * v);

// Two mechanical degrees of freedom: gas-generator N1 and the free power
// turbine/reduction output N2. Only the latter may couple to a road load.
// Rated speeds: Rolls-Royce M250 FIRST directory; maps and controls estimated.
export class TurboshaftModel {
  constructor(config) {
    this.spec = { ratedCoreRPM: 50970, ratedPowerTurbineRPM: 33290,
      ratedOutputRPM: 6016, ratedPowerKW: 313, idleCoreFraction: 0.60,
      idleOutputFraction: 0.40, designPressureRatio: 7.2, maxMassFlowKgS: 1.8,
      spoolUpSeconds: 1.8, spoolDownSeconds: 2.3, ...config.turboshaftDesign };
    this.running = false;
    this.coreFraction = 0;
    this.fuelCommand = 0;
    this.outputRPM = 0;
    this.isCombusting = false;
    this.starterActive = false;
    this.coreAngle = 0;
    this.powerTurbineAngle = 0;
    this.exhaustTemperatureC = 25;
    this.netTorque = 0;
    this.gasFraction = 0;
    this.governorOpening = 0;
  }

  setRunning(running) {
    this.running = Boolean(running);
    if (!running) {
      this.isCombusting = false;
      this.starterActive = false;
      this.fuelCommand = 0;
      this.gasFraction = 0;
      this.governorOpening = 0;
    }
  }

  steadyTorqueAtRPM(rpm) {
    const fraction = Math.max(0, rpm) / this.spec.ratedOutputRPM;
    const ratedTorque = this.spec.ratedPowerKW * 1000 / (this.spec.ratedOutputRPM * Math.PI / 30);
    // A linear free-turbine torque/speed approximation has finite stall torque,
    // zero power at zero speed and no power above the calibrated gas budget.
    return Math.max(0, ratedTorque * (2 - fraction));
  }

  update(dt, { throttle = 0, outputRPM = this.outputRPM, thermalPowerFactor = 1 } = {}) {
    const s = this.spec;
    this.outputRPM = Math.max(0, outputRPM);
    const pedal = this.running ? clamp(Number(throttle) || 0, 0, 1) : 0;
    this.fuelCommand += (pedal - this.fuelCommand) * (1 - Math.exp(-dt / 0.25));
    this.isCombusting = this.running && this.coreFraction >= 0.18;
    this.starterActive = this.running && this.coreFraction < s.idleCoreFraction * 0.90;
    if (!this.running) {
      this.coreFraction *= Math.exp(-dt / 5.5);
      if (this.coreFraction < 0.001) this.coreFraction = 0;
    } else if (!this.isCombusting) this.coreFraction = Math.min(0.18, this.coreFraction + dt * 0.07);
    else {
      const target = s.idleCoreFraction + (1 - s.idleCoreFraction) * this.fuelCommand ** 0.65;
      const tau = target > this.coreFraction ? s.spoolUpSeconds : s.spoolDownSeconds;
      this.coreFraction += (target - this.coreFraction) * (1 - Math.exp(-dt / tau));
    }
    const band = smooth(clamp((this.coreFraction - s.idleCoreFraction) / (1 - s.idleCoreFraction), 0, 1));
    this.gasFraction = this.isCombusting ? (0.025 + 0.975 * band) * thermalPowerFactor : 0;
    const outputFraction = this.outputRPM / s.ratedOutputRPM;
    const requestedOutputFraction = s.idleOutputFraction + (1 - s.idleOutputFraction) * this.fuelCommand ** 0.6;
    // Fuel/power-turbine overspeed control closes smoothly before the selected
    // output setpoint. It never assigns N1 from a road-speed/gear calculation.
    this.governorOpening = clamp((requestedOutputFraction - outputFraction) / 0.015, 0, 1);
    const bearingDrag = (3 + 6 * outputFraction) * Math.min(1, this.outputRPM / 200);
    const available = this.steadyTorqueAtRPM(this.outputRPM) * this.gasFraction * this.governorOpening;
    this.netTorque = available - bearingDrag * (1 - this.gasFraction * this.governorOpening);
    const egtTarget = this.isCombusting ? 350 + 440 * band + 35 * (1 - Math.min(1, outputFraction)) * band : 25;
    this.exhaustTemperatureC += (egtTarget - this.exhaustTemperatureC) * (1 - Math.exp(-dt / (this.running ? 0.8 : 5)));
    this.coreAngle = (this.coreAngle + this.coreFraction * s.ratedCoreRPM * 6 * dt) % 360;
    return this.snapshot();
  }

  syncOutputRPM(rpm, dt = 0) {
    this.outputRPM = Math.max(0, rpm);
    this.powerTurbineAngle = (this.powerTurbineAngle
      + this.outputRPM * this.spec.ratedPowerTurbineRPM / this.spec.ratedOutputRPM * 6 * dt) % 360;
  }

  snapshot() {
    const s = this.spec;
    const powerTurbineRPM = this.outputRPM * s.ratedPowerTurbineRPM / s.ratedOutputRPM;
    return { coreRPM: this.coreFraction * s.ratedCoreRPM, corePercent: this.coreFraction * 100,
      coreRPMKind: 'published-rated-speed', powerTurbineRPM,
      powerTurbinePercent: powerTurbineRPM / s.ratedPowerTurbineRPM * 100,
      outputShaftRPM: this.outputRPM, coreAngle: this.coreAngle, powerTurbineAngle: this.powerTurbineAngle,
      shaftTorqueNm: Math.max(0, this.netTorque), shaftPowerKW: Math.max(0, this.netTorque) * this.outputRPM * Math.PI / 30000,
      gasGeneratorPowerKW: s.ratedPowerKW * this.gasFraction, governorOpening: this.governorOpening,
      exhaustTemperatureC: this.exhaustTemperatureC, nozzleTemperatureC: this.exhaustTemperatureC,
      pressureRatio: 1 + (s.designPressureRatio - 1) * this.coreFraction ** 2.4,
      massFlowKgS: s.maxMassFlowKgS * this.coreFraction ** 1.4,
      designMassFlowKgS: s.maxMassFlowKgS, fuelFlowKgS: this.isCombusting ? 0.012 + 0.035 * this.gasFraction : 0,
      isCombusting: this.isCombusting, starterActive: this.starterActive,
      afterburnerAmount: 0, afterburnerEnabled: false, nozzleAreaRatio: 1,
      startState: !this.running ? this.coreFraction > 0 ? 'cooldown' : 'off'
        : !this.isCombusting ? 'purge' : this.starterActive ? 'lightoff' : 'running', faultCode: '', faultFireAmount: 0 };
  }
}
