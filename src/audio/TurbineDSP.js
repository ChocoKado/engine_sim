/**
 * Continuous turbine acoustics, shared by AudioWorklet and the callback fallback.
 * Rotor orders are audible proxies, not a claimed blade count or an OEM recording.
 * In particular, a compressor's stage count does not specify its blade-pass tone.
 */
export class TurbineDSP {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.seed = 834721;
    this.rpm = this.flow = this.fuel = this.afterburner = 0;
    this.powerRPM = this.powerPhase = 0;
    this.exhaustMix = this.intakeMix = this.mechanicalMix = 1;
    this.phase = this.secondPhase = 0;
    this.airLow = this.roarLow = this.roarSlow = this.burnerLow = 0;
    this.previous = this.dc = 0;
    this.configure({ layout: 'turbine', defaultRedlineRPM: 54000 });
  }

  configure(config) {
    this.jet = config.propulsionKind === 'turbojet' || config.layout === 'turbojet';
    this.referenceRPM = Math.max(1000, Math.min(120000, Number(config.turboshaftDesign?.ratedCoreRPM)
      || Number(config.soundReferenceCoreRPM) || (this.jet ? config.defaultRedlineRPM : 50970) || 17000));
    this.referencePowerRPM = Math.max(1000, Number(config.turboshaftDesign?.ratedPowerTurbineRPM)
      || Number(config.soundReferencePowerTurbineRPM) || 33290);
  }

  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 2147483648 - 1;
  }

  process(output, parameters = {}) {
    const read = (name, index, fallback) => {
      const value = parameters[name];
      if (value == null) return fallback;
      const number = typeof value === 'number' ? value : value.length > 1 ? value[index] : value[0];
      return Number.isFinite(number) ? number : fallback;
    };
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const dt = 1 / this.sampleRate;
    const slew = 1 - Math.exp(-dt / 0.012);
    const fuelSlew = 1 - Math.exp(-dt / 0.025);
    const mixSlew = 1 - Math.exp(-dt / 0.03);
    for (let i = 0; i < output.length; i++) {
      this.rpm += (clamp(read('rpm', i, 0), 0, 120000) - this.rpm) * slew;
      this.powerRPM += (clamp(read('powerTurbineRPM', i, 0), 0, 120000) - this.powerRPM) * slew;
      this.flow += (clamp(read('turbineFlow', i, 0), 0, 2) - this.flow) * slew;
      this.fuel += (clamp(read('turbineFuel', i, 0), 0, 1) - this.fuel) * fuelSlew;
      this.afterburner += (clamp(read('afterburner', i, 0), 0, 1) - this.afterburner) * fuelSlew;
      const velocity = clamp(read('jetVelocity', i, 0), 0, 2200);
      const pressureRatio = clamp(read('pressureRatio', i, 1), 1, 50);
      const normalizedRPM = clamp(this.rpm / this.referenceRPM, 0, 1.5);
      this.exhaustMix += (clamp(read('exhaustMix', i, 1), 0, 3) - this.exhaustMix) * mixSlew;
      this.intakeMix += (clamp(read('intakeMix', i, 1), 0, 3) - this.intakeMix) * mixSlew;
      this.mechanicalMix += (clamp(read('mechanicalMix', i, 1), 0, 4) - this.mechanicalMix) * mixSlew;
      const exhaustMix = this.exhaustMix, intakeMix = this.intakeMix, mechanicalMix = this.mechanicalMix;
      // Only resolved low shaft orders are synthesized. Attenuate them before
      // Nyquist instead of clamping their pitch into a stationary whistle.
      const shaftHz = this.rpm / 60;
      const secondHz = shaftHz * (this.jet ? 2 : 3);
      this.phase = (this.phase + shaftHz * dt) % 1;
      this.secondPhase = (this.secondPhase + secondHz * dt) % 1;
      const powerHz = this.powerRPM / 60;
      this.powerPhase = (this.powerPhase + powerHz * dt) % 1;
      const audible = hz => clamp((this.sampleRate * 0.43 - hz) / (this.sampleRate * 0.08), 0, 1);
      const rotorLevel = Math.min(1.2, Math.sqrt(normalizedRPM)) * (0.20 + Math.sqrt(this.flow) * 0.8);
      const rotor = (Math.sin(this.phase * Math.PI * 2) * 0.085 * audible(shaftHz)
        + Math.sin(this.secondPhase * Math.PI * 2) * 0.030 * audible(secondHz)) * rotorLevel;
      const powerRotor = Math.sin(this.powerPhase * Math.PI * 2) * audible(powerHz) * 0.055
        * Math.min(1.2, Math.sqrt(this.powerRPM / this.referencePowerRPM));

      const noise = this.random();
      const lowpass = hz => 1 - Math.exp(-2 * Math.PI * Math.min(hz, this.sampleRate * 0.35) * dt);
      this.airLow += (noise - this.airLow) * lowpass(700 + 3300 * Math.min(1.3, normalizedRPM));
      this.roarLow += (noise - this.roarLow) * lowpass(1100 + velocity * 0.65);
      this.roarSlow += (noise - this.roarSlow) * lowpass(80);
      this.burnerLow += (noise - this.burnerLow) * lowpass(420);
      const airflow = this.airLow * Math.sqrt(this.flow) * 0.095;
      const jetEnergy = Math.min(1.8, Math.sqrt(this.flow) * (0.35 + velocity / 1000));
      // Broadband combustion never triggers once per shaft rotation. Fuel off
      // removes the hot roar, while motored rotor / compressor airflow remain.
      const roar = (this.roarLow * 0.22 + this.roarSlow * 0.55) * this.fuel
        * (0.25 + jetEnergy * 0.75) * (0.85 + Math.min(1, (pressureRatio - 1) / 8) * 0.15);
      const afterburner = (this.burnerLow * 1.20 + this.roarLow * 0.18)
        * this.afterburner * this.fuel * jetEnergy;
      const input = rotor * (mechanicalMix * 0.65 + intakeMix * 0.35) + powerRotor * mechanicalMix
        + airflow * intakeMix + (roar + afterburner) * exhaustMix;
      this.dc = input - this.previous + Math.exp(-2 * Math.PI * 12 * dt) * this.dc;
      this.previous = input;
      // Normal levels remain linear; the bound protects against extreme inputs.
      output[i] = clamp(this.dc, -0.92, 0.92);
      if (this.rpm < 0.01 && this.powerRPM < 0.01 && this.flow < 0.00001 && this.fuel < 0.00001) output[i] = 0;
    }
    return output;
  }
}
