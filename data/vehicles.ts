import { apriliaVehicles, bmwVehicles, ducatiVehicles } from "./european-motorcycles.ts";
import { moreKawasakiVehicles, moreYamahaVehicles } from "./expanded-yamaha-kawasaki.ts";
import { hondaVehicles } from "./honda.ts";
import { kawasakiVehicles } from "./kawasaki.ts";
import { defineTrim } from "./motorcycle.ts";
import { suzukiVehicles } from "./suzuki.ts";

export interface Vehicle {
  readonly kind?: "car" | "formula1";
  readonly id: string;
  readonly brand: string;
  readonly name: string;
  readonly version: string;
  readonly displacementCc: number;
  readonly engine: string;
  readonly gears: number;
  readonly source: string;
  readonly supercharger?: {
    readonly driveRatio: number;
    readonly audioGain: number;
  };
  readonly turbocharger?: {
    readonly maxBoostBar: number;
    readonly spoolStartRpm?: number;
    readonly turbineCount?: 1 | 2;
    readonly releaseStyle?: "recirculating" | "external" | "flutter" | "subtle";
  };
  readonly geometry: {
    readonly boreM: number;
    readonly strokeM: number;
    readonly rodLengthM: number;
    readonly cylinderSpacingM: number;
    readonly intakeLiftM: number;
    readonly exhaustLiftM: number;
    readonly bankAngleRad?: number;
    readonly cylinderFiringAnglesRad?: readonly number[];
    readonly rotary?: {
      readonly rotors: number;
      readonly eccentricityM: number;
      readonly rotorRadiusM: number;
      readonly rotorWidthM: number;
    };
    readonly vva?: { readonly switchRpm: number | null; readonly highIntakeLiftM: number };
  };
  readonly audio: {
    readonly firingAnglesRad: readonly number[];
    readonly exhaustBanks?: readonly number[];
    readonly exhaustOpeningRad?: number;
    readonly exhaustFrequencyHz: number;
    readonly pulseDecayMs: number;
    readonly exhaustBody: {
      readonly frequencyHz: number;
      readonly decayMs: number;
      readonly gain: number;
      readonly runnerImbalance: number;
    };
    readonly exhaustReflectionMs?: number;
    readonly brightnessStartRpm?: number;
    readonly brightnessMaxRpm?: number;
  };
  readonly physics: {
    readonly curbMassKg: number;
    readonly gearRatios: readonly number[];
    readonly primaryRatio: number;
    readonly finalDriveRatio: number;
    readonly drivelineEfficiency?: number;
    readonly lowRpmTorqueRatio?: number;
    readonly peakTorqueNm: number;
    readonly peakTorqueRpm: number;
    readonly peakTorqueEndRpm?: number;
    readonly maxDriveAccelerationG?: number;
    readonly peakPowerPs: number;
    readonly peakPowerRpm: number;
    readonly idleRpm: number;
    readonly referenceRpm: number;
    readonly fuelCutRpm: number;
    readonly gearFuelCutRpm?: Readonly<Partial<Record<number, number>>>;
    readonly speedLimitKmh?: number;
    readonly engineInertiaKgM2: number;
    readonly wheelInertiaKgM2: number;
    readonly rollingRadiusM: number;
    readonly dragAreaM2: number;
    readonly downforceAreaM2?: number;
    readonly maxBrakeAccelerationG?: number;
    readonly hybridAssist?: {
      readonly peakPowerKw: number;
      readonly capacityKj: number;
      readonly regenPowerKw: number;
      readonly taperStartKmh?: number;
      readonly taperEndKmh?: number;
    };
    readonly frictionNm: number;
    readonly frictionNmPerRadPerSecond: number;
    readonly pumpingNmPerRadPerSecond: number;
    readonly clutchCapacityNm: number;
    readonly slipperCapacityNm: number;
    readonly clutchDampingNmPerRadPerSecond: number;
  };
}

// 車型規格、跨版本傳動比與近似值的證據分級見 docs/SOURCES.md。
const yamahaBase = [
  {
    id: "yamaha-r15",
    brand: "Yamaha",
    name: "YZF-R15",
    version: "2026 台灣版",
    displacementCc: 155,
    engine: "單缸・VVA",
    gears: 6,
    source: "https://www.yamaha-motor.com.tw/news/news-202605-r15",
    geometry: {
      boreM: 0.058,
      strokeM: 0.0587,
      rodLengthM: 0.098,
      cylinderSpacingM: 0.077,
      intakeLiftM: 0.0058,
      exhaustLiftM: 0.0054,
      vva: { switchRpm: null, highIntakeLiftM: 0.0076 },
    },
    audio: {
      firingAnglesRad: [0],
      exhaustFrequencyHz: 132,
      pulseDecayMs: 11,
      exhaustBody: { frequencyHz: 156, decayMs: 12.8, gain: 0.74, runnerImbalance: 0 },
    },
    physics: {
      curbMassKg: 141,
      gearRatios: [34 / 12, 30 / 16, 30 / 22, 24 / 21, 22 / 23, 21 / 25],
      primaryRatio: 73 / 24,
      finalDriveRatio: 48 / 14,
      peakTorqueNm: 1.4 * 9.80665,
      peakTorqueRpm: 7500,
      peakPowerPs: 18.4,
      peakPowerRpm: 10000,
      idleRpm: 1450,
      referenceRpm: 11500,
      fuelCutRpm: 11900,
      engineInertiaKgM2: 0.017,
      wheelInertiaKgM2: 1.15,
      rollingRadiusM: 0.305,
      dragAreaM2: 0.36,
      frictionNm: 0.8,
      frictionNmPerRadPerSecond: 0.0018,
      pumpingNmPerRadPerSecond: 0.0032,
      clutchCapacityNm: 26,
      slipperCapacityNm: 9,
      clutchDampingNmPerRadPerSecond: 0.38,
    },
  },
  {
    id: "yamaha-r3",
    brand: "Yamaha",
    name: "YZF-R3",
    version: "2026 台灣版",
    displacementCc: 321,
    engine: "並列雙缸",
    gears: 6,
    source: "https://www.yamaha-motor.com.tw/news/news-202603-70-anniversary-edition",
    geometry: {
      boreM: 0.068,
      strokeM: 0.0441,
      rodLengthM: 0.092,
      cylinderSpacingM: 0.086,
      intakeLiftM: 0.0064,
      exhaustLiftM: 0.0059,
    },
    audio: {
      firingAnglesRad: [0, Math.PI],
      exhaustFrequencyHz: 174,
      pulseDecayMs: 8,
      exhaustBody: { frequencyHz: 205, decayMs: 11.5, gain: 0.74, runnerImbalance: 0.10 },
    },
    physics: {
      curbMassKg: 170,
      gearRatios: [35 / 14, 31 / 17, 31 / 23, 25 / 23, 23 / 25, 24 / 30],
      primaryRatio: 70 / 23,
      finalDriveRatio: 43 / 14,
      peakTorqueNm: 3.0 * 9.80665,
      peakTorqueRpm: 9000,
      peakPowerPs: 41,
      peakPowerRpm: 10750,
      idleRpm: 1500,
      referenceRpm: 12000,
      fuelCutRpm: 12750,
      engineInertiaKgM2: 0.031,
      wheelInertiaKgM2: 1.35,
      rollingRadiusM: 0.305,
      dragAreaM2: 0.39,
      frictionNm: 1.25,
      frictionNmPerRadPerSecond: 0.0026,
      pumpingNmPerRadPerSecond: 0.0050,
      clutchCapacityNm: 48,
      slipperCapacityNm: 16,
      clutchDampingNmPerRadPerSecond: 0.50,
    },
  },
  {
    id: "yamaha-r6",
    brand: "Yamaha",
    name: "R6 RACE",
    version: "2026 歐規賽道版",
    displacementCc: 599,
    engine: "直列四缸",
    gears: 6,
    source: "https://www.yamaha-motor.eu/cz/cs/motorcycles/supersport/pdp/r6-race/",
    geometry: {
      boreM: 0.067,
      strokeM: 0.0425,
      rodLengthM: 0.094,
      cylinderSpacingM: 0.079,
      intakeLiftM: 0.0085,
      exhaustLiftM: 0.0075,
      cylinderFiringAnglesRad: [0, Math.PI, 3 * Math.PI, 2 * Math.PI],
    },
    audio: {
      firingAnglesRad: [0, Math.PI, 2 * Math.PI, 3 * Math.PI],
      exhaustFrequencyHz: 218,
      pulseDecayMs: 6,
      exhaustBody: { frequencyHz: 275, decayMs: 9.5, gain: 0.73, runnerImbalance: 0.19 },
      exhaustReflectionMs: 2.5,
      brightnessStartRpm: 8500,
      brightnessMaxRpm: 15500,
    },
    physics: {
      curbMassKg: 185,
      gearRatios: [31 / 12, 32 / 16, 30 / 18, 26 / 18, 27 / 21, 23 / 20],
      primaryRatio: 85 / 41,
      finalDriveRatio: 45 / 16,
      lowRpmTorqueRatio: 0.26,
      peakTorqueNm: 61.7,
      peakTorqueRpm: 10500,
      peakPowerPs: 118.4,
      peakPowerRpm: 14500,
      idleRpm: 1400,
      referenceRpm: 16500,
      fuelCutRpm: 17100,
      engineInertiaKgM2: 0.037,
      wheelInertiaKgM2: 1.65,
      rollingRadiusM: 0.310,
      dragAreaM2: 0.34,
      frictionNm: 2.0,
      frictionNmPerRadPerSecond: 0.0034,
      pumpingNmPerRadPerSecond: 0.0052,
      clutchCapacityNm: 95,
      slipperCapacityNm: 47,
      clutchDampingNmPerRadPerSecond: 0.95,
    },
  },
  {
    id: "yamaha-r7",
    brand: "Yamaha",
    name: "YZF-R7",
    version: "2026 台灣版",
    displacementCc: 689,
    engine: "CP2 雙缸",
    gears: 6,
    source: "https://www.yamaha-motor.com.tw/news/news-202603-70-anniversary-edition",
    geometry: {
      boreM: 0.08,
      strokeM: 0.0686,
      rodLengthM: 0.121,
      cylinderSpacingM: 0.097,
      intakeLiftM: 0.0078,
      exhaustLiftM: 0.0072,
    },
    audio: {
      firingAnglesRad: [0, 1.5 * Math.PI],
      exhaustFrequencyHz: 112,
      pulseDecayMs: 12.5,
      exhaustBody: { frequencyHz: 148, decayMs: 14, gain: 0.86, runnerImbalance: 0.08 },
      exhaustReflectionMs: 4.5,
      brightnessStartRpm: 5500,
      brightnessMaxRpm: 10000,
    },
    physics: {
      curbMassKg: 189,
      gearRatios: [37 / 13, 34 / 16, 31 / 19, 26 / 20, 24 / 22, 27 / 28],
      primaryRatio: 77 / 40,
      finalDriveRatio: 42 / 16,
      peakTorqueNm: 6.9 * 9.80665,
      peakTorqueRpm: 6500,
      peakPowerPs: 73.4,
      peakPowerRpm: 8750,
      idleRpm: 1250,
      referenceRpm: 10500,
      fuelCutRpm: 10900,
      engineInertiaKgM2: 0.055,
      wheelInertiaKgM2: 1.55,
      rollingRadiusM: 0.310,
      dragAreaM2: 0.39,
      frictionNm: 2.1,
      frictionNmPerRadPerSecond: 0.0035,
      pumpingNmPerRadPerSecond: 0.0054,
      clutchCapacityNm: 98,
      slipperCapacityNm: 50,
      clutchDampingNmPerRadPerSecond: 1,
    },
  },
  {
    id: "yamaha-r9",
    brand: "Yamaha",
    name: "YZF-R9",
    version: "2026 歐規全功率版",
    displacementCc: 890,
    engine: "CP3 三缸",
    gears: 6,
    source: "https://www.yamaha-motor.eu/al/en/motorcycles/supersport/pdp/r9-2026/",
    geometry: {
      boreM: 0.078,
      strokeM: 0.0621,
      rodLengthM: 0.115,
      cylinderSpacingM: 0.091,
      intakeLiftM: 0.0085,
      exhaustLiftM: 0.0078,
    },
    audio: {
      firingAnglesRad: [0, 4 * Math.PI / 3, 8 * Math.PI / 3],
      exhaustFrequencyHz: 188,
      pulseDecayMs: 9,
      exhaustBody: { frequencyHz: 216, decayMs: 12.2, gain: 0.90, runnerImbalance: 0.15 },
      exhaustReflectionMs: 3.6,
      brightnessStartRpm: 6500,
      brightnessMaxRpm: 10500,
    },
    physics: {
      curbMassKg: 195,
      gearRatios: [36 / 14, 37 / 19, 34 / 21, 29 / 21, 25 / 21, 28 / 27],
      primaryRatio: 79 / 47,
      finalDriveRatio: 43 / 16,
      peakTorqueNm: 93,
      peakTorqueRpm: 7000,
      peakPowerPs: 119,
      peakPowerRpm: 10000,
      idleRpm: 1250,
      referenceRpm: 10500,
      fuelCutRpm: 11000,
      engineInertiaKgM2: 0.064,
      wheelInertiaKgM2: 1.65,
      rollingRadiusM: 0.310,
      dragAreaM2: 0.41,
      frictionNm: 2.4,
      frictionNmPerRadPerSecond: 0.0036,
      pumpingNmPerRadPerSecond: 0.006,
      clutchCapacityNm: 140,
      slipperCapacityNm: 62,
      clutchDampingNmPerRadPerSecond: 1.2,
    },
  },
  {
    id: "yamaha-r1",
    brand: "Yamaha",
    name: "YZF-R1",
    version: "2020 日規道路版",
    displacementCc: 997,
    engine: "CP4 十字曲軸",
    gears: 6,
    source: "https://global.yamaha-motor.com/jp/news/2020/0528/yzf-r1.html",
    geometry: {
      boreM: 0.079,
      strokeM: 0.0509,
      rodLengthM: 0.105,
      cylinderSpacingM: 0.091,
      intakeLiftM: 0.009,
      exhaustLiftM: 0.008,
      cylinderFiringAnglesRad: [0, 2.5 * Math.PI, 1.5 * Math.PI, 3 * Math.PI],
    },
    audio: {
      firingAnglesRad: [0, 1.5 * Math.PI, 2.5 * Math.PI, 3 * Math.PI],
      exhaustFrequencyHz: 151,
      pulseDecayMs: 9.5,
      exhaustBody: { frequencyHz: 169, decayMs: 13, gain: 0.92, runnerImbalance: 0.12 },
      exhaustReflectionMs: 3.9,
      brightnessStartRpm: 7500,
      brightnessMaxRpm: 13500,
    },
    physics: {
      curbMassKg: 201,
      gearRatios: [2.600, 2.176, 1.842, 1.578, 1.380, 1.250],
      primaryRatio: 67 / 41,
      finalDriveRatio: 41 / 16,
      lowRpmTorqueRatio: 0.39,
      peakTorqueNm: 113,
      peakTorqueRpm: 11500,
      peakPowerPs: 200,
      peakPowerRpm: 13500,
      idleRpm: 1250,
      referenceRpm: 14000,
      fuelCutRpm: 14500,
      engineInertiaKgM2: 0.061,
      wheelInertiaKgM2: 1.75,
      rollingRadiusM: 0.316,
      dragAreaM2: 0.40,
      frictionNm: 2.7,
      frictionNmPerRadPerSecond: 0.0043,
      pumpingNmPerRadPerSecond: 0.0066,
      clutchCapacityNm: 170,
      slipperCapacityNm: 76,
      clutchDampingNmPerRadPerSecond: 1.4,
    },
  },
] as const satisfies readonly Vehicle[];

const [r15, r3, r6, r7, r9, r1] = yamahaBase;
const r1Race = defineTrim(r1, {
  id: "yamaha-r1-race", name: "YZF-R1 RACE", version: "2025 歐規・賽道",
  source: "https://www.yamaha-motor.eu/gb/en/motorcycles/supersport/pdp/r1-race/", curbMassKg: 201,
});

export const vehicles = [
  r15, r3,
  defineTrim(r15, {
    id: "yamaha-r15m", name: "YZF-R15M", version: "2026 台灣版",
    source: r15.source, curbMassKg: 141,
  }),
  r6, r7, r9, r1,
  defineTrim(r6, {
    id: "yamaha-r6-gytr", name: "YZF-R6 GYTR", version: "2026 歐規・賽道",
    source: "https://www.yamaha-motor.eu/content/dam/yme/language-masters/en/eicma-2025/digital-brochures/2026_EICMA_MC_BROCHURE_EN.pdf",
    curbMassKg: 185,
  }),
  defineTrim(r1, {
    id: "yamaha-r1m", name: "YZF-R1M", version: "2023 日規道路版",
    source: "https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r1_2023.pdf", curbMassKg: 202, rollingRadiusM: 0.322,
  }),
  r1Race,
  defineTrim(r1Race, {
    id: "yamaha-r1-gytr", name: "YZF-R1 GYTR", version: "2026 歐規・賽道",
    source: "https://www.yamaha-motor.eu/is/en/motorcycles/supersport/pdp/r1-gytr/", curbMassKg: 201,
  }),
  ...moreYamahaVehicles,
  ...kawasakiVehicles,
  ...moreKawasakiVehicles,
  ...apriliaVehicles,
  ...ducatiVehicles,
  ...suzukiVehicles,
  ...hondaVehicles,
  ...bmwVehicles,
] as const satisfies readonly Vehicle[];
