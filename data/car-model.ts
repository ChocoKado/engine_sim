import type { Vehicle } from "./vehicles.ts";

const radians = (degrees: number) => degrees * Math.PI / 180;

type PublishedAndCalibratedPhysics = Omit<Vehicle["physics"],
  "primaryRatio" | "frictionNm" | "frictionNmPerRadPerSecond" | "pumpingNmPerRadPerSecond" |
  "clutchCapacityNm" | "slipperCapacityNm" | "clutchDampingNmPerRadPerSecond">;

export interface CarSpec extends Pick<Vehicle, "id" | "brand" | "name" | "version" | "source" | "engine" | "displacementCc"> {
  readonly kind?: Vehicle["kind"];
  readonly turbocharger?: Vehicle["turbocharger"];
  readonly cylinderDimensionsMm?: readonly [bore: number, stroke: number, rodLength: number];
  readonly cylinderFiringDegrees?: readonly number[];
  readonly firingDegrees: readonly number[];
  readonly bankAngleDegrees?: number;
  readonly exhaustBanks?: readonly number[];
  readonly rotary?: Vehicle["geometry"]["rotary"];
  readonly exhaustFrequencyHz: number;
  readonly pulseDecayMs: number;
  readonly runnerImbalance?: number;
  readonly physics: PublishedAndCalibratedPhysics;
}

// Each preset uses published anchors; geometry beyond bore/stroke, loss, sound and grip are approximations.
export function defineCar(spec: CarSpec): Vehicle {
  const { id, brand, name, version, source, engine, displacementCc, physics } = spec;
  const [boreMm, strokeMm, rodMm] = spec.cylinderDimensionsMm ?? [0, 0, 0];
  const { exhaustFrequencyHz, pulseDecayMs, exhaustBanks } = spec;
  const cylinderFiringDegrees = spec.cylinderFiringDegrees ?? (exhaustBanks
    ? [0, 1].flatMap((bank) => spec.firingDegrees.filter((_, index) => exhaustBanks[index] === bank))
    : spec.firingDegrees);
  const boreM = boreMm / 1000;
  const torque = physics.peakTorqueNm;
  return {
    id, brand, name, version, source, engine, displacementCc,
    kind: spec.kind ?? "car",
    turbocharger: spec.turbocharger,
    gears: physics.gearRatios.length,
    geometry: {
      boreM,
      strokeM: strokeMm / 1000,
      rodLengthM: rodMm / 1000,
      cylinderSpacingM: boreM + 0.012,
      intakeLiftM: boreM * 0.12,
      exhaustLiftM: boreM * 0.10,
      cylinderFiringAnglesRad: cylinderFiringDegrees.map(radians),
      bankAngleRad: spec.bankAngleDegrees === undefined ? undefined : radians(spec.bankAngleDegrees),
      rotary: spec.rotary,
    },
    audio: {
      firingAnglesRad: spec.firingDegrees.map(radians),
      exhaustBanks,
      exhaustFrequencyHz,
      pulseDecayMs,
      exhaustReflectionMs: 610 / exhaustFrequencyHz,
      exhaustBody: {
        frequencyHz: Math.round(exhaustFrequencyHz * 1.28),
        decayMs: pulseDecayMs * 1.35,
        gain: 0.86,
        runnerImbalance: spec.runnerImbalance ?? (spec.rotary ? 0 : 0.13),
      },
      brightnessStartRpm: physics.referenceRpm * 0.42,
      brightnessMaxRpm: physics.peakPowerRpm,
    },
    physics: {
      ...physics,
      primaryRatio: 1,
      drivelineEfficiency: physics.drivelineEfficiency ?? (spec.kind === "formula1" ? 0.95 : brand === "Honda" ? 0.92 : 0.88),
      frictionNm: 1.8 + displacementCc * 0.0017,
      frictionNmPerRadPerSecond: 0.006 + displacementCc * 0.0000024,
      pumpingNmPerRadPerSecond: 0.016 + displacementCc * 0.000007,
      clutchCapacityNm: torque * 1.55,
      slipperCapacityNm: torque * 1.20,
      clutchDampingNmPerRadPerSecond: 1.1 + torque * 0.012,
    },
  };
}
