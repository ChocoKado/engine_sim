import { defineCar } from "./car-model.ts";

const hpToPs = 745.6998716 / 735.49875;
const poundFeetToNm = 1.3558179483;
const evenFour = [0, 180, 360, 540] as const;
const evenSix = [0, 120, 240, 360, 480, 600] as const;
const evenEight = [0, 90, 180, 270, 360, 450, 540, 630] as const;
const oddTen = [0, 90, 144, 234, 288, 378, 432, 522, 576, 666] as const;
const alternatingSix = [0, 1, 0, 1, 0, 1] as const;
const alternatingTen = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1] as const;

// Inertia, effective tire radius, loss, traction, exhaust response and spool tuning are simulation estimates.
export const expandedRoadCars = [
  defineCar({
    id: "nissan-skyline-gtr-r34", brand: "Nissan", name: "Skyline GT-R R34", version: "2000 日規 V·spec II・6MT",
    engine: "RB26DETT 雙渦輪直列六缸", displacementCc: 2568,
    source: "https://global.nissannews.com/en/releases/skyline-and-skyline-gt-r-undergo-minor-model-change",
    cylinderDimensionsMm: [86, 73.7, 121.5], firingDegrees: evenSix,
    cylinderFiringDegrees: [0, 480, 240, 600, 120, 360],
    turbocharger: { maxBoostBar: 0.7, spoolStartRpm: 3000, turbineCount: 2 },
    exhaustFrequencyHz: 118, pulseDecayMs: 7.4,
    physics: {
      curbMassKg: 1560, gearRatios: [3.827, 2.360, 1.685, 1.312, 1, 0.793], finalDriveRatio: 3.545,
      peakTorqueNm: 392, peakTorqueRpm: 4400, peakPowerPs: 280, peakPowerRpm: 6800,
      idleRpm: 850, referenceRpm: 8000, fuelCutRpm: 8200, lowRpmTorqueRatio: 0.29,
      engineInertiaKgM2: 0.21, wheelInertiaKgM2: 5.2, rollingRadiusM: 0.318, dragAreaM2: 0.71, maxDriveAccelerationG: 0.81,
    },
  }),
  defineCar({
    id: "mazda-rx7-spirit-r", brand: "Mazda", name: "RX-7 Spirit R", version: "2002 日規 Type A・5MT",
    engine: "13B-REW 序列雙渦輪雙轉子", displacementCc: 1308,
    source: "https://newsroom.mazda.com/en/publicity/release/2002/200203/0325e.html",
    rotary: { rotors: 2, eccentricityM: 0.015, rotorRadiusM: 0.105, rotorWidthM: 0.080 },
    firingDegrees: evenFour, cylinderFiringDegrees: [],
    turbocharger: { maxBoostBar: 0.69, spoolStartRpm: 2400, turbineCount: 2 },
    exhaustFrequencyHz: 173, pulseDecayMs: 5.9,
    physics: {
      curbMassKg: 1270, gearRatios: [3.483, 2.015, 1.391, 1, 0.762], finalDriveRatio: 4.3,
      peakTorqueNm: 314, peakTorqueRpm: 5000, peakPowerPs: 280, peakPowerRpm: 6500,
      idleRpm: 850, referenceRpm: 8000, fuelCutRpm: 8000, lowRpmTorqueRatio: 0.31,
      engineInertiaKgM2: 0.155, wheelInertiaKgM2: 4.5, rollingRadiusM: 0.306, dragAreaM2: 0.57, maxDriveAccelerationG: 0.73,
    },
  }),
  defineCar({
    id: "honda-nsx-na2", brand: "Honda", name: "NSX NA2", version: "1997 日規 NSX 3.2・6MT",
    engine: "C32B 自然進氣 V6・VTEC", displacementCc: 3179,
    vtecSwitchRpm: 5700,
    source: "https://www.honda.co.jp/factbook/auto/NSX/19970206/ns97-011.html",
    cylinderDimensionsMm: [93, 78, 149], bankAngleDegrees: 90, firingDegrees: evenSix,
    cylinderFiringDegrees: [0, 240, 480, 120, 360, 600], exhaustBanks: alternatingSix,
    exhaustFrequencyHz: 151, pulseDecayMs: 6.8,
    physics: {
      curbMassKg: 1350, gearRatios: [3.066, 1.956, 1.428, 1.125, 0.914, 0.717], finalDriveRatio: 4.062,
      peakTorqueNm: 31 * 9.80665, peakTorqueRpm: 5300, peakPowerPs: 280, peakPowerRpm: 7300,
      idleRpm: 780, referenceRpm: 8000, fuelCutRpm: 8200, lowRpmTorqueRatio: 0.47,
      engineInertiaKgM2: 0.20, wheelInertiaKgM2: 4.7, rollingRadiusM: 0.306, dragAreaM2: 0.59, maxDriveAccelerationG: 0.75,
    },
  }),
  defineCar({
    id: "honda-s2000-ap1", brand: "Honda", name: "S2000 AP1", version: "1999 日規標準版・6MT",
    engine: "F20C 自然進氣直列四缸・VTEC", displacementCc: 1997,
    vtecSwitchRpm: 6000,
    source: "https://www.honda.co.jp/auto-archive/s2000/2001/shogen.html",
    cylinderDimensionsMm: [87, 84, 153], firingDegrees: evenFour, cylinderFiringDegrees: [0, 540, 180, 360],
    exhaustFrequencyHz: 168, pulseDecayMs: 5.9,
    physics: {
      curbMassKg: 1240, gearRatios: [3.133, 2.045, 1.481, 1.161, 0.970, 0.810], finalDriveRatio: 1.160 * 4.100,
      peakTorqueNm: 218, peakTorqueRpm: 7500, peakPowerPs: 250, peakPowerRpm: 8300,
      idleRpm: 850, referenceRpm: 9000, fuelCutRpm: 9000, lowRpmTorqueRatio: 0.48,
      engineInertiaKgM2: 0.14, wheelInertiaKgM2: 4.0, rollingRadiusM: 0.299, dragAreaM2: 0.65, maxDriveAccelerationG: 0.70,
    },
  }),
  defineCar({
    id: "toyota-gr-yaris", brand: "Toyota", name: "GR Yaris", version: "2024 日規 RZ High Performance・6MT",
    engine: "G16E-GTS 渦輪直列三缸", displacementCc: 1618,
    source: "https://toyotagazooracing.com/pressrelease/2024/0321-01/",
    cylinderDimensionsMm: [87.5, 89.7, 143.5], firingDegrees: [0, 240, 480],
    cylinderFiringDegrees: [0, 480, 240],
    turbocharger: { maxBoostBar: 1.6, spoolStartRpm: 2300 },
    exhaustFrequencyHz: 129, pulseDecayMs: 7.4,
    physics: {
      // The fifth and sixth gears have a different output reduction.
      curbMassKg: 1280, gearRatios: [3.538, 2.238, 1.535, 1.162, 1.081 * 3.350 / 3.941, 0.902 * 3.350 / 3.941],
      finalDriveRatio: 3.941,
      peakTorqueNm: 400, peakTorqueRpm: 3250, peakTorqueEndRpm: 4600, peakPowerPs: 304, peakPowerRpm: 6500,
      idleRpm: 850, referenceRpm: 7000, fuelCutRpm: 7250, lowRpmTorqueRatio: 0.27,
      engineInertiaKgM2: 0.15, wheelInertiaKgM2: 4.5, rollingRadiusM: 0.310, dragAreaM2: 0.76, maxDriveAccelerationG: 0.86,
    },
  }),
  defineCar({
    id: "subaru-impreza-wrx-sti", brand: "Subaru", name: "Impreza WRX STI", version: "2005 加規 GDB・6MT",
    engine: "EJ257 渦輪水平對臥四缸", displacementCc: 2457,
    source: "https://www.subaru.ca/Content/7907/media/en-ca/download/2005ImprezaWRXSTi.pdf",
    cylinderDimensionsMm: [99.5, 79, 130.5], bankAngleDegrees: 180, firingDegrees: evenFour,
    cylinderFiringDegrees: evenFour, exhaustBanks: [0, 0, 1, 1], runnerImbalance: 0.36,
    turbocharger: { maxBoostBar: 1, spoolStartRpm: 2700 },
    exhaustFrequencyHz: 101, pulseDecayMs: 9.4,
    physics: {
      curbMassKg: 1504, gearRatios: [3.636, 2.375, 1.761, 1.346, 0.971, 0.756], finalDriveRatio: 3.900,
      peakTorqueNm: 300 * poundFeetToNm, peakTorqueRpm: 4000, peakPowerPs: 300 * hpToPs, peakPowerRpm: 6000,
      idleRpm: 775, referenceRpm: 7000, fuelCutRpm: 7000, lowRpmTorqueRatio: 0.31,
      engineInertiaKgM2: 0.19, wheelInertiaKgM2: 5.0, rollingRadiusM: 0.310, dragAreaM2: 0.77, maxDriveAccelerationG: 0.83,
    },
  }),
  defineCar({
    id: "audi-tt-rs-8j", brand: "Audi", name: "TT RS Coupé 8J", version: "2010 歐規 quattro・6MT",
    engine: "CEPA 渦輪直列五缸", displacementCc: 2480,
    source: "https://www.vag-technique.fr/ext_files/ssp/vw/SSP_451_Audi_TT_RS_avec_moteur_TFSI_R5_de_2-5_L.pdf",
    cylinderDimensionsMm: [82.5, 92.8, 144], firingDegrees: [0, 144, 288, 432, 576],
    cylinderFiringDegrees: [0, 144, 576, 288, 432],
    turbocharger: { maxBoostBar: 1.2, spoolStartRpm: 1450 },
    exhaustFrequencyHz: 117, pulseDecayMs: 8.7,
    physics: {
      // Audi SSP 451 publishes the effective ratio of each gear including its own final reduction.
      curbMassKg: 1450, gearRatios: [13.45, 8.12, 5.51, 4.16, 3.36, 2.83], finalDriveRatio: 1,
      peakTorqueNm: 450, peakTorqueRpm: 1600, peakTorqueEndRpm: 5300, peakPowerPs: 340, peakPowerRpm: 5800,
      idleRpm: 780, referenceRpm: 6800, fuelCutRpm: 7000, lowRpmTorqueRatio: 0.36,
      engineInertiaKgM2: 0.22, wheelInertiaKgM2: 5.4, rollingRadiusM: 0.321, dragAreaM2: 0.68, maxDriveAccelerationG: 0.85,
      speedLimitKmh: 250,
    },
  }),
  defineCar({
    id: "bmw-m3-e92", brand: "BMW", name: "M3 E92 Coupé", version: "2007 歐規・6MT",
    engine: "S65 自然進氣十字曲軸 V8", displacementCc: 3999,
    source: "https://www.press.bmwgroup.com/deutschland/article/attachment/T0082243DE/125133",
    cylinderDimensionsMm: [92, 75.2, 140.7], bankAngleDegrees: 90, firingDegrees: evenEight,
    cylinderFiringDegrees: [0, 450, 180, 630, 540, 360, 90, 270], exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0],
    exhaustFrequencyHz: 132, pulseDecayMs: 7.6,
    physics: {
      curbMassKg: 1580, gearRatios: [4.055, 2.369, 1.582, 1.192, 1, 0.872], finalDriveRatio: 3.846,
      peakTorqueNm: 400, peakTorqueRpm: 3900, peakPowerPs: 420, peakPowerRpm: 8300,
      idleRpm: 850, referenceRpm: 8400, fuelCutRpm: 8400, lowRpmTorqueRatio: 0.56,
      engineInertiaKgM2: 0.235, wheelInertiaKgM2: 5.7, rollingRadiusM: 0.326, dragAreaM2: 0.68, maxDriveAccelerationG: 0.78,
      speedLimitKmh: 250,
    },
  }),
  defineCar({
    id: "porsche-911-gt3-992", brand: "Porsche", name: "911 GT3 (992.2)", version: "2025 歐規・6MT",
    engine: "4.0 自然進氣水平對臥六缸", displacementCc: 3996,
    source: "https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr%3A46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf",
    cylinderDimensionsMm: [102, 81.5, 145], bankAngleDegrees: 180, firingDegrees: evenSix,
    cylinderFiringDegrees: [0, 480, 240, 120, 360, 600], exhaustBanks: alternatingSix,
    exhaustFrequencyHz: 146, pulseDecayMs: 6.3,
    physics: {
      curbMassKg: 1462, gearRatios: [3.75, 2.38, 1.72, 1.34, 1.08, 0.88], finalDriveRatio: 4.30,
      peakTorqueNm: 450, peakTorqueRpm: 6250, peakPowerPs: 510, peakPowerRpm: 8500,
      idleRpm: 850, referenceRpm: 9000, fuelCutRpm: 9000, lowRpmTorqueRatio: 0.52,
      engineInertiaKgM2: 0.21, wheelInertiaKgM2: 5.8, rollingRadiusM: 0.352, dragAreaM2: 0.72, maxDriveAccelerationG: 0.96,
    },
  }),
  defineCar({
    id: "chevrolet-corvette-stingray-c8", brand: "Chevrolet", name: "Corvette Stingray C8", version: "2022 歐規 Z51 Coupé・8DCT",
    engine: "LT2 自然進氣十字曲軸 V8", displacementCc: 6162,
    source: "https://media.chevrolet.com/content/dam/Media/documents/INTL/chevrolet/tech-data/corvette-stingray/Chevrolet-Corvette-Stingray-TechSpecs_EN.pdf",
    cylinderDimensionsMm: [103.25, 92, 154.9], bankAngleDegrees: 90, firingDegrees: evenEight,
    cylinderFiringDegrees: [0, 630, 450, 180, 270, 540, 360, 90], exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0],
    exhaustFrequencyHz: 91, pulseDecayMs: 10.3,
    physics: {
      // Chevrolet's mass in running order includes 75 kg for the driver.
      curbMassKg: 1730 - 75, gearRatios: [2.905, 1.759, 1.220, 0.878, 0.653, 0.508, 0.397, 0.329], finalDriveRatio: 5.17,
      peakTorqueNm: 613, peakTorqueRpm: 4500, peakPowerPs: 482, peakPowerRpm: 6450,
      idleRpm: 675, referenceRpm: 6500, fuelCutRpm: 6600, lowRpmTorqueRatio: 0.56,
      engineInertiaKgM2: 0.30, wheelInertiaKgM2: 6.0, rollingRadiusM: 0.339, dragAreaM2: 0.80, maxDriveAccelerationG: 1.02,
    },
  }),
  defineCar({
    id: "dodge-viper", brand: "Dodge", name: "Viper SRT", version: "2017 美規標準版・6MT",
    engine: "8.4 自然進氣 V10・不等間隔點火", displacementCc: 8382,
    source: "https://s3.amazonaws.com/chryslermedia.iconicweb.com/mediasite/specs/2017_DG_Viper_SPfla4qp9pu01chim5ofhl9bmqdd.pdf",
    cylinderDimensionsMm: [103, 100.6, 169], bankAngleDegrees: 90, firingDegrees: oddTen,
    cylinderFiringDegrees: [0, 288, 432, 576, 144, 666, 234, 378, 522, 90], exhaustBanks: alternatingTen,
    exhaustFrequencyHz: 82, pulseDecayMs: 10.8,
    physics: {
      curbMassKg: 1537, gearRatios: [2.26, 1.58, 1.19, 1, 0.77, 0.63], finalDriveRatio: 3.55,
      peakTorqueNm: 814, peakTorqueRpm: 5000, peakPowerPs: 645 * hpToPs, peakPowerRpm: 6200,
      idleRpm: 750, referenceRpm: 6200, fuelCutRpm: 6400, lowRpmTorqueRatio: 0.57,
      engineInertiaKgM2: 0.36, wheelInertiaKgM2: 6.2, rollingRadiusM: 0.340, dragAreaM2: 0.78, maxDriveAccelerationG: 0.91,
    },
  }),
  defineCar({
    id: "mercedes-sls-amg", brand: "Mercedes-AMG", name: "SLS AMG Coupé", version: "2010 C197・7DCT",
    engine: "M159 自然進氣十字曲軸 V8", displacementCc: 6208,
    source: "https://www.ausmotive.com/downloads/Mercedes-Benz/SLS-AMG-Press-kit-July2010.pdf",
    cylinderDimensionsMm: [102.2, 94.6, 161], bankAngleDegrees: 90, firingDegrees: evenEight,
    cylinderFiringDegrees: [0, 450, 180, 630, 540, 360, 90, 270], exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0],
    exhaustFrequencyHz: 97, pulseDecayMs: 10.0,
    physics: {
      curbMassKg: 1620, gearRatios: [3.40, 2.19, 1.63, 1.29, 1.03, 0.84, 0.72], finalDriveRatio: 3.67,
      peakTorqueNm: 650, peakTorqueRpm: 4750, peakPowerPs: 571, peakPowerRpm: 6800,
      idleRpm: 720, referenceRpm: 7200, fuelCutRpm: 7200, lowRpmTorqueRatio: 0.62,
      engineInertiaKgM2: 0.29, wheelInertiaKgM2: 6.0, rollingRadiusM: 0.338, dragAreaM2: 0.72, maxDriveAccelerationG: 0.94,
      speedLimitKmh: 317,
    },
  }),
  defineCar({
    id: "lamborghini-gallardo-lp560", brand: "Lamborghini", name: "Gallardo LP 560-4", version: "2009 Coupé・6MT",
    engine: "5.2 FSI 自然進氣 V10・不等間隔點火", displacementCc: 5204,
    source: "https://www.lamborghini.com/en-en/history/gallardo-lp-560-4-coupe",
    cylinderDimensionsMm: [84.5, 92.8, 154], bankAngleDegrees: 90, firingDegrees: oddTen,
    cylinderFiringDegrees: [0, 288, 432, 576, 144, 90, 378, 522, 666, 234], exhaustBanks: alternatingTen,
    exhaustFrequencyHz: 158, pulseDecayMs: 6.9,
    physics: {
      // Shift ratio anchors from the Lamborghini 2009 workshop manual. Curb mass is estimated from dry mass.
      curbMassKg: 1600, gearRatios: [3.313, 2.053, 1.458, 1.138, 0.939, 0.784], finalDriveRatio: 3.08,
      peakTorqueNm: 540, peakTorqueRpm: 6500, peakPowerPs: 560, peakPowerRpm: 8000,
      idleRpm: 850, referenceRpm: 8300, fuelCutRpm: 8300, lowRpmTorqueRatio: 0.49,
      engineInertiaKgM2: 0.245, wheelInertiaKgM2: 5.9, rollingRadiusM: 0.325, dragAreaM2: 0.72, maxDriveAccelerationG: 0.98,
    },
  }),
  defineCar({
    id: "ferrari-812-superfast", brand: "Ferrari", name: "812 Superfast", version: "2017 歐規・7DCT",
    engine: "F140 GA 65° 自然進氣 V12", displacementCc: 6496,
    source: "https://cdn.ferrari.com/cms/network/media/pdf/cs_ferrari_812_superfast_gbr.pdf",
    cylinderDimensionsMm: [94, 78, 145], bankAngleDegrees: 65,
    firingDegrees: [0, 65, 120, 185, 240, 305, 360, 425, 480, 545, 600, 665],
    cylinderFiringDegrees: [0, 480, 240, 600, 120, 360, 65, 545, 305, 665, 185, 425],
    exhaustBanks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    exhaustFrequencyHz: 169, pulseDecayMs: 7.3,
    physics: {
      // Curb mass with light options, individual ratios and the limiter are from the 812 owner's manual.
      curbMassKg: 1630, gearRatios: [3.334, 2.285, 1.728, 1.369, 1.115, 0.904, 0.703], finalDriveRatio: 4.375,
      peakTorqueNm: 718, peakTorqueRpm: 7000, peakPowerPs: 800, peakPowerRpm: 8500,
      idleRpm: 850, referenceRpm: 8900, fuelCutRpm: 8900, lowRpmTorqueRatio: 0.52,
      engineInertiaKgM2: 0.275, wheelInertiaKgM2: 6.4, rollingRadiusM: 0.356, dragAreaM2: 0.78, maxDriveAccelerationG: 1.02,
    },
  }),
];
