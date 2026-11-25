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
  readonly startRpm: number;
  readonly powerRecoveryStartedAtSeconds: number | null;
}

interface ShiftResult {
  readonly fromGear: number;
  readonly targetGear: number;
  readonly startRpm: number;
  readonly endRpm: number;
}

export interface TransmissionState {
  readonly gear: number;
  readonly shiftMode: ShiftMode;
  readonly shiftQueue: readonly ShiftDirection[];
  readonly shift: ShiftState | null;
  readonly lastShift: ShiftResult | null;
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

const UNLOAD_SECONDS = 0.025;
const RATIO_CHANGE_SECONDS = 0.085;
const SHIFT_END_SECONDS = 0.20;
const RACE_UNLOAD_SECONDS = 0.014;
const RACE_RATIO_CHANGE_SECONDS = 0.042;
const RACE_SHIFT_END_SECONDS = 0.092;
const UPSHIFT_RATIO_CHANGE_SECONDS = 0.080;
const UPSHIFT_CLUTCH_ENGAGEMENT_SECONDS = 0.026;
const UPSHIFT_MAX_SYNC_SECONDS = 0.27;
const UPSHIFT_POWER_RECOVERY_SECONDS = 0.024;
const UPSHIFT_MATCH_TOLERANCE_RPM = 90;
const AUTO_COOLDOWN_SECONDS = 0.48;
const AUTO_BRAKE_COOLDOWN_SECONDS = 0.11;
const AUTO_RACE_BRAKE_COOLDOWN_SECONDS = 0.042;
const NEUTRAL_MAX_SPEED_MPS = 2;
const STANDSTILL_SPEED_MPS = 0.15;
const MAX_QUEUED_SHIFTS = 4;
const MIN_COMBUSTION_SCALE = 0.08;

export const INITIAL_TRANSMISSION_STATE: TransmissionState = {
  gear: 0,
  shiftMode: "MT",
  shiftQueue: [],
  shift: null,
  lastShift: null,
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

function smoothProgress(progress: number): number {
  const normalized = Math.min(1, Math.max(0, progress));
  return normalized ** 2 * (3 - 2 * normalized);
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
  const { referenceRpm, idleRpm, peakPowerRpm, fuelCutRpm, gearFuelCutRpm } = vehicle.physics;
  if (!input.engineOn || shiftCooldownSeconds > 0) return gear;

  if (gear === 0) {
    const firstGearRpm = matchedRpm(vehicle, 1, wheelAngularVelocity);
    return throttle > 0.12 && brake < 0.12 && withinAutomaticRpmLimit(firstGearRpm, vehicle) ? 1 : 0;
  }

  const requestedLoad = throttle * (1 - brake);
  const activeFuelCut = gearFuelCutRpm?.[gear] ?? fuelCutRpm;
  const fullLoadUpshiftRpm = Math.min(
    activeFuelCut - 250,
    Math.max(0.92 * referenceRpm, Math.min(0.985 * referenceRpm, peakPowerRpm * 1.015)),
  );
  const upshiftRpm = referenceRpm * 0.48 + (fullLoadUpshiftRpm - referenceRpm * 0.48) * requestedLoad;
  const currentMatchedRpm = matchedRpm(vehicle, gear, wheelAngularVelocity);
  if (gear < vehicle.gears && engineRpm > upshiftRpm && currentMatchedRpm > 0.8 * upshiftRpm && brake < 0.2) {
    const nextMatchedRpm = matchedRpm(vehicle, gear + 1, wheelAngularVelocity);
    const hittingLimiter = engineRpm >= activeFuelCut - 260;
    const overdriveBog = requestedLoad > 0.85 && !hittingLimiter && nextMatchedRpm < 0.765 * peakPowerRpm
      && (vehicle.physics.gearRatios[gear] ?? 1) < 0.86 && gear >= 5;
    if (!overdriveBog) return gear + 1;
  }

  if (gear > 1) {
    if (vehicleSpeed <= STANDSTILL_SPEED_MPS) {
      const firstRpm = matchedRpm(vehicle, 1, wheelAngularVelocity);
      if (withinAutomaticRpmLimit(firstRpm, vehicle)) return 1;
    }
    const isRace = vehicle.kind === "formula1" || vehicle.kind === "endurance";
    const brakeDownshiftBias = brake >= 0.2 ? brake * (isRace ? 0.40 : 0.26) : 0;
    const downshiftRpm = idleRpm + (referenceRpm - idleRpm) * Math.min(0.74, 0.13 + 0.39 * requestedLoad + brakeDownshiftBias);
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
  const isRace = vehicle.kind === "formula1" || vehicle.kind === "endurance";
  const activeCooldownCap = input.shiftMode === "AT" && input.brake >= 0.25 && previous.gear > 1
    ? (isRace ? AUTO_RACE_BRAKE_COOLDOWN_SECONDS : AUTO_BRAKE_COOLDOWN_SECONDS)
    : previous.shiftCooldownSeconds;
  const shiftCooldownSeconds = Math.max(0, Math.min(previous.shiftCooldownSeconds, activeCooldownCap) - stepSeconds);
  let transmission: TransmissionState = {
    gear: previous.gear,
    shiftMode: input.shiftMode,
    shiftQueue: modeChanged ? [] : previous.shiftQueue,
    shift: previous.shift,
    lastShift: previous.lastShift,
    shiftCooldownSeconds,
  };
  let { shift } = transmission;

  if (!shift) {
    const targetGear = input.shiftMode === "AT"
      ? automaticTarget(transmission, input, vehicle)
      : manualTarget(transmission.gear, transmission.shiftQueue[0], vehicle.gears, input.vehicleSpeed);
    if (transmission.shiftQueue.length) transmission = { ...transmission, shiftQueue: transmission.shiftQueue.slice(1) };
    if (targetGear !== transmission.gear) {
      if (input.shiftMode === "AT" && input.vehicleSpeed <= STANDSTILL_SPEED_MPS && targetGear === 1 && transmission.gear > 1) {
        transmission = { ...transmission, gear: 1, shift: null, shiftCooldownSeconds: 0 };
        return { transmission, clutchScale: 1, combustionScale: 1, revMatchRpm: 0 };
      }
      shift = {
        phase: "unload", fromGear: transmission.gear, targetGear, elapsedSeconds: 0, targetRpm: 0,
        startRpm: input.engineRpm, powerRecoveryStartedAtSeconds: null,
      };
    }
  }

  if (!shift) return { transmission, clutchScale: 1, combustionScale: 1, revMatchRpm: 0 };

  const elapsedSeconds = shift.elapsedSeconds + stepSeconds;
  let { targetGear } = shift;
  const positiveUpshift = targetGear > shift.fromGear && shift.fromGear > 0;
  const raceDownshift = isRace && targetGear > 0 && targetGear < shift.fromGear;
  const unloadAt = raceDownshift ? RACE_UNLOAD_SECONDS : UNLOAD_SECONDS;
  const standingLaunch = input.engineOn && input.shiftMode === "MT" && shift.fromGear === 0 && targetGear === 1
    && shift.startRpm >= vehicle.physics.referenceRpm * 0.36
    && (shift.phase === "recouple" || input.vehicleSpeed < NEUTRAL_MAX_SPEED_MPS);
  const ratioChangeAt = positiveUpshift ? UPSHIFT_RATIO_CHANGE_SECONDS
    : raceDownshift ? RACE_RATIO_CHANGE_SECONDS : RATIO_CHANGE_SECONDS;
  let targetRpm = matchedRpm(vehicle, targetGear, input.wheelAngularVelocity);
  const phase = elapsedSeconds < unloadAt ? "unload" : elapsedSeconds < ratioChangeAt ? "disengage" : "recouple";
  let { gear } = transmission;

  if (phase === "recouple" && shift.phase !== "recouple") {
    const selectsLowerGear = targetGear > 0 && (shift.fromGear === 0 || targetGear < shift.fromGear);
    if (input.shiftMode === "AT" && selectsLowerGear && !withinAutomaticRpmLimit(targetRpm, vehicle)) {
      targetGear = shift.fromGear;
      targetRpm = matchedRpm(vehicle, targetGear, input.wheelAngularVelocity);
    }
    gear = targetGear;
  }

  const downshiftEndAt = raceDownshift ? RACE_SHIFT_END_SECONDS : SHIFT_END_SECONDS;
  const recoupleDuration = positiveUpshift ? UPSHIFT_CLUTCH_ENGAGEMENT_SECONDS
    : standingLaunch ? 0.29 : downshiftEndAt - ratioChangeAt;
  const clutchScale = phase === "unload" ? 1 - smoothProgress(elapsedSeconds / unloadAt)
    : smoothProgress((elapsedSeconds - ratioChangeAt) / recoupleDuration);
  let { powerRecoveryStartedAtSeconds } = shift;
  if (positiveUpshift && phase === "recouple" && powerRecoveryStartedAtSeconds === null) {
    const synchronized = clutchScale === 1 && Math.abs(input.engineRpm - targetRpm) <= UPSHIFT_MATCH_TOLERANCE_RPM;
    if (synchronized || elapsedSeconds >= UPSHIFT_MAX_SYNC_SECONDS) powerRecoveryStartedAtSeconds = elapsedSeconds;
  }

  // Cut immediately on an upshift, then restore combustion at the new ratio once RPM has caught up.
  const upshiftRecovery = powerRecoveryStartedAtSeconds === null ? 0
    : smoothProgress((elapsedSeconds - powerRecoveryStartedAtSeconds) / UPSHIFT_POWER_RECOVERY_SECONDS);
  const recovery = positiveUpshift ? upshiftRecovery : clutchScale;
  const complete = positiveUpshift ? upshiftRecovery === 1 : elapsedSeconds >= ratioChangeAt + recoupleDuration;
  if (complete) {
    const lastShift = input.engineOn && shift.fromGear > 0 && gear > 0 && gear !== shift.fromGear
      ? { fromGear: shift.fromGear, targetGear: gear, startRpm: shift.startRpm, endRpm: input.engineRpm }
      : transmission.lastShift;
    const cooldown = input.shiftMode === "AT" && input.brake >= 0.25 && gear < shift.fromGear
      ? (isRace ? AUTO_RACE_BRAKE_COOLDOWN_SECONDS : AUTO_BRAKE_COOLDOWN_SECONDS)
      : AUTO_COOLDOWN_SECONDS;
    transmission = { ...transmission, gear, shift: null, lastShift, shiftCooldownSeconds: cooldown };
    return { transmission, clutchScale: 1, combustionScale: 1, revMatchRpm: 0 };
  }

  const combustionScale = standingLaunch ? 1 : MIN_COMBUSTION_SCALE + (1 - MIN_COMBUSTION_SCALE) * recovery;
  const revMatchRpm = input.engineOn && phase !== "unload" && targetGear > 0 && targetGear < shift.fromGear
    && (input.shiftMode === "MT" || withinAutomaticRpmLimit(targetRpm, vehicle))
    ? Math.min(targetRpm, vehicle.physics.referenceRpm * 0.97) : 0;

  transmission = { ...transmission, gear, shift: { ...shift, phase, targetGear, elapsedSeconds, targetRpm, powerRecoveryStartedAtSeconds } };
  return { transmission, clutchScale, combustionScale, revMatchRpm };
}
