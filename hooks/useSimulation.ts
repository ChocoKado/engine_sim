import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../data/vehicles";
import {
  advanceSimulation,
  createSimulationState,
  FIXED_STEP_SECONDS,
  INITIAL_SIMULATION_INPUT,
  PIT_SPEED_LIMIT_KMH,
  stepSimulation,
} from "../lib/simulation";
import type { SimulationInput, SimulationState } from "../lib/simulation";
import { stepReplayTick, TelemetryRecorder } from "../lib/telemetry-recorder";
import type { TelemetryRun } from "../lib/telemetry-recorder";
import { enqueueShift } from "../lib/transmission";

const READOUT_INTERVAL_MS = 50;
const MAX_FRAME_SECONDS = 0.1;

export type ReplayStatus = "idle" | "recording" | "replaying";

export function useSimulation(vehicle: Vehicle, onFrame: (state: SimulationState, timestampMs: number) => void) {
  const [snapshot, setSnapshot] = useState(() => createSimulationState(vehicle));
  const state = useRef(snapshot);
  const input = useRef<SimulationInput>({ ...INITIAL_SIMULATION_INPUT, shiftMode: snapshot.shiftMode });
  const [pedalReset, setPedalReset] = useState(0);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>("idle");
  const [recordedRuns, setRecordedRuns] = useState<Partial<Record<string, TelemetryRun>>>({});
  const recorder = useRef(new TelemetryRecorder());
  const replayCursor = useRef<{ run: TelemetryRun; index: number } | null>(null);
  const readState = useCallback(() => state.current, []);

  const stopReplayOrRecording = useCallback(() => {
    if (recorder.current.isRecording) recorder.current.cancel();
    if (replayCursor.current) replayCursor.current = null;
    setReplayStatus("idle");
  }, []);

  useEffect(() => {
    if (state.current.vehicleId !== vehicle.id) {
      stopReplayOrRecording();
      const initial = createSimulationState(vehicle);
      state.current = initial;
      input.current = { ...INITIAL_SIMULATION_INPUT, shiftMode: initial.shiftMode };
      setSnapshot(initial);
      setPedalReset((version) => version + 1);
    }

    let frameId = 0;
    let previousFrame: number | undefined;
    let remainderSeconds = 0;
    let lastPublished = 0;

    function update(timestamp: number) {
      if (document.hidden) return;

      if (previousFrame !== undefined) {
        const elapsedSeconds = Math.max(0, Math.min(MAX_FRAME_SECONDS, (timestamp - previousFrame) / 1000));
        const previousState = state.current;
        const activeReplay = replayCursor.current;
        const recording = recorder.current.isRecording;

        if (activeReplay) {
          const accumulated = remainderSeconds + elapsedSeconds;
          const steps = Math.floor((accumulated + 1e-12) / FIXED_STEP_SECONDS);
          remainderSeconds = Math.max(0, accumulated - steps * FIXED_STEP_SECONDS);
          let current = previousState;
          for (let step = 0; step < steps; step += 1) {
            const tick = activeReplay.run.ticks[activeReplay.index];
            if (!tick) {
              replayCursor.current = null;
              input.current = {
                ...input.current,
                engineOn: current.powerOn,
                shiftMode: current.shiftMode,
                throttle: 0,
                brake: 0,
                pitReturn: false,
              };
              setPedalReset((version) => version + 1);
              setReplayStatus("idle");
              break;
            }
            current = stepReplayTick(current, tick, vehicle);
            activeReplay.index += 1;
          }
          state.current = current;
        } else if (recording) {
          const accumulated = remainderSeconds + elapsedSeconds;
          const steps = Math.floor((accumulated + 1e-12) / FIXED_STEP_SECONDS);
          remainderSeconds = Math.max(0, accumulated - steps * FIXED_STEP_SECONDS);
          let current = previousState;
          for (let step = 0; step < steps; step += 1) {
            const stepInput = input.current;
            current = stepSimulation(current, stepInput, vehicle);
            const stillRecording = recorder.current.recordStep(stepInput, current);
            if (!stillRecording) {
              const finished = recorder.current.stop(current);
              if (finished) setRecordedRuns((prev) => ({ ...prev, [vehicle.id]: finished }));
              setReplayStatus("idle");
              break;
            }
          }
          state.current = current;
        } else {
          const next = advanceSimulation(previousState, input.current, vehicle, elapsedSeconds, remainderSeconds);
          state.current = next.state;
          remainderSeconds = next.remainderSeconds;
        }

        const nextState = state.current;
        if (!replayCursor.current && nextState.pitZone !== previousState.pitZone) {
          if (nextState.pitZone === "box") {
            input.current = { ...input.current, engineOn: false, throttle: 0, brake: 0, pitReturn: false };
            setPedalReset((version) => version + 1);
          } else {
            input.current = { ...input.current, pitReturn: false };
          }
        }
        if (nextState !== previousState) onFrame(nextState, timestamp - remainderSeconds * 1000);

        const commandApplied = nextState.gear !== previousState.gear ||
          nextState.enginePhase !== previousState.enginePhase ||
          nextState.pitZone !== previousState.pitZone ||
          nextState.shiftMode !== previousState.shiftMode ||
          nextState.shift?.phase !== previousState.shift?.phase ||
          nextState.engineFailed !== previousState.engineFailed;
        if (nextState !== previousState && (commandApplied || timestamp - lastPublished >= READOUT_INTERVAL_MS)) {
          setSnapshot(nextState);
          lastPublished = timestamp;
        }
      }

      previousFrame = timestamp;
      frameId = requestAnimationFrame(update);
    }

    function syncVisibility() {
      cancelAnimationFrame(frameId);
      previousFrame = undefined;
      remainderSeconds = 0;
      if (!document.hidden) frameId = requestAnimationFrame(update);
    }

    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      cancelAnimationFrame(frameId);
    };
  }, [vehicle, onFrame, stopReplayOrRecording]);

  const setPedal = useCallback((pedal: "brake" | "throttle", opening: number) => {
    const value = Number.isFinite(opening) ? Math.min(1, Math.max(0, opening)) : 0;
    if (replayCursor.current && value > 0) {
      replayCursor.current = null;
      setReplayStatus("idle");
    }
    if (input.current[pedal] !== value) input.current = { ...input.current, [pedal]: value };
  }, []);

  function shift(direction: -1 | 1) {
    if (replayCursor.current) return;
    if (input.current.shiftMode === "MT") {
      const beforeLen = state.current.shiftQueue.length;
      state.current = enqueueShift(state.current, direction);
      if (state.current.shiftQueue.length > beforeLen) recorder.current.recordShift(direction);
    }
  }

  function setShiftMode(shiftMode: SimulationInput["shiftMode"]) {
    if (replayCursor.current) return;
    input.current = { ...input.current, shiftMode };
  }

  function setRoadSpeedLimitDisabled(roadSpeedLimitDisabled: boolean) {
    if (replayCursor.current) return;
    input.current = { ...input.current, roadSpeedLimitDisabled };
  }

  function toggleEngine() {
    if (replayCursor.current) {
      replayCursor.current = null;
      setReplayStatus("idle");
    }
    const current = input.current;
    input.current = { ...current, engineOn: !current.engineOn, throttle: 0, brake: 0 };
    setPedalReset((version) => version + 1);
  }

  function requestPitReturn() {
    if (replayCursor.current) return;
    if (state.current.pitZone !== "track" || state.current.vehicleSpeed * 3.6 > PIT_SPEED_LIMIT_KMH) return;
    input.current = { ...input.current, throttle: 0, pitReturn: true };
    setPedalReset((version) => version + 1);
  }

  function resetSimulation() {
    stopReplayOrRecording();
    const { roadSpeedLimitDisabled } = input.current;
    const initial = { ...createSimulationState(vehicle), roadSpeedLimitDisabled };
    state.current = initial;
    input.current = { ...INITIAL_SIMULATION_INPUT, shiftMode: initial.shiftMode, roadSpeedLimitDisabled };
    setSnapshot(initial);
    setPedalReset((version) => version + 1);
  }

  function toggleRunRecording() {
    if (replayCursor.current) {
      replayCursor.current = null;
      setReplayStatus("idle");
      return;
    }
    if (recorder.current.isRecording) {
      const finished = recorder.current.stop(state.current);
      if (finished) setRecordedRuns((prev) => ({ ...prev, [vehicle.id]: finished }));
      setReplayStatus("idle");
      return;
    }
    recorder.current.start(vehicle, state.current);
    setReplayStatus("recording");
  }

  function toggleRunReplay() {
    if (replayCursor.current) {
      replayCursor.current = null;
      input.current = { ...input.current, throttle: 0, brake: 0 };
      setPedalReset((version) => version + 1);
      setReplayStatus("idle");
      return;
    }
    const run = recordedRuns[vehicle.id];
    if (!run || run.ticks.length === 0) return;
    if (recorder.current.isRecording) recorder.current.cancel();
    state.current = run.initialState;
    setSnapshot(run.initialState);
    setPedalReset((version) => version + 1);
    replayCursor.current = { run, index: 0 };
    setReplayStatus("replaying");
  }

  const activeRecordedRun = recordedRuns[vehicle.id] ?? null;

  return {
    snapshot, readState, pedalReset, setPedal, shift, setShiftMode, setRoadSpeedLimitDisabled,
    toggleEngine, requestPitReturn, resetSimulation,
    replayStatus, activeRecordedRun, toggleRunRecording, toggleRunReplay,
  };
}
