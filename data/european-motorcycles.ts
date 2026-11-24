import { defineMotorcycle, inlineFourFiring, singleFiring, twin270Firing } from "./motorcycle.ts";

const twinPulse = [0, 90, 290, 380];
const twinPulseByBank = [0, 290, 90, 380];
const panigaleV4Gears = [36 / 15, 34 / 17, 33 / 19, 32 / 21, 30 / 22, 27 / 22];
const bmwRrGears = [2.647, 2.091, 1.727, 1.500, 1.360, 1.261];

export const apriliaVehicles = [
  defineMotorcycle({
    id: "aprilia-rs125", brand: "Aprilia", name: "RS 125", version: "2025 歐規", engine: "單缸",
    source: "https://www.aprilia.com/en_EN/models/rs-125/rs-125-125-4s4v-2025/",
    displacementCc: 125, boreMm: 58, strokeMm: 47, firingDegrees: singleFiring, curbMassKg: 144,
    gearRatios: [33 / 11, 30 / 15, 27 / 18, 24 / 20, 27 / 25, 22 / 23], primaryRatio: 2.53, finalDriveRatio: 58 / 13,
    peakTorqueNm: 11.4, peakTorqueRpm: 8500, peakPowerPs: 15, peakPowerRpm: 10500,
    referenceRpm: 11000, fuelCutRpm: 11600, rollingRadiusM: 0.3, dragAreaM2: 0.35, exhaustFrequencyHz: 164,
  }),
  defineMotorcycle({
    id: "aprilia-rs457", brand: "Aprilia", name: "RS 457", version: "2025 日規", engine: "270° 並列雙缸",
    source: "https://wlassets.aprilia.com/wlassets/aprilia/jp/tech-spec/2024/RS_457_JP/original/457_JP.pdf",
    displacementCc: 457, boreMm: 69, strokeMm: 61.1, firingDegrees: twin270Firing, curbMassKg: 175,
    gearRatios: [43 / 13, 44 / 19, 35 / 20, 38 / 27, 34 / 29, 32 / 31], primaryRatio: 80 / 39, finalDriveRatio: 43 / 15,
    peakTorqueNm: 43.5, peakTorqueRpm: 6700, peakPowerPs: 47.6, peakPowerRpm: 9400,
    referenceRpm: 10000, fuelCutRpm: 10700, rollingRadiusM: 0.306, dragAreaM2: 0.365, exhaustFrequencyHz: 143,
  }),
  defineMotorcycle({
    id: "aprilia-rs660", brand: "Aprilia", name: "RS 660", version: "2025 歐規", engine: "270° 並列雙缸",
    source: "https://www.aprilia.com/gb_EN/aprilia-world/news-aprilia/aprilia-rs-660-new-range/",
    displacementCc: 659, boreMm: 81, strokeMm: 63.93, firingDegrees: twin270Firing, curbMassKg: 183,
    gearRatios: [46 / 17, 33 / 16, 39 / 24, 26 / 19, 25 / 21, 23 / 22], primaryRatio: 80 / 39, finalDriveRatio: 43 / 17,
    peakTorqueNm: 70, peakTorqueRpm: 8400, peakPowerPs: 105, peakPowerRpm: 10400,
    referenceRpm: 11500, fuelCutRpm: 11800, rollingRadiusM: 0.312, dragAreaM2: 0.36, exhaustFrequencyHz: 121,
  }),
  defineMotorcycle({
    id: "aprilia-rsv4", brand: "Aprilia", name: "RSV4", version: "2025 歐規", engine: "65° V4",
    source: "https://www.aprilia.com/wlassets/EICMA/EICMA-2025/Aprilia/brochure/EN-DIGITAL-Aprilia-Range-11-2025/original/EN-DIGITAL-Aprilia-Range-11-2025.pdf",
    displacementCc: 1099, boreMm: 81, strokeMm: 53.32, firingDegrees: [0, 180, 425, 605],
    bankAngleDegrees: 65, cylinderFiringDegrees: [0, 180, 425, 605], curbMassKg: 204,
    gearRatios: [39 / 15, 33 / 16, 34 / 20, 32 / 22, 34 / 26, 33 / 27], primaryRatio: 73 / 44, finalDriveRatio: 41 / 16,
    peakTorqueNm: 127, peakTorqueRpm: 10800, peakPowerPs: 220, peakPowerRpm: 13000,
    referenceRpm: 13600, fuelCutRpm: 13900, rollingRadiusM: 0.327, dragAreaM2: 0.37, exhaustFrequencyHz: 138,
  }),
  defineMotorcycle({
    id: "aprilia-rsv-mille", brand: "Aprilia", name: "RSV Mille", version: "1998 歐規・經典", engine: "60° V2",
    source: "https://www.press.piaggiogroup.com/en_EN/post/show/146743/la-storia-di-aprilia.html",
    displacementCc: 998, boreMm: 97, strokeMm: 67.5, firingDegrees: [0, 300], bankAngleDegrees: 60, curbMassKg: 221,
    gearRatios: [2.50, 1.75, 1.368, 1.091, 0.957, 0.852], primaryRatio: 60 / 31, finalDriveRatio: 42 / 17,
    peakTorqueNm: 103, peakTorqueRpm: 7250, peakPowerPs: 128, peakPowerRpm: 9500,
    referenceRpm: 10200, fuelCutRpm: 10500, rollingRadiusM: 0.316, dragAreaM2: 0.39, exhaustFrequencyHz: 96,
  }),
];

export const ducatiVehicles = [
  defineMotorcycle({
    id: "ducati-panigale-v2", brand: "Ducati", name: "Panigale V2", version: "2025 印度版・890 cc", engine: "90° V2・IVT",
    source: "https://www.ducati.com/in/en/bikes/panigale/panigale-v2-2025/insights?tab=Electronics",
    displacementCc: 890, boreMm: 96, strokeMm: 61.5, firingDegrees: twin270Firing, bankAngleDegrees: 90, curbMassKg: 190,
    gearRatios: [38 / 14, 34 / 17, 32 / 20, 29 / 22, 24 / 21, 26 / 25], primaryRatio: 1.84, finalDriveRatio: 42 / 15,
    peakTorqueNm: 93.3, peakTorqueRpm: 8250, peakPowerPs: 120, peakPowerRpm: 10750,
    referenceRpm: 11300, fuelCutRpm: 11800, rollingRadiusM: 0.317, dragAreaM2: 0.36, exhaustFrequencyHz: 108,
  }),
  defineMotorcycle({
    id: "ducati-panigale-v4", brand: "Ducati", name: "Panigale V4", version: "2027 歐規", engine: "90° V4・Twin Pulse",
    source: "https://www.ducati.com/gb/en/bikes/panigale/panigale-v4-2027/insights",
    displacementCc: 1103, boreMm: 81, strokeMm: 53.5, firingDegrees: twinPulse,
    bankAngleDegrees: 90, cylinderFiringDegrees: twinPulseByBank, curbMassKg: 204,
    gearRatios: panigaleV4Gears, primaryRatio: 1.80, finalDriveRatio: 42 / 17,
    peakTorqueNm: 120.6, peakTorqueRpm: 11000, peakPowerPs: 218, peakPowerRpm: 13500,
    referenceRpm: 14500, fuelCutRpm: 14600, gearFuelCutRpm: { 2: 15000, 3: 15000, 4: 15000, 5: 15000 },
    rollingRadiusM: 0.328, dragAreaM2: 0.36, exhaustFrequencyHz: 128,
  }),
  defineMotorcycle({
    id: "ducati-panigale-v4-r", brand: "Ducati", name: "Panigale V4 R", version: "2026 歐規", engine: "90° V4・Twin Pulse",
    source: "https://www.ducati.com/gb/en/bikes/panigale/panigale-v4-r/insights",
    displacementCc: 998, boreMm: 81, strokeMm: 48.4, firingDegrees: twinPulse,
    bankAngleDegrees: 90, cylinderFiringDegrees: twinPulseByBank, curbMassKg: 199,
    gearRatios: panigaleV4Gears, primaryRatio: 1.80, finalDriveRatio: 43 / 16,
    peakTorqueNm: 114.5, peakTorqueRpm: 12000, peakPowerPs: 218, peakPowerRpm: 15750,
    referenceRpm: 16000, fuelCutRpm: 16000, gearFuelCutRpm: { 6: 16500 },
    rollingRadiusM: 0.328, dragAreaM2: 0.37, exhaustFrequencyHz: 155,
  }),
  defineMotorcycle({
    id: "ducati-916", brand: "Ducati", name: "916", version: "1994 歐規・經典", engine: "90° V2・Desmo",
    source: "https://www.ducati.com/us/en/heritage/bikes/916",
    displacementCc: 916, boreMm: 94, strokeMm: 66, firingDegrees: twin270Firing, bankAngleDegrees: 90, curbMassKg: 211,
    gearRatios: [2.467, 1.765, 1.400, 1.182, 1.043, 0.958], primaryRatio: 1.84, finalDriveRatio: 36 / 15,
    peakTorqueNm: 90.5, peakTorqueRpm: 6900, peakPowerPs: 114, peakPowerRpm: 9000,
    referenceRpm: 10000, fuelCutRpm: 10400, rollingRadiusM: 0.313, dragAreaM2: 0.38, exhaustFrequencyHz: 91,
  }),
];

export const bmwVehicles = [
  defineMotorcycle({
    id: "bmw-g310rr", brand: "BMW", name: "G 310 RR", version: "印度版・Sport", engine: "單缸",
    source: "https://www.bmw-motorrad.in/en/models/sport/g310rr/technicaldata.html",
    displacementCc: 312.12, boreMm: 80, strokeMm: 62.1, firingDegrees: singleFiring, curbMassKg: 174,
    gearRatios: [3.000, 2.063, 1.588, 1.286, 1.095, 0.955], primaryRatio: 3.083, finalDriveRatio: 2.625,
    peakTorqueNm: 27.3, peakTorqueRpm: 7700, peakPowerPs: 34, peakPowerRpm: 9700,
    referenceRpm: 10500, fuelCutRpm: 10900, rollingRadiusM: 0.299, dragAreaM2: 0.38, exhaustFrequencyHz: 130,
  }),
  defineMotorcycle({
    id: "bmw-s1000rr", brand: "BMW", name: "S 1000 RR", version: "2025 歐規", engine: "直列四缸・ShiftCam",
    source: "https://www.press.bmwgroup.com/switzerland/article/attachment/T0446040DE/624096",
    displacementCc: 999, boreMm: 80, strokeMm: 49.7, firingDegrees: inlineFourFiring, curbMassKg: 197,
    gearRatios: bmwRrGears, primaryRatio: 1.652, finalDriveRatio: 46 / 17,
    peakTorqueNm: 113, peakTorqueRpm: 11000, peakPowerPs: 210, peakPowerRpm: 13750,
    referenceRpm: 14600, fuelCutRpm: 15000, rollingRadiusM: 0.317, dragAreaM2: 0.37, exhaustFrequencyHz: 150,
  }),
  defineMotorcycle({
    id: "bmw-m1000rr", brand: "BMW", name: "M 1000 RR", version: "2025 歐規", engine: "直列四缸・ShiftCam",
    source: "https://www.press.bmwgroup.com/switzerland/article/attachment/T0446040DE/624096",
    displacementCc: 999, boreMm: 80, strokeMm: 49.7, firingDegrees: inlineFourFiring, curbMassKg: 194,
    gearRatios: bmwRrGears, primaryRatio: 1.652, finalDriveRatio: 46 / 17,
    peakTorqueNm: 113, peakTorqueRpm: 11000, peakPowerPs: 218, peakPowerRpm: 14500,
    referenceRpm: 15100, fuelCutRpm: 15400, rollingRadiusM: 0.327, dragAreaM2: 0.37, exhaustFrequencyHz: 166,
  }),
  defineMotorcycle({
    id: "bmw-s1000rr-2009", brand: "BMW", name: "S 1000 RR ’09", version: "2009 歐規・初代", engine: "直列四缸",
    source: "https://www.press.bmwgroup.com/global/article/detail/T0119114EN/the-new-bmw-s-1000-rr",
    displacementCc: 999, boreMm: 80, strokeMm: 49.7, firingDegrees: inlineFourFiring, curbMassKg: 206.5,
    gearRatios: [2.647, 2.091, 1.727, 1.500, 1.360, 1.261], primaryRatio: 1.652, finalDriveRatio: 44 / 17,
    peakTorqueNm: 112, peakTorqueRpm: 9750, peakPowerPs: 193, peakPowerRpm: 13000,
    referenceRpm: 14000, fuelCutRpm: 14200, rollingRadiusM: 0.317, dragAreaM2: 0.375, exhaustFrequencyHz: 133,
  }),
];
