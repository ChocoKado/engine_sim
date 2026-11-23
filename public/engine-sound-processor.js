const ENGINE_CYCLE_RAD = 4 * Math.PI;
const TELEMETRY_DELAY_SECONDS = 0.04;
const MAX_TELEMETRY_AGE_SECONDS = 0.18;
const MAX_EXTRAPOLATION_SECONDS = 0.045;
const MAX_OUTPUT = 0.38;
const REVOLUTION_RAD = 2 * Math.PI;
const RADIANS_PER_SECOND_TO_RPM = 60 / REVOLUTION_RAD;

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

function velocityAt(frame, next, previous, time) {
  const age = time - frame.contextTime;
  if (next?.engineOn && next.contextTime - frame.contextTime < MAX_TELEMETRY_AGE_SECONDS) {
    const fraction = clamp(age / (next.contextTime - frame.contextTime), 0, 1);
    return frame.angularVelocity + fraction * (next.angularVelocity - frame.angularVelocity);
  }

  if (previous?.engineOn && frame.contextTime - previous.contextTime < MAX_TELEMETRY_AGE_SECONDS) {
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

class SuperchargerWhine {
  constructor({ driveRatio, audioGain }) {
    this.driveRatio = driveRatio;
    this.gain = clamp(audioGain, 0, 0.32);
    this.maximumAngularVelocity = REVOLUTION_RAD * sampleRate * 0.2;
    this.smoothing = smoothingFactor(0.012);
    this.angularVelocity = 0;
    this.phase = 0;
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
    const whine = (Math.sin(this.phase) + 0.16 * harmonic) * (0.31 + 0.54 * throttle + 0.15 * load);
    const shaftSlowdown = clamp((this.angularVelocity - shaftTarget) / (REVOLUTION_RAD * 140), 0, 1);
    const chirp = 0.55 * harmonic * closingThrottle * shaftSlowdown * speedLevel;
    const air = turbulence * speedLevel * (0.035 + 0.11 * throttle + 0.04 * load);
    return this.gain * speedLevel * (whine + air + chirp);
  }
}

class EngineSoundProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();

    const {
      firingAnglesRad, exhaustFrequencyHz, pulseDecayMs,
      exhaustOpeningRad = 0, exhaustReflectionMs, brightnessStartRpm = 8000, brightnessMaxRpm, supercharger,
    } = processorOptions;
    const exhaustOffset = Number.isFinite(exhaustOpeningRad) ? exhaustOpeningRad : 0;
    this.exhaustPulseAnglesRad = firingAnglesRad.map((angle) => wrapAngle(angle + exhaustOffset)).sort((a, b) => a - b);
    this.exhaust = new DampedResonator(exhaustFrequencyHz, pulseDecayMs * 0.93);
    this.exhaustOvertone = new DampedResonator(exhaustFrequencyHz * 2.55, pulseDecayMs * 0.42);
    this.exhaustEdge = new DampedResonator(exhaustFrequencyHz * 12.5, 1.85);
    this.tripleCollector = firingAnglesRad.length === 3 ? new DampedResonator(exhaustFrequencyHz * 0.78, pulseDecayMs * 1.2) : null;
    // A quarter-wave pipe's round-trip time is half a period of its fundamental.
    const reflectionMs = Number.isFinite(exhaustReflectionMs) ? exhaustReflectionMs : 500 / exhaustFrequencyHz;
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
    this.pressureTailDecay = 1 - smoothingFactor(0.0021);
    this.dcSmoothing = frequencyFactor(22);
    this.outputSmoothing = frequencyFactor(5800);
    this.throttleAttack = smoothingFactor(0.045);
    this.throttleRelease = smoothingFactor(0.105);
    this.loadSmoothing = smoothingFactor(0.06);
    this.chargeAttack = smoothingFactor(0.03);
    this.chargeRelease = smoothingFactor(0.06);
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
      if (data?.type === "reset-clock") {
        this.telemetryQueue.length = 0;
        this.previousTelemetry = null;
        this.synchronized = false;
        return;
      }
      if (data?.type !== "state") return;

      const { angleRad, angularVelocity, throttle, combustion, load, shiftCut = 0, engineOn, contextTime } = data;
      if (!Number.isFinite(angleRad) || !Number.isFinite(angularVelocity) || angularVelocity < 0
        || angularVelocity > 4000 || !Number.isFinite(throttle) || !Number.isFinite(combustion)
        || !Number.isFinite(load) || !Number.isFinite(shiftCut) || typeof engineOn !== "boolean" || !Number.isFinite(contextTime)) {
        this.telemetryQueue.length = 0;
        this.previousTelemetry = null;
        return;
      }

      const queue = this.telemetryQueue;
      const previousTime = queue.at(-1)?.contextTime;
      if (contextTime < previousTime) return;
      if (contextTime === previousTime) queue.pop();
      queue.push({
        angleRad: wrapAngle(angleRad), angularVelocity, engineOn, contextTime,
        throttle: clamp(throttle, 0, 1), combustion: clamp(combustion, 0, 1), load: clamp(load, 0, 1),
        shiftCut: clamp(shiftCut, 0, 1),
        superchargerAngularVelocity: data.superchargerAngularVelocity,
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

    const playheadTime = currentTime - TELEMETRY_DELAY_SECONDS;
    const endTime = playheadTime + output.length / sampleRate;
    const queue = this.telemetryQueue;
    while (queue[1]?.contextTime <= playheadTime) this.previousTelemetry = queue.shift();
    const [telemetry, following] = queue;
    const age = telemetry ? playheadTime - telemetry.contextTime : Infinity;
    const running = telemetry?.engineOn && age >= -1e-9 && age < MAX_TELEMETRY_AGE_SECONDS;
    const throttle = running ? telemetry.throttle : 0;
    const load = running ? telemetry.load : 0;
    const combustion = running ? Math.sqrt(telemetry.combustion) : 0;
    const shiftCut = running ? telemetry.shiftCut : 0;
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

    if (running) {
      velocityTarget = velocityAt(telemetry, following, this.previousTelemetry, playheadTime);
      let endIndex = 0;
      while (queue[endIndex + 1]?.engineOn && queue[endIndex + 1].contextTime <= endTime) endIndex += 1;
      const endVelocity = velocityAt(queue[endIndex], queue[endIndex + 1], endIndex === 0 ? this.previousTelemetry : queue[endIndex - 1], endTime);
      velocityIncrement = (endVelocity - velocityTarget) / output.length;

      const changingDuration = following?.engineOn ? age : Math.min(age, MAX_EXTRAPOLATION_SECONDS);
      const angleAdvance = changingDuration * (telemetry.angularVelocity + velocityTarget) / 2 + (age - changingDuration) * velocityTarget;
      const anchorAngle = wrapAngle(telemetry.angleRad + angleAdvance);
      if (!this.synchronized) this.alignCrank(anchorAngle, velocityTarget);
      // Correct slow clock drift without modulating pitch on each physics packet.
      const phaseError = wrapAngle(anchorAngle - this.angle + ENGINE_CYCLE_RAD / 2) - ENGINE_CYCLE_RAD / 2;
      const maxCorrection = velocityTarget * 0.018;
      correctionTarget = clamp(phaseError * 2.5, -maxCorrection, maxCorrection);
    } else if (this.gate < 0.0001) {
      this.synchronized = false;
      return true;
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
      this.load += this.loadSmoothing * (load - this.load);
      this.combustion += chargeSmoothing * (combustion - this.combustion);
      const gateSmoothing = gateTarget >= this.gate ? this.gateAttack : this.gateRelease;
      this.gate += gateSmoothing * (gateTarget - this.gate);

      const rpm = this.angularVelocity * RADIANS_PER_SECOND_TO_RPM;
      const pumpingLevel = clamp((rpm - 1200) / 6500, 0, 1);
      const upperRange = clamp((rpm - this.brightnessStartRpm) / this.brightnessRangeRpm, 0, 1);
      const brightness = upperRange * upperRange * (3 - 2 * upperRange);
      const exhaustPulse = this.advanceCrank(this.angularVelocity / sampleRate);
      const pumping = exhaustPulse ? 0.12 + 0.29 * pumpingLevel : 0;
      // Shifts soften the combustion pulse while the crank continues pumping air.
      const charge = exhaustPulse ? this.combustion * (0.41 + 0.12 * this.load) * (1 - 0.18 * this.shiftCut) : 0;
      const pressure = pumping + charge;
      const body = this.exhaust.render(pressure);
      const deeperBody = this.tripleCollector ? this.tripleCollector.render(pressure) * (0.22 + 0.28 * this.load) : 0;
      const overtone = this.exhaustOvertone.render(pressure) * (0.34 + 0.13 * this.load + 0.44 * brightness);
      const edge = this.exhaustEdge.render(pressure * (0.063 + 0.94 * brightness));

      this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) >>> 0;
      const noise = this.noiseSeed / 2147483648 - 1;
      this.pressureNoiseBaseline += this.pressureNoiseBaselineSmoothing * (noise - this.pressureNoiseBaseline);

      // A short pressure envelope excites broadband turbulence as exhaust flow starts.
      const pressureBurst = pumping * 0.55 + charge;
      this.pressureFront = (this.pressureFront + pressureBurst) * this.pressureFrontDecay;
      this.pressureTail = (this.pressureTail + pressureBurst) * this.pressureTailDecay;
      this.pressureLowPass += this.pressureNoiseSmoothing * (noise - this.pressureLowPass);
      const turbulence = this.pressureLowPass - this.pressureNoiseBaseline;
      const blowdown = (this.pressureTail - this.pressureFront) * (0.09 + 0.08 * brightness + turbulence * (0.49 + 0.45 * brightness));

      // A firm cut darkens the exhaust briefly while the timed air pulses continue.
      const cut = clamp((this.shiftCut - 0.18) / 0.72, 0, 1);
      const cutTone = cut * cut * (3 - 2 * cut);
      const exhaustBody = (body + deeperBody) * (1 - 0.06 * cutTone);
      const exhaustHarmonics = (overtone + edge) * (1 - 0.32 * cutTone);
      const exhaust = (exhaustBody + exhaustHarmonics) * 0.87 + blowdown * (1 - 0.25 * cutTone);
      const delayedPressure = this.exhaustDelay[this.exhaustDelayIndex];
      this.exhaustDelay[this.exhaustDelayIndex] = exhaust;
      this.exhaustDelayIndex += 1;
      if (this.exhaustDelayIndex === this.exhaustDelay.length) this.exhaustDelayIndex = 0;
      this.reflectedPressure += this.exhaustReflectionSmoothing * (delayedPressure - this.reflectedPressure);
      // The returning pressure wave from an open end is inverted and attenuated.
      const closingThrottle = running ? Math.max(0, this.throttle - throttle) : 0;
      const whine = supercharger ? supercharger.render(shaftTarget + index * shaftIncrement, this.throttle, this.load, turbulence, closingThrottle) : 0;
      const mix = 0.96 * exhaust - 0.12 * this.reflectedPressure + whine;
      this.dcMean += this.dcSmoothing * (mix - this.dcMean);
      this.filteredOutput += this.outputSmoothing * (mix - this.dcMean - this.filteredOutput);
      output[index] = MAX_OUTPUT * this.gate * this.filteredOutput / (1 + Math.abs(this.filteredOutput));
    }

    for (let index = 1; index < channels.length; index += 1) channels[index].set(output);
    return true;
  }
}

registerProcessor("engine-sound", EngineSoundProcessor);
