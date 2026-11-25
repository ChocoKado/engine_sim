import { defineCar } from "./car-model.ts";
import { leMansHypercars } from "./lemans-hypercars.ts";
import type { Vehicle } from "./vehicles.ts";

const bhpToPs = 745.6998716 / 735.49875;
const evenV8 = [0, 90, 180, 270, 360, 450, 540, 630] as const;
const evenV6 = [0, 120, 240, 360, 480, 600] as const;
const lmdhMotor = { motorPowerKw: 50, batteryCapacityKwh: 1.35 };

// BoP and homologated setups vary by event. Gear and aero coefficients,
// unpublished engine dimensions and curves, and the pit handoff are estimates.
// Cadillac, Porsche and BMW long gearing and drag are referenced to 2025 Le Mans speed traps.
export const enduranceCars: readonly Vehicle[] = [
  defineCar({
    kind: "endurance", id: "cadillac-v-series-r", brand: "Cadillac", name: "V-Series.R", version: "2023 Le Mans・LMDh",
    engine: "LMC55R 自然進氣十字曲軸 V8", displacementCc: 5500,
    source: "https://www.cadillac.com/content/cadillac/na/us/en/index/racing/imsa.html",
    cylinderDimensionsMm: [105.5, 78.65, 150], bankAngleDegrees: 90, firingDegrees: evenV8,
    exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0], exhaustFrequencyHz: 82, pulseDecayMs: 9.5, runnerImbalance: 0.28,
    physics: {
      // ACO 2023 Le Mans entry dossier: 680 PS at 8,600 RPM, 1,046 kg.
      curbMassKg: 1046, gearRatios: [3.21, 2.33, 1.83, 1.50, 1.26, 1.08, 0.903], finalDriveRatio: 3.59,
      peakTorqueNm: 630, peakTorqueRpm: 6600, peakPowerPs: 680, peakPowerRpm: 8600,
      idleRpm: 1700, referenceRpm: 8650, fuelCutRpm: 8800, lowRpmTorqueRatio: 0.38,
      engineInertiaKgM2: 0.205, wheelInertiaKgM2: 6.2, rollingRadiusM: 0.347, dragAreaM2: 0.84,
      downforceAreaM2: 2.85, maxDriveAccelerationG: 1.19, maxBrakeAccelerationG: 1.44, drivelineEfficiency: 0.93,
      electricDrive: { ...lmdhMotor, launchTorqueNm: 1820, engineStartKmh: 34 },
    },
  }),
  defineCar({
    kind: "endurance", id: "porsche-963", brand: "Porsche", name: "963", version: "2023 規格基準・LMDh",
    engine: "9RD 雙渦輪 V8", displacementCc: 4593,
    source: "https://newsroom.porsche.com/en/2023/motorsports/porsche-hypercar-gtp-prototype-963-technology-31043.html",
    // Porsche's bulletin lists 96 mm, which conflicts with 4,593 cc at 81 mm stroke.
    // The visual geometry uses a 95 mm bore consistent with its published displacement.
    cylinderDimensionsMm: [95, 81, 146], bankAngleDegrees: 90, firingDegrees: evenV8,
    exhaustBanks: [0, 1, 0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 112, pulseDecayMs: 6.6,
    turbocharger: { maxBoostBar: 0.95, spoolStartRpm: 3200, turbineCount: 2, releaseStyle: "subtle" },
    physics: {
      curbMassKg: 1030, gearRatios: [3.24, 2.32, 1.82, 1.50, 1.25, 1.07, 0.895], finalDriveRatio: 3.54,
      peakTorqueNm: 650, peakTorqueRpm: 5200, peakPowerPs: 685, peakPowerRpm: 7900,
      idleRpm: 1600, referenceRpm: 8300, fuelCutRpm: 8500, lowRpmTorqueRatio: 0.28,
      engineInertiaKgM2: 0.175, wheelInertiaKgM2: 6.1, rollingRadiusM: 0.346, dragAreaM2: 0.78,
      downforceAreaM2: 2.96, maxDriveAccelerationG: 1.18, maxBrakeAccelerationG: 1.47, drivelineEfficiency: 0.93,
      electricDrive: { ...lmdhMotor, launchTorqueNm: 1650, engineStartKmh: 32 },
    },
  }),
  defineCar({
    kind: "endurance", id: "bmw-m-hybrid-v8", brand: "BMW", name: "M Hybrid V8", version: "2023 規格基準・LMDh",
    engine: "P66/3 雙渦輪 V8", displacementCc: 3999,
    source: "https://newsroom.bmwgroup.com/global/the-heart-of-the-bmw-m-hybrid-v8-p663-eight-cylinder-hybrid-turbo-engine-drives-the-lmdh-prototype",
    cylinderDimensionsMm: [93, 73.6, 141], bankAngleDegrees: 90, firingDegrees: evenV8,
    exhaustBanks: [0, 1, 0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 127, pulseDecayMs: 5.8,
    turbocharger: { maxBoostBar: 1.20, spoolStartRpm: 2850, turbineCount: 2, releaseStyle: "subtle" },
    physics: {
      curbMassKg: 1030, gearRatios: [3.25, 2.34, 1.83, 1.52, 1.26, 1.08, 0.84], finalDriveRatio: 3.45,
      peakTorqueNm: 650, peakTorqueRpm: 5250, peakPowerPs: 640 * bhpToPs, peakPowerRpm: 7600,
      idleRpm: 1650, referenceRpm: 8100, fuelCutRpm: 8200, lowRpmTorqueRatio: 0.31,
      engineInertiaKgM2: 0.157, wheelInertiaKgM2: 6.3, rollingRadiusM: 0.343, dragAreaM2: 0.795,
      downforceAreaM2: 3.02, maxDriveAccelerationG: 1.20, maxBrakeAccelerationG: 1.45, drivelineEfficiency: 0.93,
      electricDrive: { ...lmdhMotor, launchTorqueNm: 1740, engineStartKmh: 34 },
    },
  }),
  defineCar({
    kind: "endurance", id: "acura-arx-06", brand: "Acura", name: "ARX-06", version: "2023 規格基準・IMSA GTP",
    engine: "AR24e 雙渦輪 V6", displacementCc: 2400,
    source: "https://acuranews.com/en-US/releases/acura-unveils-all-new-electrified-arx-06-race-car",
    cylinderDimensionsMm: [86, 68.86, 128], bankAngleDegrees: 90, firingDegrees: evenV6,
    exhaustBanks: [0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 155, pulseDecayMs: 4.9,
    turbocharger: { maxBoostBar: 1.52, spoolStartRpm: 4000, turbineCount: 2, releaseStyle: "subtle" },
    physics: {
      curbMassKg: 1030, gearRatios: [3.50, 2.48, 1.95, 1.60, 1.34, 1.16, 1.01], finalDriveRatio: 3.88,
      peakTorqueNm: 575, peakTorqueRpm: 7200, peakPowerPs: 685, peakPowerRpm: 9350,
      idleRpm: 1950, referenceRpm: 9850, fuelCutRpm: 10000, lowRpmTorqueRatio: 0.25,
      engineInertiaKgM2: 0.108, wheelInertiaKgM2: 6.0, rollingRadiusM: 0.346, dragAreaM2: 0.90,
      downforceAreaM2: 2.90, maxDriveAccelerationG: 1.19, maxBrakeAccelerationG: 1.45, drivelineEfficiency: 0.93,
      electricDrive: { ...lmdhMotor, launchTorqueNm: 1640, engineStartKmh: 37 },
    },
  }),
  ...leMansHypercars,
];
