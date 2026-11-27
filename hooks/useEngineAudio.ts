import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../data/vehicles";
import type { TuningProfile } from "../data/tuning";
import type { SimulationState } from "../lib/simulation";
import { rpmFromRadiansPerSecond } from "../lib/simulation";
import { VALVE_EVENTS } from "../lib/kinematics";
import { RecordedEngineMixer } from "../lib/recorded-engine";
import type { RecordingKind } from "../lib/recorded-engine";
import { getOverallRatio, resolveTransmissionType } from "../lib/transmission";

export type AudioStatus = "muted" | "starting" | "enabled" | "paused" | "unavailable";

const DEFAULT_VOLUME = 88;
const VOLUME_STORAGE_KEY = "engine_sim.audioVolume";

interface AudioGraph {
  context: AudioContext;
  gain: GainNode;
  synthGain: GainNode;
  moduleReady: Promise<void>;
  moduleLoaded: boolean;
  recordingsByVehicle: Map<string, RecordedEngineMixer>;
  activeVehicleId?: string;
  node?: AudioWorkletNode;
  clockOffsetSeconds?: number;
}

function fade({ context, gain }: AudioGraph, target: number) {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(target, now, 0.035);
}

function buildProcessorOptions(vehicle: Vehicle) {
  return {
    ...vehicle.audio,
    exhaustOpeningRad: vehicle.audio.exhaustOpeningRad
      ?? (vehicle.geometry.rotary ? 130 : VALVE_EVENTS.exhaust.opensDegrees) * Math.PI / 180,
    supercharger: vehicle.supercharger,
    turbocharger: vehicle.turbocharger,
    twoStroke: vehicle.twoStroke,
    transmissionType: resolveTransmissionType(vehicle),
    rotaryIdleRpm: vehicle.geometry.rotary ? vehicle.physics.idleRpm : undefined,
    electricStarter: Boolean(vehicle.physics.electricDrive),
  };
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
  const latestVehicle = useRef(vehicle);
  const latestState = useRef<{ state: SimulationState; timestampMs: number } | null>(null);
  const lastFlame = useRef({ strength: 0, elapsedMs: 0, durationMs: 150, lastReadMs: 0 });
  const silentAfterfire = useRef<{
    charge: number; wasOpen: boolean; wasPoweredCut: boolean; lastTimestampMs: number;
    pendingCount: number; nextPopInMs: number; burstStrength: number;
  }>({ charge: 0, wasOpen: false, wasPoweredCut: false, lastTimestampMs: 0, pendingCount: 0, nextPopInMs: 0, burstStrength: 0 });
  const showExhaustRef = useRef(showExhaust);
  const latestVoicing = useRef(tuning.voicing);

  const triggerFlame = useCallback((strength: number, rawDurationMs?: number) => {
    const durationMs = Number.isFinite(rawDurationMs) ? Math.min(280, Math.max(155, 3.8 * (rawDurationMs as number))) : 210;
    lastFlame.current = {
      strength: Math.max(0, strength),
      elapsedMs: 0,
      durationMs,
      lastReadMs: performance.now(),
    };
  }, []);

  const readExhaustFlame = useCallback((advanceMs?: number) => {
    if (!latestState.current?.state.engineOn) {
      lastFlame.current.strength = 0;
      return 0;
    }
    const current = lastFlame.current;
    if (current.strength <= 0) return 0;
    const now = performance.now();
    const deltaMs = advanceMs !== undefined ? Math.max(0, advanceMs) : Math.max(0, now - current.lastReadMs);
    current.lastReadMs = now;
    current.elapsedMs += deltaMs;
    if (current.elapsedMs >= current.durationMs) {
      current.strength = 0;
      return 0;
    }
    const peak = Math.min(1, 0.30 + current.strength * 0.92);
    return peak * (1 - current.elapsedMs / current.durationMs) ** 1.22;
  }, []);

  const reportRecording = useCallback((kind: RecordingKind | null) => {
    if (activeRecording.current === kind) return;
    activeRecording.current = kind;
    setRecordedKind(kind);
  }, []);

  const attachVehicleNode = useCallback((audio: AudioGraph, nextVehicle: Vehicle) => {
    if (audio.node) {
      audio.node.port.onmessage = null;
      audio.node.onprocessorerror = null;
      audio.node.disconnect();
      audio.node = undefined;
    }
    if (audio.activeVehicleId && audio.activeVehicleId !== nextVehicle.id) {
      audio.recordingsByVehicle.get(audio.activeVehicleId)?.stop();
    }
    audio.activeVehicleId = nextVehicle.id;
    audio.clockOffsetSeconds = undefined;

    const node = new AudioWorkletNode(audio.context, "engine-sound", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: buildProcessorOptions(nextVehicle),
    });
    node.connect(audio.synthGain);
    node.port.onmessage = ({ data }) => {
      if (data?.type === "afterfire" && Number.isFinite(data.strength)) {
        triggerFlame(data.strength, data.durationMs);
      }
    };
    node.port.postMessage({ type: "tuning", voicing: latestVoicing.current });
    node.onprocessorerror = () => {
      if (graph.current !== audio) return;
      requested.current = false;
      graph.current = null;
      for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
      reportRecording(null);
      void audio.context.close().catch(() => {});
      setAudioStatus("unavailable");
    };
    audio.node = node;
  }, [reportRecording, triggerFlame]);

  useEffect(() => {
    latestVehicle.current = vehicle;
    lastFlame.current = { strength: 0, elapsedMs: 0, durationMs: 150, lastReadMs: 0 };
    silentAfterfire.current = { charge: 0, wasOpen: false, wasPoweredCut: false, lastTimestampMs: 0, pendingCount: 0, nextPopInMs: 0, burstStrength: 0 };
    latestState.current = null;
    reportRecording(null);
    const audio = graph.current;
    if (audio?.moduleLoaded && (audio.context.state as string) !== "closed") {
      attachVehicleNode(audio, vehicle);
    }
  }, [attachVehicleNode, reportRecording, vehicle]);

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

  const updateSilentExhaustFlame = useCallback((state: SimulationState, timestampMs: number) => {
    const tracker = silentAfterfire.current;
    if (!state.engineOn) {
      tracker.charge = 0;
      tracker.wasOpen = false;
      tracker.wasPoweredCut = false;
      tracker.pendingCount = 0;
      tracker.lastTimestampMs = timestampMs;
      return;
    }
    const seconds = tracker.lastTimestampMs > 0 ? Math.min(0.1, Math.max(0, (timestampMs - tracker.lastTimestampMs) / 1000)) : 1 / 120;
    tracker.lastTimestampMs = timestampMs;
    const rpm = rpmFromRadiansPerSecond(state.engineAngularVelocity);
    const open = state.throttle > 0.08;
    const upshifting = state.shift !== null && state.shift.fromGear > 0 && state.shift.targetGear > state.shift.fromGear;
    const poweredCut = upshifting && state.throttle >= 0.60 && state.shiftCut >= 0.50 && rpm >= 5000;
    const revMatching = state.revMatchThrottle > 0.04;
    const voicing = 0.66 + 0.38 * Math.min(1.5, Math.max(0.5, latestVoicing.current.harmonics));
    const { peakTorqueNm } = latestVehicle.current.physics;
    const ratio = getOverallRatio(latestVehicle.current, state.gear);
    const combustion = Math.min(1, Math.max(0, state.combustionTorqueNm / peakTorqueNm));
    const load = ratio ? Math.min(1, Math.abs(state.drivetrainTorqueNm) / (ratio * peakTorqueNm)) : 0;

    if (revMatching) {
      tracker.pendingCount = 0;
      tracker.charge *= Math.exp(-seconds / 0.055);
    } else if (open) {
      tracker.pendingCount = 0;
      if (poweredCut && !tracker.wasPoweredCut) {
        const strength = tracker.charge * voicing;
        if (strength > 0.20 && Math.random() < Math.min(0.86, 0.18 + 0.66 * strength)) {
          const impulse = Math.min(0.96, (0.42 + strength * 0.50) * (0.72 + Math.random() * 0.28));
          triggerFlame(impulse, Math.round(31 + 22 * impulse));
        }
      } else if ((state.launchActive && latestVehicle.current.turbocharger && Math.random() < 0.22)
        || (state.limiterCut && latestVoicing.current.harmonics > 1.2 && Math.random() < 0.12)) {
        triggerFlame(0.82 + Math.random() * 0.14, 54);
      }
      const heat = Math.min(1, Math.max(0, (rpm - 2600) / 5000)) * Math.min(1, Math.max(0, (state.throttle - 0.12) / 0.5));
      const target = heat * (0.64 + 0.23 * Math.sqrt(combustion) + 0.13 * load);
      const chargeTau = target >= tracker.charge ? 0.11 : 0.42;
      tracker.charge += (1 - Math.exp(-seconds / chargeTau)) * (target - tracker.charge);
    } else if (tracker.wasOpen) {
      const strength = tracker.charge * voicing;
      if (rpm > 3400 && strength > 0.14 && state.shiftCut < 0.15 && Math.random() < Math.min(0.89, 0.2 + 0.87 * strength)) {
        tracker.pendingCount = 1 + Number(Math.random() < strength * 0.55) + Number(Math.random() < strength * 0.19);
        tracker.nextPopInMs = 30 + Math.random() * 75;
        tracker.burstStrength = strength;
      }
      tracker.charge = 0;
    }

    if (rpm < 2500) tracker.pendingCount = 0;
    if (tracker.pendingCount > 0) {
      tracker.nextPopInMs -= seconds * 1000;
      if (tracker.nextPopInMs <= 0) {
        tracker.pendingCount -= 1;
        tracker.nextPopInMs = 75 + Math.random() * 125;
        const impulse = Math.min(0.96, (0.42 + tracker.burstStrength * 0.52) * (0.72 + Math.random() * 0.28));
        tracker.burstStrength *= 0.74;
        triggerFlame(impulse, Math.round(46 + 22 * impulse));
      }
    }
    tracker.wasOpen = open && !revMatching;
    tracker.wasPoweredCut = poweredCut;
  }, [triggerFlame]);

  const sendAudioState = useCallback((state: SimulationState, timestampMs = performance.now()) => {
    latestState.current = { state, timestampMs };
    const audio = graph.current;
    const audibleRunning = requested.current && Boolean(audio?.node) && audio?.context.state === "running";
    if (!audibleRunning) {
      if (showExhaustRef.current) updateSilentExhaustFlame(state, timestampMs);
      return;
    }
    if (!audio?.node) return;

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
    const currentVehicle = latestVehicle.current;
    const ratio = getOverallRatio(currentVehicle, state.gear);
    const { peakTorqueNm } = currentVehicle.physics;
    const mixer = audio.recordingsByVehicle.get(currentVehicle.id);
    if (mixer) reportRecording(mixer.update(state, requested.current && preferRecording.current));
    else reportRecording(null);

    audio.node.port.postMessage({
      type: "state",
      angleRad: state.crankAngleRad,
      angularVelocity: state.engineAngularVelocity,
      superchargerAngularVelocity: state.superchargerAngularVelocity,
      turboBoostBar: state.turboBoostBar,
      turboRelease: state.turboRelease,
      revMatchThrottle: state.revMatchThrottle,
      vtecEngagement: Math.max(state.vtecEngagement, state.vvaEngagement * 0.72),
      limiterCut: state.limiterCut,
      launchActive: state.launchActive,
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
  }, [reportRecording, updateSilentExhaustFlame]);

  useEffect(() => {
    function handleVisibility() {
      const audio = graph.current;
      if (!document.hidden || !audio || !requested.current) return;
      requested.current = false;
      for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
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
        for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
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
        for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
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
    if (requested.current && graph.current && (graph.current.context.state as string) !== "running") {
      return requestActivation();
    }
    if (requested.current) return activation.current;
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
    const created: AudioGraph = {
      context,
      gain,
      synthGain,
      moduleLoaded: false,
      recordingsByVehicle: new Map(),
      moduleReady: context.audioWorklet.addModule("/engine-sound-processor.js").then(() => {
        created.moduleLoaded = true;
      }),
    };
    // Import can initialize a suspended context before the user enables playback.
    void created.moduleReady.catch(() => {});
    graph.current = created;
    context.onstatechange = () => {
      if (graph.current !== created || !created.node || !requested.current) return;
      if ((context.state as string) === "running") return;
      requested.current = false;
      for (const mixer of created.recordingsByVehicle.values()) mixer.stop();
      reportRecording(null);
      fade(created, 0);
      setAudioStatus("paused");
    };
    return created;
  }

  async function loadRecording(kind: RecordingKind, file: File, referenceRpm?: number) {
    const audio = graph.current ?? createAudioGraph();
    const id = latestVehicle.current.id;
    let mixer = audio.recordingsByVehicle.get(id);
    if (!mixer) {
      mixer = new RecordedEngineMixer(audio.context, audio.synthGain, audio.gain);
      audio.recordingsByVehicle.set(id, mixer);
    }
    await mixer.load(kind, file, referenceRpm);
  }

  function removeRecording(kind: RecordingKind) {
    graph.current?.recordingsByVehicle.get(latestVehicle.current.id)?.remove(kind);
  }

  function selectRecording(preferred: boolean) {
    preferRecording.current = preferred;
    if (!preferred) {
      const audio = graph.current;
      if (audio) for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
      reportRecording(null);
    }
  }

  async function activateAudio() {
    let audio = graph.current;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      audio ??= createAudioGraph();

      // Call resume on the same user activation, before awaiting the module or any other work.
      const wasSuspended = (audio.context.state as string) !== "running";
      const ready = Promise.all([audio.moduleReady, audio.context.resume()]);
      const timeoutReached = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Audio activation timed out")), 2500);
      });
      await Promise.race([ready, timeoutReached]);
      if (graph.current !== audio) return;

      if (!audio.node || audio.activeVehicleId !== latestVehicle.current.id) {
        attachVehicleNode(audio, latestVehicle.current);
      } else if (wasSuspended) {
        audio.clockOffsetSeconds = undefined;
        audio.node.port.postMessage({ type: "reset-clock" });
      }
      const latest = latestState.current;
      if (latest && performance.now() - latest.timestampMs < 80) sendAudioState(latest.state, latest.timestampMs);
      fade(audio, requested.current ? volumeRef.current / 100 : 0);
      if (requested.current) setAudioStatus("enabled");
    } catch {
      if (graph.current !== audio || (audio?.node && (audio.context.state as string) === "running")) return;
      requested.current = false;
      graph.current = null;
      if (audio) {
        for (const mixer of audio.recordingsByVehicle.values()) mixer.stop();
        void audio.context.close().catch(() => {});
      }
      reportRecording(null);
      setAudioStatus("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    audioStatus, volume, changeVolume, sendAudioState, toggleAudio, startIgnitionAudio,
    readExhaustFlame, recordedKind, selectRecording, loadRecording, removeRecording,
  };
}
