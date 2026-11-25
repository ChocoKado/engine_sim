import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../data/vehicles";
import type { TuningProfile } from "../data/tuning";
import type { SimulationState } from "../lib/simulation";
import { VALVE_EVENTS } from "../lib/kinematics";
import { RecordedEngineMixer } from "../lib/recorded-engine";
import type { RecordingKind } from "../lib/recorded-engine";
import { getOverallRatio } from "../lib/transmission";

export type AudioStatus = "muted" | "starting" | "enabled" | "paused" | "unavailable";

const DEFAULT_VOLUME = 88;
const VOLUME_STORAGE_KEY = "engine_sim.audioVolume";

interface AudioGraph {
  context: AudioContext;
  gain: GainNode;
  synthGain: GainNode;
  ready: Promise<AudioWorkletNode>;
  recordings?: RecordedEngineMixer;
  node?: AudioWorkletNode;
  clockOffsetSeconds?: number;
}

function fade({ context, gain }: AudioGraph, target: number) {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(target, now, 0.035);
}

export function useEngineAudio(vehicle: Vehicle, tuning: TuningProfile, showExhaust: boolean) {
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("muted");
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [recordedKind, setRecordedKind] = useState<RecordingKind | null>(null);
  const activeRecording = useRef<RecordingKind | null>(null);
  const preferRecording = useRef(false);
  const graph = useRef<AudioGraph | null>(null);
  const activation = useRef<Promise<void> | null>(null);
  const requested = useRef(false);
  const userMuted = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const latestState = useRef<{ state: SimulationState; timestampMs: number } | null>(null);
  const lastFlame = useRef({ timestampMs: -Infinity, strength: 0, durationMs: 150 });
  const showExhaustRef = useRef(showExhaust);
  const latestVoicing = useRef(tuning.voicing);
  const readExhaustFlame = useCallback(() => {
    const { timestampMs, strength, durationMs } = lastFlame.current;
    const elapsedMs = performance.now() - timestampMs;
    return latestState.current?.state.engineOn && elapsedMs < durationMs
      ? Math.min(1, strength * 1.9) * (1 - elapsedMs / durationMs) ** 1.4
      : 0;
  }, []);
  const reportRecording = useCallback((kind: RecordingKind | null) => {
    if (activeRecording.current === kind) return;
    activeRecording.current = kind;
    setRecordedKind(kind);
  }, []);

  useEffect(() => {
    latestVoicing.current = tuning.voicing;
    graph.current?.node?.port.postMessage({ type: "tuning", voicing: tuning.voicing });
  }, [tuning]);

  useEffect(() => {
    showExhaustRef.current = showExhaust;
  }, [showExhaust]);

  const applyVolume = useCallback((nextVolume: number) => {
    if (!Number.isFinite(nextVolume)) return;
    const level = Math.min(100, Math.max(0, Math.round(nextVolume)));
    volumeRef.current = level;
    setVolume(level);
    const audio = graph.current;
    if (requested.current && audio?.node && audio.context.state === "running") fade(audio, level / 100);
  }, []);

  useEffect(() => {
    try {
      const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (savedVolume !== null) applyVolume(Number(savedVolume));
    } catch {
      // The control still works in a browser that disallows storage.
    }
  }, [applyVolume]);

  function changeVolume(nextVolume: number) {
    applyVolume(nextVolume);
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(volumeRef.current));
    } catch {
      // Keep the current session's gain even when it cannot be saved.
    }
  }

  const sendAudioState = useCallback((state: SimulationState, timestampMs = performance.now()) => {
    latestState.current = { state, timestampMs };
    const audio = graph.current;
    if ((!requested.current && !showExhaustRef.current) || !audio?.node || audio.context.state !== "running") return;

    const observedOffset = audio.context.currentTime - performance.now() / 1000;
    const previousOffset = audio.clockOffsetSeconds ?? observedOffset;
    // The audio clock is quantized to render blocks. Keep that jitter out of the physics timestamps.
    const clockError = observedOffset - previousOffset;
    if (Math.abs(clockError) > 0.075) {
      audio.clockOffsetSeconds = observedOffset;
      audio.node.port.postMessage({ type: "reset-clock" });
    } else {
      audio.clockOffsetSeconds = previousOffset + Math.min(0.004, Math.max(-0.004, clockError)) * 0.015;
    }
    const ratio = getOverallRatio(vehicle, state.gear);
    const { peakTorqueNm } = vehicle.physics;
    if (audio.recordings) reportRecording(audio.recordings.update(state, requested.current && preferRecording.current));
    audio.node.port.postMessage({
      type: "state",
      angleRad: state.crankAngleRad,
      angularVelocity: state.engineAngularVelocity,
      superchargerAngularVelocity: state.superchargerAngularVelocity,
      turboBoostBar: state.turboBoostBar,
      turboRelease: state.turboRelease,
      revMatchThrottle: state.revMatchThrottle,
      vtecEngagement: state.vtecEngagement,
      starter: state.starter,
      motorAngularVelocity: state.motorAngularVelocity,
      motorLoad: state.motorLoad,
      throttle: state.throttle,
      combustion: Math.min(1, state.combustionTorqueNm / peakTorqueNm),
      shiftCut: state.shiftCut,
      upshifting: state.shift !== null && state.shift.fromGear > 0 && state.shift.targetGear > state.shift.fromGear,
      load: ratio ? Math.min(1, Math.abs(state.drivetrainTorqueNm) / (ratio * peakTorqueNm)) : 0,
      engineOn: state.engineOn,
      contextTime: timestampMs / 1000 + audio.clockOffsetSeconds,
    });
  }, [reportRecording, vehicle]);

  useEffect(() => {
    function handleVisibility() {
      const audio = graph.current;
      if (!document.hidden || !audio || !requested.current) return;
      requested.current = false;
      audio.recordings?.stop();
      reportRecording(null);
      fade(audio, 0);
      setAudioStatus("paused");
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      requested.current = false;
      const audio = graph.current;
      graph.current = null;
      if (audio) {
        audio.recordings?.stop();
        audio.context.onstatechange = null;
        void audio.context.close().catch(() => {});
      }
    };
  }, [reportRecording]);

  function toggleAudio() {
    const audio = graph.current;
    if (requested.current) {
      userMuted.current = true;
      requested.current = false;
      if (audio) {
        audio.recordings?.stop();
        fade(audio, 0);
      }
      reportRecording(null);
      setAudioStatus("muted");
      return;
    }
    userMuted.current = false;
    void requestAudibleAudio();
  }

  function requestAudibleAudio() {
    requested.current = true;
    setAudioStatus("starting");
    return requestActivation();
  }

  function startIgnitionAudio() {
    if (!requested.current && !userMuted.current) return requestAudibleAudio();
    if (requested.current) return activation.current;
    if (showExhaustRef.current) prepareAudio();
  }

  function prepareAudio() {
    if (!graph.current || graph.current.context.state !== "running") void requestActivation();
  }

  function requestActivation() {
    activation.current ??= activateAudio().finally(() => { activation.current = null; });
    return activation.current;
  }

  function createAudioGraph() {
    const AudioContextClass = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error("這個瀏覽器目前無法播放引擎音訊。");
    const context = new AudioContextClass({ latencyHint: "interactive" });
    if (!context.audioWorklet) {
      void context.close().catch(() => {});
      throw new Error("這個瀏覽器目前無法混合實錄與引擎音訊。");
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    const synthGain = context.createGain();
    synthGain.connect(gain);
    const ready = context.audioWorklet.addModule("/engine-sound-processor.js").then(() => {
      const node = new AudioWorkletNode(context, "engine-sound", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          ...vehicle.audio,
          exhaustOpeningRad: vehicle.audio.exhaustOpeningRad
            ?? (vehicle.geometry.rotary ? 130 : VALVE_EVENTS.exhaust.opensDegrees) * Math.PI / 180,
          supercharger: vehicle.supercharger,
          turbocharger: vehicle.turbocharger,
          rotaryIdleRpm: vehicle.geometry.rotary ? vehicle.physics.idleRpm : undefined,
          electricStarter: Boolean(vehicle.physics.electricDrive),
        },
      });
      node.connect(synthGain);
      return node;
    });
    // Import can initialize a suspended context before the user enables playback.
    void ready.catch(() => {});
    const created: AudioGraph = { context, gain, synthGain, ready };
    graph.current = created;
    context.onstatechange = () => {
      if (graph.current !== created || !created.node || !requested.current || context.state === "running") return;
      requested.current = false;
      created.recordings?.stop();
      reportRecording(null);
      fade(created, 0);
      setAudioStatus("paused");
    };
    return created;
  }

  async function loadRecording(kind: RecordingKind, file: File, referenceRpm?: number) {
    const audio = graph.current ?? createAudioGraph();
    audio.recordings ??= new RecordedEngineMixer(audio.context, audio.synthGain, audio.gain);
    await audio.recordings.load(kind, file, referenceRpm);
  }

  function removeRecording(kind: RecordingKind) {
    graph.current?.recordings?.remove(kind);
  }

  function selectRecording(preferred: boolean) {
    preferRecording.current = preferred;
    if (!preferred) {
      graph.current?.recordings?.stop();
      reportRecording(null);
    }
  }

  async function activateAudio() {
    let audio = graph.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      audio ??= createAudioGraph();

      // Call resume on the same user activation, before awaiting the module or any other work.
      const wasSuspended = audio.context.state !== "running";
      const ready = Promise.all([audio.ready, audio.context.resume()]);
      const timeoutReached = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Audio activation timed out")), 2500);
      });
      const [node] = await Promise.race([ready, timeoutReached]);
      if (graph.current !== audio) return;

      const activated = audio;
      if (wasSuspended) {
        activated.clockOffsetSeconds = undefined;
        node.port.postMessage({ type: "reset-clock" });
      }
      if (!activated.node) {
        activated.node = node;
        node.port.onmessage = ({ data }) => {
          if (data?.type === "afterfire" && Number.isFinite(data.strength)) {
            const durationMs = Number.isFinite(data.durationMs) ? Math.min(195, Math.max(95, 2.8 * data.durationMs)) : 150;
            lastFlame.current = { timestampMs: performance.now(), strength: Math.max(0, data.strength), durationMs };
          }
        };
        node.port.postMessage({ type: "tuning", voicing: latestVoicing.current });
        node.onprocessorerror = () => {
          if (graph.current !== activated) return;
          requested.current = false;
          graph.current = null;
          activated.recordings?.stop();
          reportRecording(null);
          void activated.context.close().catch(() => {});
          setAudioStatus("unavailable");
        };
      }
      const latest = latestState.current;
      if (latest && performance.now() - latest.timestampMs < 80) sendAudioState(latest.state, latest.timestampMs);
      fade(activated, requested.current ? volumeRef.current / 100 : 0);
      if (requested.current) setAudioStatus("enabled");
    } catch {
      if (graph.current !== audio || (audio?.node && audio.context.state === "running")) return;
      requested.current = false;
      graph.current = null;
      if (audio) {
        audio.recordings?.stop();
        void audio.context.close().catch(() => {});
      }
      reportRecording(null);
      setAudioStatus("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    audioStatus, volume, changeVolume, sendAudioState, toggleAudio, startIgnitionAudio, prepareAudio,
    readExhaustFlame, recordedKind, selectRecording, loadRecording, removeRecording,
  };
}
