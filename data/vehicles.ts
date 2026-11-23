export interface Vehicle {
  readonly id: string;
  readonly name: string;
  readonly displacementCc: number;
  readonly engine: string;
  readonly gears: number;
  readonly source: string;
  readonly geometry: {
    readonly boreM: number;
    readonly strokeM: number;
    readonly rodLengthM: number;
    readonly cylinderSpacingM: number;
    readonly intakeLiftM: number;
    readonly exhaustLiftM: number;
    readonly vva?: { readonly switchRpm: number | null; readonly highIntakeLiftM: number };
  };
  readonly audio: {
    readonly firingAnglesRad: readonly number[];
    readonly exhaustFrequencyHz: number;
    readonly intakeFrequencyHz: number;
    readonly mechanicalFrequencyHz: number;
    readonly pulseDecayMs: number;
  };
  readonly physics: {
    readonly curbMassKg: number;
    readonly gearRatios: readonly number[];
    readonly primaryRatio: number;
    readonly finalDriveRatio: number;
    readonly peakTorqueNm: number;
    readonly peakTorqueRpm: number;
    readonly peakPowerPs: number;
    readonly peakPowerRpm: number;
    readonly idleRpm: number;
    readonly referenceRpm: number;
    readonly fuelCutRpm: number;
    readonly engineInertiaKgM2: number;
    readonly wheelInertiaKgM2: number;
    readonly rollingRadiusM: number;
    readonly rearGripCoefficient: number;
    readonly dragAreaM2: number;
    readonly frictionNm: number;
    readonly frictionNmPerRadPerSecond: number;
    readonly pumpingNmPerRadPerSecond: number;
    readonly clutchCapacityNm: number;
    readonly slipperCapacityNm: number;
    readonly clutchDampingNmPerRadPerSecond: number;
  };
}

// 台規數值、日規暫用傳動比與近似值的證據分級見 docs/SOURCES.md。
export const vehicles = [
  {
    id: "yamaha-r15",
    name: "YZF-R15",
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
      intakeFrequencyHz: 440,
      mechanicalFrequencyHz: 960,
      pulseDecayMs: 11,
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
      engineInertiaKgM2: 0.027,
      wheelInertiaKgM2: 1.15,
      rollingRadiusM: 0.305,
      rearGripCoefficient: 0.9,
      dragAreaM2: 0.36,
      frictionNm: 0.8,
      frictionNmPerRadPerSecond: 0.0018,
      pumpingNmPerRadPerSecond: 0.0032,
      clutchCapacityNm: 17,
      slipperCapacityNm: 9,
      clutchDampingNmPerRadPerSecond: 0.38,
    },
  },
  {
    id: "yamaha-r3",
    name: "YZF-R3",
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
      intakeFrequencyHz: 520,
      mechanicalFrequencyHz: 1180,
      pulseDecayMs: 8,
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
      engineInertiaKgM2: 0.050,
      wheelInertiaKgM2: 1.35,
      rollingRadiusM: 0.305,
      rearGripCoefficient: 0.9,
      dragAreaM2: 0.39,
      frictionNm: 1.25,
      frictionNmPerRadPerSecond: 0.0026,
      pumpingNmPerRadPerSecond: 0.0050,
      clutchCapacityNm: 33,
      slipperCapacityNm: 16,
      clutchDampingNmPerRadPerSecond: 0.50,
    },
  },
] as const satisfies readonly Vehicle[];
