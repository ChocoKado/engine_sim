import type { TransmissionType, Vehicle } from "../data/vehicles";

export type ShiftMode = "MT" | "AT";
export type ShiftDirection = -1 | 1;
export type ShiftPhase = "unload" | "disengage" | "recouple";

export function resolveTransmissionType(vehicle: Vehicle): TransmissionType {
  if (vehicle.transmissionType) return vehicle.transmissionType;
  const ver = vehicle.version;
  if (ver.includes("DCT") || vehicle.id === "kawasaki-ninja7-hybrid") return "dct";
  if (ver.includes("ASG")) return "asg";
  if (vehicle.kind === "formula1") {
    return vehicle.id === "ferrari-312t" || vehicle.id === "mclaren-mp4-4" || vehicle.id === "mclaren-mp4-6"
      ? "manual" : "seamless";
  }
  if (vehicle.kind === "endurance") {
    return vehicle.id === "mazda-787b" ? "manual" : "seamless";
  }
  if (vehicle.kind === "car") return "manual";
  // Motorcycles: modern sportbikes & flagships use electronic quickshifter; classics/small bikes use manual clutch.
  if (vehicle.twoStroke || ver.includes("198") || ver.includes("199") || ver.includes("’8") || ver.includes("’9") || ver.includes("’00") || ver.includes("’05")
    || (vehicle.displacementCc <= 350 && !vehicle.id.includes("zx25") && !vehicle.id.includes("r15m"))) {
    return "manual";
  }
  return "quickshifter";
}

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  manual: "傳統手排",
  quickshifter: "電控快排 QS",
  dct: "雙離合 DCT",
  asg: "單離合序列 ASG",
  seamless: "賽車序列無縫",
};

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
  const txType = resolveTransmissionType(vehicle);
  const isCarLike = Boolean(vehicle.kind);
  const positiveUpshift = targetGear > shift.fromGear && shift.fromGear > 0;
  const raceDownshift = (isRace || txType === "dct" || txType === "seamless") && targetGear > 0 && targetGear < shift.fromGear;

  let unloadAt = raceDownshift ? RACE_UNLOAD_SECONDS : UNLOAD_SECONDS;
  let upshiftRatioAt = UPSHIFT_RATIO_CHANGE_SECONDS;
  let upshiftEngageSeconds = UPSHIFT_CLUTCH_ENGAGEMENT_SECONDS;
  let upshiftRecoverySeconds = UPSHIFT_POWER_RECOVERY_SECONDS;

  if (isCarLike) {
    if (txType === "dct") {
      unloadAt = positiveUpshift ? 0.008 : 0.012;
      upshiftRatioAt = 0.028;
      upshiftEngageSeconds = 0.016;
      upshiftRecoverySeconds = 0.012;
    } else if (txType === "seamless") {
      unloadAt = positiveUpshift ? 0.006 : RACE_UNLOAD_SECONDS;
      upshiftRatioAt = 0.022;
      upshiftEngageSeconds = 0.014;
      upshiftRecoverySeconds = 0.010;
    } else if (txType === "asg") {
      // Single-clutch automated sequential (e.g. Lexus LFA): pronounced torque gap followed by fierce slam engagement.
      unloadAt = positiveUpshift ? 0.020 : 0.022;
      upshiftRatioAt = 0.105;
      upshiftEngageSeconds = 0.018;
      upshiftRecoverySeconds = 0.014;
    } else {
      // Classic H-pattern foot-clutch manual car.
      unloadAt = positiveUpshift ? 0.036 : 0.034;
      upshiftRatioAt = 0.132;
      upshiftEngageSeconds = 0.052;
      upshiftRecoverySeconds = 0.042;
    }
  } else if (txType === "manual") {
    // Cable-clutch manual motorcycle: slightly longer hand-clutch throw while keeping >=7 disengage ticks.
    unloadAt = 0.025;
    upshiftRatioAt = 0.092;
    upshiftEngageSeconds = 0.034;
    upshiftRecoverySeconds = 0.028;
  }

  const standingLaunch = input.engineOn && input.shiftMode === "MT" && shift.fromGear === 0 && targetGear === 1
    && shift.startRpm >= vehicle.physics.referenceRpm * 0.36
    && (shift.phase === "recouple" || input.vehicleSpeed < NEUTRAL_MAX_SPEED_MPS);
  const ratioChangeAt = positiveUpshift ? upshiftRatioAt
    : raceDownshift ? RACE_RATIO_CHANGE_SECONDS : (isCarLike && txType === "manual" ? 0.115 : RATIO_CHANGE_SECONDS);
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

  const downshiftEndAt = raceDownshift ? RACE_SHIFT_END_SECONDS : (isCarLike && txType === "manual" ? 0.24 : SHIFT_END_SECONDS);
  const recoupleDuration = positiveUpshift ? upshiftEngageSeconds
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
    : smoothProgress((elapsedSeconds - powerRecoveryStartedAtSeconds) / upshiftRecoverySeconds);
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
