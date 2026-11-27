import { kawasakiVehicles } from "./kawasaki.ts";
import { defineMotorcycle, defineTrim, inlineFourFiring, singleFiring, twin180Firing } from "./motorcycle.ts";

const ninjaCloseGears = [41 / 14, 37 / 18, 34 / 21, 32 / 24, 30 / 26, 28 / 27];
const [zx25r] = kawasakiVehicles;
const zx25rr = defineTrim(zx25r, {
  id: "kawasaki-zx25rr", name: "ZX-25RR", version: "2026 日規",
  source: "https://www.kawasaki-motors.com/ja-jp/motorcycle/ninja/supersport/ninja-zx-25r/2026-ninja-zx-25rr", curbMassKg: 184,
});

export const moreYamahaVehicles = [
  defineMotorcycle({
    id: "yamaha-r125", brand: "Yamaha", name: "YZF-R125", version: "2026 歐規", engine: "單缸・VVA",
    source: "https://www.yamaha-motor.eu/gb/en/motorcycles/supersport/pdp/r125/",
    displacementCc: 125, boreMm: 52, strokeMm: 58.7, firingDegrees: singleFiring, curbMassKg: 141, hasVva: true,
    gearRatios: [2.833, 1.875, 1.364, 1.143, 0.957, 0.840], primaryRatio: 3.042, finalDriveRatio: 3.429,
    peakTorqueNm: 11.5, peakTorqueRpm: 8000, peakPowerPs: 15, peakPowerRpm: 10000,
    referenceRpm: 10900, fuelCutRpm: 11400, rollingRadiusM: 0.293, dragAreaM2: 0.355, exhaustFrequencyHz: 174,
  }),
  defineMotorcycle({
    id: "yamaha-r25", brand: "Yamaha", name: "YZF-R25", version: "2026 日規", engine: "180° 並列雙缸",
    source: "https://www.yamaha-motor.co.jp/mc/spec-data/secret/yzf-r25-2026.html",
    displacementCc: 249, boreMm: 60, strokeMm: 44.1, firingDegrees: twin180Firing, curbMassKg: 169,
    gearRatios: [2.666, 1.882, 1.454, 1.200, 1.037, 0.920], primaryRatio: 70 / 23, finalDriveRatio: 43 / 14,
    peakTorqueNm: 23, peakTorqueRpm: 10000, peakPowerPs: 35, peakPowerRpm: 12000,
    referenceRpm: 14000, fuelCutRpm: 14300, rollingRadiusM: 0.306, dragAreaM2: 0.355, exhaustFrequencyHz: 177,
  }),
  defineMotorcycle({
    id: "yamaha-r1-1998", brand: "Yamaha", name: "YZF-R1 ’98", version: "1998 歐規・初代", engine: "直列四缸",
    source: "https://global.yamaha-motor.com/jp/showroom/cp/collection/yzf-r1/",
    displacementCc: 998, boreMm: 74, strokeMm: 58, firingDegrees: inlineFourFiring, curbMassKg: 197,
    gearRatios: [2.500, 1.842, 1.500, 1.333, 1.200, 1.115], primaryRatio: 68 / 43, finalDriveRatio: 43 / 16,
    peakTorqueNm: 108.3, peakTorqueRpm: 8500, peakPowerPs: 150, peakPowerRpm: 10000,
    referenceRpm: 11750, fuelCutRpm: 12000, rollingRadiusM: 0.309, dragAreaM2: 0.37, exhaustFrequencyHz: 137,
  }),
  defineMotorcycle({
    id: "yamaha-tzr250r-3xv", brand: "Yamaha", name: "TZR250R SP ’91", version: "1991 日規 3XV・二行程",
    engine: "90° V2 二行程・YPVS",
    source: "https://global.yamaha-motor.com/showroom/cp/collection/tzr250/",
    displacementCc: 249, boreMm: 56.0, strokeMm: 50.7,
    firingDegrees: [0, 90, 360, 450], cylinderFiringDegrees: [0, 90], bankAngleDegrees: 90,
    twoStroke: { powerbandStartRpm: 7600, powerbandPeakRpm: 10200 },
    curbMassKg: 146,
    gearRatios: [38 / 15, 29 / 16, 29 / 20, 26 / 21, 23 / 21, 22 / 22], primaryRatio: 62 / 24, finalDriveRatio: 37 / 14,
    peakTorqueNm: 36.3, peakTorqueRpm: 8500, peakPowerPs: 45, peakPowerRpm: 9500,
    idleRpm: 1350, referenceRpm: 11500, fuelCutRpm: 12000, speedLimitKmh: 180,
    rollingRadiusM: 0.302, dragAreaM2: 0.34, exhaustFrequencyHz: 215,
  }),
];

export const moreKawasakiVehicles = [
  defineMotorcycle({
    id: "kawasaki-ninja125", brand: "Kawasaki", name: "Ninja 125", version: "2027 歐規", engine: "單缸",
    source: "https://www.kawasaki.eu/en/Motorcycles/A2_Bikes/Ninja_125_2027.html/BX125CVFNN/BX125CVFNN/EbonyMetallicCarbonGray",
    displacementCc: 125, boreMm: 58, strokeMm: 47.2, firingDegrees: singleFiring, curbMassKg: 149,
    gearRatios: [34 / 12, 30 / 16, 26 / 18, 29 / 24, 19 / 18, 25 / 26], primaryRatio: 86 / 29, finalDriveRatio: 56 / 16,
    peakTorqueNm: 11.7, peakTorqueRpm: 7700, peakPowerPs: 14.14, peakPowerRpm: 10000,
    referenceRpm: 11200, fuelCutRpm: 11600, rollingRadiusM: 0.3, dragAreaM2: 0.36, exhaustFrequencyHz: 180,
  }),
  defineMotorcycle({
    id: "kawasaki-ninja250", brand: "Kawasaki", name: "Ninja 250", version: "2026 日規", engine: "180° 並列雙缸",
    source: "https://www.kawasaki-motors.com/ja-jp/motorcycle/ninja/sport/ninja-250/2026-ninja-250",
    displacementCc: 248, boreMm: 62, strokeMm: 41.2, firingDegrees: twin180Firing, curbMassKg: 166,
    gearRatios: [36 / 13, 36 / 19, 33 / 22, 31 / 25, 29 / 27, 24 / 25], primaryRatio: 89 / 29, finalDriveRatio: 41 / 14,
    peakTorqueNm: 22, peakTorqueRpm: 10500, peakPowerPs: 35, peakPowerRpm: 12500,
    referenceRpm: 13200, fuelCutRpm: 13800, rollingRadiusM: 0.306, dragAreaM2: 0.36, exhaustFrequencyHz: 189,
  }),
  defineMotorcycle({
    id: "kawasaki-ninja400", brand: "Kawasaki", name: "Ninja 400", version: "2026 日規", engine: "180° 並列雙缸",
    source: "https://www.kawasaki-motors.com/ja-jp/motorcycle/ninja/sport/ninja-400/2026-ninja-400",
    displacementCc: 398, boreMm: 70, strokeMm: 51.8, firingDegrees: twin180Firing, curbMassKg: 167,
    gearRatios: ninjaCloseGears, primaryRatio: 71 / 32, finalDriveRatio: 41 / 14,
    peakTorqueNm: 37, peakTorqueRpm: 8000, peakPowerPs: 48, peakPowerRpm: 10000,
    referenceRpm: 12000, fuelCutRpm: 12500, rollingRadiusM: 0.299, dragAreaM2: 0.36, exhaustFrequencyHz: 163,
  }),
  defineMotorcycle({
    id: "kawasaki-ninja500", brand: "Kawasaki", name: "Ninja 500", version: "2027 歐規", engine: "180° 並列雙缸",
    source: "https://www.kawasaki.eu/en/Motorcycles/A2_Bikes/Ninja_500_2027.html/EX500GVFNN/EX500GVFNNPA/MetallicFlatSparkBlackMetallicSparkBlack",
    displacementCc: 451, boreMm: 70, strokeMm: 58.6, firingDegrees: twin180Firing, curbMassKg: 171,
    gearRatios: ninjaCloseGears, primaryRatio: 69 / 34, finalDriveRatio: 43 / 14,
    peakTorqueNm: 42.6, peakTorqueRpm: 6000, peakPowerPs: 45, peakPowerRpm: 9000,
    referenceRpm: 10500, fuelCutRpm: 11000, rollingRadiusM: 0.299, dragAreaM2: 0.365, exhaustFrequencyHz: 152,
  }),
  defineMotorcycle({
    id: "kawasaki-ninja650", brand: "Kawasaki", name: "Ninja 650", version: "2027 歐規", engine: "180° 並列雙缸",
    source: "https://www.kawasaki.eu/en/Motorcycles/A2_Bikes/Ninja_650_2027.html/EX650VVFNN/EX650VVFNN/MetallicMatteGrapheneSteelGrayMetallicSparkBlack",
    displacementCc: 649, boreMm: 83, strokeMm: 60, firingDegrees: twin180Firing, curbMassKg: 194,
    gearRatios: [39 / 16, 36 / 21, 32 / 24, 30 / 27, 28 / 29, 23 / 27], primaryRatio: 88 / 42, finalDriveRatio: 46 / 15,
    peakTorqueNm: 64, peakTorqueRpm: 6700, peakPowerPs: 68, peakPowerRpm: 8000,
    referenceRpm: 10000, fuelCutRpm: 10400, rollingRadiusM: 0.306, dragAreaM2: 0.38, exhaustFrequencyHz: 132,
  }),
  defineMotorcycle({
    id: "kawasaki-ninja7-hybrid", brand: "Kawasaki", name: "Ninja 7 Hybrid", version: "2024 歐規・燃油引擎",
    engine: "油電並列雙缸",
    source: "https://www.kawasaki.eu/en/Motorcycles/EV_HEV/Ninja_7_Hybrid.html",
    displacementCc: 451, boreMm: 70, strokeMm: 58.6, firingDegrees: twin180Firing, curbMassKg: 227,
    gearRatios: [38 / 17, 36 / 20, 33 / 22, 31 / 25, 29 / 27, 27 / 28], primaryRatio: 71 / 32, finalDriveRatio: 43 / 14,
    peakTorqueNm: 43.6, peakTorqueRpm: 7500, peakPowerPs: 59, peakPowerRpm: 10500,
    referenceRpm: 11000, fuelCutRpm: 11500, rollingRadiusM: 0.299, dragAreaM2: 0.39, exhaustFrequencyHz: 166,
  }),
  {
    ...zx25rr,
    physics: { ...zx25rr.physics, peakTorqueNm: 21, peakPowerPs: 46, peakPowerRpm: 16000, engineInertiaKgM2: 0.019 },
  },
  defineMotorcycle({
    id: "kawasaki-zx4rr", brand: "Kawasaki", name: "ZX-4RR", version: "2027 歐規・全功率", engine: "高轉直列四缸",
    source: "https://www.kawasaki.eu/en/Motorcycles/A2_Bikes/Ninja_ZX-4RR_2027.dispdir.dispdir.html.html",
    displacementCc: 399, boreMm: 57, strokeMm: 39.1, firingDegrees: inlineFourFiring, curbMassKg: 189,
    gearRatios: ninjaCloseGears, primaryRatio: 69 / 34, finalDriveRatio: 48 / 14,
    peakTorqueNm: 39, peakTorqueRpm: 13600, peakPowerPs: 77, peakPowerRpm: 14500,
    referenceRpm: 15500, fuelCutRpm: 16100, rollingRadiusM: 0.306, dragAreaM2: 0.35, exhaustFrequencyHz: 222,
  }),
  defineMotorcycle({
    id: "kawasaki-zx10rr", brand: "Kawasaki", name: "ZX-10RR", version: "2026 澳洲版", engine: "高轉直列四缸",
    source: "https://www.kawasaki.com.au/en-au/motorcycle/ninja/supersport/ninja-zx-10r/2026-ninja-zx-10rr",
    displacementCc: 998, boreMm: 76, strokeMm: 55, firingDegrees: inlineFourFiring, curbMassKg: 207,
    gearRatios: [39 / 15, 41 / 19, 32 / 17, 33 / 20, 31 / 21, 30 / 23], primaryRatio: 79 / 47, finalDriveRatio: 41 / 17,
    peakTorqueNm: 110, peakTorqueRpm: 11400, peakPowerPs: 197, peakPowerRpm: 13200,
    referenceRpm: 14500, fuelCutRpm: 15000, rollingRadiusM: 0.316, dragAreaM2: 0.355, exhaustFrequencyHz: 185,
  }),
  defineMotorcycle({
    id: "kawasaki-zx7r", brand: "Kawasaki", name: "ZX-7R ’96", version: "1996 出口版・經典", engine: "直列四缸",
    source: "https://www.kawasaki.com/en-us/owner-center/parts/1996/ZX750-P1",
    displacementCc: 748, boreMm: 73, strokeMm: 44.7, firingDegrees: inlineFourFiring, curbMassKg: 233,
    gearRatios: [2.857, 2.000, 1.619, 1.391, 1.222, 1.103], primaryRatio: 93 / 53, finalDriveRatio: 43 / 16,
    peakTorqueNm: 78, peakTorqueRpm: 9300, peakPowerPs: 122, peakPowerRpm: 11800,
    referenceRpm: 12500, fuelCutRpm: 13000, rollingRadiusM: 0.317, dragAreaM2: 0.392, exhaustFrequencyHz: 147,
  }),
];
