// Sea-level, static single-spool turbojet test bench. The published J85-21 dry
// and augmented thrust anchors calibrate this reduced-order cycle; compressor
// maps, efficiencies, fuel scheduling and transient time constants are estimates.
// NASA TM-81451: https://ntrs.nasa.gov/citations/19800012848
// Cycle/nozzle: https://www.grc.nasa.gov/www/k-12/airplane/turbab.html
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => v * v * (3 - 2 * v);
const AIR_CP = 1005;
const GAS_CP = 1150;
const AIR_GAMMA = 1.4;
const GAS_GAMMA = 1.33;
const AMBIENT_K = 288.15;
const AMBIENT_PA = 101325;
const FUEL_LHV = 43e6;

export class TurbojetModel {
  constructor(config) {
    this.config = config;
    this.spec = { referenceCoreRPM: 17000, idleCoreFraction: 0.55,
      lightoffCoreFraction: 0.22, designPressureRatio: 8.3,
      compressorEfficiency: 0.78, turbineEfficiency: 0.86,
      shaftEfficiency: 0.99, burnerPressureRecovery: 0.95,
      burnerEfficiency: 0.98, afterburnerEfficiency: 0.90, nozzleEfficiency: 0.96,
      idleTurbineInletK: 700, designTurbineExitK: 1000, maxMassFlowKgS: 24.05,
      spoolUpSeconds: 1.25, spoolDownSeconds: 1.7, coastSeconds: 4.5,
      ...config.jetDesign };
    // NASA TM-81451's sea-level 100%-design-speed point provides PR=8.30,
    // airflow=24.05 kg/s and about 1000 K turbine exit temperature. Compressor
    // work fixes the corresponding TIT; equivalent nozzle efficiency is then
    // calibrated to rated dry thrust, without altering that measured PR/flow.
    const compressorK = AMBIENT_K * (1 + (this.spec.designPressureRatio ** ((AIR_GAMMA - 1) / AIR_GAMMA) - 1)
      / this.spec.compressorEfficiency);
    this.spec.designTurbineInletK = this.spec.designTurbineExitK
      + AIR_CP * (compressorK - AMBIENT_K) / (GAS_CP * this.spec.shaftEfficiency);
    const dry = this.cycle(1, 0, this.spec.designTurbineInletK, this.spec.maxMassFlowKgS);
    this.spec.nozzleEfficiency *= (config.ratedDryThrustN / dry.thrustN) ** 2;
    let lo = this.spec.designTurbineInletK, hi = 3000;
    for (let i = 0; i < 60; i++) {
      const temperature = (lo + hi) / 2;
      const trial = this.cycle(1, 1, this.spec.designTurbineInletK,
        this.spec.maxMassFlowKgS, temperature);
      if (trial.thrustN < config.ratedAfterburnerThrustN) lo = temperature;
      else hi = temperature;
    }
    this.spec.afterburnerTemperatureK = (lo + hi) / 2;
    this.running = false;
    this.afterburnerEnabled = false;
    this.coreFraction = 0;
    this.fuelCommand = 0;
    this.afterburnerAmount = 0;
    this.isCombusting = false;
    this.starterActive = false;
    this.exhaustTemperatureC = AMBIENT_K - 273.15;
    this.nozzleTemperatureC = AMBIENT_K - 273.15;
    this.readings = this.coldReadings();
    this.startScenario = 'normal';
    this.startState = 'off';
    this.faultCode = '';
    this.faultFireAmount = 0;
    this.startElapsed = this.lightoffElapsed = this.abortElapsed = this.purgeRemaining = 0;
    this.unburnedFuelKg = 0;
  }

  coldReadings() {
    return { thrustN: 0, pressureRatio: 1, massFlowKgS: 0, jetVelocity: 0,
      fuelFlowKgS: 0, nozzleAreaRatio: 1,
      compressorExitTemperatureC: AMBIENT_K - 273.15,
      turbineInletTemperatureC: AMBIENT_K - 273.15 };
  }

  // Ideal-expanded equivalent nozzle: Pe=Pambient, F=mdot_exit*Vexit for
  // this stationary bench. Turbine work first pays for compressor work; the
  // afterburner adds heat downstream, not crank torque or core overspeed.
  cycle(coreFraction, afterburnerAmount, turbineInletK, massFlowKgS,
    afterburnerTemperatureK = this.spec.designTurbineInletK) {
    const s = this.spec;
    const n = clamp(coreFraction, 0, 1);
    const pressureRatio = 1 + (s.designPressureRatio - 1) * n ** 2.4;
    const compressorK = AMBIENT_K * (1 + (pressureRatio ** ((AIR_GAMMA - 1) / AIR_GAMMA) - 1)
      / s.compressorEfficiency);
    const turbineK = Math.max(AMBIENT_K, turbineInletK
      - AIR_CP * (compressorK - AMBIENT_K) / (GAS_CP * s.shaftEfficiency));
    const turbinePressure = AMBIENT_PA * pressureRatio * s.burnerPressureRecovery
      * (turbineK / turbineInletK) ** (GAS_GAMMA / ((GAS_GAMMA - 1) * s.turbineEfficiency));
    const ab = clamp(afterburnerAmount, 0, 1);
    const nozzleK = turbineK + Math.max(0, afterburnerTemperatureK - turbineK) * ab;
    const nozzlePressure = Math.max(AMBIENT_PA, turbinePressure * (1 - 0.04 * ab));
    const mainFuelRatio = Math.max(0, GAS_CP * (turbineInletK - compressorK)
      / (s.burnerEfficiency * FUEL_LHV - GAS_CP * turbineInletK));
    const abFuelRatio = Math.max(0, (1 + mainFuelRatio) * GAS_CP * (nozzleK - turbineK)
      / (s.afterburnerEfficiency * FUEL_LHV - GAS_CP * nozzleK));
    const velocity = Math.sqrt(Math.max(0, 2 * s.nozzleEfficiency * GAS_CP * nozzleK
      * (1 - (AMBIENT_PA / nozzlePressure) ** ((GAS_GAMMA - 1) / GAS_GAMMA))));
    return { thrustN: massFlowKgS * (1 + mainFuelRatio + abFuelRatio) * velocity,
      pressureRatio, massFlowKgS, jetVelocity: velocity,
      fuelFlowKgS: massFlowKgS * (mainFuelRatio + abFuelRatio),
      // Same-flow throat-area change from Tt and Pt; this is a relative opening,
      // not a claim about the J85's exact nozzle dimensions or actuator schedule.
      nozzleAreaRatio: Math.sqrt(nozzleK / turbineK) / (1 - 0.04 * ab),
      compressorExitTemperatureC: compressorK - 273.15,
      turbineInletTemperatureC: turbineInletK - 273.15,
      turbineExitTemperatureC: turbineK - 273.15, nozzleTemperatureC: nozzleK - 273.15 };
  }

  setRunning(running) {
    if (running && (this.faultCode || this.purgeRemaining > 0)) return false;
    if (running && !this.running) {
      this.startState = 'purge';
      this.startElapsed = this.lightoffElapsed = 0;
    }
    this.running = Boolean(running);
    if (!this.running) {
      this.afterburnerEnabled = false;
      this.afterburnerAmount = 0;
      this.fuelCommand = 0;
      this.isCombusting = false;
      this.starterActive = false;
      this.readings = { ...this.readings, thrustN: 0, fuelFlowKgS: 0, nozzleAreaRatio: 1 };
      if (!this.faultCode) this.startState = this.coreFraction > 0 ? 'cooldown' : 'off';
    }
    return true;
  }

  setStartScenario(scenario) {
    if (!['normal', 'no-lightoff', 'hot-start'].includes(scenario)
      || this.running || this.starterActive || this.coreFraction >= 0.01) return false;
    this.startScenario = scenario;
    return true;
  }

  resetStartFault() {
    if (this.running || this.starterActive || this.coreFraction >= 0.01 || this.exhaustTemperatureC > 200) return false;
    this.faultCode = '';
    this.faultFireAmount = this.unburnedFuelKg = 0;
    this.startState = this.coreFraction > 0 ? 'cooldown' : 'off';
    return true;
  }

  abortStart(code) {
    this.setRunning(false);
    this.faultCode = code;
    this.startState = 'abort';
    this.abortElapsed = 0;
    this.purgeRemaining = 6;
    this.starterActive = true;
    if (code === 'HOT_START') this.faultFireAmount = 1;
  }

  setAfterburnerEnabled(enabled) { this.afterburnerEnabled = Boolean(enabled); }

  update(dt, throttle) {
    if (!Number.isFinite(dt) || dt <= 0) return this.snapshot();
    const s = this.spec;
    const pedal = this.running ? clamp(Number(throttle) || 0, 0, 1) : 0;
    this.fuelCommand += (pedal - this.fuelCommand) * (1 - Math.exp(-dt / 0.18));
    if (this.running) this.startElapsed += dt;
    const purgingFault = !this.running && this.purgeRemaining > 0;
    this.starterActive = purgingFault || this.running && this.coreFraction < s.idleCoreFraction * 0.92;
    this.isCombusting = this.running && this.coreFraction >= s.lightoffCoreFraction
      && this.startScenario !== 'no-lightoff';
    if (purgingFault) {
      this.abortElapsed += dt;
      this.purgeRemaining = Math.max(0, this.purgeRemaining - dt);
      this.startState = this.abortElapsed < 0.45 ? 'abort' : 'purge';
      this.coreFraction += (0.25 - this.coreFraction) * (1 - Math.exp(-dt / 0.8));
      this.unburnedFuelKg *= Math.exp(-dt / 0.8);
    } else if (!this.running) {
      this.coreFraction *= Math.exp(-dt / s.coastSeconds);
      if (this.coreFraction < 0.001) this.coreFraction = 0;
      this.startState = this.coreFraction > 0 ? 'cooldown' : 'off';
    } else if (!this.isCombusting) {
      // Estimated assisted start; do not teleport from zero to a running idle.
      this.startState = 'purge';
      const motoringLimit = this.startScenario === 'no-lightoff' ? 0.28 : s.lightoffCoreFraction;
      this.coreFraction = Math.min(motoringLimit, this.coreFraction + dt * 0.075);
    } else {
      const hotStart = this.startScenario === 'hot-start' && this.startState !== 'running';
      const target = hotStart ? s.idleCoreFraction * 0.60
        : s.idleCoreFraction + (1 - s.idleCoreFraction) * this.fuelCommand ** 0.65;
      const tau = target > this.coreFraction ? s.spoolUpSeconds * (1 + 1.2 * (1 - this.coreFraction)) : s.spoolDownSeconds;
      this.coreFraction += (target - this.coreFraction) * (1 - Math.exp(-dt / tau));
      this.startState = this.coreFraction >= s.idleCoreFraction * 0.92 ? 'running' : 'lightoff';
    }
    if (this.running && this.coreFraction >= s.lightoffCoreFraction && this.startState !== 'running') this.lightoffElapsed += dt;
    this.faultFireAmount *= Math.exp(-dt / 0.35);
    // An illustrative high-power interlock prevents lighting the augmentor at
    // idle or before light-off. Threshold/timing are estimates, not a flight ECU.
    const wantAB = this.isCombusting && this.afterburnerEnabled && pedal >= 0.9 && this.coreFraction >= 0.92;
    this.afterburnerAmount += ((wantAB ? 1 : 0) - this.afterburnerAmount)
      * (1 - Math.exp(-dt / (wantAB ? 0.35 : 0.12)));
    if (!this.isCombusting) this.afterburnerAmount = 0;
    const massFlow = s.maxMassFlowKgS * this.coreFraction ** 1.4;
    if (this.isCombusting) {
      const band = smooth(clamp((this.coreFraction - s.idleCoreFraction) / (1 - s.idleCoreFraction), 0, 1));
      const hotStart = this.startScenario === 'hot-start' && this.startState === 'lightoff';
      const inletK = hotStart ? 1800 : s.idleTurbineInletK + (s.designTurbineInletK - s.idleTurbineInletK) * band;
      this.readings = this.cycle(this.coreFraction, this.afterburnerAmount, inletK, massFlow,
        s.afterburnerTemperatureK);
    } else {
      // Rotor pumping and residual heat remain audible on shutdown; no fuel,
      // combustion thrust or fictitious shaft power survives the fuel cut.
      this.readings = { ...this.coldReadings(), massFlowKgS: massFlow,
        pressureRatio: 1 + (s.designPressureRatio - 1) * this.coreFraction ** 2.4 };
      if (this.running && this.startScenario === 'no-lightoff' && this.coreFraction >= s.lightoffCoreFraction) {
        this.readings.fuelFlowKgS = 0.035;
        this.unburnedFuelKg += this.readings.fuelFlowKgS * dt;
      }
    }
    const egtTarget = this.isCombusting ? this.readings.turbineExitTemperatureC : AMBIENT_K - 273.15;
    const nozzleTarget = this.isCombusting ? this.readings.nozzleTemperatureC : AMBIENT_K - 273.15;
    this.exhaustTemperatureC += (egtTarget - this.exhaustTemperatureC) * (1 - Math.exp(-dt / (this.running ? 0.8 : purgingFault ? 2 : 5)));
    this.nozzleTemperatureC += (nozzleTarget - this.nozzleTemperatureC) * (1 - Math.exp(-dt / (this.running ? 0.25 : 3)));
    // FAA start-failure principles: no light-off requires fuel shutoff; a hot
    // start is excessive EGT from fuel/air mismatch. Continue dry motoring to
    // purge. The numerical timeout/temperature are training estimates, not an
    // approved J85 operating procedure.
    if (this.running && this.startScenario === 'no-lightoff' && this.lightoffElapsed >= 8) this.abortStart('NO_LIGHTOFF');
    if (this.running && this.startState === 'lightoff' && this.exhaustTemperatureC > 850) this.abortStart('HOT_START');
    return this.snapshot();
  }

  snapshot() {
    return { ...this.readings, coreRPM: this.coreFraction * this.spec.referenceCoreRPM,
      corePercent: this.coreFraction * 100, exhaustTemperatureC: this.exhaustTemperatureC,
      nozzleTemperatureC: this.nozzleTemperatureC, afterburnerAmount: this.afterburnerAmount,
      afterburnerEnabled: this.afterburnerEnabled, isCombusting: this.isCombusting,
      starterActive: this.starterActive, designMassFlowKgS: this.spec.maxMassFlowKgS,
      startScenario: this.startScenario, startState: this.startState, faultCode: this.faultCode,
      faultFireAmount: this.faultFireAmount, unburnedFuelKg: this.unburnedFuelKg,
      coreRPMKind: 'normalized-animation-reference' };
  }
}
