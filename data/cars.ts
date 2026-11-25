import type { Vehicle } from "./vehicles.ts";
import { defineCar } from "./car-model.ts";
import { expandedRoadCars } from "./road-cars.ts";
import { supraA80 } from "./supra-a80.ts";

const poundsToKg = 0.45359237;
const poundFeetToNm = 1.3558179483;
const hpToPs = 745.6998716 / 735.49875;
const kilowattsToPs = 1000 / 735.49875;
const evenFour = [0, 180, 360, 540] as const;
const evenSix = [0, 120, 240, 360, 480, 600] as const;

export const cars: readonly Vehicle[] = [
  defineCar({
    id: "toyota-gr86", brand: "Toyota", name: "GR86", version: "2025 日規 RZ・6MT",
    engine: "FA24 水平對臥四缸", displacementCc: 2387,
    source: "https://toyota.jp/pages/contents/request/webcatalog/86/gr86_main_202507.pdf",
    cylinderDimensionsMm: [94, 86, 130.5], firingDegrees: evenFour,
    bankAngleDegrees: 180, cylinderFiringDegrees: [0, 180, 360, 540],
    exhaustFrequencyHz: 139, pulseDecayMs: 6.8,
    physics: {
      curbMassKg: 1270, gearRatios: [3.626, 2.188, 1.541, 1.213, 1, 0.767], finalDriveRatio: 4.1,
      peakTorqueNm: 250, peakTorqueRpm: 3700, peakPowerPs: 235, peakPowerRpm: 7000,
      idleRpm: 775, referenceRpm: 7400, fuelCutRpm: 7550, lowRpmTorqueRatio: 0.41,
      engineInertiaKgM2: 0.19, wheelInertiaKgM2: 4.0, rollingRadiusM: 0.306, dragAreaM2: 0.76, maxDriveAccelerationG: 0.71,
    },
  }),
  defineCar({
    id: "honda-civic-type-r", brand: "Honda", name: "Civic Type R", version: "2027 美規 FL5・6MT",
    engine: "K20C1 渦輪直列四缸", displacementCc: 1996,
    turbocharger: { maxBoostBar: 1.6, spoolStartRpm: 1500 },
    source: "https://automobiles.honda.com/civic-type-r/specs-features-trim-comparison",
    cylinderDimensionsMm: [86, 85.9, 139], firingDegrees: evenFour, cylinderFiringDegrees: [0, 540, 180, 360],
    exhaustFrequencyHz: 154, pulseDecayMs: 5.8,
    physics: {
      curbMassKg: 3188 * poundsToKg, gearRatios: [3.625, 2.115, 1.529, 1.125, 0.911, 0.734], finalDriveRatio: 3.842,
      peakTorqueNm: 310 * poundFeetToNm, peakTorqueRpm: 2600, peakTorqueEndRpm: 4000, peakPowerPs: 315 * hpToPs, peakPowerRpm: 6500,
      idleRpm: 760, referenceRpm: 7000, fuelCutRpm: 7150, lowRpmTorqueRatio: 0.29,
      engineInertiaKgM2: 0.19, wheelInertiaKgM2: 4.9, rollingRadiusM: 0.312, dragAreaM2: 0.75, maxDriveAccelerationG: 0.56,
    },
  }),
  defineCar({
    id: "toyota-gr-supra", brand: "Toyota", name: "GR Supra", version: "2025 北美 3.0・6MT",
    engine: "B58 渦輪直列六缸", displacementCc: 2998,
    turbocharger: { maxBoostBar: 1.05, spoolStartRpm: 1100 },
    source: "https://www.toyota.com/content/dam/toyota/brochures/pdf/2025/grsupra_ebrochure.pdf",
    cylinderDimensionsMm: [82, 94.6, 148], firingDegrees: evenSix, cylinderFiringDegrees: [0, 480, 240, 600, 120, 360],
    exhaustFrequencyHz: 108, pulseDecayMs: 7.8,
    physics: {
      curbMassKg: 3389 * poundsToKg, gearRatios: [4.110, 2.315, 1.542, 1.179, 1.000, 0.846], finalDriveRatio: 3.460,
      peakTorqueNm: 368 * poundFeetToNm, peakTorqueRpm: 1800, peakTorqueEndRpm: 5000, peakPowerPs: 382 * hpToPs, peakPowerRpm: 5800,
      idleRpm: 735, referenceRpm: 7000, fuelCutRpm: 7100, lowRpmTorqueRatio: 0.31,
      engineInertiaKgM2: 0.25, wheelInertiaKgM2: 5.4, rollingRadiusM: 0.329, dragAreaM2: 0.66, maxDriveAccelerationG: 0.75,
      speedLimitKmh: 249,
    },
  }),
  defineCar({
    id: "nissan-z", brand: "Nissan", name: "Z", version: "2024 澳規・6MT",
    engine: "VR30DDTT 雙渦輪 V6", displacementCc: 2997,
    turbocharger: { maxBoostBar: 1.05, spoolStartRpm: 1050, turbineCount: 2 },
    source: "https://www.nissan.com.au/content/dam/Nissan/AU/Files/Brochures/Models/Specsheet/Nissan_Z_Key-Visual_Collateral_SpecSheet_eSpec_v2.pdf",
    cylinderDimensionsMm: [86, 86, 143], firingDegrees: evenSix,
    bankAngleDegrees: 60, cylinderFiringDegrees: [0, 240, 480, 120, 360, 600], exhaustBanks: [0, 1, 0, 1, 0, 1],
    exhaustFrequencyHz: 125, pulseDecayMs: 7.2,
    physics: {
      curbMassKg: 1600, gearRatios: [3.794, 2.324, 1.624, 1.271, 1, 0.794], finalDriveRatio: 3.538,
      peakTorqueNm: 475, peakTorqueRpm: 1600, peakTorqueEndRpm: 5600, peakPowerPs: 298 * kilowattsToPs, peakPowerRpm: 6400,
      idleRpm: 740, referenceRpm: 6800, fuelCutRpm: 7000, lowRpmTorqueRatio: 0.28,
      engineInertiaKgM2: 0.23, wheelInertiaKgM2: 5.3, rollingRadiusM: 0.329, dragAreaM2: 0.77, maxDriveAccelerationG: 0.73,
    },
  }),
  defineCar({
    id: "ford-mustang-gt", brand: "Ford", name: "Mustang GT", version: "2025 美規 Fastback・6MT",
    engine: "Coyote 十字曲軸 V8", displacementCc: 5038,
    source: "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2025/specs/2025_Mustang_Technical_Specs.pdf",
    cylinderDimensionsMm: [93, 92.7, 151], firingDegrees: [0, 90, 180, 270, 360, 450, 540, 630],
    bankAngleDegrees: 90, cylinderFiringDegrees: [0, 630, 450, 180, 90, 360, 540, 270], exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0],
    exhaustFrequencyHz: 86, pulseDecayMs: 10.8,
    physics: {
      curbMassKg: 3827 * poundsToKg, gearRatios: [3.237, 2.104, 1.422, 1, 0.814, 0.622], finalDriveRatio: 3.55,
      peakTorqueNm: 415 * poundFeetToNm, peakTorqueRpm: 4900, peakPowerPs: 480 * hpToPs, peakPowerRpm: 7150,
      idleRpm: 750, referenceRpm: 7500, fuelCutRpm: 7650, lowRpmTorqueRatio: 0.48,
      engineInertiaKgM2: 0.31, wheelInertiaKgM2: 6.1, rollingRadiusM: 0.336, dragAreaM2: 0.80, maxDriveAccelerationG: 0.73,
      speedLimitKmh: 249,
    },
  }),
  defineCar({
    id: "mazda-rx8", brand: "Mazda", name: "RX-8", version: "2009 美規・6MT",
    engine: "13B RENESIS 雙轉子", displacementCc: 1308,
    source: "https://news.mazdausa.com/download/2009-RX-8-Spec.pdf",
    rotary: { rotors: 2, eccentricityM: 0.015, rotorRadiusM: 0.105, rotorWidthM: 0.080 },
    // Each rotor has one exhaust event per eccentric-shaft revolution.
    firingDegrees: evenFour, cylinderFiringDegrees: [], exhaustFrequencyHz: 204, pulseDecayMs: 5.5,
    physics: {
      curbMassKg: 3064 * poundsToKg, gearRatios: [3.815, 2.260, 1.536, 1.177, 1, 0.787], finalDriveRatio: 4.777,
      peakTorqueNm: 159 * poundFeetToNm, peakTorqueRpm: 5500, peakPowerPs: 232 * hpToPs, peakPowerRpm: 8500,
      idleRpm: 800, referenceRpm: 9000, fuelCutRpm: 9250, lowRpmTorqueRatio: 0.40,
      engineInertiaKgM2: 0.145, wheelInertiaKgM2: 4.3, rollingRadiusM: 0.322, dragAreaM2: 0.68, maxDriveAccelerationG: 0.67,
    },
  }),
  ...expandedRoadCars,
  supraA80,
];
