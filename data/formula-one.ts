import { defineCar } from "./car-model.ts";
import type { Vehicle } from "./vehicles.ts";

const hpToPs = 745.6998716 / 735.49875;
const kwToPs = 1000 / 735.49875;

const v6 = [0, 120, 240, 360, 480, 600] as const;
const v8 = [0, 90, 180, 270, 360, 450, 540, 630] as const;
const v10 = [0, 72, 144, 216, 288, 360, 432, 504, 576, 648] as const;
const v12 = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660] as const;
const v6Banks = [0, 1, 0, 1, 0, 1] as const;
const v8Banks = [0, 1, 0, 1, 0, 1, 0, 1] as const;
const v10Banks = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1] as const;
const v12Banks = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] as const;

// Engine architecture, gear count and published specifications anchor each car. The ratios,
// effective tyre radii, aero, inertia, torque curves, pulse timing and resonance are approximations.
// Where published mass includes the driver, subtract the operator mass applied by the simulation.
export const formulaOneCars: readonly Vehicle[] = [
  defineCar({
    kind: "formula1", id: "ferrari-312t", brand: "Ferrari", name: "312 T", version: "1975 賽季",
    engine: "Tipo 015 自然進氣 180° V12", displacementCc: 2991,
    source: "https://www.ferrari.com/en-CA/formula1/312-t",
    cylinderDimensionsMm: [80, 49.6, 105], firingDegrees: v12, bankAngleDegrees: 180, exhaustBanks: v12Banks,
    exhaustFrequencyHz: 116, pulseDecayMs: 4.9,
    physics: {
      curbMassKg: 575, gearRatios: [3.18, 2.33, 1.85, 1.57, 1.36], finalDriveRatio: 3.78,
      peakTorqueNm: 318, peakTorqueRpm: 9700, peakPowerPs: 495, peakPowerRpm: 12200,
      idleRpm: 1800, referenceRpm: 12300, fuelCutRpm: 12600, lowRpmTorqueRatio: 0.39,
      engineInertiaKgM2: 0.112, wheelInertiaKgM2: 5.2, rollingRadiusM: 0.330, dragAreaM2: 1.01,
      downforceAreaM2: 1.52, maxDriveAccelerationG: 1.12, maxBrakeAccelerationG: 1.26, drivelineEfficiency: 0.90,
    },
  }),
  defineCar({
    kind: "formula1", id: "mclaren-mp4-4", brand: "McLaren", name: "MP4/4", version: "1988 賽季",
    engine: "Honda RA168E 80° 雙渦輪 V6", displacementCc: 1494,
    source: "https://global.honda/en/F1/machine/1988_McLarenHondaMP44/",
    turbocharger: { maxBoostBar: 1.5, spoolStartRpm: 5200, turbineCount: 2, releaseStyle: "external" },
    // The original Honda R&D Technical Review reports 685 PS (504 kW) in the maximum-power setup.
    // https://www.jstage.jst.go.jp/article/hondatechnicalreview/1/0/1_1989_1_1/_pdf/-char/en
    cylinderDimensionsMm: [79, 50.8, 105], firingDegrees: v6, bankAngleDegrees: 80, exhaustBanks: v6Banks,
    exhaustFrequencyHz: 128, pulseDecayMs: 6.0,
    physics: {
      curbMassKg: 540, gearRatios: [3.60, 2.63, 2.08, 1.72, 1.45, 1.27], finalDriveRatio: 3.70,
      peakTorqueNm: 445, peakTorqueRpm: 10000, peakPowerPs: 685, peakPowerRpm: 12100,
      idleRpm: 2300, referenceRpm: 12300, fuelCutRpm: 12300, lowRpmTorqueRatio: 0.19,
      engineInertiaKgM2: 0.083, wheelInertiaKgM2: 5.8, rollingRadiusM: 0.328, dragAreaM2: 1.06,
      downforceAreaM2: 2.52, maxDriveAccelerationG: 1.22, maxBrakeAccelerationG: 1.42, drivelineEfficiency: 0.91,
    },
  }),
  defineCar({
    kind: "formula1", id: "mclaren-mp4-6", brand: "McLaren", name: "MP4/6", version: "1991 賽季",
    engine: "Honda RA121E 自然進氣 60° V12", displacementCc: 3497,
    source: "https://global.honda/en/F1/machine/1991_McLarenHondaMP46/",
    cylinderDimensionsMm: [86.5, 49.6, 108], firingDegrees: v12, bankAngleDegrees: 60, exhaustBanks: v12Banks,
    exhaustFrequencyHz: 146, pulseDecayMs: 4.4,
    physics: {
      curbMassKg: 505, gearRatios: [3.72, 2.74, 2.18, 1.83, 1.58, 1.40], finalDriveRatio: 3.68,
      peakTorqueNm: 414, peakTorqueRpm: 11500, peakPowerPs: 735, peakPowerRpm: 13500,
      idleRpm: 2400, referenceRpm: 13800, fuelCutRpm: 14000, lowRpmTorqueRatio: 0.31,
      engineInertiaKgM2: 0.107, wheelInertiaKgM2: 5.7, rollingRadiusM: 0.330, dragAreaM2: 1.19,
      downforceAreaM2: 2.68, maxDriveAccelerationG: 1.24, maxBrakeAccelerationG: 1.46, drivelineEfficiency: 0.91,
    },
  }),
  defineCar({
    kind: "formula1", id: "williams-fw14b", brand: "Williams", name: "FW14B", version: "1992 賽季",
    engine: "Renault RS3／RS4 自然進氣 67° V10", displacementCc: 3498,
    source: "https://www.williamsf1.com/articles/22794892-7962-4c82-b00b-90aac32870b8/nigel-mansell-and-the-fw14b-an-iconic-duo",
    // The Bonhams FW14-08 listing cites Renault's range for the season, up to 760 bhp at 14,500 rpm.
    cylinderDimensionsMm: [93, 51.5, 109], firingDegrees: v10, bankAngleDegrees: 67, exhaustBanks: v10Banks,
    exhaustFrequencyHz: 165, pulseDecayMs: 4.2,
    physics: {
      curbMassKg: 505, gearRatios: [3.68, 2.76, 2.20, 1.84, 1.59, 1.42], finalDriveRatio: 3.97,
      peakTorqueNm: 417, peakTorqueRpm: 12500, peakPowerPs: 760 * hpToPs, peakPowerRpm: 14500,
      idleRpm: 2600, referenceRpm: 14600, fuelCutRpm: 15000, lowRpmTorqueRatio: 0.30,
      engineInertiaKgM2: 0.094, wheelInertiaKgM2: 5.8, rollingRadiusM: 0.331, dragAreaM2: 1.17,
      downforceAreaM2: 3.05, maxDriveAccelerationG: 1.27, maxBrakeAccelerationG: 1.49, drivelineEfficiency: 0.92,
    },
  }),
  defineCar({
    kind: "formula1", id: "ferrari-f2004", brand: "Ferrari", name: "F2004", version: "2004 賽季",
    engine: "Tipo 053 自然進氣 90° V10", displacementCc: 2997,
    source: "https://www.ferrari.com/en-EN/formula1/f2004",
    // 636 kW at 18,300 rpm is a museum exhibit figure for a representative race tune.
    cylinderDimensionsMm: [98, 39.73, 102], firingDegrees: v10, bankAngleDegrees: 90, exhaustBanks: v10Banks,
    exhaustFrequencyHz: 212, pulseDecayMs: 3.4,
    physics: {
      curbMassKg: 605, gearRatios: [4.19, 3.16, 2.54, 2.13, 1.83, 1.62, 1.48], finalDriveRatio: 4.37,
      peakTorqueNm: 365, peakTorqueRpm: 15300, peakPowerPs: 636 * kwToPs, peakPowerRpm: 18300,
      idleRpm: 3200, referenceRpm: 18700, fuelCutRpm: 19000, lowRpmTorqueRatio: 0.25,
      engineInertiaKgM2: 0.070, wheelInertiaKgM2: 5.9, rollingRadiusM: 0.327, dragAreaM2: 1.12,
      downforceAreaM2: 3.68, maxDriveAccelerationG: 1.32, maxBrakeAccelerationG: 1.58, drivelineEfficiency: 0.92,
    },
  }),
  defineCar({
    kind: "formula1", id: "brawn-bgp001", brand: "Brawn GP", name: "BGP 001", version: "2009 賽季",
    engine: "Mercedes-Benz FO108W 自然進氣 90° V8", displacementCc: 2398,
    source: "https://images2.bonhams.com/original?src=Images%2Flive%2F2025-04%2F14%2FS-30996-0-1.pdf",
    cylinderDimensionsMm: [98, 39.74, 101], firingDegrees: v8, bankAngleDegrees: 90, exhaustBanks: v8Banks,
    exhaustFrequencyHz: 188, pulseDecayMs: 4.0,
    physics: {
      curbMassKg: 605, gearRatios: [4.06, 3.12, 2.52, 2.11, 1.81, 1.60, 1.44], finalDriveRatio: 4.42,
      peakTorqueNm: 335, peakTorqueRpm: 14900, peakPowerPs: 750 * hpToPs, peakPowerRpm: 18000,
      idleRpm: 3400, referenceRpm: 18000, fuelCutRpm: 18000, lowRpmTorqueRatio: 0.24,
      engineInertiaKgM2: 0.063, wheelInertiaKgM2: 6.1, rollingRadiusM: 0.329, dragAreaM2: 1.13,
      downforceAreaM2: 3.54, maxDriveAccelerationG: 1.28, maxBrakeAccelerationG: 1.53, drivelineEfficiency: 0.92,
    },
  }),
  defineCar({
    kind: "formula1", id: "mercedes-w11", brand: "Mercedes-AMG", name: "F1 W11", version: "2020 EQ Performance",
    engine: "M11 90° 單渦輪 V6 油電", displacementCc: 1600,
    source: "https://media.mercedes-benz.com/en/article/95002cb8-fdee-4190-82fb-c2b00feaf8db",
    turbocharger: { maxBoostBar: 2.35, spoolStartRpm: 5200, releaseStyle: "subtle" },
    cylinderDimensionsMm: [80, 53.05, 107], firingDegrees: v6, bankAngleDegrees: 90, exhaustBanks: v6Banks,
    exhaustFrequencyHz: 166, pulseDecayMs: 5.7,
    physics: {
      curbMassKg: 671, gearRatios: [3.20, 2.46, 2.02, 1.71, 1.47, 1.29, 1.15, 1.03], finalDriveRatio: 4.30,
      // Combustion output and operating range are model estimates. The motor output is separate.
      peakTorqueNm: 500, peakTorqueRpm: 9300, peakPowerPs: 545 * kwToPs, peakPowerRpm: 11800,
      idleRpm: 3600, referenceRpm: 12500, fuelCutRpm: 13200, lowRpmTorqueRatio: 0.24,
      engineInertiaKgM2: 0.082, wheelInertiaKgM2: 6.4, rollingRadiusM: 0.330, dragAreaM2: 1.15,
      downforceAreaM2: 4.25, maxDriveAccelerationG: 1.36, maxBrakeAccelerationG: 1.60, drivelineEfficiency: 0.93,
      hybridAssist: { peakPowerKw: 120, capacityKj: 4000, regenPowerKw: 120 },
    },
  }),
  defineCar({
    kind: "formula1", id: "red-bull-rb19", brand: "Red Bull Racing", name: "RB19", version: "2023 賽季",
    engine: "Honda RBPTH001 90° 單渦輪 V6 油電", displacementCc: 1600,
    source: "https://global.honda/en/F1/machine/2023_RedBullRB19/",
    turbocharger: { maxBoostBar: 2.4, spoolStartRpm: 5200, releaseStyle: "subtle" },
    cylinderDimensionsMm: [80, 53.05, 107], firingDegrees: v6, bankAngleDegrees: 90, exhaustBanks: v6Banks,
    exhaustFrequencyHz: 146, pulseDecayMs: 6.0,
    physics: {
      curbMassKg: 723, gearRatios: [3.31, 2.54, 2.09, 1.76, 1.51, 1.33, 1.18, 1.06], finalDriveRatio: 4.36,
      // The FIA estimates 550–560 kW combustion output for this generation of power units.
      peakTorqueNm: 490, peakTorqueRpm: 9700, peakPowerPs: 555 * kwToPs, peakPowerRpm: 12100,
      idleRpm: 3650, referenceRpm: 12800, fuelCutRpm: 13500, lowRpmTorqueRatio: 0.25,
      engineInertiaKgM2: 0.086, wheelInertiaKgM2: 7.8, rollingRadiusM: 0.352, dragAreaM2: 1.09,
      downforceAreaM2: 4.12, maxDriveAccelerationG: 1.34, maxBrakeAccelerationG: 1.57, drivelineEfficiency: 0.93,
      hybridAssist: { peakPowerKw: 120, capacityKj: 4000, regenPowerKw: 120 },
    },
  }),
  defineCar({
    kind: "formula1", id: "ferrari-sf-26", brand: "Ferrari", name: "SF-26", version: "2026 賽季",
    engine: "067/6 90° 單渦輪 V6 油電", displacementCc: 1600,
    source: "https://www.ansa.it/documents/1769167532298_SF26.pdf",
    turbocharger: { maxBoostBar: 2.2, spoolStartRpm: 6100, releaseStyle: "subtle" },
    cylinderDimensionsMm: [80, 53, 106], firingDegrees: v6, bankAngleDegrees: 90, exhaustBanks: v6Banks,
    exhaustFrequencyHz: 156, pulseDecayMs: 5.2,
    physics: {
      curbMassKg: 695, gearRatios: [3.03, 2.34, 1.92, 1.63, 1.41, 1.24, 1.10, 0.99], finalDriveRatio: 4.38,
      // 400 kW is the FIA's approximate 2026 combustion target, separate from the 350 kW MGU-K.
      peakTorqueNm: 372, peakTorqueRpm: 9800, peakPowerPs: 400 * kwToPs, peakPowerRpm: 11500,
      idleRpm: 3400, referenceRpm: 12200, fuelCutRpm: 13000, lowRpmTorqueRatio: 0.26,
      engineInertiaKgM2: 0.079, wheelInertiaKgM2: 7.2, rollingRadiusM: 0.346, dragAreaM2: 0.94,
      downforceAreaM2: 3.36, maxDriveAccelerationG: 1.32, maxBrakeAccelerationG: 1.53, drivelineEfficiency: 0.93,
      // Usable state-of-charge window. Road-speed taper approximates deployment without track zones.
      hybridAssist: { peakPowerKw: 350, capacityKj: 4000, regenPowerKw: 350, taperStartKmh: 290, taperEndKmh: 345 },
    },
  }),
];
