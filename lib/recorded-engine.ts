import type { EnginePhase, SimulationState } from "./simulation";

export type RecordingKind = "idle" | "load" | "start" | "lift";

export const MAX_RECORDING_BYTES = 12 * 1024 * 1024;

const MAX_DURATION_SECONDS = 20;
const MAX_EVENT_SECONDS = 8;
const MIN_DURATION_SECONDS = 0.18;
const TARGET_RMS = 0.085;
const MAX_PEAK = 0.32;
const FADE_TIME_CONSTANT = 0.026;
const FADE_TAIL_SECONDS = 0.13;

interface Clip {
  kind: RecordingKind;
  buffer: AudioBuffer;
  referenceRpm: number;
  gain: number;
}

interface Voice {
  clip: Clip;
  source: AudioBufferSourceNode;
  gain: GainNode;
  endTime: number;
  rate: number;
}

function isLoop(kind: RecordingKind) {
  return kind === "idle" || kind === "load";
}

function matchLevel(buffer: AudioBuffer): number {
  let peak = 0;
  let energy = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    for (const sample of buffer.getChannelData(channel)) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
  }
  const rms = Math.sqrt(energy / (buffer.length * buffer.numberOfChannels));
  if (!(rms > 0.0001) || !Number.isFinite(peak)) throw new Error("錄音太安靜或無法讀取");
  return Math.min(TARGET_RMS / rms, MAX_PEAK / peak, 4);
}

function prepareLoop(context: AudioContext, input: AudioBuffer): AudioBuffer {
  const overlap = Math.min(Math.round(input.sampleRate * 0.025), Math.floor(input.length / 6));
  const period = input.length - overlap;
  const buffer = context.createBuffer(input.numberOfChannels, period, input.sampleRate);
  // The overlap joins the end and start once at load time. Playback can then loop without a hard splice.
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const original = input.getChannelData(channel);
    const loop = buffer.getChannelData(channel);
    loop.set(original.subarray(0, period));
    for (let index = 0; index < overlap; index += 1) {
      const blend = index / Math.max(1, overlap - 1);
      loop[index] = (1 - blend) * original[period + index] + blend * original[index];
    }
  }
  return buffer;
}

function fade(parameter: AudioParam, value: number, now: number) {
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, FADE_TIME_CONSTANT);
}

export class RecordedEngineMixer {
  private readonly context: AudioContext;
  private readonly synthGain: GainNode;
  private readonly masterGain: GainNode;
  private readonly clips = new Map<RecordingKind, Clip>();
  private readonly pendingLoads = new Map<RecordingKind, object>();
  private active: Voice | null = null;
  private previousPhase: EnginePhase = "off";
  private liftArmed = false;

  constructor(context: AudioContext, synthGain: GainNode, masterGain: GainNode) {
    this.context = context;
    this.synthGain = synthGain;
    this.masterGain = masterGain;
  }

  async load(kind: RecordingKind, file: File, referenceRpm?: number): Promise<void> {
    const token = {};
    this.pendingLoads.set(kind, token);
    try {
      if (file.size === 0 || file.size > MAX_RECORDING_BYTES) throw new Error("請選擇 12 MB 以內的錄音");
      if (isLoop(kind) && (referenceRpm === undefined || !Number.isFinite(referenceRpm) || referenceRpm < 300 || referenceRpm > 25000)) {
        throw new Error("循環錄音的參考轉速必須介於 300–25,000 RPM");
      }
      const decoded = await this.context.decodeAudioData(await file.arrayBuffer());
      if (this.pendingLoads.get(kind) !== token) return;
      const limit = isLoop(kind) ? MAX_DURATION_SECONDS : MAX_EVENT_SECONDS;
      if (decoded.duration < MIN_DURATION_SECONDS || decoded.duration > limit) {
        throw new Error(`錄音長度須介於 0.18–${limit} 秒`);
      }
      const buffer = isLoop(kind) ? prepareLoop(this.context, decoded) : decoded;
      this.clips.set(kind, { kind, buffer, gain: matchLevel(buffer), referenceRpm: referenceRpm ?? 0 });
    } catch (error) {
      if (this.pendingLoads.get(kind) === token) throw error;
    } finally {
      if (this.pendingLoads.get(kind) === token) this.pendingLoads.delete(kind);
    }
  }

  remove(kind: RecordingKind): void {
    this.pendingLoads.delete(kind);
    this.clips.delete(kind);
    if (this.active?.clip.kind === kind) this.stop();
  }

  update(state: SimulationState, preferRecording: boolean): RecordingKind | null {
    const starting = state.enginePhase === "cranking" && this.previousPhase !== "cranking";
    this.previousPhase = state.enginePhase;
    const releasing = this.liftArmed && state.throttle <= 0.08;
    if (!state.engineOn || state.throttle <= 0.08) this.liftArmed = false;
    else if (state.throttle >= 0.35) this.liftArmed = true;

    if (!preferRecording || !state.powerOn) {
      this.stop();
      return null;
    }

    const rpm = state.engineAngularVelocity * 30 / Math.PI;
    const lift = releasing && state.engineOn && rpm >= 1.35 * state.idleTargetRpm;
    const event = starting ? this.clips.get("start") : lift ? this.clips.get("lift") : undefined;
    if (event) {
      this.play(event, 1);
      return event.kind;
    }

    const voice = this.active;
    if (voice && this.context.currentTime + FADE_TAIL_SECONDS < voice.endTime) {
      const kind = voice.clip.kind;
      if ((kind === "start" && (state.enginePhase === "cranking" || (state.engineOn && state.throttle <= 0.18)))
        || (kind === "lift" && state.engineOn && state.throttle <= 0.16)) return kind;
    }

    const idle = state.engineOn && state.throttle <= 0.08 && rpm <= state.idleTargetRpm * 1.4 && state.shift === null;
    const loaded = state.engineOn && state.gear > 0 && state.throttle >= 0.2 && state.drivetrainTorqueNm > 0 && state.shiftCut < 0.3;
    const clip = idle ? this.clips.get("idle") : loaded ? this.clips.get("load") : undefined;
    const rate = clip ? rpm / clip.referenceRpm : 0;
    const minimum = voice?.clip === clip ? 0.73 : 0.77;
    const maximum = voice?.clip === clip ? 1.37 : 1.33;
    if (!clip || !(rate >= minimum && rate <= maximum)) {
      this.stop();
      return null;
    }
    if (voice?.clip !== clip) this.play(clip, rate);
    else if (Math.abs(voice.rate - rate) >= 0.01) {
      voice.source.playbackRate.setTargetAtTime(rate, this.context.currentTime, 0.045);
      voice.rate = rate;
    }
    return clip.kind;
  }

  stop(): void {
    if (!this.active) return;
    const now = this.context.currentTime;
    this.retireVoice(now);
    fade(this.synthGain.gain, 1, now);
  }

  private retireVoice(now: number) {
    const voice = this.active;
    if (!voice) return;
    this.active = null;
    fade(voice.gain.gain, 0, now);
    voice.source.stop(now + FADE_TAIL_SECONDS);
  }

  private play(clip: Clip, rate: number) {
    const now = this.context.currentTime;
    this.retireVoice(now);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.buffer = clip.buffer;
    source.loop = isLoop(clip.kind);
    source.playbackRate.value = rate;
    source.connect(gain);
    gain.connect(this.masterGain);
    const endTime = source.loop ? Infinity : now + clip.buffer.duration;
    const voice: Voice = { clip, source, gain, endTime, rate };
    this.active = voice;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.active !== voice) return;
      this.active = null;
      fade(this.synthGain.gain, 1, this.context.currentTime);
    };
    source.start(now);
    fade(gain.gain, clip.gain, now);
    fade(this.synthGain.gain, 0, now);
  }
}
