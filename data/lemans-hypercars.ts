import { defineCar } from "./car-model.ts";
import type { Vehicle } from "./vehicles.ts";

const kilowattsToPs = 1000 / 735.49875;
const evenV6 = [0, 120, 240, 360, 480, 600] as const;
const evenV12 = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660] as const;
// Front MGU deployment speed comes from the 2025 Le Mans BoP. Usable charge and recovery are estimates.
const frontErs = { peakPowerKw: 200, capacityKj: 4000, regenPowerKw: 200, minDeploymentKmh: 190 };

// FIA WEC D29, Le Mans 2025: minimum dry mass and power below 250 km/h.
// Long gearing and effective drag approximate the 2025 Le Mans speed traps.
// Piston geometry where unpublished, inertia, RPM cutoffs and sound are estimates.
export const leMansHypercars: readonly Vehicle[] = [
  defineCar({
    kind: "endurance", id: "ferrari-499p", brand: "Ferrari", name: "499P", version: "2025 Le Mans・LMH",
    engine: "F163 120° 雙渦輪 V6・前軸 ERS", displacementCc: 2992,
    source: "https://www.24h-lemans.com/en/news/24-hours-of-le-mans-ferrari-unveils-the-499p-hypercar-56769",
    cylinderDimensionsMm: [88, 82, 142], bankAngleDegrees: 120, firingDegrees: evenV6,
    exhaustBanks: [0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 148, pulseDecayMs: 5.4, runnerImbalance: 0.08,
    turbocharger: { maxBoostBar: 1.4, spoolStartRpm: 3550, turbineCount: 2, releaseStyle: "subtle" },
    physics: {
      curbMassKg: 1042, gearRatios: [3.38, 2.48, 1.97, 1.62, 1.36, 1.17, 0.83], finalDriveRatio: 3.70,
      // ACO 2023 entry dossier supplies the reference combustion torque and RPM curve anchors.
      peakTorqueNm: 755, peakTorqueRpm: 6500, peakPowerPs: 707, peakPowerRpm: 7350,
      idleRpm: 1750, referenceRpm: 9000, fuelCutRpm: 9200, lowRpmTorqueRatio: 0.28,
      engineInertiaKgM2: 0.132, wheelInertiaKgM2: 6.2, rollingRadiusM: 0.351, dragAreaM2: 0.81,
      downforceAreaM2: 2.86, maxDriveAccelerationG: 1.2, maxBrakeAccelerationG: 1.46, drivelineEfficiency: 0.93,
      hybridAssist: { ...frontErs, totalPowerCapKw: 515 },
    },
  }),
  defineCar({
    kind: "endurance", id: "toyota-gr010-hybrid", brand: "Toyota", name: "GR010 Hybrid", version: "2025 Le Mans・LMH",
    engine: "90° 雙渦輪 V6・前軸 ERS", displacementCc: 3500,
    source: "https://toyotagazooracing.com/wec/cars/2025/",
    cylinderDimensionsMm: [92, 87.75, 145], bankAngleDegrees: 90, firingDegrees: evenV6,
    exhaustBanks: [0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 121, pulseDecayMs: 6.8, runnerImbalance: 0.15,
    turbocharger: { maxBoostBar: 1.28, spoolStartRpm: 3230, turbineCount: 2, releaseStyle: "subtle" },
    physics: {
      curbMassKg: 1053, gearRatios: [3.54, 2.58, 2.05, 1.69, 1.43, 1.23, 1.04], finalDriveRatio: 3.61,
      // The 2023 entrant dossier reports 9,500 RPM at rated power and leaves peak torque unpublished.
      peakTorqueNm: 665, peakTorqueRpm: 6650, peakPowerPs: 520 * kilowattsToPs, peakPowerRpm: 9500,
      idleRpm: 1850, referenceRpm: 9800, fuelCutRpm: 10000, lowRpmTorqueRatio: 0.29,
      engineInertiaKgM2: 0.153, wheelInertiaKgM2: 6.2, rollingRadiusM: 0.35, dragAreaM2: 0.855,
      downforceAreaM2: 2.96, maxDriveAccelerationG: 1.2, maxBrakeAccelerationG: 1.46, drivelineEfficiency: 0.93,
      hybridAssist: { ...frontErs, totalPowerCapKw: 520 },
    },
  }),
  defineCar({
    kind: "endurance", id: "aston-martin-valkyrie-lmh", brand: "Aston Martin", name: "Valkyrie AMR-LMH", version: "2025 Le Mans・LMH",
    engine: "Cosworth 65° 自然進氣 V12", displacementCc: 6500,
    source: "https://media.astonmartin.com/valkyrie-takes-the-ultimate-hypercar-from-the-road-to-the-track-as-new-quest-for-le-mans-glory-begins/?lang=eng",
    // Road-engine geometry and firing order are used as proxies for the related race engine.
    cylinderDimensionsMm: [98, 71.8, 152], bankAngleDegrees: 65, firingDegrees: evenV12,
    cylinderFiringDegrees: [0, 120, 240, 600, 480, 360, 60, 180, 300, 660, 540, 420],
    exhaustBanks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], exhaustFrequencyHz: 238, pulseDecayMs: 4.6, runnerImbalance: 0.06,
    physics: {
      curbMassKg: 1030, gearRatios: [3.42, 2.46, 1.94, 1.61, 1.36, 1.18, 0.983], finalDriveRatio: 3.69,
      peakTorqueNm: 625, peakTorqueRpm: 7000, peakPowerPs: 520 * kilowattsToPs, peakPowerRpm: 8900,
      idleRpm: 1550, referenceRpm: 9300, fuelCutRpm: 9600, lowRpmTorqueRatio: 0.37,
      engineInertiaKgM2: 0.177, wheelInertiaKgM2: 6.2, rollingRadiusM: 0.35, dragAreaM2: 0.835,
      downforceAreaM2: 2.98, maxDriveAccelerationG: 1.2, maxBrakeAccelerationG: 1.45, drivelineEfficiency: 0.93,
      // The launch starter is documented. Its kW, capacity and handoff speed are unpublished.
      electricDrive: { motorPowerKw: 20, launchTorqueNm: 650, batteryCapacityKwh: 0.35, engineStartKmh: 15, regenPowerKw: 0 },
    },
  }),
];
