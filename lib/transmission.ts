import type { Vehicle } from "../data/vehicles";

export type ShiftMode = "MT" | "AT";
export type ShiftDirection = -1 | 1;
export type ShiftPhase = "unload" | "disengage" | "recouple";

export interface ShiftState {
  readonly phase: ShiftPhase;
  readonly fromGear: number;
  readonly targetGear: number;
  readonly elapsedSeconds: number;
  readonly targetRpm: number;
}

export interface TransmissionState {
  readonly gear: number;
  readonly shiftMode: ShiftMode;
  readonly shiftQueue: readonly ShiftDirection[];
  readonly shift: ShiftState | null;
  readonly shiftCooldownSeconds: number;
}

interface TransmissionInput {
  readonly engineOn: boolean;
  readonly shiftMode: ShiftMode;
  readonly throttle: number;
  readonly brake: number;
  readonly engineRpm: number;
  readonly wheelAngularVelocity: number;
  readonly vehicleSpeed: number;
}

interface TransmissionStep {
  readonly transmission: TransmissionState;
  readonly clutchScale: number;
  readonly combustionScale: number;
  readonly revMatchRpm: number;
}

const UNLOAD_SECONDS = 0.055;
const RATIO_CHANGE_SECONDS = 0.12;
const SHIFT_END_SECONDS = 0.30;
const AUTO_COOLDOWN_SECONDS = 0.48;
const NEUTRAL_MAX_SPEED_MPS = 2;
const MAX_QUEUED_SHIFTS = 4;
const MIN_COMBUSTION_SCALE = 0.08;

export const INITIAL_TRANSMISSION_STATE: TransmissionState = {
  gear: 0,
  shiftMode: "MT",
  shiftQueue: [],
  shift: null,
  shiftCooldownSeconds: 0,
};

export function getOverallRatio(vehicle: Vehicle, gear: number): number {
  const { gearRatios, primaryRatio, finalDriveRatio } = vehicle.physics;
  return (gearRatios[gear - 1] ?? 0) * primaryRatio * finalDriveRatio;
}

export function enqueueShift<T extends TransmissionState>(state: T, direction: ShiftDirection): T {
  if (state.shiftMode === "AT" || state.shiftQueue.length >= MAX_QUEUED_SHIFTS) return state;
  return { ...state, shiftQueue: [...state.shiftQueue, direction] };
}

function matchedRpm(vehicle: Vehicle, gear: number, wheelAngularVelocity: number): number {
  return Math.abs(wheelAngularVelocity * getOverallRatio(vehicle, gear)) * 60 / (2 * Math.PI);
}

function withinAutomaticRpmLimit(targetRpm: number, vehicle: Vehicle): boolean {
  return targetRpm <= 0.94 * vehicle.physics.referenceRpm;
}

function manualTarget(gear: number, request: ShiftDirection | undefined, maxGear: number, speed: number): number {
  if (request === 1) return Math.min(gear + 1, maxGear);
  if (request === -1 && gear === 1 && speed <= NEUTRAL_MAX_SPEED_MPS) return 0;
  if (request === -1 && gear > 1) return gear - 1;
  return gear;
}

function automaticTarget(state: TransmissionState, input: TransmissionInput, vehicle: Vehicle): number {
  const { gear, shiftCooldownSeconds } = state;
  const { throttle, brake, engineRpm, vehicleSpeed, wheelAngularVelocity } = input;
  const { referenceRpm, idleRpm } = vehicle.physics;
  if (!input.engineOn || shiftCooldownSeconds > 0) return gear;

  if (gear === 0) {
    const firstGearRpm = matchedRpm(vehicle, 1, wheelAngularVelocity);
    return throttle > 0.12 && brake < 0.12 && withinAutomaticRpmLimit(firstGearRpm, vehicle) ? 1 : 0;
  }

  const requestedLoad = throttle * (1 - brake);
  const upshiftRpm = referenceRpm * (0.48 + 0.44 * requestedLoad);
  const currentMatchedRpm = matchedRpm(vehicle, gear, wheelAngularVelocity);
  if (gear < vehicle.gears && engineRpm > upshiftRpm && currentMatchedRpm > 0.8 * upshiftRpm && brake < 0.2) {
    return gear + 1;
  }

  if (gear > 1) {
    const downshiftRpm = idleRpm + (referenceRpm - idleRpm) * (0.13 + 0.39 * requestedLoad);
    const targetRpm = matchedRpm(vehicle, gear - 1, wheelAngularVelocity);
    const needsLowerGear = engineRpm < downshiftRpm || vehicleSpeed < 2.5;
    if (needsLowerGear && withinAutomaticRpmLimit(targetRpm, vehicle)) return gear - 1;
  }
  return gear;
}

export function advanceTransmission(
  previous: TransmissionState,
  input: TransmissionInput,
  vehicle: Vehicle,
  stepSeconds: number,
): TransmissionStep {
  const modeChanged = input.shiftMode !== previous.shiftMode;
  const shiftCooldownSeconds = Math.max(0, previous.shiftCooldownSeconds - stepSeconds);
  let transmission: TransmissionState = {
    gear: previous.gear,
    shiftMode: input.shiftMode,
    shiftQueue: modeChanged ? [] : previous.shiftQueue,
    shift: previous.shift,
    shiftCooldownSeconds,
  };
  let { shift } = transmission;

  if (!shift) {
    const targetGear = input.shiftMode === "AT"
      ? automaticTarget(transmission, input, vehicle)
      : manualTarget(transmission.gear, transmission.shiftQueue[0], vehicle.gears, input.vehicleSpeed);
    if (transmission.shiftQueue.length) transmission = { ...transmission, shiftQueue: transmission.shiftQueue.slice(1) };
    if (targetGear !== transmission.gear) {
      shift = { phase: "unload", fromGear: transmission.gear, targetGear, elapsedSeconds: 0, targetRpm: 0 };
    }
  }

  if (!shift) return { transmission, clutchScale: 1, combustionScale: 1, revMatchRpm: 0 };

  const elapsedSeconds = shift.elapsedSeconds + stepSeconds;
  let { targetGear } = shift;
  let targetRpm = matchedRpm(vehicle, targetGear, input.wheelAngularVelocity);
  const phase = elapsedSeconds < UNLOAD_SECONDS ? "unload" : elapsedSeconds < RATIO_CHANGE_SECONDS ? "disengage" : "recouple";
  let { gear } = transmission;

  if (phase === "recouple" && shift.phase !== "recouple") {
    const selectsLowerGear = targetGear > 0 && (shift.fromGear === 0 || targetGear < shift.fromGear);
    if (input.shiftMode === "AT" && selectsLowerGear && !withinAutomaticRpmLimit(targetRpm, vehicle)) {
      targetGear = shift.fromGear;
      targetRpm = matchedRpm(vehicle, targetGear, input.wheelAngularVelocity);
    }
    gear = targetGear;
  }

  if (elapsedSeconds >= SHIFT_END_SECONDS) {
    transmission = { ...transmission, gear, shift: null, shiftCooldownSeconds: AUTO_COOLDOWN_SECONDS };
    return { transmission, clutchScale: 1, combustionScale: 1, revMatchRpm: 0 };
  }

  const clutchScale = phase === "unload"
    ? 1 - elapsedSeconds / UNLOAD_SECONDS
    : phase === "recouple" ? (elapsedSeconds - RATIO_CHANGE_SECONDS) / (SHIFT_END_SECONDS - RATIO_CHANGE_SECONDS) : 0;
  const combustionScale = MIN_COMBUSTION_SCALE + (1 - MIN_COMBUSTION_SCALE) * clutchScale;
  const revMatchRpm = input.shiftMode === "AT" && phase !== "unload" && targetGear > 0 && targetGear < shift.fromGear
    && withinAutomaticRpmLimit(targetRpm, vehicle) ? targetRpm : 0;

  transmission = { ...transmission, gear, shift: { ...shift, phase, targetGear, elapsedSeconds, targetRpm } };
  return { transmission, clutchScale, combustionScale, revMatchRpm };
}
