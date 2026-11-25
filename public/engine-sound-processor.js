const ENGINE_CYCLE_RAD = 4 * Math.PI;
const TELEMETRY_DELAY_SECONDS = 0.04;
const MAX_TELEMETRY_AGE_SECONDS = 0.18;
const MAX_EXTRAPOLATION_SECONDS = 0.045;
const MAX_OUTPUT = 0.38;
const REVOLUTION_RAD = 2 * Math.PI;
const RADIANS_PER_SECOND_TO_RPM = 60 / REVOLUTION_RAD;
const BASELINE_VOICING = { body: 1, harmonics: 1, reflection: 1, pulseTail: 1, turbulence: 1 };
const VOICING_CHANNELS = Object.keys(BASELINE_VOICING);
const SOUND_EFFECTS = ["turboFlutter", "rotaryPort"];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function wrapAngle(angle) {
  const wrapped = angle % ENGINE_CYCLE_RAD;
  return wrapped < 0 ? wrapped + ENGINE_CYCLE_RAD : wrapped;
}

function smoothingFactor(seconds) {
  return 1 - Math.exp(-1 / (sampleRate * seconds));
}

function frequencyFactor(hertz) {
  return 1 - Math.exp(-2 * Math.PI * hertz / sampleRate);
}

function crankTurning(frame) {
  return frame?.engineOn || frame?.starter > 0;
}

function velocityAt(frame, next, previous, time) {
  const age = time - frame.contextTime;
  if (crankTurning(next) && next.contextTime - frame.contextTime < MAX_TELEMETRY_AGE_SECONDS) {
    const fraction = clamp(age / (next.contextTime - frame.contextTime), 0, 1);
    return frame.angularVelocity + fraction * (next.angularVelocity - frame.angularVelocity);
  }

  if (crankTurning(previous) && frame.contextTime - previous.contextTime < MAX_TELEMETRY_AGE_SECONDS) {
    const slope = (frame.angularVelocity - previous.angularVelocity) / (frame.contextTime - previous.contextTime);
    return clamp(frame.angularVelocity + slope * clamp(age, 0, MAX_EXTRAPOLATION_SECONDS), 0, 4000);
  }

  return frame.angularVelocity;
}

class DampedResonator {
  constructor(frequencyHz, decayMs) {
    const angle = 2 * Math.PI * clamp(frequencyHz, 35, sampleRate * 0.2) / sampleRate;
    const radius = Math.exp(-1000 / (sampleRate * clamp(decayMs, 1, 200)));
    this.inputGain = Math.sin(angle);
    this.feedback = 2 * radius * Math.cos(angle);
    this.previousFeedback = radius * radius;
    this.last = 0;
    this.previous = 0;
  }

  render(excitation) {
    const next = excitation * this.inputGain + this.feedback * this.last - this.previousFeedback * this.previous;
    this.previous = this.last;
    this.last = next;
    return next;
  }
}

class ExhaustBodyMode {
  constructor(frequencyHz, decayMs) {
    const angle = REVOLUTION_RAD * frequencyHz / sampleRate;
    // Use the approximate four-time-constant decay to keep the mode broad.
    const q = clamp(Math.PI * frequencyHz * decayMs / 4000, 0.85, 2.15);
    const damping = Math.sin(angle) / (2 * q);
    this.inputGain = damping / (1 + damping);
    this.feedback = 2 * Math.cos(angle) / (1 + damping);
    this.previousFeedback = (1 - damping) / (1 + damping);
    this.history = 0;
    this.previousHistory = 0;
  }

  render(pressure) {
    const direct = pressure * this.inputGain;
    const next = direct + this.history;
    this.history = this.feedback * next + this.previousHistory;
    this.previousHistory = -direct - this.previousFeedback * next;
    return next;
  }
}

class ExhaustCollectorBody {
  constructor({ frequencyHz, decayMs, gain, runnerImbalance }, cylinderCount) {
    const frequency = clamp(frequencyHz, 105, 360);
    const decay = Number.isFinite(decayMs) ? clamp(decayMs, 4, 24) : 11;
    this.collector = new ExhaustBodyMode(frequency, decay);
    this.muffler = new ExhaustBodyMode(frequency * 1.78, decay * 0.64);
    this.lowPassRate = frequencyFactor(1250);
    this.lowPass = 0;
    this.bodyPressure = 0;
    this.gain = clamp(gain, 0, 1);
    this.runnerImbalance = Number.isFinite(runnerImbalance) ? clamp(runnerImbalance, 0, 0.25) : 0;
    this.runnerBalance = Array.from({ length: cylinderCount }, (_, index) => cylinderCount > 1 ? 2 * index / (cylinderCount - 1) - 1 : 0);
  }

  render(exhaust, pressure, nextFiringIndex, rpm) {
    let input = exhaust;
    // The runner weights color already scheduled pulses without moving them or changing engine speed.
    if (pressure && this.runnerImbalance) {
      const firedIndex = nextFiringIndex === 0 ? this.runnerBalance.length - 1 : nextFiringIndex - 1;
      const imbalance = this.runnerImbalance * (0.5 + 0.5 * clamp(rpm / 8500, 0, 1));
      input += 12 * pressure * this.runnerBalance[firedIndex] * imbalance;
    }
    const resonantPressure = 0.65 * this.collector.render(input) + 0.59 * this.muffler.render(input);
    this.lowPass += this.lowPassRate * (resonantPressure - this.lowPass);
    this.bodyPressure += this.lowPassRate * (this.lowPass - this.bodyPressure);
    return this.gain * this.bodyPressure;
  }
}

class SuperchargerWhine {
  constructor({ driveRatio, audioGain }) {
    this.driveRatio = driveRatio;
    this.gain = clamp(audioGain, 0, 0.32);
    this.maximumAngularVelocity = REVOLUTION_RAD * sampleRate * 0.2;
    this.smoothing = smoothingFactor(0.012);
    this.angularVelocity = 0;
    this.phase = 0;
    this.chirpPhase = 0;
    this.chirpDecay = 1 - smoothingFactor(0.035);
    this.releasePressure = 0;
  }

  targetVelocity(frame) {
    const velocity = frame.superchargerAngularVelocity ?? frame.angularVelocity * this.driveRatio;
    return Number.isFinite(velocity) ? clamp(velocity, 0, this.maximumAngularVelocity) : 0;
  }

  render(shaftTarget, throttle, load, turbulence, closingThrottle) {
    this.angularVelocity += this.smoothing * (shaftTarget - this.angularVelocity);
    this.phase += this.angularVelocity / sampleRate;
    if (this.phase >= REVOLUTION_RAD) this.phase -= REVOLUTION_RAD;

    const speedLevel = clamp(this.angularVelocity / (REVOLUTION_RAD * 1700), 0, 1);
    // The impeller remains driven through lift-off and combustion cut.
    const harmonic = Math.sin(2 * this.phase);
    const bladeBand = clamp(1 - 6 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.38), 0, 1);
    const bladeTone = 0.10 * bladeBand * Math.sin(6 * this.phase);
    const whine = (Math.sin(this.phase) + 0.21 * harmonic + bladeTone) * (0.30 + 0.53 * throttle + 0.17 * load);
    const shaftSlowdown = clamp((this.angularVelocity - shaftTarget) / (REVOLUTION_RAD * 140), 0, 1);
    // A rapid lift at high shaft speed briefly excites the intake while the compressor stays geared to the crank.
    this.releasePressure = Math.max(this.releasePressure * this.chirpDecay, closingThrottle * shaftSlowdown * speedLevel ** 2);
    this.chirpPhase = (this.chirpPhase + (19 + this.releasePressure * 15) / sampleRate) % 1;
    const chirpEnvelope = this.releasePressure * (0.66 + 0.34 * Math.sin(REVOLUTION_RAD * this.chirpPhase));
    const chirp = chirpEnvelope * (0.74 * harmonic + 0.19 * Math.sin(3 * this.phase) + 0.46 * turbulence);
    const air = turbulence * speedLevel * (0.055 + 0.13 * throttle + 0.05 * load);
    return this.gain * speedLevel * (whine + air + chirp);
  }
}

class ExhaustAfterfire {
  constructor(exhaustFrequencyHz, reflectionMs, onFire) {
    this.onFire = onFire;
    this.shell = new ExhaustBodyMode(clamp(exhaustFrequencyHz * 1.43, 115, 395), 6.2);
    this.reflection = new Float32Array(Math.ceil(sampleRate * clamp(reflectionMs, 1.4, 6) / 1000));
    this.reflectionIndex = 0;
    this.frontDecay = 1 - smoothingFactor(0.00048);
    this.reboundDecay = 1 - smoothingFactor(0.0017);
    this.front = 0;
    this.rebound = 0;
    this.scatter = 0;
    this.tailSamples = 0;
    this.reset();
  }

  reset() {
    this.charge = 0;
    this.wasOpen = false;
    this.wasPoweredCut = false;
    this.armedFromUpshift = false;
    this.count = 0;
  }

  update({ throttle, angularVelocity, combustion, load, shiftCut, upshifting, revMatchThrottle = 0 }, harmonics, seconds) {
    const rpm = angularVelocity * RADIANS_PER_SECOND_TO_RPM;
    const open = throttle > 0.08;
    const poweredCut = upshifting && throttle >= 0.60 && shiftCut >= 0.50 && rpm >= 5000;
    const revMatching = revMatchThrottle > 0.04;
    const voicing = 0.66 + 0.34 * clamp(harmonics, 0.5, 1.5);
    if (revMatching) {
      this.count = 0;
      this.charge *= Math.exp(-seconds / 0.055);
    } else if (open) {
      if (!this.armedFromUpshift) this.count = 0;
      if (poweredCut && !this.wasPoweredCut) {
        const strength = this.charge * voicing;
        if (strength > 0.20 && Math.random() < clamp(0.16 + 0.65 * strength, 0, 0.78)) {
          this.armedFromUpshift = true;
          this.count = 1;
          this.delay = Math.round(sampleRate * (0.016 + Math.random() * 0.038));
          this.strength = strength * 0.92;
        }
      }
      const heat = clamp((rpm - 2600) / 5000, 0, 1) * clamp((throttle - 0.12) / 0.5, 0, 1);
      const target = heat * (0.63 + 0.24 * Math.sqrt(combustion) + 0.13 * load);
      this.charge += (1 - Math.exp(-seconds / 0.13)) * (target - this.charge);
    } else if (this.wasOpen) {
      const strength = this.charge * voicing;
      if (!this.armedFromUpshift && rpm > 3400 && strength > 0.14 && shiftCut < 0.15 && Math.random() < clamp(0.2 + 0.87 * strength, 0, 0.89)) {
        this.count = 1 + Number(Math.random() < strength * 0.55) + Number(Math.random() < strength * 0.19);
        const transit = this.reflection.length / sampleRate;
        this.delay = Math.round(sampleRate * (0.027 + transit + Math.random() * 0.112));
        this.strength = strength;
      }
      this.charge = 0;
    }
    if (rpm < 2500 || (this.armedFromUpshift && !upshifting)) {
      this.count = 0;
      this.armedFromUpshift = false;
    }
    this.wasOpen = open && !revMatching;
    this.wasPoweredCut = poweredCut;
  }

  fire() {
    this.count -= 1;
    this.delay = Math.round(sampleRate * (0.062 + Math.random() * 0.142));
    const shiftPop = this.armedFromUpshift;
    const impulse = clamp((0.34 + this.strength * 0.56) * (0.66 + Math.random() * 0.34), 0, 0.96);
    this.strength *= 0.72;
    const pressure = impulse * (shiftPop ? 1.32 : 1.12);
    this.front += pressure;
    this.rebound += pressure;
    this.scatter += impulse * (shiftPop ? 0.56 : 1);
    this.scatterDecay = 1 - smoothingFactor(shiftPop ? 0.0028 : 0.0045);
    const durationMs = Math.round((shiftPop ? 31 : 46) + 22 * impulse);
    this.tailSamples = Math.ceil(sampleRate * durationMs / 1000);
    this.armedFromUpshift = false;
    this.onFire(impulse, durationMs);
    return impulse;
  }

  render(noise) {
    const impulse = this.count > 0 && --this.delay <= 0 ? this.fire() : 0;
    if (this.tailSamples === 0) return 0;
    this.tailSamples -= 1;
    // The steep pressure front and rebound make the crack. Only a small part rings in the muffler.
    this.front *= this.frontDecay;
    this.rebound *= this.reboundDecay;
    this.scatter *= this.scatterDecay;
    const pressure = 3.42 * this.front - 1.08 * this.rebound;
    const delayed = this.reflection[this.reflectionIndex];
    this.reflection[this.reflectionIndex] = pressure;
    this.reflectionIndex = (this.reflectionIndex + 1) % this.reflection.length;
    return pressure - 0.26 * delayed + 11 * this.shell.render(impulse) + 2.4 * this.scatter * noise;
  }
}

class TurboSound {
  constructor({ releaseStyle: style = "recirculating", maxBoostBar }) {
    this.gain = style === "subtle" ? 0.32 : style === "recirculating" ? 0.67 : 1.1;
    this.maxBoost = Number.isFinite(maxBoostBar) && maxBoostBar > 0 ? maxBoostBar : 1;
    this.spool = 0;
    this.spoolPhase = 0;
    this.spoolSmoothing = smoothingFactor(0.07);
    this.envelope = 0;
    this.smoothing = smoothingFactor(0.012);
    this.previousLevel = 0;
    this.pressure = 0;
    this.untilBurst = 0;
    this.air = 0;
    this.airBaseline = 0;
    this.airFloor = frequencyFactor(230);
    this.burstEnergy = 0;
    this.burstAge = 0;
    this.burstSamples = 0;
  }

  renderSpool(pressureBar, rpm, turbulence) {
    const target = clamp(pressureBar / this.maxBoost, 0, 1);
    this.spool += this.spoolSmoothing * (target - this.spool);
    if (this.spool < 0.001) return 0;
    // Pressure shapes the compressor sound. There is no implied measurement of turbo shaft speed.
    const pitch = 510 + 1410 * Math.sqrt(this.spool) + 0.021 * rpm;
    this.spoolPhase = (this.spoolPhase + pitch / sampleRate) % 1;
    const phase = this.spoolPhase * REVOLUTION_RAD;
    return this.spool * (0.105 * Math.sin(phase) + 0.035 * Math.sin(phase * 2) + 0.13 * turbulence);
  }

  releaseBurst(noise) {
    const pressure = this.pressure;
    this.burstEnergy = pressure ** 0.87;
    this.burstAge = 0;
    this.burstSamples = Math.round(sampleRate * (0.022 + (1 - pressure) * 0.015));
    this.airEdge = frequencyFactor(470 + 1840 * pressure);
    this.untilBurst = Math.round(sampleRate * (0.032 + (1 - pressure) * 0.042 + 0.008 * noise));
    this.pressure *= 0.49 + 0.1 * noise;
  }

  render(level, noise, turbulence, flutter) {
    if (flutter > 0.05 && level > 0.14 && level > this.previousLevel + 0.045) {
      this.pressure = level;
      this.untilBurst = Math.round(sampleRate * 0.004);
    }
    this.previousLevel = level;
    this.envelope += this.smoothing * (level - this.envelope);
    const bypass = this.envelope * (1 - 0.86 * flutter) * this.gain * 1.12 * turbulence;
    // Each pressure reversal spends part of the remaining boost. The next puff comes later
    // and has less top end, instead of sounding like the same hiss with a modulation applied.
    if (this.pressure > 0.065 && --this.untilBurst <= 0) this.releaseBurst(noise);
    if (this.burstAge >= this.burstSamples) return bypass;
    const travel = this.burstAge++ / this.burstSamples;
    const attack = Math.min(1, travel * 24);
    const falloff = (1 - travel) ** 2.8;
    this.air += this.airEdge * (noise - this.air);
    this.airBaseline += this.airFloor * (noise - this.airBaseline);
    const pressureNoise = 2.3 * (this.air - this.airBaseline) + 0.28 * turbulence;
    return bypass + flutter * this.burstEnergy * attack * falloff * pressureNoise;
  }
}

class StarterSound {
  constructor(electric) {
    this.electric = electric;
    this.level = 0;
    this.engaged = false;
    this.phase = 0;
    this.attack = smoothingFactor(0.024);
    this.release = smoothingFactor(0.019);
    this.contact = electric ? null : new DampedResonator(810, 2.4);
    this.pinion = electric ? null : new DampedResonator(1760, 1.9);
    this.meshDelay = 0;
    this.caseNoise = 0;
    this.caseSmoothing = frequencyFactor(1540);
  }

  render(starter, angularVelocity, compression, noise) {
    const engaged = starter > 0.02;
    if (!engaged && !this.engaged && this.level < 0.0001) return 0;
    const began = engaged && !this.engaged;
    const contactImpulse = began ? 0.39 * starter : this.engaged && !engaged ? -0.045 : 0;
    if (began && !this.electric) this.meshDelay = Math.round(sampleRate * 0.009);
    this.engaged = engaged;
    this.level += (engaged ? this.attack : this.release) * (starter - this.level);
    const pitch = clamp(angularVelocity * (this.electric ? 8 : 32) / REVOLUTION_RAD, this.electric ? 36 : 112, 1000);
    this.phase = (this.phase + pitch / sampleRate) % 1;
    const phase = REVOLUTION_RAD * this.phase;
    if (this.electric) return this.level * (0.041 * Math.sin(phase) + 0.034 * Math.sin(2 * phase) + 0.022 * noise);
    const meshImpulse = this.meshDelay > 0 && --this.meshDelay === 0 && engaged ? 0.12 : 0;
    this.caseNoise += this.caseSmoothing * (noise - this.caseNoise);
    const gearWhir = 0.12 * Math.sin(phase) + 0.095 * Math.sin(phase * 2) + 0.042 * Math.sin(phase * 3);
    const grind = 0.35 * this.caseNoise + 0.083 * noise;
    const crankingBody = (0.52 + 0.52 * compression) * (gearWhir + grind);
    return this.level * crankingBody + this.contact.render(contactImpulse) + this.pinion.render(meshImpulse);
  }
}

class ElectricMotorSound {
  constructor() {
    this.omega = 0;
    this.level = 0;
    this.phase = 0;
    this.smoothing = smoothingFactor(0.024);
  }

  render(angularVelocity, load, turbulence) {
    if (angularVelocity === 0 && this.omega < 0.01 && this.level < 0.0001) return 0;
    this.omega += this.smoothing * (angularVelocity - this.omega);
    const target = clamp(this.omega / 90, 0, 1) * (0.23 + 0.77 * Math.abs(load));
    this.level += this.smoothing * (target - this.level);
    // Electrical tone follows the motor shaft. Its simulated pole count is a sound parameter.
    const pitch = Math.min(1400, this.omega * 5 / REVOLUTION_RAD);
    this.phase = (this.phase + pitch / sampleRate) % 1;
    const phase = this.phase * REVOLUTION_RAD;
    const whine = 0.069 * Math.sin(phase) + 0.032 * Math.sin(2 * phase)
      + (load < 0 ? 0.025 : 0.012) * Math.sin(3 * phase);
    return this.level * (0.76 * whine + 0.042 * turbulence);
  }
}

class EngineSoundProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();

    const {
      firingAnglesRad, exhaustBanks, exhaustFrequencyHz, pulseDecayMs,
      exhaustOpeningRad = 0, exhaustReflectionMs, exhaustBody, brightnessStartRpm = 8000, brightnessMaxRpm,
      supercharger, turbocharger, rotaryIdleRpm, electricStarter,
    } = processorOptions;
    const exhaustOffset = Number.isFinite(exhaustOpeningRad) ? exhaustOpeningRad : 0;
    this.exhaustOffset = exhaustOffset;
    const events = firingAnglesRad.map((angle, index) => ({ angle: wrapAngle(angle + exhaustOffset), bank: exhaustBanks?.[index] ?? 0 }));
    events.sort((a, b) => a.angle - b.angle);
    this.exhaustPulseAnglesRad = events.map(({ angle }) => angle);
    this.exhaustBanks = exhaustBanks ? events.map(({ bank }) => bank) : null;
    this.exhaust = new DampedResonator(exhaustFrequencyHz, pulseDecayMs * 0.93);
    this.otherBank = this.exhaustBanks ? new DampedResonator(exhaustFrequencyHz * 0.88, pulseDecayMs * 1.05) : null;
    this.exhaustOvertone = new DampedResonator(exhaustFrequencyHz * 2.55, pulseDecayMs * 0.42);
    this.exhaustEdge = new DampedResonator(exhaustFrequencyHz * 12.5, 1.85);
    this.tripleCollector = firingAnglesRad.length === 3 ? new DampedResonator(exhaustFrequencyHz * 0.78, pulseDecayMs * 1.2) : null;
    this.collectorBody = Number.isFinite(exhaustBody?.frequencyHz) && Number.isFinite(exhaustBody.gain) && exhaustBody.gain > 0
      ? new ExhaustCollectorBody(exhaustBody, firingAnglesRad.length) : null;
    // A quarter-wave pipe's round-trip time is half a period of its fundamental.
    const reflectionMs = Number.isFinite(exhaustReflectionMs) ? exhaustReflectionMs : 500 / exhaustFrequencyHz;
    this.afterfire = new ExhaustAfterfire(exhaustFrequencyHz, reflectionMs, (strength, durationMs) => {
      this.port.postMessage?.({ type: "afterfire", strength, durationMs });
    });
    this.turbo = turbocharger ? new TurboSound(turbocharger) : null;
    this.rotaryIdleRpm = Number.isFinite(rotaryIdleRpm) && rotaryIdleRpm > 0 ? rotaryIdleRpm : 0;
    this.rotaryIdleBody = this.rotaryIdleRpm ? new DampedResonator(124, 9) : null;
    this.rotaryUnburned = this.rotaryIdleBody ? new Float32Array(2) : null;
    this.electricStarter = electricStarter === true;
    this.starter = null;
    this.motor = null;
    this.startedByCranking = false;
    this.catchCharge = 0;
    this.catchDecay = 1 - smoothingFactor(0.15);
    this.exhaustDelay = new Float32Array(Math.ceil(sampleRate * clamp(reflectionMs, 0.8, 8) / 1000));
    this.exhaustDelayIndex = 0;
    this.exhaustReflectionSmoothing = frequencyFactor(1700);
    this.reflectedPressure = 0;
    this.brightnessStartRpm = Number.isFinite(brightnessStartRpm) ? Math.max(0, brightnessStartRpm) : 8000;
    this.brightnessRangeRpm = Number.isFinite(brightnessMaxRpm) && brightnessMaxRpm > this.brightnessStartRpm
      ? brightnessMaxRpm - this.brightnessStartRpm : 5000;
    this.pressureNoiseBaselineSmoothing = frequencyFactor(950);
    this.pressureNoiseSmoothing = frequencyFactor(4400);
    this.pressureFrontDecay = 1 - smoothingFactor(0.00028);
    this.voicing = { ...BASELINE_VOICING, turboFlutter: 0, rotaryPort: 0 };
    this.targetVoicing = { ...this.voicing };
    this.dcSmoothing = frequencyFactor(22);
    this.outputSmoothing = frequencyFactor(5800);
    this.throttleAttack = smoothingFactor(0.045);
    this.throttleRelease = smoothingFactor(0.105);
    this.loadSmoothing = smoothingFactor(0.06);
    this.chargeAttack = smoothingFactor(0.03);
    this.chargeRelease = smoothingFactor(0.06);
    this.camSmoothing = smoothingFactor(0.065);
    this.camEngagement = 0;
    this.shiftCutAttack = smoothingFactor(0.007);
    this.shiftCutRelease = smoothingFactor(0.014);
    this.velocitySmoothing = smoothingFactor(0.003);
    this.phaseSmoothing = smoothingFactor(0.08);
    this.gateAttack = smoothingFactor(0.032);
    this.gateRelease = smoothingFactor(0.055);
    this.noiseSeed = 0x7d4ace62;
    this.supercharger = Number.isFinite(supercharger?.driveRatio) && supercharger.driveRatio > 0
      && Number.isFinite(supercharger.audioGain) && supercharger.audioGain > 0 ? new SuperchargerWhine(supercharger) : null;

    this.telemetryQueue = [];
    this.previousTelemetry = null;
    this.synchronized = false;
    this.angle = 0;
    this.nextFiringIndex = 0;
    this.radiansToFire = 0;
    this.angularVelocity = 0;
    this.phaseCorrection = 0;
    this.throttle = 0;
    this.load = 0;
    this.combustion = 0;
    this.shiftCut = 0;
    this.gate = 0;
    this.pressureNoiseBaseline = 0;
    this.pressureLowPass = 0;
    this.pressureFront = 0;
    this.pressureTail = 0;
    this.dcMean = 0;
    this.filteredOutput = 0;

    this.port.onmessage = ({ data }) => {
      if (data?.type === "tuning") {
        const voicing = data.voicing;
        if (voicing && VOICING_CHANNELS.every((channel) => Number.isFinite(voicing[channel]))) {
          this.targetVoicing = Object.fromEntries(VOICING_CHANNELS.map((channel) => [channel, clamp(voicing[channel], 0.45, 1.6)]));
          for (const effect of SOUND_EFFECTS) this.targetVoicing[effect] = Number.isFinite(voicing[effect]) ? clamp(voicing[effect], 0, 1) : 0;
        }
        return;
      }
      if (data?.type === "reset-clock") {
        this.telemetryQueue.length = 0;
        this.previousTelemetry = null;
        this.synchronized = false;
        this.afterfire.reset();
        this.startedByCranking = false;
        this.catchCharge = 0;
        return;
      }
      if (data?.type !== "state") return;

      const { angleRad, angularVelocity, throttle, combustion, load, shiftCut = 0, upshifting = false, engineOn, contextTime } = data;
      if (!Number.isFinite(angleRad) || !Number.isFinite(angularVelocity) || angularVelocity < 0
        || angularVelocity > 4000 || !Number.isFinite(throttle) || !Number.isFinite(combustion)
        || !Number.isFinite(load) || !Number.isFinite(shiftCut) || typeof upshifting !== "boolean"
        || typeof engineOn !== "boolean" || !Number.isFinite(contextTime)) {
        this.telemetryQueue.length = 0;
        this.previousTelemetry = null;
        return;
      }

      const queue = this.telemetryQueue;
      const previousTime = queue.at(-1)?.contextTime;
      if (contextTime < previousTime) return;
      if (contextTime === previousTime) queue.pop();
      const starter = Number.isFinite(data.starter) ? clamp(data.starter, 0, 1) : 0;
      const motorAngularVelocity = Number.isFinite(data.motorAngularVelocity) ? clamp(data.motorAngularVelocity, 0, 10000) : 0;
      const motorLoad = Number.isFinite(data.motorLoad) ? clamp(data.motorLoad, -1, 1) : 0;
      if (starter && !this.starter) this.starter = new StarterSound(this.electricStarter);
      if (motorAngularVelocity && !this.motor) this.motor = new ElectricMotorSound();
      queue.push({
        angleRad: wrapAngle(angleRad), angularVelocity, engineOn, contextTime, starter, motorAngularVelocity, motorLoad,
        throttle: clamp(throttle, 0, 1), combustion: clamp(combustion, 0, 1), load: clamp(load, 0, 1),
        shiftCut: clamp(shiftCut, 0, 1), upshifting,
        superchargerAngularVelocity: data.superchargerAngularVelocity,
        turboRelease: Number.isFinite(data.turboRelease) ? clamp(data.turboRelease, 0, 1) : 0,
        turboBoostBar: Number.isFinite(data.turboBoostBar) ? clamp(data.turboBoostBar, 0, 6) : 0,
        revMatchThrottle: Number.isFinite(data.revMatchThrottle) ? clamp(data.revMatchThrottle, 0, 1) : 0,
        vtecEngagement: Number.isFinite(data.vtecEngagement) ? clamp(data.vtecEngagement, 0, 1) : 0,
      });
      if (queue.length > 32) this.previousTelemetry = queue.shift();
    };
  }

  alignCrank(angle, angularVelocity) {
    this.synchronized = true;
    this.angle = angle;
    this.angularVelocity = angularVelocity;
    this.phaseCorrection = 0;
    const firingIndex = this.exhaustPulseAnglesRad.findIndex((pulseAngle) => pulseAngle >= angle);
    this.nextFiringIndex = firingIndex < 0 ? 0 : firingIndex;
    this.radiansToFire = this.exhaustPulseAnglesRad[this.nextFiringIndex] - angle;
    if (firingIndex < 0) this.radiansToFire += ENGINE_CYCLE_RAD;
  }

  advanceCrank(increment) {
    this.angle += increment;
    if (this.angle >= ENGINE_CYCLE_RAD) this.angle -= ENGINE_CYCLE_RAD;
    if (increment <= 0) return false;

    this.radiansToFire -= increment;
    if (this.radiansToFire > 0) return false;

    const firedAt = this.exhaustPulseAnglesRad[this.nextFiringIndex];
    this.nextFiringIndex = (this.nextFiringIndex + 1) % this.exhaustPulseAnglesRad.length;
    const next = this.exhaustPulseAnglesRad[this.nextFiringIndex];
    this.radiansToFire += this.nextFiringIndex === 0 ? next + ENGINE_CYCLE_RAD - firedAt : next - firedAt;
    return true;
  }

  process(_inputs, outputs) {
    const channels = outputs[0];
    const output = channels?.[0];
    if (!output) return true;

    const voicing = this.voicing;
    const voicingRate = 1 - Math.exp(-output.length / (sampleRate * 0.045));
    for (const channel of VOICING_CHANNELS) voicing[channel] += voicingRate * (this.targetVoicing[channel] - voicing[channel]);
    for (const effect of SOUND_EFFECTS) voicing[effect] += voicingRate * (this.targetVoicing[effect] - voicing[effect]);
    const pressureTailDecay = 1 - smoothingFactor(0.0021 * voicing.pulseTail);

    const playheadTime = currentTime - TELEMETRY_DELAY_SECONDS;
    const endTime = playheadTime + output.length / sampleRate;
    const queue = this.telemetryQueue;
    while (queue[1]?.contextTime <= playheadTime) this.previousTelemetry = queue.shift();
    const [telemetry, following] = queue;
    const age = telemetry ? playheadTime - telemetry.contextTime : Infinity;
    const fresh = age >= -1e-9 && age < MAX_TELEMETRY_AGE_SECONDS;
    const running = fresh && telemetry.engineOn;
    const starterLevel = fresh ? telemetry.starter : 0;
    const cranking = starterLevel > 0;
    const motorSpeed = fresh ? telemetry.motorAngularVelocity : 0;
    const motorLoad = fresh ? telemetry.motorLoad : 0;
    const starter = this.starter;
    const motor = this.motor;
    const auxiliarySound = cranking || starter?.level > 0.0001 || motorSpeed > 0 || motor?.level > 0.0001;
    const starterCompression = cranking && !this.electricStarter;
    const throttle = running ? Math.max(telemetry.throttle, telemetry.revMatchThrottle) : 0;
    const load = running ? telemetry.load : 0;
    const combustion = running ? Math.sqrt(telemetry.combustion) : 0;
    const shiftCut = running ? telemetry.shiftCut : 0;
    const turboRelease = running ? telemetry.turboRelease : 0;
    const turboBoost = running ? telemetry.turboBoostBar : 0;
    const camTarget = running ? telemetry.vtecEngagement : 0;
    if (running) {
      this.afterfire.update(telemetry, voicing.harmonics, output.length / sampleRate);
      if (this.startedByCranking) this.catchCharge = this.electricStarter ? 1.2 : 0.98;
    } else {
      this.afterfire.reset();
    }
    this.startedByCranking = cranking && !running;
    const gateTarget = running ? clamp(telemetry.angularVelocity / 130, 0, 1) : 0;
    const supercharger = this.supercharger;
    let shaftTarget = 0;
    let shaftIncrement = 0;
    if (running && supercharger) {
      shaftTarget = supercharger.targetVelocity(telemetry);
      if (following?.engineOn) {
        const duration = following.contextTime - telemetry.contextTime;
        const difference = supercharger.targetVelocity(following) - shaftTarget;
        const startBlend = clamp(age / duration, 0, 1);
        shaftTarget += difference * startBlend;
        shaftIncrement = difference * (clamp((endTime - telemetry.contextTime) / duration, 0, 1) - startBlend) / output.length;
      }
    }
    let velocityTarget = 0;
    let velocityIncrement = 0;
    let correctionTarget = 0;

    if (running || cranking) {
      velocityTarget = velocityAt(telemetry, following, this.previousTelemetry, playheadTime);
      let endIndex = 0;
      while (crankTurning(queue[endIndex + 1]) && queue[endIndex + 1].contextTime <= endTime) endIndex += 1;
      const endVelocity = velocityAt(queue[endIndex], queue[endIndex + 1], endIndex === 0 ? this.previousTelemetry : queue[endIndex - 1], endTime);
      velocityIncrement = (endVelocity - velocityTarget) / output.length;

      const changingDuration = crankTurning(following) ? age : Math.min(age, MAX_EXTRAPOLATION_SECONDS);
      const angleAdvance = changingDuration * (telemetry.angularVelocity + velocityTarget) / 2 + (age - changingDuration) * velocityTarget;
      const anchorAngle = wrapAngle(telemetry.angleRad + angleAdvance);
      if (!this.synchronized) this.alignCrank(anchorAngle, velocityTarget);
      // Correct slow clock drift without modulating pitch on each physics packet.
      const phaseError = wrapAngle(anchorAngle - this.angle + ENGINE_CYCLE_RAD / 2) - ENGINE_CYCLE_RAD / 2;
      const maxCorrection = velocityTarget * 0.018;
      correctionTarget = clamp(phaseError * 2.5, -maxCorrection, maxCorrection);
    } else if (this.gate < 0.0001) {
      this.synchronized = false;
      if (!auxiliarySound) return true;
    }

    for (let index = 0; index < output.length; index += 1) {
      this.phaseCorrection += this.phaseSmoothing * (correctionTarget - this.phaseCorrection);
      const instantaneousVelocity = Math.max(0, velocityTarget + index * velocityIncrement + this.phaseCorrection);
      this.angularVelocity += this.velocitySmoothing * (instantaneousVelocity - this.angularVelocity);
      const throttleSmoothing = throttle >= this.throttle ? this.throttleAttack : this.throttleRelease;
      const shiftSmoothing = shiftCut >= this.shiftCut ? this.shiftCutAttack : this.shiftCutRelease;
      this.shiftCut += shiftSmoothing * (shiftCut - this.shiftCut);
      const shifting = this.shiftCut > 0.025;
      const chargeSmoothing = combustion >= this.combustion
        ? (shifting ? this.shiftCutRelease : this.chargeAttack)
        : (shifting ? this.shiftCutAttack : this.chargeRelease);
      this.throttle += throttleSmoothing * (throttle - this.throttle);
      this.camEngagement += this.camSmoothing * (camTarget - this.camEngagement);
      this.load += this.loadSmoothing * (load - this.load);
      this.combustion += chargeSmoothing * (combustion - this.combustion);
      const gateSmoothing = gateTarget >= this.gate ? this.gateAttack : this.gateRelease;
      this.gate += gateSmoothing * (gateTarget - this.gate);
      this.catchCharge *= this.catchDecay;

      const rpm = this.angularVelocity * RADIANS_PER_SECOND_TO_RPM;
      const pumpingLevel = clamp((rpm - 1200) / 6500, 0, 1);
      const upperRange = clamp((rpm - this.brightnessStartRpm) / this.brightnessRangeRpm, 0, 1);
      const brightness = upperRange * upperRange * (3 - 2 * upperRange);
      const exhaustPulse = this.advanceCrank(this.angularVelocity / sampleRate);
      const pumping = exhaustPulse ? 0.12 + 0.29 * pumpingLevel : 0;
      // Shifts soften the combustion pulse while the crank continues pumping air.
      const charge = exhaustPulse ? this.combustion * (0.41 + 0.12 * this.load + this.catchCharge * 0.42) * (1 - 0.18 * this.shiftCut) : 0;
      const rotaryIdle = this.rotaryIdleBody
        ? voicing.rotaryPort * clamp((1.9 - rpm / this.rotaryIdleRpm) / 0.72, 0, 1) * clamp(1 - 3 * this.throttle, 0, 1)
        : 0;
      this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) >>> 0;
      const noise = this.noiseSeed / 2147483648 - 1;
      let rotaryAccent = 0;
      if (exhaustPulse && rotaryIdle > 0.001) {
        // The race-port model varies the strength of exhaust events around idle while preserving shaft phase.
        const rotor = this.nextFiringIndex % 2;
        const unburned = this.rotaryUnburned[rotor];
        const weak = noise < 0.19 - 1.58 * unburned;
        rotaryAccent = weak ? -0.93 : 0.47 + unburned * 1.32 + 0.15 * noise;
        this.rotaryUnburned[rotor] = weak ? Math.min(0.88, unburned + 0.42) : 0;
      }
      const pulseScale = 1 + rotaryIdle * rotaryAccent;
      const pressure = (pumping + charge) * pulseScale;
      const idleBody = this.rotaryIdleBody?.render(Math.max(0, rotaryAccent) * pressure * rotaryIdle) ?? 0;
      const otherBankPulse = this.exhaustBanks && pressure
        && this.exhaustBanks[this.nextFiringIndex === 0 ? this.exhaustBanks.length - 1 : this.nextFiringIndex - 1] === 1;
      const body = this.exhaust.render(otherBankPulse ? 0 : pressure) + (this.otherBank?.render(otherBankPulse ? pressure : 0) ?? 0);
      const deeperBody = this.tripleCollector ? this.tripleCollector.render(pressure) * (0.22 + 0.28 * this.load) : 0;
      const highCam = this.camEngagement * this.throttle;
      const overtone = this.exhaustOvertone.render(pressure) * (0.34 + 0.13 * this.load + 0.44 * brightness + 0.17 * highCam);
      const edge = this.exhaustEdge.render(pressure * (0.063 + 0.94 * brightness + 0.24 * highCam));

      this.pressureNoiseBaseline += this.pressureNoiseBaselineSmoothing * (noise - this.pressureNoiseBaseline);

      // A short pressure envelope excites broadband turbulence as exhaust flow starts.
      const pressureBurst = (pumping * 0.55 + charge) * pulseScale;
      this.pressureFront = (this.pressureFront + pressureBurst) * this.pressureFrontDecay;
      this.pressureTail = (this.pressureTail + pressureBurst) * pressureTailDecay;
      this.pressureLowPass += this.pressureNoiseSmoothing * (noise - this.pressureLowPass);
      const turbulence = this.pressureLowPass - this.pressureNoiseBaseline;
      const blowdown = (this.pressureTail - this.pressureFront)
        * (0.09 + 0.08 * brightness + turbulence * (0.49 + 0.45 * brightness + 0.15 * highCam) * voicing.turbulence);

      // A firm cut darkens the exhaust briefly while the timed air pulses continue.
      const cut = clamp((this.shiftCut - 0.18) / 0.72, 0, 1);
      const cutTone = cut * cut * (3 - 2 * cut);
      const exhaustBody = (body + deeperBody) * (1 - 0.06 * cutTone) * voicing.body;
      const exhaustHarmonics = (overtone + edge) * (1 - 0.32 * cutTone) * voicing.harmonics;
      const exhaust = (exhaustBody + exhaustHarmonics) * 0.87 + blowdown * (1 - 0.25 * cutTone);
      const delayedPressure = this.exhaustDelay[this.exhaustDelayIndex];
      this.exhaustDelay[this.exhaustDelayIndex] = exhaust;
      this.exhaustDelayIndex += 1;
      if (this.exhaustDelayIndex === this.exhaustDelay.length) this.exhaustDelayIndex = 0;
      this.reflectedPressure += this.exhaustReflectionSmoothing * (delayedPressure - this.reflectedPressure);
      // The returning pressure wave from an open end is inverted and attenuated.
      const closingThrottle = running ? Math.max(0, this.throttle - throttle) : 0;
      const whine = supercharger ? supercharger.render(shaftTarget + index * shaftIncrement, this.throttle, this.load, turbulence, closingThrottle) : 0;
      const afterfire = this.afterfire.render(turbulence);
      const release = this.turbo?.render(turboRelease, noise, turbulence, voicing.turboFlutter) ?? 0;
      const spool = this.turbo?.renderSpool(turboBoost, rpm, turbulence) ?? 0;
      const mix = 0.96 * exhaust - 0.12 * this.reflectedPressure * voicing.reflection + whine + afterfire + release + spool + 0.82 * idleBody;
      this.dcMean += this.dcSmoothing * (mix - this.dcMean);
      this.filteredOutput += this.outputSmoothing * (mix - this.dcMean - this.filteredOutput);
      let normalized = this.filteredOutput / (1 + Math.abs(this.filteredOutput));
      if (this.collectorBody) {
        const collectorPressure = this.collectorBody.render(exhaust, pressure, this.nextFiringIndex, rpm);
        const extension = collectorPressure * 0.50 * (1 - 0.76 * brightness - 0.12 * cutTone) * voicing.body;
        // Give the body its own soft knee so low frequencies don't compress the exhaust edge or whine.
        const direction = extension < 0 ? -1 : 1;
        const headroom = 1 - direction * normalized;
        const knee = 0.65 * headroom;
        const overflow = Math.abs(extension) - knee;
        const remaining = headroom - knee;
        normalized += overflow > 0 ? direction * (knee + remaining * overflow / (remaining + overflow)) : extension;
      }
      let sample = this.gate * normalized;
      if (auxiliarySound) {
        const motorSound = motor?.render(motorSpeed, motorLoad, turbulence) ?? 0;
        const compression = starterCompression ? Math.exp(-6 * (this.radiansToFire - this.exhaustOffset) ** 2) : 0;
        const starterSound = starter?.render(starterLevel, this.angularVelocity, compression, noise) ?? 0;
        sample = clamp(sample + (starterSound + motorSound) * (1 - Math.abs(sample)), -1, 1);
      }
      output[index] = MAX_OUTPUT * sample;
    }

    for (let index = 1; index < channels.length; index += 1) channels[index].set(output);
    return true;
  }
}

registerProcessor("engine-sound", EngineSoundProcessor);
