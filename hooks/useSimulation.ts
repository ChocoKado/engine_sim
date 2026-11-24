import { useCallback, useEffect, useRef, useState } from "react";
import type { Vehicle } from "../data/vehicles";
import {
  advanceSimulation,
  createSimulationState,
  INITIAL_SIMULATION_INPUT,
} from "../lib/simulation";
import type { SimulationInput, SimulationState } from "../lib/simulation";
import { enqueueShift } from "../lib/transmission";

const READOUT_INTERVAL_MS = 50;

export function useSimulation(vehicle: Vehicle, onFrame: (state: SimulationState, timestampMs: number) => void) {
  const [snapshot, setSnapshot] = useState(() => createSimulationState(vehicle));
  const state = useRef(snapshot);
  const input = useRef<SimulationInput>(INITIAL_SIMULATION_INPUT);
  const [pedalReset, setPedalReset] = useState(0);
  const readState = useCallback(() => state.current, []);

  useEffect(() => {
    let frameId = 0;
    let previousFrame: number | undefined;
    let remainderSeconds = 0;
    let lastPublished = 0;

    function update(timestamp: number) {
      if (document.hidden) return;

      if (previousFrame !== undefined) {
        const elapsedSeconds = (timestamp - previousFrame) / 1000;
        const previousState = state.current;
        const next = advanceSimulation(previousState, input.current, vehicle, elapsedSeconds, remainderSeconds);
        state.current = next.state;
        remainderSeconds = next.remainderSeconds;
        if (next.state !== previousState) onFrame(next.state, timestamp - remainderSeconds * 1000);

        const commandApplied = next.state.gear !== previousState.gear ||
          next.state.engineOn !== previousState.engineOn ||
          next.state.shiftMode !== previousState.shiftMode ||
          next.state.shift?.phase !== previousState.shift?.phase ||
          next.state.engineFailed !== previousState.engineFailed;
        if (next.state !== previousState && (commandApplied || timestamp - lastPublished >= READOUT_INTERVAL_MS)) {
          setSnapshot(next.state);
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
  }, [vehicle, onFrame]);

  const setPedal = useCallback((pedal: "brake" | "throttle", pressed: boolean) => {
    const value = pressed ? 1 : 0;
    if (input.current[pedal] !== value) input.current = { ...input.current, [pedal]: value };
  }, []);

  function shift(direction: -1 | 1) {
    if (input.current.shiftMode === "MT") state.current = enqueueShift(state.current, direction);
  }

  function setShiftMode(shiftMode: SimulationInput["shiftMode"]) {
    input.current = { ...input.current, shiftMode };
  }

  function setRoadSpeedLimitDisabled(roadSpeedLimitDisabled: boolean) {
    input.current = { ...input.current, roadSpeedLimitDisabled };
  }

  function toggleEngine() {
    const current = input.current;
    input.current = { ...current, engineOn: !current.engineOn, throttle: 0, brake: 0 };
    setPedalReset((version) => version + 1);
  }

  function resetSimulation() {
    const { roadSpeedLimitDisabled } = input.current;
    const initial = { ...createSimulationState(vehicle), roadSpeedLimitDisabled };
    state.current = initial;
    input.current = { ...INITIAL_SIMULATION_INPUT, roadSpeedLimitDisabled };
    setSnapshot(initial);
    setPedalReset((version) => version + 1);
  }

  return { snapshot, readState, pedalReset, setPedal, shift, setShiftMode, setRoadSpeedLimitDisabled, toggleEngine, resetSimulation };
}
