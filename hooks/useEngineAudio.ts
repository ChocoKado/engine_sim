import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../data/vehicles";
import type { TuningProfile } from "../data/tuning";
import type { SimulationState } from "../lib/simulation";
import { VALVE_EVENTS } from "../lib/kinematics";
import { getOverallRatio } from "../lib/transmission";

export type AudioStatus = "muted" | "starting" | "enabled" | "paused" | "unavailable";

const DEFAULT_VOLUME = 88;
const VOLUME_STORAGE_KEY = "engine_sim.audioVolume";

interface AudioGraph {
  context: AudioContext;
  gain: GainNode;
  ready: Promise<AudioWorkletNode>;
  node?: AudioWorkletNode;
  clockOffsetSeconds?: number;
}

function fade({ context, gain }: AudioGraph, target: number) {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(target, now, 0.035);
}

export function useEngineAudio(vehicle: Vehicle, tuning: TuningProfile) {
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("muted");
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const graph = useRef<AudioGraph | null>(null);
  const requested = useRef(false);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const latestState = useRef<{ state: SimulationState; timestampMs: number } | null>(null);
  const latestVoicing = useRef(tuning.voicing);

  useEffect(() => {
    latestVoicing.current = tuning.voicing;
    graph.current?.node?.port.postMessage({ type: "tuning", voicing: tuning.voicing });
  }, [tuning]);

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
    if (!requested.current || !audio?.node || audio.context.state !== "running") return;

    const observedOffset = audio.context.currentTime - performance.now() / 1000;
    const previousOffset = audio.clockOffsetSeconds ?? observedOffset;
    // The audio clock is quantized to render blocks. Keep that jitter out of the physics timestamps.
    const clockError = Math.min(0.004, Math.max(-0.004, observedOffset - previousOffset));
    audio.clockOffsetSeconds = previousOffset + clockError * 0.015;
    const ratio = getOverallRatio(vehicle, state.gear);
    const { peakTorqueNm } = vehicle.physics;
    audio.node.port.postMessage({
      type: "state",
      angleRad: state.crankAngleRad,
      angularVelocity: state.engineAngularVelocity,
      superchargerAngularVelocity: state.superchargerAngularVelocity,
      throttle: state.throttle,
      combustion: Math.min(1, state.combustionTorqueNm / peakTorqueNm),
      shiftCut: state.shiftCut,
      upshifting: state.shift !== null && state.shift.fromGear > 0 && state.shift.targetGear > state.shift.fromGear,
      load: ratio ? Math.min(1, Math.abs(state.drivetrainTorqueNm) / (ratio * peakTorqueNm)) : 0,
      engineOn: state.engineOn,
      contextTime: timestampMs / 1000 + audio.clockOffsetSeconds,
    });
  }, [vehicle]);

  useEffect(() => {
    function handleVisibility() {
      const audio = graph.current;
      if (!document.hidden || !audio || !requested.current) return;
      requested.current = false;
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
        audio.context.onstatechange = null;
        void audio.context.close().catch(() => {});
      }
    };
  }, []);

  async function toggleAudio() {
    let audio = graph.current;
    if (requested.current) {
      requested.current = false;
      if (audio) fade(audio, 0);
      setAudioStatus("muted");
      return;
    }

    requested.current = true;
    setAudioStatus("starting");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!audio) {
        const context = new AudioContext({ latencyHint: "interactive" });
        if (!context.audioWorklet) {
          void context.close().catch(() => {});
          throw new Error("AudioWorklet unavailable");
        }

        const gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
        const ready = context.audioWorklet.addModule("/engine-sound-processor.js").then(() => {
          const node = new AudioWorkletNode(context, "engine-sound", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: {
              ...vehicle.audio,
              exhaustOpeningRad: VALVE_EVENTS.exhaust.opensDegrees * Math.PI / 180,
              supercharger: vehicle.supercharger,
            },
          });
          node.connect(gain);
          return node;
        });

        const created: AudioGraph = { context, gain, ready };
        context.onstatechange = () => {
          if (graph.current !== created || !created.node || !requested.current || context.state === "running") return;
          requested.current = false;
          fade(created, 0);
          setAudioStatus("paused");
        };
        audio = created;
        graph.current = audio;
      }

      // Call resume on the same user activation, before awaiting the module or any other work.
      const ready = Promise.all([audio.ready, audio.context.resume()]);
      const timeoutReached = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Audio activation timed out")), 2500);
      });
      const [node] = await Promise.race([ready, timeoutReached]);
      if (graph.current !== audio || !requested.current) return;

      const activated = audio;
      activated.node = node;
      activated.clockOffsetSeconds = undefined;
      node.port.postMessage({ type: "reset-clock" });
      node.port.postMessage({ type: "tuning", voicing: latestVoicing.current });
      node.onprocessorerror = () => {
        if (graph.current !== activated) return;
        requested.current = false;
        graph.current = null;
        void activated.context.close().catch(() => {});
        setAudioStatus("unavailable");
      };
      const latest = latestState.current;
      if (latest && performance.now() - latest.timestampMs < 80) sendAudioState(latest.state, latest.timestampMs);
      fade(activated, volumeRef.current / 100);
      setAudioStatus("enabled");
    } catch {
      if (graph.current !== audio || !requested.current) return;
      requested.current = false;
      graph.current = null;
      if (audio) void audio.context.close().catch(() => {});
      setAudioStatus("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  return { audioStatus, volume, changeVolume, sendAudioState, toggleAudio };
}
