import { defineCar } from "./car-model.ts";

export const supraA80 = defineCar({
  id: "toyota-supra-a80", brand: "Toyota", name: "Supra A80", version: "1993 日規 RZ・6MT",
  engine: "2JZ-GTE 序列式雙渦輪直列六缸", displacementCc: 2997,
  source: "https://toyota.jp/ucar/catalog/brand-TOYOTA/car-SUPRA/199305/1000910/",
  cylinderDimensionsMm: [86, 86, 142],
  firingDegrees: [0, 120, 240, 360, 480, 600], cylinderFiringDegrees: [0, 480, 240, 600, 120, 360],
  exhaustFrequencyHz: 94, pulseDecayMs: 9.1, runnerImbalance: 0.18,
  // The two-step hardware is represented by a single estimated boost curve.
  turbocharger: { maxBoostBar: 0.7, spoolStartRpm: 1750, turbineCount: 2 },
  physics: {
    curbMassKg: 1490, gearRatios: [3.827, 2.360, 1.685, 1.312, 1, 0.793], finalDriveRatio: 3.266,
    peakTorqueNm: 431.5, peakTorqueRpm: 3600, peakPowerPs: 280, peakPowerRpm: 5600,
    idleRpm: 700, referenceRpm: 6800, fuelCutRpm: 7000, lowRpmTorqueRatio: 0.32,
    engineInertiaKgM2: 0.285, wheelInertiaKgM2: 5.2, rollingRadiusM: 0.322, dragAreaM2: 0.65,
    maxDriveAccelerationG: 0.69, speedLimitKmh: 180,
  },
});
