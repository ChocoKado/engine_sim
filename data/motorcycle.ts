import type { Vehicle } from "./vehicles.ts";

export const singleFiring = [0] as const;
export const twin180Firing = [0, 180] as const;
export const twin270Firing = [0, 270] as const;
export const inlineFourFiring = [0, 180, 360, 540] as const;

export function defineTrim(base: Vehicle, trim: Pick<Vehicle, "id" | "name" | "version" | "source"> & {
  curbMassKg: number;
  rollingRadiusM?: number;
}): Vehicle {
  const { curbMassKg, rollingRadiusM = base.physics.rollingRadiusM, ...model } = trim;
  return { ...base, ...model, physics: { ...base.physics, curbMassKg, rollingRadiusM } };
}

export interface MotorcycleSpec {
  readonly id: string;
  readonly brand: Vehicle["brand"];
  readonly name: string;
  readonly version: string;
  readonly engine: string;
  readonly source: string;
  readonly displacementCc: number;
  readonly boreMm: number;
  readonly strokeMm: number;
  readonly firingDegrees: readonly number[];
  readonly cylinderFiringDegrees?: readonly number[];
  readonly bankAngleDegrees?: number;
  readonly hasVva?: boolean;
  readonly curbMassKg: number;
  readonly gearRatios: readonly number[];
  readonly primaryRatio: number;
  readonly finalDriveRatio: number;
  readonly peakTorqueNm: number;
  readonly peakTorqueRpm: number;
  readonly peakPowerPs: number;
  readonly peakPowerRpm: number;
  readonly idleRpm?: number;
  readonly referenceRpm: number;
  readonly fuelCutRpm: number;
  readonly gearFuelCutRpm?: Vehicle["physics"]["gearFuelCutRpm"];
  readonly rollingRadiusM: number;
  readonly dragAreaM2?: number;
  readonly speedLimitKmh?: number;
  readonly exhaustFrequencyHz: number;
}

// These presets combine versioned specifications with C/D-grade dynamics and original synthesis.
export function defineMotorcycle(spec: MotorcycleSpec): Vehicle {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const cylinders = spec.firingDegrees.length;
  const displacement = spec.displacementCc;
  const strokeM = spec.strokeMm / 1000;
  const boreM = spec.boreMm / 1000;
  const torque = spec.peakTorqueNm;
  const body = Math.min(1, displacement / 1150);
  const firingOrder = spec.cylinderFiringDegrees ?? (cylinders === 4 && !spec.bankAngleDegrees
    ? [0, 180, 540, 360] : spec.firingDegrees);

  return {
    id: spec.id,
    brand: spec.brand,
    name: spec.name,
    version: spec.version,
    displacementCc: displacement,
    engine: spec.engine,
    gears: spec.gearRatios.length,
    source: spec.source,
    geometry: {
      boreM,
      strokeM,
      rodLengthM: strokeM * 1.95,
      cylinderSpacingM: boreM + 0.013,
      intakeLiftM: Math.min(0.012, boreM * 0.105),
      exhaustLiftM: Math.min(0.011, boreM * 0.097),
      bankAngleRad: spec.bankAngleDegrees ? radians(spec.bankAngleDegrees) : undefined,
      vva: spec.hasVva ? { switchRpm: null, highIntakeLiftM: Math.min(0.014, boreM * 0.13) } : undefined,
      cylinderFiringAnglesRad: firingOrder.map(radians),
    },
    audio: {
      firingAnglesRad: spec.firingDegrees.map(radians),
      exhaustFrequencyHz: spec.exhaustFrequencyHz,
      pulseDecayMs: 5.8 + 5 * body + (cylinders < 3 ? 2.5 : 0),
      exhaustReflectionMs: 520 / spec.exhaustFrequencyHz,
      exhaustBody: {
        frequencyHz: Math.round(spec.exhaustFrequencyHz * 1.2),
        decayMs: 8.8 + 5 * body,
        gain: 0.70 + 0.22 * body,
        runnerImbalance: cylinders > 1 ? 0.11 + 0.08 * body : 0,
      },
      brightnessStartRpm: spec.referenceRpm * 0.48,
      brightnessMaxRpm: spec.peakPowerRpm,
    },
    physics: {
      curbMassKg: spec.curbMassKg,
      gearRatios: spec.gearRatios,
      primaryRatio: spec.primaryRatio,
      finalDriveRatio: spec.finalDriveRatio,
      lowRpmTorqueRatio: cylinders >= 4 ? 0.32 + 0.1 * body : 0.42,
      peakTorqueNm: torque,
      peakTorqueRpm: spec.peakTorqueRpm,
      peakPowerPs: spec.peakPowerPs,
      peakPowerRpm: spec.peakPowerRpm,
      idleRpm: spec.idleRpm ?? (displacement <= 300 ? 1500 : 1250),
      referenceRpm: spec.referenceRpm,
      fuelCutRpm: spec.fuelCutRpm,
      gearFuelCutRpm: spec.gearFuelCutRpm,
      speedLimitKmh: spec.speedLimitKmh,
      engineInertiaKgM2: (cylinders === 1 ? 0.006 : 0.008) + displacement * 0.000055,
      wheelInertiaKgM2: 1.07 + Math.min(1, displacement / 1350),
      rollingRadiusM: spec.rollingRadiusM,
      dragAreaM2: spec.dragAreaM2 ?? 0.38,
      frictionNm: 0.55 + displacement * 0.0024,
      frictionNmPerRadPerSecond: 0.0012 + displacement * 0.0000036,
      pumpingNmPerRadPerSecond: 0.0024 + displacement * 0.0000049,
      clutchCapacityNm: torque * 1.65 + 4,
      slipperCapacityNm: torque * 0.83 + 2,
      clutchDampingNmPerRadPerSecond: 0.31 + torque * 0.011,
    },
  };
}
