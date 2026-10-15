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
    this.phase = this.secondPhase = 0;
    this.airLow = this.roarLow = this.roarSlow = this.burnerLow = 0;
    this.previous = this.dc = 0;
    this.configure({ layout: 'turbine', defaultRedlineRPM: 54000 });
  }

  configure(config) {
    this.jet = config.propulsionKind === 'turbojet' || config.layout === 'turbojet';
    this.referenceRPM = Math.max(1000, Math.min(120000, Number(config.defaultRedlineRPM) || 17000));
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
    for (let i = 0; i < output.length; i++) {
      this.rpm += (clamp(read('rpm', i, 0), 0, 120000) - this.rpm) * slew;
      this.flow += (clamp(read('turbineFlow', i, 0), 0, 2) - this.flow) * slew;
      this.fuel += (clamp(read('turbineFuel', i, 0), 0, 1) - this.fuel) * fuelSlew;
      this.afterburner += (clamp(read('afterburner', i, 0), 0, 1) - this.afterburner) * fuelSlew;
      const velocity = clamp(read('jetVelocity', i, 0), 0, 2200);
      const pressureRatio = clamp(read('pressureRatio', i, 1), 1, 50);
      const normalizedRPM = clamp(this.rpm / this.referenceRPM, 0, 1.5);
      // Only resolved low shaft orders are synthesized. Attenuate them before
      // Nyquist instead of clamping their pitch into a stationary whistle.
      const shaftHz = this.rpm / 60;
      const secondHz = shaftHz * (this.jet ? 2 : 3);
      this.phase = (this.phase + shaftHz * dt) % 1;
      this.secondPhase = (this.secondPhase + secondHz * dt) % 1;
      const audible = hz => clamp((this.sampleRate * 0.43 - hz) / (this.sampleRate * 0.08), 0, 1);
      const rotorLevel = Math.min(1.2, Math.sqrt(normalizedRPM)) * (0.20 + Math.sqrt(this.flow) * 0.8);
      const rotor = (Math.sin(this.phase * Math.PI * 2) * 0.085 * audible(shaftHz)
        + Math.sin(this.secondPhase * Math.PI * 2) * 0.030 * audible(secondHz)) * rotorLevel;

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
      const input = rotor + airflow + roar + afterburner;
      this.dc = input - this.previous + Math.exp(-2 * Math.PI * 12 * dt) * this.dc;
      this.previous = input;
      // A linear bounded range avoids creating above-Nyquist tonal harmonics.
      output[i] = clamp(this.dc, -0.92, 0.92);
      if (this.rpm < 0.01 && this.flow < 0.00001 && this.fuel < 0.00001) output[i] = 0;
    }
    return output;
  }
}
