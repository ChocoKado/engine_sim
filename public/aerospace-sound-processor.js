const turn = 2 * Math.PI;

function advancePhase(phase, hertz) {
  return (phase + hertz / sampleRate) % 1;
}

class AerospaceSoundProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.kind = processorOptions.kind;
    this.lastPacketTime = -Infinity;
    this.frame = { primary: 0, secondary: 0, shaftRpm: 0, outputLevel: 0, vacuum: false };
    this.phase = 0;
    this.corePhase = 0;
    this.level = 0;
    this.primary = 0;
    this.secondary = 0;
    this.rpm = 0;
    this.noiseSeed = 0x19d450b7;
    this.bass = 0;
    this.mid = 0;
    this.rumbleRate = 1 - Math.exp(-turn * 180 / sampleRate);
    this.midRate = 1 - Math.exp(-turn * 950 / sampleRate);
    this.smoothing = 1 - Math.exp(-1 / (sampleRate * 0.042));
    this.port.onmessage = ({ data }) => {
      if (![data?.primary, data?.secondary, data?.shaftRpm, data?.outputLevel].every(Number.isFinite)) return;
      if (data.primary < 0 || data.primary > 1 || data.secondary < 0 || data.secondary > 1 ||
        data.shaftRpm < 0 || data.shaftRpm > 3500 || data.outputLevel < 0 || data.outputLevel > 1) return;
      this.frame = data;
      this.lastPacketTime = currentTime;
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const frame = this.frame;
    const fresh = currentTime - this.lastPacketTime < 0.23;
    const rocket = this.kind === "rocket";
    const piston = this.kind === "piston";
    const fan = this.kind === "turbofan";
    const targetLevel = !fresh || (rocket && frame.vacuum) ? 0 : rocket ? frame.outputLevel
      : Math.min(1, frame.primary * 0.77 + frame.secondary * 0.23 + frame.outputLevel * 0.4);
    const smooth = this.smoothing;

    for (let index = 0; index < output.length; index += 1) {
      this.level += (targetLevel - this.level) * smooth;
      this.primary += (frame.primary - this.primary) * smooth;
      this.secondary += (frame.secondary - this.secondary) * smooth;
      this.rpm += (frame.shaftRpm - this.rpm) * smooth;
      this.noiseSeed ^= this.noiseSeed << 13;
      this.noiseSeed ^= this.noiseSeed >>> 17;
      this.noiseSeed ^= this.noiseSeed << 5;
      const noise = (this.noiseSeed >>> 0) / 2147483648 - 1;
      this.bass += (noise - this.bass) * this.rumbleRate;
      this.mid += (noise - this.mid) * this.midRate;

      let sound;
      if (piston) {
        // A two-blade prop and a four-cylinder four-stroke both pulse twice per shaft turn.
        this.phase = advancePhase(this.phase, this.rpm / 60);
        const angle = turn * this.phase;
        const blade = Math.sin(angle * 2) * 0.49 + Math.sin(angle * 4) * 0.16;
        const combustion = Math.sin(angle * 6) * 0.20 + Math.sin(angle * 8) * 0.10;
        sound = blade + combustion * (0.31 + 0.69 * frame.outputLevel) + 0.70 * this.mid;
      } else if (rocket) {
        sound = 3.65 * this.bass + 1.20 * this.mid + 0.18 * (noise - this.mid);
      } else {
        this.phase = advancePhase(this.phase, (fan ? 1050 : 1480) * this.primary);
        this.corePhase = advancePhase(this.corePhase, (fan ? 1570 : 2140) * this.secondary);
        const lower = Math.sin(turn * this.phase) * (fan ? 0.40 : 0.15);
        const core = Math.sin(turn * this.corePhase) * (fan ? 0.12 : 0.28);
        sound = lower + core + (fan ? 1.12 : 1.7) * this.mid + (fan ? 0.15 : 0.32) * (noise - this.mid);
      }
      const sample = this.level * sound;
      output[index] = 0.21 * sample / (1 + Math.abs(sample));
    }
    return true;
  }
}

registerProcessor("aerospace-sound", AerospaceSoundProcessor);
