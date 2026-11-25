import type { AerospaceEngine } from "../data/aerospace.ts";

export interface AerospaceInput {
  readonly enabled: boolean;
  readonly command: number;
  readonly heavyPropLoad: boolean;
  readonly vacuum: boolean;
}

export interface AerospaceState {
  readonly primary: number;
  readonly secondary: number;
  readonly shaftRpm: number;
  readonly coreRpm: number;
  readonly shaftAngle: number;
  readonly coreAngle: number;
  readonly cycleAngle: number;
  readonly powerKw: number;
  readonly thrustKn: number;
  readonly outputLevel: number;
  readonly vacuum: boolean;
  readonly stage: AerospaceStage;
  readonly sequenceSeconds: number;
}

export type AerospaceStage = "ready" | "booster" | "separation" | "upper";
// A short visual sequence uses representative phases, independent of real mission timing.
const BOOSTER_DEMO_SECONDS = 4.2;
const SEPARATION_DEMO_SECONDS = 1.35;

export const aerospaceStageLabels: Record<AerospaceStage, string> = {
  ready: "待命", booster: "一級點火", separation: "一級關機・級間分離", upper: "二級點火",
};

export const INITIAL_AEROSPACE_INPUT: AerospaceInput = { enabled: false, command: 0, heavyPropLoad: false, vacuum: false };
export const INITIAL_AEROSPACE_STATE: AerospaceState = {
  primary: 0, secondary: 0, shaftRpm: 0, coreRpm: 0, shaftAngle: 0, coreAngle: 0, cycleAngle: 0,
  powerKw: 0, thrustKn: 0, outputLevel: 0, vacuum: false, stage: "ready", sequenceSeconds: 0,
};

export const AERO_STEP_SECONDS = 1 / 120;
const fullTurn = 2 * Math.PI;

function approach(value: number, target: number, timeConstant: number): number {
  const result = target + (value - target) * Math.exp(-AERO_STEP_SECONDS / timeConstant);
  return result < 1e-4 ? 0 : result;
}

function angleAfterStep(angle: number, previousRpm: number, rpm: number, turn = fullTurn): number {
  return (angle + (previousRpm + rpm) / 2 * AERO_STEP_SECONDS * fullTurn / 60) % turn;
}

export function stepAerospace(state: AerospaceState, input: AerospaceInput, engine: AerospaceEngine): AerospaceState {
  const command = Number.isFinite(input.command) ? Math.max(0, Math.min(1, input.command)) : 0;
  if (engine.kind === "piston") {
    const idle = 0.26;
    const load = input.heavyPropLoad ? 1.24 : 1;
    // A simple propeller load law with a calibrated full-power point at the reference load.
    const target = input.enabled ? Math.sqrt((idle ** 2 + (1 - idle ** 2) * command) / load) : 0;
    const primary = approach(state.primary, target, input.enabled ? 0.45 : 0.68);
    const shaftRpm = primary * engine.ratedRpm;
    const outputLevel = input.enabled ? Math.min(1, load * primary ** 3) : 0;
    return { ...INITIAL_AEROSPACE_STATE, primary, shaftRpm, outputLevel,
      shaftAngle: angleAfterStep(state.shaftAngle, state.shaftRpm, shaftRpm),
      cycleAngle: angleAfterStep(state.cycleAngle, state.shaftRpm, shaftRpm, 2 * fullTurn),
      powerKw: outputLevel * engine.ratedPowerKw };
  }

  if (engine.kind === "turboprop") {
    const secondary = approach(state.secondary, input.enabled ? 0.51 + 0.49 * command : 0, 0.95);
    const load = input.heavyPropLoad ? 1.18 : 1;
    // The free power turbine drives the prop through gearing. Core, propeller and load are distinct variables.
    const primary = approach(state.primary, input.enabled ? (0.48 + 0.52 * command) * secondary / Math.sqrt(load) : 0, 0.75);
    const shaftRpm = primary * engine.ratedRpm;
    const coreRpm = secondary * 15500;
    const outputLevel = input.enabled ? Math.min(1, load * primary ** 2 * secondary) : 0;
    return { ...INITIAL_AEROSPACE_STATE, primary, secondary, shaftRpm, coreRpm, outputLevel,
      shaftAngle: angleAfterStep(state.shaftAngle, state.shaftRpm, shaftRpm),
      coreAngle: angleAfterStep(state.coreAngle, state.coreRpm, coreRpm), powerKw: outputLevel * engine.ratedPowerKw };
  }

  if (engine.kind === "staged-rocket") {
    if (!input.enabled) return INITIAL_AEROSPACE_STATE;
    const upperStarts = BOOSTER_DEMO_SECONDS + SEPARATION_DEMO_SECONDS;
    const sequenceSeconds = Math.min(upperStarts + 12, state.sequenceSeconds + AERO_STEP_SECONDS);
    const stage: AerospaceStage = sequenceSeconds < BOOSTER_DEMO_SECONDS ? "booster"
      : sequenceSeconds < upperStarts ? "separation" : "upper";
    const primary = stage === "booster" ? approach(state.primary, 1, 0.28) : 0;
    const secondary = stage === "upper" ? approach(state.secondary, 1, 0.50) : 0;
    return { ...INITIAL_AEROSPACE_STATE, stage, sequenceSeconds, primary, secondary,
      vacuum: stage !== "booster", outputLevel: primary + secondary,
      thrustKn: primary * engine.boosterThrustKn + secondary * engine.upperThrustKn };
  }

  if (engine.kind === "rocket") {
    // The control requests normalized bench output. Real startup and throttle envelopes are outside this model.
    const primary = approach(state.primary, input.enabled ? command : 0, input.enabled ? 0.77 : 0.32);
    const vacuum = input.vacuum || engine.seaLevelThrustKn === null;
    const rating = vacuum ? engine.vacuumThrustKn : engine.seaLevelThrustKn ?? engine.vacuumThrustKn;
    return { ...INITIAL_AEROSPACE_STATE, primary, outputLevel: primary, thrustKn: primary * rating, vacuum };
  }

  const fan = engine.kind === "turbofan";
  const idleLow = fan ? 0.22 : 0.27;
  const idleHigh = fan ? 0.57 : 0.51;
  const targetHigh = input.enabled ? idleHigh + (1 - idleHigh) * command ** 0.77 : 0;
  const secondary = approach(state.secondary, targetHigh, input.enabled ? (fan ? 1.18 : 0.95) : 1.75);
  const targetLow = secondary <= idleHigh ? idleLow * secondary / idleHigh
    : idleLow + (1 - idleLow) * ((secondary - idleHigh) / (1 - idleHigh)) ** 0.91;
  const primary = approach(state.primary, targetLow, fan ? 0.96 : 0.63);
  const outputLevel = fan ? primary ** 1.85 * secondary ** 0.65 : primary ** 0.93 * secondary ** 1.46;
  // The drawing uses representative shaft rates. Only normalized speeds are displayed on the bench.
  const shaftRpm = primary * (engine.id === "ge90-115b" ? 2800 : fan ? 5100 : 6400);
  const coreRpm = secondary * (fan ? 14500 : 8100);
  return { ...INITIAL_AEROSPACE_STATE, primary, secondary, outputLevel, shaftRpm, coreRpm, thrustKn: outputLevel * engine.ratedThrustKn,
    shaftAngle: angleAfterStep(state.shaftAngle, state.shaftRpm, shaftRpm),
    coreAngle: angleAfterStep(state.coreAngle, state.coreRpm, coreRpm) };
}

export function advanceAerospace(state: AerospaceState, input: AerospaceInput, engine: AerospaceEngine, elapsedSeconds: number, remainderSeconds = 0) {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.min(0.10, elapsedSeconds)) : 0;
  const carry = remainderSeconds >= 0 && remainderSeconds < AERO_STEP_SECONDS ? remainderSeconds : 0;
  const accumulated = elapsed + carry;
  const steps = Math.floor((accumulated + 1e-12) / AERO_STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) state = stepAerospace(state, input, engine);
  return { state, remainderSeconds: Math.max(0, accumulated - steps * AERO_STEP_SECONDS) };
}
