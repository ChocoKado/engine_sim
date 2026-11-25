import type { Vehicle } from "../data/vehicles";
import { FIXED_STEP_SECONDS, rpmFromRadiansPerSecond, stepSimulation } from "./simulation.ts";
import type { SimulationInput, SimulationState } from "./simulation.ts";
import { enqueueShift } from "./transmission.ts";
import type { ShiftDirection, ShiftMode } from "./transmission.ts";

export const MAX_RECORDING_SECONDS = 60;
export const MAX_RECORDED_TICKS = Math.round(MAX_RECORDING_SECONDS / FIXED_STEP_SECONDS);
const SAMPLE_STRIDE_TICKS = 3;

export interface RecordedTick {
  readonly input: SimulationInput;
  readonly shifts: readonly ShiftDirection[];
}

export interface TelemetrySample {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly throttle: number;
  readonly brake: number;
  readonly gear: number;
  readonly shiftMode: ShiftMode;
  readonly rpm: number;
  readonly speedKmh: number;
}

export interface TelemetryRun {
  readonly version: 1;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly vehicleVersion: string;
  readonly stepSeconds: number;
  readonly durationSeconds: number;
  readonly initialState: SimulationState;
  readonly ticks: readonly RecordedTick[];
  readonly samples: readonly TelemetrySample[];
}

function toSample(tick: number, state: SimulationState): TelemetrySample {
  return {
    tick,
    timeSeconds: Number((tick * FIXED_STEP_SECONDS).toFixed(4)),
    throttle: Number(state.throttle.toFixed(3)),
    brake: Number(state.brake.toFixed(3)),
    gear: state.gear,
    shiftMode: state.shiftMode,
    rpm: Number(rpmFromRadiansPerSecond(state.engineAngularVelocity).toFixed(1)),
    speedKmh: Number((state.vehicleSpeed * 3.6).toFixed(2)),
  };
}

export class TelemetryRecorder {
  private initialState: SimulationState | null = null;
  private vehicle: Vehicle | null = null;
  private ticks: RecordedTick[] = [];
  private samples: TelemetrySample[] = [];
  private pendingShifts: ShiftDirection[] = [];
  private previousGear = 0;
  private active = false;

  get isRecording(): boolean {
    return this.active;
  }

  get recordedTicks(): number {
    return this.ticks.length;
  }

  start(vehicle: Vehicle, initialState: SimulationState): void {
    this.vehicle = vehicle;
    this.initialState = initialState;
    this.ticks = [];
    this.samples = [toSample(0, initialState)];
    this.pendingShifts = [];
    this.previousGear = initialState.gear;
    this.active = true;
  }

  recordShift(direction: ShiftDirection): void {
    if (this.active && this.pendingShifts.length < 4) {
      this.pendingShifts.push(direction);
    }
  }

  recordStep(input: SimulationInput, nextState: SimulationState): boolean {
    if (!this.active) return false;
    const shifts = this.pendingShifts.length ? [...this.pendingShifts] : [];
    this.pendingShifts = [];
    this.ticks.push({ input: { ...input }, shifts });
    const tick = this.ticks.length;
    if (tick % SAMPLE_STRIDE_TICKS === 0 || nextState.gear !== this.previousGear || tick >= MAX_RECORDED_TICKS) {
      this.samples.push(toSample(tick, nextState));
    }
    this.previousGear = nextState.gear;
    if (tick >= MAX_RECORDED_TICKS) {
      this.active = false;
      return false;
    }
    return true;
  }

  stop(finalState?: SimulationState): TelemetryRun | null {
    if (!this.initialState || !this.vehicle || this.ticks.length === 0) {
      this.cancel();
      return null;
    }
    this.active = false;
    const totalTicks = this.ticks.length;
    if (finalState && this.samples.at(-1)?.tick !== totalTicks) {
      this.samples.push(toSample(totalTicks, finalState));
    }
    const run: TelemetryRun = {
      version: 1,
      vehicleId: this.vehicle.id,
      vehicleName: this.vehicle.name,
      vehicleVersion: this.vehicle.version,
      stepSeconds: FIXED_STEP_SECONDS,
      durationSeconds: Number((totalTicks * FIXED_STEP_SECONDS).toFixed(3)),
      initialState: this.initialState,
      ticks: this.ticks,
      samples: this.samples,
    };
    this.initialState = null;
    this.vehicle = null;
    this.ticks = [];
    this.samples = [];
    this.pendingShifts = [];
    return run;
  }

  cancel(): void {
    this.active = false;
    this.initialState = null;
    this.vehicle = null;
    this.ticks = [];
    this.samples = [];
    this.pendingShifts = [];
  }
}

export function stepReplayTick(state: SimulationState, recorded: RecordedTick, vehicle: Vehicle): SimulationState {
  let working = state;
  for (const direction of recorded.shifts) {
    working = enqueueShift(working, direction);
  }
  return stepSimulation(working, recorded.input, vehicle);
}

export function simulateReplayRun(run: TelemetryRun, vehicle: Vehicle): SimulationState[] {
  const states: SimulationState[] = [];
  let state = run.initialState;
  for (const tick of run.ticks) {
    state = stepReplayTick(state, tick, vehicle);
    states.push(state);
  }
  return states;
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatTelemetryCsv(run: TelemetryRun): string {
  const header = "vehicle_id,version,time_s,throttle,brake,gear,shift_mode,rpm,speed_kmh";
  const rows = run.samples.map((sample) => [
    run.vehicleId,
    run.vehicleVersion,
    sample.timeSeconds.toFixed(4),
    sample.throttle.toFixed(3),
    sample.brake.toFixed(3),
    sample.gear === 0 ? "N" : sample.gear,
    sample.shiftMode,
    sample.rpm.toFixed(1),
    sample.speedKmh.toFixed(2),
  ].map(escapeCsv).join(","));
  return [header, ...rows].join("\n");
}

export function formatTelemetryJson(run: TelemetryRun): string {
  return JSON.stringify({
    version: run.version,
    vehicleId: run.vehicleId,
    vehicleName: run.vehicleName,
    vehicleVersion: run.vehicleVersion,
    stepSeconds: run.stepSeconds,
    durationSeconds: run.durationSeconds,
    samples: run.samples,
  }, null, 2);
}
