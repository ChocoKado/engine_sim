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
    this.runnerImbalance = Number.isFinite(runnerImbalance) ? clamp(runnerImbalance, 0, 0.45) : 0;
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
    const resonantPressure = 0.68 * this.collector.render(input) + 0.61 * this.muffler.render(input);
    this.lowPass += this.lowPassRate * (resonantPressure - this.lowPass);
    this.bodyPressure += this.lowPassRate * (this.lowPass - this.bodyPressure);
    return this.gain * this.bodyPressure;
  }
}

class SuperchargerWhine {
  constructor({ driveRatio, audioGain, whineStyle = "centrifugal" }) {
    this.driveRatio = driveRatio;
    this.roots = whineStyle === "roots";
    this.gain = clamp(audioGain, 0, 0.38);
    this.maximumAngularVelocity = REVOLUTION_RAD * sampleRate * 0.2;
    this.smoothing = smoothingFactor(0.012);
    this.angularVelocity = 0;
    this.phase = 0;
    this.chirpPhase = 0;
    this.chirpDecay = 1 - smoothingFactor(0.21);
    this.chirpCancelDecay = 1 - smoothingFactor(0.022);
    this.releasePressure = 0;
    this.airLow = 0;
    this.airHigh = 0;
    this.airLowRate = frequencyFactor(2100);
    this.airHighRate = frequencyFactor(5100);
  }

  targetVelocity(frame) {
    const velocity = frame.superchargerAngularVelocity ?? frame.angularVelocity * this.driveRatio;
    return Number.isFinite(velocity) ? clamp(velocity, 0, this.maximumAngularVelocity) : 0;
  }

  render(shaftTarget, throttle, rawThrottle, load, noise, closingThrottle) {
    if (this.gain === 0 || (shaftTarget === 0 && this.angularVelocity < 1e-4)) {
      this.angularVelocity = 0;
      this.releasePressure = 0;
      return { whine: 0, chirp: 0 };
    }
    this.angularVelocity += this.smoothing * (shaftTarget - this.angularVelocity);
    this.phase += this.angularVelocity / sampleRate;
    if (this.phase >= REVOLUTION_RAD) this.phase -= REVOLUTION_RAD;

    this.airLow += this.airLowRate * (noise - this.airLow);
    this.airHigh += this.airHighRate * (noise - this.airHigh);
    const compressedAir = this.airHigh - this.airLow;

    if (this.roots) {
      // Positive-displacement 4-lobe Roots / Twin-Screw blower ("Hellcat" scream):
      // 4× and 8× lobe-pass frequencies scream immediately as the bypass valve shuts under throttle.
      const rootsLevel = clamp(this.angularVelocity / (REVOLUTION_RAD * 290), 0, 1);
      const lobe4Band = clamp(1 - 4 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.42), 0, 1);
      const lobe8Band = clamp(1 - 8 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.40), 0, 1);
      const bypassClosed = 0.14 + 0.74 * throttle ** 0.52 + 0.12 * load;
      const lobeScream = (
        0.22 * Math.sin(this.phase)
        + 0.44 * Math.sin(2 * this.phase)
        + 0.92 * lobe4Band * Math.sin(4 * this.phase)
        + 0.36 * lobe8Band * Math.sin(8 * this.phase)
      ) * bypassClosed;
      const air = compressedAir * rootsLevel * (0.05 + 0.16 * throttle);
      return { whine: this.gain * rootsLevel * (lobeScream + air), chirp: 0 };
    }

    const speedLevel = clamp(this.angularVelocity / (REVOLUTION_RAD * 1650), 0, 1);
    // Planetary gear step-up + centrifugal impeller harmonics, band-limited below Nyquist.
    const harmonic2Band = clamp(1 - 2 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.42), 0, 1);
    const harmonic3Band = clamp(1 - 3 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.42), 0, 1);
    const bladeBand = clamp(1 - 6 * this.angularVelocity / (REVOLUTION_RAD * sampleRate * 0.38), 0, 1);
    const harmonic2 = harmonic2Band * Math.sin(2 * this.phase);
    const harmonic3 = harmonic3Band * Math.sin(3 * this.phase);
    const bladeTone = 0.11 * bladeBand * Math.sin(6 * this.phase);
    const whineTone = (Math.sin(this.phase) + 0.34 * harmonic2 + 0.14 * harmonic3 + bladeTone)
      * (0.30 + 0.53 * throttle + 0.17 * load);
    const air = compressedAir * speedLevel * (0.065 + 0.17 * throttle + 0.06 * load);

    // Rapid throttle snap-shut at high impeller speed traps boost against the throttle butterflies,
    // producing the characteristic H2/H2R centrifugal surge bird-chirp flutter.
    const surgeTrigger = closingThrottle > 0.0028 && speedLevel > 0.28
      ? clamp(closingThrottle * 58 * speedLevel ** 1.25, 0, 0.92) : 0;
    if (rawThrottle > 0.25 && closingThrottle === 0) {
      this.releasePressure *= this.chirpCancelDecay;
    } else {
      this.releasePressure = Math.max(this.releasePressure * this.chirpDecay, surgeTrigger);
    }
    let chirp = 0;
    if (this.releasePressure > 0.002) {
      this.chirpPhase = (this.chirpPhase + (17.5 + this.releasePressure * 12.5) / sampleRate) % 1;
      const staccato = Math.max(0, Math.sin(REVOLUTION_RAD * this.chirpPhase)) ** 1.65;
      const chirpVoice = 0.62 * harmonic2 + 0.36 * harmonic3 + 0.54 * compressedAir;
      chirp = this.gain * 1.45 * this.releasePressure * speedLevel * staccato * chirpVoice;
    }
    return { whine: this.gain * speedLevel * (whineTone + air), chirp };
  }
}

class ExhaustAfterfire {
  constructor(exhaustFrequencyHz, reflectionMs, onFire) {
    this.onFire = onFire;
    this.subBoom = new ExhaustBodyMode(clamp(exhaustFrequencyHz * 0.68, 72, 132), 18.5);
    this.pipeBoom = new ExhaustBodyMode(clamp(exhaustFrequencyHz * 1.48, 165, 345), 13.0);
    this.crackMode = new ExhaustBodyMode(clamp(exhaustFrequencyHz * 4.1, 520, 1120), 5.2);
    this.reflection = new Float32Array(Math.ceil(sampleRate * clamp(reflectionMs, 1.4, 6) / 1000));
    this.reflectionIndex = 0;
    this.slapDelayA = Math.max(16, Math.round(sampleRate * 0.013));
    this.slapDelayB = Math.max(32, Math.round(sampleRate * 0.025));
    this.slapBuffer = new Float32Array(this.slapDelayB + 4);
    this.slapIndex = 0;
    this.detonationDecay = 1 - smoothingFactor(0.0028);
    this.frontDecay = 1 - smoothingFactor(0.0011);
    this.reboundDecay = 1 - smoothingFactor(0.0036);
    this.blastLowRate = frequencyFactor(3500);
    this.blastHighRate = frequencyFactor(95);
    this.blastLow = 0;
    this.blastHigh = 0;
    this.detonation = 0;
    this.front = 0;
    this.rebound = 0;
    this.scatter = 0;
    this.modeGain = 1;
    this.tailSamples = 0;
    this.reset();
  }

  reset() {
    this.charge = 0;
    this.wasOpen = false;
    this.wasPoweredCut = false;
    this.wasLimiterCut = false;
    this.armedFromUpshift = false;
    this.count = 0;
  }

  update({ throttle, angularVelocity, combustion, load, shiftCut, upshifting, revMatchThrottle = 0, limiterCut = false, launchActive = false }, harmonics, seconds) {
    const rpm = angularVelocity * RADIANS_PER_SECOND_TO_RPM;
    const open = throttle > 0.08;
    const poweredCut = upshifting && throttle >= 0.60 && shiftCut >= 0.50 && rpm >= 5000;
    const revMatching = revMatchThrottle > 0.04;
    const clampedHarmonics = clamp(harmonics, 0.5, 1.5);
    const voicing = 0.66 + 0.38 * clampedHarmonics;
    this.modeGain = clampedHarmonics < 0.8 ? 0.58 : clampedHarmonics > 1.2 ? 1.32 : 1.04;
    const openPipe = clampedHarmonics > 1.2;
    if (revMatching) {
      this.count = 0;
      this.charge *= Math.exp(-seconds / 0.055);
    } else if (open) {
      if (!this.armedFromUpshift && !limiterCut && !launchActive) this.count = 0;
      if (poweredCut && !this.wasPoweredCut) {
        const strength = this.charge * voicing;
        if (strength > 0.20 && Math.random() < clamp((openPipe ? 0.28 : 0.18) + 0.68 * strength, 0, openPipe ? 0.90 : 0.82)) {
          this.armedFromUpshift = true;
          this.count = 1;
          this.delay = Math.round(sampleRate * (0.016 + Math.random() * 0.038));
          this.strength = strength * 0.96;
        }
      } else if (launchActive && limiterCut && !this.wasLimiterCut && this.count === 0) {
        // 2-Step Anti-Lag Launch Control: frequent sharp exhaust bangs build boost at standstill.
        if (Math.random() < 0.85) {
          this.count = 1;
          this.delay = Math.round(sampleRate * (0.004 + Math.random() * 0.014));
          this.strength = 0.88;
        }
      } else if (openPipe && limiterCut && !this.wasLimiterCut && rpm >= 5500 && this.count === 0) {
        const strength = Math.max(0.62, this.charge * voicing);
        if (Math.random() < 0.68) {
          this.count = 1;
          this.delay = Math.round(sampleRate * (0.008 + Math.random() * 0.018));
          this.strength = strength;
        }
      }
      const heat = clamp((rpm - 2600) / 5000, 0, 1) * clamp((throttle - 0.12) / 0.5, 0, 1);
      const target = heat * (0.64 + 0.23 * Math.sqrt(combustion) + 0.13 * load);
      const chargeTau = target >= this.charge ? 0.11 : 0.42;
      this.charge += (1 - Math.exp(-seconds / chargeTau)) * (target - this.charge);
    } else if (this.wasOpen) {
      const strength = this.charge * voicing;
      const triggerChance = clamp((openPipe ? 0.32 : 0.20) + 0.87 * strength, 0, openPipe ? 0.94 : 0.89);
      if (!this.armedFromUpshift && rpm > 3400 && strength > 0.14 && shiftCut < 0.15 && Math.random() < triggerChance) {
        const extraCrackle = openPipe ? Number(Math.random() < strength * 0.42) : 0;
        this.count = 1 + Number(Math.random() < strength * 0.55) + Number(Math.random() < strength * 0.19) + extraCrackle;
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
    this.wasLimiterCut = Boolean(limiterCut);
  }

  fire() {
    this.count -= 1;
    this.delay = Math.round(sampleRate * (0.062 + Math.random() * 0.142));
    const shiftPop = this.armedFromUpshift;
    const impulse = clamp((0.44 + this.strength * 0.50) * (0.74 + Math.random() * 0.26), 0, 0.96);
    this.strength *= 0.76;
    const pressure = impulse * (shiftPop ? 1.24 : 1.14) * this.modeGain;
    this.detonation = Math.min(1.6, this.detonation + pressure);
    this.front += pressure;
    this.rebound += pressure;
    this.scatter += pressure * (shiftPop ? 0.88 : 1.15);
    this.scatterDecay = 1 - smoothingFactor(shiftPop ? 0.0062 : 0.0088);
    const reportMs = Math.round((shiftPop ? 31 : 46) + 22 * impulse);
    const acousticMs = Math.round(reportMs + 26);
    this.tailSamples = Math.ceil(sampleRate * acousticMs / 1000);
    this.armedFromUpshift = false;
    this.onFire(impulse, reportMs);
    return impulse;
  }

  render(noise) {
    if (this.count > 0 && --this.delay <= 0) this.fire();
    if (this.tailSamples === 0) return { sample: 0, duck: 0 };
    this.tailSamples -= 1;
    // Finite-width detonation pulse excites unity-gain 72–345 Hz chest/pipe cavity modes + gunshot crack.
    this.detonation *= this.detonationDecay;
    this.front *= this.frontDecay;
    this.rebound *= this.reboundDecay;
    this.scatter *= this.scatterDecay;
    this.blastLow += this.blastLowRate * (noise - this.blastLow);
    this.blastHigh += this.blastHighRate * (this.blastLow - this.blastHigh);
    const blastNoise = this.blastLow - this.blastHigh;
    const shock = 1.18 * this.front - 0.44 * this.rebound;
    const boom = 1.35 * this.subBoom.render(this.detonation)
      + 1.05 * this.pipeBoom.render(this.detonation)
      + 0.52 * this.crackMode.render(this.front);
    const core = shock + boom + 1.38 * this.scatter * blastNoise;
    const delayed = this.reflection[this.reflectionIndex];
    this.reflection[this.reflectionIndex] = core;
    this.reflectionIndex = (this.reflectionIndex + 1) % this.reflection.length;
    const bufLen = this.slapBuffer.length;
    const slapA = this.slapBuffer[(this.slapIndex + bufLen - this.slapDelayA) % bufLen];
    const slapB = this.slapBuffer[(this.slapIndex + bufLen - this.slapDelayB) % bufLen];
    this.slapBuffer[this.slapIndex] = core;
    this.slapIndex = (this.slapIndex + 1) % bufLen;
    const rawWave = core - 0.24 * delayed + 0.18 * slapA + 0.08 * slapB;
    // Dense soft-clipping adds cannon-like harmonic weight without exceeding unity headroom.
    const denseWave = 1.32 * rawWave / (0.50 + Math.abs(rawWave));
    const duck = clamp(this.detonation * 0.95 + this.scatter * 0.42, 0, 0.85);
    return { sample: denseWave, duck };
  }
}

class TurboSound {
  constructor({ releaseStyle: style = "recirculating", maxBoostBar }) {
    this.gain = style === "subtle" ? 0.34 : style === "recirculating" ? 0.78 : 1.26;
    this.maxBoost = Number.isFinite(maxBoostBar) && maxBoostBar > 0 ? maxBoostBar : 1;
    this.spool = 0;
    this.spoolPhase = 0;
    this.spoolSmoothing = smoothingFactor(0.07);
    this.spoolAirLow = 0;
    this.spoolAirHigh = 0;
    this.spoolAirLowRate = frequencyFactor(2350);
    this.spoolAirHighRate = frequencyFactor(5200);
    this.envelope = 0;
    this.smoothing = smoothingFactor(0.012);
    this.bovCrack = 0;
    this.bovDecay = 1 - smoothingFactor(0.0065);
    this.bovMid = 0;
    this.bovHigh = 0;
    this.bovMidRate = frequencyFactor(1250);
    this.bovHighRate = frequencyFactor(4900);
    this.previousLevel = 0;
    this.pressure = 0;
    this.untilBurst = 0;
    this.air = 0;
    this.airBaseline = 0;
    this.airFloor = frequencyFactor(230);
    this.surgePhase = 0;
    this.burstEnergy = 0;
    this.burstAge = 0;
    this.burstSamples = 0;
  }

  renderSpool(pressureBar, rpm, noise) {
    const target = clamp(pressureBar / this.maxBoost, 0, 1);
    this.spool += this.spoolSmoothing * (target - this.spool);
    if (this.spool < 0.001) return 0;
    // Compressor rotor whistle + high-frequency air-suction whoosh above 2.35 kHz.
    const pitch = 510 + 1410 * Math.sqrt(this.spool) + 0.021 * rpm;
    this.spoolPhase = (this.spoolPhase + pitch / sampleRate) % 1;
    const phase = this.spoolPhase * REVOLUTION_RAD;
    this.spoolAirLow += this.spoolAirLowRate * (noise - this.spoolAirLow);
    this.spoolAirHigh += this.spoolAirHighRate * (noise - this.spoolAirHigh);
    const suctionWhoosh = (this.spoolAirHigh - this.spoolAirLow) * (0.15 + 0.24 * this.spool);
    const whistle = 0.135 * Math.sin(phase) + 0.046 * Math.sin(phase * 2) + 0.018 * Math.sin(phase * 3);
    return this.spool * (whistle + suctionWhoosh);
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
    if (level > this.previousLevel + 0.04) {
      this.bovCrack = Math.min(1, level * 1.15);
    }
    if (flutter > 0.05 && level > 0.14 && level > this.previousLevel + 0.045) {
      this.pressure = level;
      this.untilBurst = Math.round(sampleRate * 0.004);
    }
    this.previousLevel = level;
    this.bovCrack *= this.bovDecay;
    this.envelope += this.smoothing * (level - this.envelope);
    let bypass = 0;
    if (this.envelope > 0.0005 || this.bovCrack > 0.0005) {
      this.bovMid += this.bovMidRate * (noise - this.bovMid);
      this.bovHigh += this.bovHighRate * (noise - this.bovHigh);
      const pneumaticJet = (0.18 * this.envelope + 0.66 * this.bovCrack) * (this.bovHigh - this.bovMid)
        + 0.26 * this.envelope * turbulence;
      bypass = (1 - 0.90 * flutter) * this.gain * 0.74 * pneumaticJet;
    }
    // Compressor surge flutter ("stu-tu-tu"): stalled reverse pressure pulses ring in the intake tract.
    if (this.pressure > 0.065 && --this.untilBurst <= 0) this.releaseBurst(noise);
    if (this.burstAge >= this.burstSamples) return bypass;
    const travel = this.burstAge++ / this.burstSamples;
    const attack = Math.min(1, travel * 24);
    const falloff = (1 - travel) ** 2.8;
    const surgePitch = (690 + 610 * this.burstEnergy) * (1 - 0.22 * travel);
    this.surgePhase = (this.surgePhase + surgePitch / sampleRate) % 1;
    const pipeChirp = 0.28 * Math.sin(REVOLUTION_RAD * this.surgePhase) + 0.12 * Math.sin(2 * REVOLUTION_RAD * this.surgePhase);
    this.air += this.airEdge * (noise - this.air);
    this.airBaseline += this.airFloor * (noise - this.airBaseline);
    const pressureNoise = 2.05 * (this.air - this.airBaseline) + 0.24 * turbulence + pipeChirp;
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
      supercharger, turbocharger, twoStroke, transmissionType = "quickshifter", rotaryIdleRpm, electricStarter,
    } = processorOptions;
    const exhaustOffset = Number.isFinite(exhaustOpeningRad) ? exhaustOpeningRad : 0;
    this.exhaustOffset = exhaustOffset;
    this.firingAnglesRad = firingAnglesRad.map(wrapAngle);
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
    this.transmissionType = transmissionType;
    this.dctBarkBody = transmissionType === "dct" ? new ExhaustBodyMode(clamp(exhaustFrequencyHz * 1.35, 130, 290), 8.5) : null;
    this.asgClack = transmissionType === "asg" ? new DampedResonator(1380, 2.2) : null;
    this.wasShiftBark = false;
    this.dctBarkEnv = 0;
    this.dctBarkDecay = 1 - smoothingFactor(0.0085);
    this.twoStroke = twoStroke && Number.isFinite(twoStroke.powerbandStartRpm) ? twoStroke : null;
    this.chamberRingA = this.twoStroke ? new DampedResonator(1060, 5.4) : null;
    this.chamberRingB = this.twoStroke ? new DampedResonator(2140, 3.3) : null;
    this.chamberCone = this.twoStroke ? new ExhaustBodyMode(585, 6.0) : null;
    this.rotaryIdleRpm = Number.isFinite(rotaryIdleRpm) && rotaryIdleRpm > 0 ? rotaryIdleRpm : 0;
    this.rotaryIdleBody = this.rotaryIdleRpm ? new DampedResonator(124, 7.5) : null;
    this.rotaryBark = this.rotaryIdleRpm ? new ExhaustBodyMode(485, 5.0) : null;
    this.rotaryCycleStep = 0;
    this.rotaryGapTarget = 3;
    this.rotaryFiringNow = false;
    this.rotaryStaccatoGate = 1;
    this.rotaryGateRelease = smoothingFactor(0.010);
    this.limiterSkip = 0;
    this.electricStarter = electricStarter === true;
    this.starter = null;
    this.motor = null;
    this.startedByCranking = false;
    this.catchCharge = 0;
    this.catchDecay = 1 - smoothingFactor(0.15);
    const baseDelaySamples = Math.max(8, Math.ceil(sampleRate * clamp(reflectionMs, 0.8, 8) / 1000));
    this.exhaustDelay = new Float32Array(Math.ceil(baseDelaySamples * 1.62) + 2);
    this.tapPrimaryOffset = Math.max(3, Math.round(baseDelaySamples * 0.43));
    this.tapTailOffset = baseDelaySamples;
    this.tapGroundOffset = Math.round(baseDelaySamples * 1.58);
    this.exhaustDelayIndex = 0;
    this.exhaustReflectionSmoothing = frequencyFactor(1750);
    this.groundReflectionSmoothing = frequencyFactor(920);
    this.reflectedPressure = 0;
    this.groundReflection = 0;
    // Velocity-stack quarter-wave induction formant (~2.1–3.1 kHz) + finite blowdown shaping + gear/valvetrain sheen.
    this.intakeTrumpet = new DampedResonator(clamp(1920 + exhaustFrequencyHz * 3.4, 2050, 3150), 2.35);
    this.blowdownRise = 1 - smoothingFactor(0.00016);
    this.blowdownFall = 1 - smoothingFactor(0.00048);
    this.blowdownAttack = 0;
    this.blowdownEnvelope = 0;
    this.mechPhase = 0;
    this.cycleJitter = 1;
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
    this.blipAttack = smoothingFactor(0.0065);
    this.blipChargeAttack = smoothingFactor(0.008);
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
        limiterCut: data.limiterCut === true,
        launchActive: data.launchActive === true,
      });
      if (queue.length > 32) this.previousTelemetry = queue.shift();
    };
  }

  compressionAt(angle) {
    let nearest = ENGINE_CYCLE_RAD;
    for (let index = 0; index < this.firingAnglesRad.length; index += 1) {
      const distance = Math.abs(angle - this.firingAnglesRad[index]);
      const wrapped = distance > ENGINE_CYCLE_RAD / 2 ? ENGINE_CYCLE_RAD - distance : distance;
      if (wrapped < nearest) nearest = wrapped;
    }
    return Math.exp(-6 * nearest * nearest);
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
    const revMatching = running && telemetry.revMatchThrottle > 0.04;
    const limiterCut = running && telemetry.limiterCut === true;
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
      const throttleSmoothing = throttle >= this.throttle
        ? (revMatching ? this.blipAttack : this.throttleAttack)
        : this.throttleRelease;
      const shiftSmoothing = shiftCut >= this.shiftCut ? this.shiftCutAttack : this.shiftCutRelease;
      this.shiftCut += shiftSmoothing * (shiftCut - this.shiftCut);
      const shifting = this.shiftCut > 0.025;
      const chargeSmoothing = combustion >= this.combustion
        ? (revMatching ? this.blipChargeAttack : shifting ? this.shiftCutRelease : this.chargeAttack)
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
      let limiterPulseScale = 1;
      if (exhaustPulse && limiterCut) {
        this.limiterSkip = (this.limiterSkip + 1) % 4;
        limiterPulseScale = this.limiterSkip === 0 ? 1.32 : 0;
      }
      const pumping = exhaustPulse ? 0.12 + 0.29 * pumpingLevel : 0;
      // Shifts and ECU rev-limiter cuts interrupt combustion while the crank continues pumping air.
      const charge = exhaustPulse
        ? this.combustion * limiterPulseScale * (0.41 + 0.12 * this.load + this.catchCharge * 0.42) * (1 - 0.18 * this.shiftCut)
        : 0;
      const rotaryIdle = this.rotaryIdleBody
        ? voicing.rotaryPort * clamp((1.9 - rpm / this.rotaryIdleRpm) / 0.72, 0, 1) * clamp(1 - 3 * this.throttle, 0, 1)
        : 0;
      this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) >>> 0;
      const noise = this.noiseSeed / 2147483648 - 1;
      let rotaryAccent = 0;
      if (exhaustPulse) {
        // Real engines exhibit slight cycle-to-cycle IMEP flame-speed variation when under load or revving.
        const jitterDepth = (0.012 + 0.052 * this.throttle + 0.028 * brightness) * clamp(1 - rotaryIdle, 0, 1);
        this.cycleJitter = 1 + jitterDepth * noise;
      }
      if (exhaustPulse && rotaryIdle > 0.001) {
        // Bridgeport / peripheral-port scavenging cycle: 3–4 misfired rotor faces create a crisp silence break,
        // followed by a sharp, over-rich metallic "BRAP!" ignition bark (~5–6 Hz cadence at idle).
        this.rotaryCycleStep += 1;
        if (this.rotaryCycleStep <= this.rotaryGapTarget) {
          rotaryAccent = -0.97;
          this.rotaryFiringNow = false;
        } else {
          rotaryAccent = 1.58 + 0.24 * Math.abs(noise);
          this.rotaryFiringNow = true;
          this.rotaryStaccatoGate = 1;
          this.rotaryCycleStep = 0;
          this.rotaryGapTarget = noise > 0.28 ? 4 : 3;
        }
      } else if (rotaryIdle <= 0.001) {
        this.rotaryStaccatoGate = 1;
        this.rotaryCycleStep = 0;
      }
      if (rotaryIdle > 0.001 && !this.rotaryFiringNow) {
        this.rotaryStaccatoGate += this.rotaryGateRelease * (0.05 - this.rotaryStaccatoGate);
      } else if (this.rotaryFiringNow) {
        this.rotaryStaccatoGate += (this.rotaryGateRelease * 0.28) * (0.12 - this.rotaryStaccatoGate);
      }
      const staccatoEnvelope = 1 - rotaryIdle * (1 - this.rotaryStaccatoGate);
      const pulseScale = (1 + rotaryIdle * rotaryAccent) * this.cycleJitter;
      const pressure = (pumping + charge) * pulseScale;
      // Finite-width blowdown wave softens digital Dirac buzz while keeping high-RPM harmonic clarity.
      this.blowdownAttack = (this.blowdownAttack + pressure * 0.28) * this.blowdownRise;
      this.blowdownEnvelope = (this.blowdownEnvelope + pressure * 0.28) * this.blowdownFall;
      const finitePulse = 0.90 * pressure + 0.10 * (1 - 0.65 * brightness) * Math.max(0, this.blowdownEnvelope - this.blowdownAttack);
      const brapPulse = Math.max(0, rotaryAccent) * pressure * rotaryIdle;
      const idleBody = (this.rotaryIdleBody?.render(brapPulse) ?? 0) + 0.34 * (this.rotaryBark?.render(brapPulse) ?? 0);
      const otherBankPulse = this.exhaustBanks && pressure
        && this.exhaustBanks[this.nextFiringIndex === 0 ? this.exhaustBanks.length - 1 : this.nextFiringIndex - 1] === 1;
      const body = this.exhaust.render(otherBankPulse ? 0 : finitePulse) + (this.otherBank?.render(otherBankPulse ? finitePulse : 0) ?? 0);
      const deeperBody = this.tripleCollector ? this.tripleCollector.render(finitePulse) * (0.22 + 0.28 * this.load) : 0;
      const highCam = this.camEngagement * this.throttle;
      const blipAccent = revMatching ? 0.24 : 0;
      const pipeBand = this.twoStroke
        ? clamp((rpm - this.twoStroke.powerbandStartRpm + 800) / Math.max(900, this.twoStroke.powerbandPeakRpm - this.twoStroke.powerbandStartRpm + 800), 0, 1)
        : 0;
      const overtone = this.exhaustOvertone.render(pressure) * (0.34 + 0.13 * this.load + 0.44 * brightness + 0.17 * highCam + blipAccent + 0.28 * pipeBand);
      const edge = this.exhaustEdge.render(pressure * (0.063 + 0.96 * brightness + 0.24 * highCam + 0.18 * blipAccent + 0.34 * pipeBand));
      let expansionChamber = 0;
      if (this.twoStroke) {
        // Sheet-metal hydroformed 2-stroke expansion chamber: crisp "ting-ting" ping at idle/overrun,
        // locking into a nasal screaming GP250 powerband note on the pipe.
        const offPipePing = (1 - 0.72 * pipeBand) * (0.55 + 0.45 * Math.abs(noise));
        const chamberPing = (0.36 * this.chamberRingA.render(pressure * offPipePing)
          + 0.22 * this.chamberRingB.render(pressure * offPipePing));
        const chamberScream = (0.20 + 0.48 * pipeBand) * this.chamberCone.render(finitePulse);
        expansionChamber = chamberPing + chamberScream;
      }

      this.pressureNoiseBaseline += this.pressureNoiseBaselineSmoothing * (noise - this.pressureNoiseBaseline);

      // A short pressure envelope excites broadband turbulence as exhaust flow starts.
      const pressureBurst = (pumping * 0.55 + charge) * pulseScale;
      this.pressureFront = (this.pressureFront + pressureBurst) * this.pressureFrontDecay;
      this.pressureTail = (this.pressureTail + pressureBurst) * pressureTailDecay;
      this.pressureLowPass += this.pressureNoiseSmoothing * (noise - this.pressureLowPass);
      const turbulence = this.pressureLowPass - this.pressureNoiseBaseline;
      const blowdown = (this.pressureTail - this.pressureFront)
        * (0.09 + 0.08 * brightness + turbulence * (0.49 + 0.45 * brightness + 0.15 * highCam) * voicing.turbulence);

      // Velocity-stack airbox induction howl: opens with throttle & high-RPM airflow velocity (and sharpens on downshift blip).
      const inductionOpen = this.throttle * this.throttle * (0.14 + 0.86 * brightness + blipAccent) * (1 - 0.55 * this.shiftCut);
      const induction = this.intakeTrumpet.render(pressure * inductionOpen + 0.04 * inductionOpen * turbulence * voicing.turbulence)
        * (0.26 + 0.12 * highCam + 0.14 * blipAccent);

      // Subtle high-RPM valvetrain & straight-cut primary/gearbox mechanical sheen.
      this.mechPhase = (this.mechPhase + (this.angularVelocity / REVOLUTION_RAD) / sampleRate) % 1;
      const mechAngle = this.mechPhase * REVOLUTION_RAD;
      const mechanicalWhir = brightness * (0.0042 + 0.003 * this.load) * Math.sin(11 * mechAngle);

      // Gearbox-specific shift cut character: DCT retard bark, ASG actuator slam, QS crisp cut, or soft manual lift.
      const rawCut = clamp((this.shiftCut - 0.18) / 0.72, 0, 1);
      const cutScale = this.transmissionType === "manual" ? 0.58 : this.transmissionType === "asg" ? 1.15 : 1;
      const cut = clamp(rawCut * cutScale, 0, 1);
      const cutTone = cut * cut * (3 - 2 * cut);
      const shiftBarkActive = running && telemetry.upshifting && shiftCut > 0.42 && throttle > 0.45;
      let shiftTransient = 0;
      if (shiftBarkActive && !this.wasShiftBark) {
        if (this.dctBarkBody) this.dctBarkEnv = 0.55 + 0.35 * throttle;
        if (this.asgClack) shiftTransient += this.asgClack.render(0.55);
      } else if (this.asgClack) {
        shiftTransient += this.asgClack.render(0);
      }
      this.wasShiftBark = shiftBarkActive;
      if (this.dctBarkBody && this.dctBarkEnv > 0.001) {
        this.dctBarkEnv *= this.dctBarkDecay;
        shiftTransient += 0.52 * this.dctBarkBody.render(this.dctBarkEnv * (0.65 + 0.55 * noise));
      }

      const exhaustBody = (body + deeperBody) * (1 - 0.06 * cutTone) * voicing.body;
      const exhaustHarmonics = (overtone + edge + expansionChamber) * (1 - 0.32 * cutTone) * voicing.harmonics;
      const exhaust = ((exhaustBody + exhaustHarmonics) * 0.87 + blowdown * (1 - 0.25 * cutTone)) * staccatoEnvelope;
      const delayLen = this.exhaustDelay.length;
      const primaryTap = this.exhaustDelay[(this.exhaustDelayIndex + delayLen - this.tapPrimaryOffset) % delayLen];
      const tailTap = this.exhaustDelay[(this.exhaustDelayIndex + delayLen - this.tapTailOffset) % delayLen];
      const groundTap = this.exhaustDelay[(this.exhaustDelayIndex + delayLen - this.tapGroundOffset) % delayLen];
      this.exhaustDelay[this.exhaustDelayIndex] = exhaust;
      this.exhaustDelayIndex += 1;
      if (this.exhaustDelayIndex === delayLen) this.exhaustDelayIndex = 0;
      this.reflectedPressure += this.exhaustReflectionSmoothing * (tailTap - 0.22 * primaryTap - this.reflectedPressure);
      this.groundReflection += this.groundReflectionSmoothing * (groundTap - this.groundReflection);
      // Multi-tap pipe & ground early reflections act as a compact exhaust impulse response.
      const closingThrottle = running ? Math.max(0, this.throttle - throttle) : 0;
      const scOut = supercharger
        ? supercharger.render(shaftTarget + index * shaftIncrement, this.throttle, throttle, this.load, noise, closingThrottle)
        : null;
      const whine = scOut ? scOut.whine : 0;
      const scChirp = scOut ? scOut.chirp : 0;
      const afterfireOut = this.afterfire.render(noise);
      const afterfire = afterfireOut.sample;
      const afterfireDuck = afterfireOut.duck;
      const release = this.turbo?.render(turboRelease, noise, turbulence, voicing.turboFlutter) ?? 0;
      const spool = this.turbo?.renderSpool(turboBoost, rpm, noise) ?? 0;
      const pipeReflections = (0.11 * this.reflectedPressure + 0.025 * this.groundReflection) * voicing.reflection * staccatoEnvelope;
      const mix = 0.96 * exhaust + induction + mechanicalWhir - pipeReflections + whine + spool + 0.92 * idleBody;
      this.dcMean += this.dcSmoothing * (mix - this.dcMean);
      this.filteredOutput += this.outputSmoothing * (mix - this.dcMean - this.filteredOutput);
      let normalized = this.filteredOutput / (1 + Math.abs(this.filteredOutput));
      if (this.collectorBody) {
        const collectorPressure = this.collectorBody.render(exhaust, pressure, this.nextFiringIndex, rpm) * staccatoEnvelope;
        const extension = collectorPressure * 0.50 * (1 - 0.76 * brightness - 0.12 * cutTone) * voicing.body;
        // Give the body its own soft knee so low frequencies don't compress the exhaust edge or whine.
        const direction = extension < 0 ? -1 : 1;
        const headroom = 1 - direction * normalized;
        const knee = 0.65 * headroom;
        const overflow = Math.abs(extension) - knee;
        const remaining = headroom - knee;
        normalized += overflow > 0 ? direction * (knee + remaining * overflow / (remaining + overflow)) : extension;
      }
      if (afterfireDuck > 0) normalized *= 1 - 0.78 * afterfireDuck;
      // Keep afterfire detonation, turbo blow-off/flutter, and supercharger surge chirp out of exhaust saturation.
      const transient = afterfire + release + scChirp + shiftTransient;
      if (transient !== 0) {
        const direction = transient < 0 ? -1 : 1;
        const headroom = 0.985 - direction * normalized;
        if (headroom > 0) {
          const knee = 0.84 * headroom;
          const amount = Math.abs(transient);
          const overflow = amount - knee;
          const remaining = headroom - knee;
          normalized += overflow > 0 ? direction * (knee + remaining * overflow / (remaining + overflow)) : transient;
        }
      }
      let sample = this.gate * normalized;
      if (auxiliarySound) {
        const motorSound = motor?.render(motorSpeed, motorLoad, turbulence) ?? 0;
        const compression = starterCompression ? this.compressionAt(this.angle) : 0;
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
