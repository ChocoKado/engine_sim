/**
 * Sample-rate, phase-continuous pressure-pulse synthesis. This is a compact
 * acoustic model, not a CFD solver or a recording of a particular vehicle.
 * Keeping it independent of Web Audio also makes the actual DSP testable.
 */
export class CombustionDSP {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.phase = 0;
    this.crankPhase = 0;
    this.rotorPhase = 0;
    this.rpm = 900;
    this.load = 0;
    this.cut = 0;
    this.seed = 193731;
    this.noiseLow = 0;
    this.mechanicalLow = 0;
    this.previousInput = 0;
    this.dcState = 0;
    this.reflection = new Float32Array(Math.ceil(sampleRate * 0.08));
    this.writeIndex = 0;
    this.configure({ firingAngles: [0, 180, 360, 540], cylinders: 4, displacement: 1000 });
  }

  configure(config) {
    this.cycleDegrees = config.cycleDegrees || 720;
    this.rotary = config.layout === 'rotary';
    const angles = config.firingAngles?.length ? config.firingAngles : [0, 180, 360, 540];
    this.events = angles.map((angle, i) => ({
      phase: (((Number(angle) || 0) % this.cycleDegrees) + this.cycleDegrees) % this.cycleDegrees / this.cycleDegrees,
      age: 1,
      strength: 0,
      bank: config.exhaustBanks?.[i] ?? (['v', 'w', 'boxer'].includes(config.layout) ? i % 2 : 0),
      ordinal: i,
      count: 0,
    }));
    this.displacement = Math.max(0.05, (Number(config.displacement) || Number(config.defaultDisplacement) || 1000) / 1000);
    this.profile = config.profile || 'deep';
    this.bankDelay = Math.round(this.sampleRate * (config.exhaustPathDelay ?? (0.0008 + Math.min(0.0025, Math.sqrt(this.displacement) * 0.0007))));
    this.reflectionDelay = Math.round(this.sampleRate * (0.0038 + Math.sqrt(this.displacement) * 0.0014));
    this.secondaryDelay = Math.round(this.reflectionDelay * 1.63);
  }

  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 2147483648 - 1;
  }

  process(output, parameters = {}) {
    const read = (name, i, fallback) => {
      const value = parameters[name];
      if (value == null) return fallback;
      const number = typeof value === 'number' ? value : value.length > 1 ? value[i] : value[0];
      return Number.isFinite(number) ? number : fallback;
    };
    const dt = 1 / this.sampleRate;
    const level = 0.76 / Math.sqrt(this.events.length);
    const cylinderLiters = this.displacement / this.events.length;
    const baseExhaustDecay = 0.0018 + Math.sqrt(cylinderLiters) * 0.0035;
    const rpmSlew = 1 - Math.exp(-dt / 0.005);
    const loadSlew = 1 - Math.exp(-dt / 0.012);
    const cutSlew = 1 - Math.exp(-dt / 0.0015);
    for (let i = 0; i < output.length; i++) {
      this.rpm += (Math.max(0, Math.min(24000, read('rpm', i, 900))) - this.rpm) * rpmSlew;
      this.load += (Math.max(0, Math.min(1.6, read('load', i, 0))) - this.load) * loadSlew;
      this.cut += (Math.max(0, Math.min(1, read('ignitionCut', i, 0))) - this.cut) * cutSlew;
      const before = this.phase;
      this.phase = (this.phase + this.rpm * 6 * dt / this.cycleDegrees) % 1;
      this.crankPhase = (this.crankPhase + this.rpm * dt / 60) % 1;
      this.rotorPhase = (this.rotorPhase + this.rpm * dt / 180) % 1;
      const idleBlend = this.rotary
        ? Math.max(0, Math.min(1, (3000 - this.rpm) / 1600))
          * Math.max(0, Math.min(1, (0.40 - this.load) / 0.30))
        : 0;
      const brapBlend = idleBlend * Math.max(0, Math.min(1, read('rotaryBrap', i, 0)));
      // Stock side-port RENESIS retains every evenly spaced firing. At idle,
      // shorter blowdown tails expose each pulse instead of a continuous wash.
      const exhaustDecay = Math.min(0.010, baseExhaustDecay * (this.rotary ? 1.35 - 0.55 * idleBlend : 1));
      const limiterAmount = Math.max(0, Math.min(1, read('limiter', i, 0)));
      const limiterHz = Math.max(8, Math.min(32, read('limiterHz', i, 18)));
      const limiterDepth = Math.max(0.3, Math.min(1, read('limiterDepth', i, 0.85)));
      // 0: quiet proportional cut, 1: grouped hard cuts, 2: rotating cylinders.
      const limiterMode = Math.round(read('limiterMode', i, 1));
      const limitPhase = (read('time', i, 0) + i * dt) * limiterHz;
      const limiter = limitPhase % 1 < limiterAmount;
      const combustion = (1 - this.cut) * (limiterMode === 0 ? 1 - limiterAmount * (0.70 + 0.285 * limiterDepth)
        : limiter ? 1 - limiterDepth * 0.985 : 1);
      const camBlend = Math.max(0, Math.min(1, read('camBlend', i, 0)));
      let pressure = 0;
      for (const event of this.events) {
        const fired = this.phase >= before
          ? before <= event.phase && this.phase > event.phase
          : event.phase >= before || event.phase < this.phase;
        if (fired && this.rpm > 30) {
          // Small cycle differences remove a perfectly repeating electronic buzz.
          event.age = -event.bank * this.bankDelay * dt;
          const sequentialCut = limiterMode === 2 && ((Math.floor(limitPhase) + event.ordinal) % this.events.length)
            / this.events.length < limiterAmount;
          const firing = limiterMode === 2 ? (1 - this.cut) * (sequentialCut ? 1 - limiterDepth * 0.985 : 1) : combustion;
          event.count++;
          // Small face-to-face differences repeat over three shaft revolutions,
          // without changing the rotor's two-per-shaft-turn combustion cadence.
          const faceVariation = 1 + idleBlend * 0.035
            * Math.sin(((event.count - 1) % 3) * Math.PI * 2 / 3 + event.ordinal * 0.8);
          // Optional ported-13B-style sound illustration: weak/strong combustion
          // groups, never whole-output gating or a change to simulated torque.
          const group = 0.28 + 1.9 * Math.max(0, Math.sin(this.rotorPhase * Math.PI * 2));
          const groupedStrength = 1 + brapBlend * (group - 1);
          event.strength = (0.22 + 0.78 * this.load) * firing
            * (0.975 + this.random() * 0.025) * faceVariation * groupedStrength;
        }
        if (event.age >= 0 && event.age < exhaustDecay * 9) {
          const age = event.age;
          const rise = 1 - Math.exp(-age / ((0.00018 + 0.00012 * (1 - Math.min(1, this.load))) * (1 - camBlend * 0.20)));
          const decay = Math.exp(-age / exhaustDecay);
          const reflectedDepression = Math.exp(-age / (exhaustDecay * 1.8)) * 0.23;
          const turbulentEdge = this.random() * Math.exp(-age / (exhaustDecay * 0.55)) * (0.12 + 0.2 * this.load);
          pressure += (rise * decay - reflectedDepression + turbulentEdge) * event.strength;
          // Motored cylinders still pump gas with ignition disabled.
          pressure += rise * decay * (0.014 + this.cut * 0.050);
        }
        event.age += dt;
      }
      const noise = this.random();
      this.noiseLow += (noise - this.noiseLow) * 0.10;
      this.mechanicalLow += (noise - this.mechanicalLow) * 0.028;
      const mechanical = this.mechanicalLow * (0.022 + Math.min(0.025, this.rpm / 400000))
        + Math.sin(this.crankPhase * Math.PI * 2) * 0.012;
      const input = pressure * level + mechanical;
      const length = this.reflection.length;
      const reflection1 = this.reflection[(this.writeIndex - this.reflectionDelay + length) % length];
      const reflection2 = this.reflection[(this.writeIndex - this.secondaryDelay + length) % length];
      const resonant = input + reflection1 * (0.36 - idleBlend * 0.08) - reflection2 * (0.16 - idleBlend * 0.035);
      this.reflection[this.writeIndex] = input + reflection1 * (0.20 - idleBlend * 0.065);
      this.writeIndex = (this.writeIndex + 1) % length;
      // Remove pulse-train DC before nonlinear exhaust saturation.
      const dcPole = 0.9975 + idleBlend * 0.00125;
      this.dcState = resonant - this.previousInput + this.dcState * dcPole;
      this.previousInput = resonant;
      output[i] = Math.tanh(this.dcState * (1.3 + this.load * 0.65)) * 0.78;
    }
    return output;
  }
}

// Embed the same DSP in a worklet without external imports or path assumptions.
export function combustionWorkletSource() {
  return `const CombustionDSP = (${CombustionDSP.toString()});
class CombustionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 24000, automationRate: 'a-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1.6, automationRate: 'k-rate' },
      { name: 'ignitionCut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'limiter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'limiterHz', defaultValue: 18, minValue: 8, maxValue: 32, automationRate: 'k-rate' },
      { name: 'limiterMode', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'limiterDepth', defaultValue: 0.85, minValue: 0.3, maxValue: 1, automationRate: 'k-rate' },
      { name: 'camBlend', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rotaryBrap', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    this.dsp = new CombustionDSP(sampleRate);
    if (options.processorOptions?.config) this.dsp.configure(options.processorOptions.config);
    this.port.onmessage = ({ data }) => { if (data.config) this.dsp.configure(data.config); };
  }
  process(inputs, outputs, parameters) {
    try {
      if (!outputs[0]?.length) return true;
      this.dsp.process(outputs[0][0], { ...parameters, time: currentTime });
      for (let channel = 1; channel < outputs[0].length; channel++) outputs[0][channel].set(outputs[0][0]);
      return true;
    } catch (error) {
      this.port.postMessage({ error: String(error.message || error) });
      return false;
    }
  }
}
registerProcessor('combustion-pressure', CombustionProcessor);`;
}

/** Pressure-dependent transient data shared by live audio and regression tests. */
export function inductionEventShape(eventOrIntensity = 1, type = 'bov') {
  const event = typeof eventOrIntensity === 'object' && eventOrIntensity ? eventOrIntensity : { intensity: eventOrIntensity };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const intensity = clamp(Number(event.intensity) || 0, 0, 2.5);
  const pressure = clamp(Number(event.pressure) || intensity * 0.75, 0.01, 3);
  const rotorRPM = clamp(Number(event.rotorRPM) || 80000 + pressure * 35000, 10000, 250000);
  const duration = clamp(Number(event.duration) || (type === 'flutter' ? 0.18 + Math.sqrt(pressure) * 0.38 : 0.10 + Math.sqrt(pressure) * 0.22), 0.08, 1.2);
  const pulseRate = clamp(Number(event.pulseRate) || 11 + rotorRPM / 24000, 8, 28);
  return { intensity, pressure, rotorRPM, duration, pulseRate, when: event.when };
}
