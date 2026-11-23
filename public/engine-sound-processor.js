const ENGINE_CYCLE_RAD = 4 * Math.PI;
const MAX_TELEMETRY_AGE_SECONDS = 0.18;
const MAX_OUTPUT = 0.30;
const RADIANS_PER_SECOND_TO_RPM = 60 / (2 * Math.PI);

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

class EngineSoundProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();

    const {
      firingAnglesRad, exhaustFrequencyHz, intakeFrequencyHz, mechanicalFrequencyHz, pulseDecayMs,
      exhaustOpeningRad = 0, exhaustReflectionMs, brightnessStartRpm = 8000, brightnessMaxRpm,
    } = processorOptions;
    const exhaustOffset = Number.isFinite(exhaustOpeningRad) ? exhaustOpeningRad : 0;
    this.exhaustPulseAnglesRad = firingAnglesRad.map((angle) => wrapAngle(angle + exhaustOffset)).sort((a, b) => a - b);
    this.exhaust = new DampedResonator(exhaustFrequencyHz, pulseDecayMs * 0.93);
    this.exhaustOvertone = new DampedResonator(exhaustFrequencyHz * 2.55, pulseDecayMs * 0.42);
    this.exhaustEdge = new DampedResonator(exhaustFrequencyHz * 12.5, 1.85);
    // A quarter-wave pipe's round-trip time is half a period of its fundamental.
    const reflectionMs = Number.isFinite(exhaustReflectionMs) ? exhaustReflectionMs : 500 / exhaustFrequencyHz;
    this.exhaustDelay = new Float32Array(Math.ceil(sampleRate * clamp(reflectionMs, 0.8, 8) / 1000));
    this.exhaustDelayIndex = 0;
    this.exhaustReflectionSmoothing = frequencyFactor(1700);
    this.reflectedPressure = 0;
    this.brightnessStartRpm = Number.isFinite(brightnessStartRpm) ? Math.max(0, brightnessStartRpm) : 8000;
    this.brightnessRangeRpm = Number.isFinite(brightnessMaxRpm) && brightnessMaxRpm > this.brightnessStartRpm
      ? brightnessMaxRpm - this.brightnessStartRpm : 5000;
    this.mechanical = new DampedResonator(mechanicalFrequencyHz, 1.6);
    this.intakeSmoothing = frequencyFactor(intakeFrequencyHz * 2);
    this.intakeBaselineSmoothing = frequencyFactor(intakeFrequencyHz * 0.45);
    this.pressureNoiseSmoothing = frequencyFactor(3700);
    this.pressureFrontDecay = 1 - smoothingFactor(0.00028);
    this.pressureTailDecay = 1 - smoothingFactor(0.0021);
    this.dcSmoothing = frequencyFactor(22);
    this.outputSmoothing = frequencyFactor(4400);
    this.intakeAttack = smoothingFactor(0.045);
    this.intakeRelease = smoothingFactor(0.105);
    this.loadSmoothing = smoothingFactor(0.06);
    this.chargeAttack = smoothingFactor(0.03);
    this.chargeRelease = smoothingFactor(0.06);
    this.shiftCutAttack = smoothingFactor(0.011);
    this.shiftCutRelease = smoothingFactor(0.018);
    this.velocitySmoothing = smoothingFactor(0.009);
    this.gateAttack = smoothingFactor(0.032);
    this.gateRelease = smoothingFactor(0.055);
    this.noiseSeed = 0x7d4ace62;

    this.telemetry = null;
    this.synchronized = false;
    this.angle = 0;
    this.nextFiringIndex = 0;
    this.radiansToFire = 0;
    this.angularVelocity = 0;
    this.throttle = 0;
    this.load = 0;
    this.combustion = 0;
    this.shiftCut = 0;
    this.gate = 0;
    this.intakeLowPass = 0;
    this.intakeBaseline = 0;
    this.pressureLowPass = 0;
    this.pressureFront = 0;
    this.pressureTail = 0;
    this.dcMean = 0;
    this.filteredOutput = 0;

    this.port.onmessage = ({ data }) => {
      if (data?.type !== "state") return;

      const { angleRad, angularVelocity, throttle, combustion, load, shiftCut = 0, engineOn, contextTime } = data;
      if (!Number.isFinite(angleRad) || !Number.isFinite(angularVelocity) || angularVelocity < 0
        || angularVelocity > 4000 || !Number.isFinite(throttle) || !Number.isFinite(combustion)
        || !Number.isFinite(load) || !Number.isFinite(shiftCut) || typeof engineOn !== "boolean" || !Number.isFinite(contextTime)) {
        this.telemetry = null;
        return;
      }

      this.telemetry = {
        angleRad: wrapAngle(angleRad), angularVelocity, engineOn, contextTime,
        throttle: clamp(throttle, 0, 1), combustion: clamp(combustion, 0, 1), load: clamp(load, 0, 1),
        shiftCut: clamp(shiftCut, 0, 1),
      };
    };
  }

  alignCrank(angle, angularVelocity) {
    this.synchronized = true;
    this.angle = angle;
    this.angularVelocity = angularVelocity;
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

    const telemetry = this.telemetry;
    const age = telemetry ? currentTime - telemetry.contextTime : Infinity;
    const running = telemetry?.engineOn && age >= -0.05 && age < MAX_TELEMETRY_AGE_SECONDS;
    const throttle = running ? telemetry.throttle : 0;
    const load = running ? telemetry.load : 0;
    const combustion = running ? Math.sqrt(telemetry.combustion) : 0;
    const shiftCut = running ? telemetry.shiftCut : 0;
    const gateTarget = running ? clamp(telemetry.angularVelocity / 130, 0, 1) : 0;
    let velocityTarget = 0;

    if (running) {
      const anchorAngle = wrapAngle(telemetry.angleRad + age * telemetry.angularVelocity);
      if (!this.synchronized) this.alignCrank(anchorAngle, telemetry.angularVelocity);
      // Adjust the clock rate to track the physical crank without skipping or replaying events.
      const phaseError = wrapAngle(anchorAngle - this.angle + ENGINE_CYCLE_RAD / 2) - ENGINE_CYCLE_RAD / 2;
      const maxCorrection = telemetry.angularVelocity * 0.12;
      velocityTarget = telemetry.angularVelocity + clamp(phaseError * 12, -maxCorrection, maxCorrection);
    } else if (this.gate < 0.0001) {
      this.synchronized = false;
      return true;
    }

    for (let index = 0; index < output.length; index += 1) {
      this.angularVelocity += this.velocitySmoothing * (velocityTarget - this.angularVelocity);
      const intakeSmoothing = throttle >= this.throttle ? this.intakeAttack : this.intakeRelease;
      const shiftSmoothing = shiftCut >= this.shiftCut ? this.shiftCutAttack : this.shiftCutRelease;
      this.shiftCut += shiftSmoothing * (shiftCut - this.shiftCut);
      const shifting = this.shiftCut > 0.025;
      const chargeSmoothing = combustion >= this.combustion
        ? (shifting ? this.shiftCutRelease : this.chargeAttack)
        : (shifting ? this.shiftCutAttack : this.chargeRelease);
      this.throttle += intakeSmoothing * (throttle - this.throttle);
      this.load += this.loadSmoothing * (load - this.load);
      this.combustion += chargeSmoothing * (combustion - this.combustion);
      const gateSmoothing = gateTarget >= this.gate ? this.gateAttack : this.gateRelease;
      this.gate += gateSmoothing * (gateTarget - this.gate);

      const rpm = this.angularVelocity * RADIANS_PER_SECOND_TO_RPM;
      const pumpingLevel = clamp((rpm - 1200) / 6500, 0, 1);
      const speedLevel = clamp(rpm / 8500, 0, 1);
      const upperRange = clamp((rpm - this.brightnessStartRpm) / this.brightnessRangeRpm, 0, 1);
      const brightness = upperRange * upperRange * (3 - 2 * upperRange);
      const exhaustPulse = this.advanceCrank(this.angularVelocity / sampleRate);
      const pumping = exhaustPulse ? 0.12 + 0.29 * pumpingLevel : 0;
      // Shifts soften the combustion pulse while the crank continues pumping air.
      const charge = exhaustPulse ? this.combustion * (0.41 + 0.12 * this.load) * (1 - 0.18 * this.shiftCut) : 0;
      const pressure = pumping + charge;
      const body = this.exhaust.render(pressure);
      const overtone = this.exhaustOvertone.render(pressure) * (0.29 + 0.12 * this.load + 0.39 * brightness);
      const edge = this.exhaustEdge.render(pressure * (0.045 + 0.84 * brightness));

      this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) >>> 0;
      const noise = this.noiseSeed / 2147483648 - 1;
      this.intakeLowPass += this.intakeSmoothing * (noise - this.intakeLowPass);
      this.intakeBaseline += this.intakeBaselineSmoothing * (this.intakeLowPass - this.intakeBaseline);
      const airflow = (0.044 + 0.15 * this.throttle + 0.055 * this.load) * speedLevel;
      const intake = (this.intakeLowPass - this.intakeBaseline) * airflow;

      // A short pressure envelope excites broadband turbulence as exhaust flow starts.
      const pressureBurst = pumping * 0.55 + charge;
      this.pressureFront = (this.pressureFront + pressureBurst) * this.pressureFrontDecay;
      this.pressureTail = (this.pressureTail + pressureBurst) * this.pressureTailDecay;
      this.pressureLowPass += this.pressureNoiseSmoothing * (noise - this.pressureLowPass);
      const turbulence = this.pressureLowPass - this.intakeLowPass;
      const blowdown = (this.pressureTail - this.pressureFront) * (0.09 + 0.08 * brightness + turbulence * (0.49 + 0.45 * brightness));

      const valveTick = this.mechanical.render(exhaustPulse ? 0.06 + 0.07 * speedLevel : 0);
      const mechanical = valveTick + turbulence * (0.016 + 0.026 * speedLevel);
      const exhaust = (body + overtone + edge) * 0.87 + blowdown;
      const delayedPressure = this.exhaustDelay[this.exhaustDelayIndex];
      this.exhaustDelay[this.exhaustDelayIndex] = exhaust;
      this.exhaustDelayIndex += 1;
      if (this.exhaustDelayIndex === this.exhaustDelay.length) this.exhaustDelayIndex = 0;
      this.reflectedPressure += this.exhaustReflectionSmoothing * (delayedPressure - this.reflectedPressure);
      // The returning pressure wave from an open end is inverted and attenuated.
      const mix = 0.96 * exhaust - 0.12 * this.reflectedPressure + intake + mechanical * 0.30;
      this.dcMean += this.dcSmoothing * (mix - this.dcMean);
      this.filteredOutput += this.outputSmoothing * (mix - this.dcMean - this.filteredOutput);
      output[index] = MAX_OUTPUT * this.gate * this.filteredOutput / (1 + Math.abs(this.filteredOutput));
    }

    for (let index = 1; index < channels.length; index += 1) channels[index].set(output);
    return true;
  }
}

registerProcessor("engine-sound", EngineSoundProcessor);
