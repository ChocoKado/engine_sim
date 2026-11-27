import type { Vehicle } from "../data/vehicles";
import { advanceTransmission, getOverallRatio, INITIAL_TRANSMISSION_STATE } from "./transmission.ts";
import type { ShiftMode, TransmissionState } from "./transmission.ts";

export const FIXED_STEP_SECONDS = 1 / 120;
export const PIT_SPEED_LIMIT_KMH = 60;
export const PIT_EXIT_LENGTH_M = 110;
export const PIT_ENTRY_LENGTH_M = 55;
const MAX_FRAME_SECONDS = 0.1;
const RAD_PER_REVOLUTION = 2 * Math.PI;
const RAD_PER_ENGINE_CYCLE = 2 * RAD_PER_REVOLUTION;
const GRAVITY_MPS2 = 9.80665;
const OPERATOR_MASS_KG = 75;
const ROLLING_RESISTANCE = 0.015;
const AIR_DENSITY_KG_M3 = 1.225;
const WATTS_PER_METRIC_HP = 735.49875;
const FUEL_CUT_WINDOW_RPM = 220;
const SPEED_LIMIT_WINDOW_KMH = 0.5;

export type EnginePhase = "off" | "electric" | "cranking" | "running";
export type PitZone = "box" | "exit" | "track" | "entry" | null;

export interface PerformanceTimer {
  readonly armed: boolean;
  readonly running: boolean;
  readonly elapsedSeconds: number;
  readonly distanceM: number;
  readonly zeroTo100Seconds: number | null;
  readonly zeroTo200Seconds: number | null;
  readonly quarterMileSeconds: number | null;
  readonly quarterMileSpeedKmh: number | null;
}

export const INITIAL_PERFORMANCE_TIMER: PerformanceTimer = {
  armed: true,
  running: false,
  elapsedSeconds: 0,
  distanceM: 0,
  zeroTo100Seconds: null,
  zeroTo200Seconds: null,
  quarterMileSeconds: null,
  quarterMileSpeedKmh: null,
};

export interface SimulationInput {
  readonly engineOn: boolean;
  readonly shiftMode: ShiftMode;
  readonly throttle: number;
  readonly brake: number;
  readonly roadSpeedLimitDisabled: boolean;
  readonly pitReturn?: boolean;
  readonly rotaryLope?: boolean;
  readonly launchControl?: boolean;
}

export interface SimulationState extends SimulationInput, TransmissionState {
  readonly vehicleId: string;
  readonly pitZone: PitZone;
  readonly pitDistanceM: number;
  readonly pitAwaitingPowerOff: boolean;
  readonly powerOn: boolean;
  readonly enginePhase: EnginePhase;
  readonly crankingSeconds: number;
  readonly runningSeconds: number;
  readonly engineWarmth: number;
  readonly idleTargetRpm: number;
  readonly starter: number;
  readonly electricEnergyKj: number;
  readonly electricPowerKw: number;
  readonly motorAngularVelocity: number;
  readonly motorLoad: number;
  readonly engineAngularVelocity: number;
  readonly wheelAngularVelocity: number;
  readonly vehicleSpeed: number;
  readonly crankAngleRad: number;
  readonly superchargerAngularVelocity: number;
  readonly superchargerAngleRad: number;
  readonly turboBoostBar: number;
  readonly turboRelease: number;
  readonly hybridEnergyKj: number;
  readonly hybridPowerKw: number;
  readonly engineTorqueNm: number;
  readonly combustionTorqueNm: number;
  readonly shiftCut: number;
  readonly revMatchThrottle: number;
  readonly vtecEngagement: number;
  readonly vvaEngagement: number;
  readonly limiterCut: boolean;
  readonly launchActive: boolean;
  readonly lopePhaseRad: number;
  readonly perfTimer: PerformanceTimer;
  readonly drivetrainTorqueNm: number;
  readonly clutchSlipRadPerSecond: number;
  readonly mechanicalOverRev: boolean;
  readonly overRevSeconds: number;
  readonly peakOverRevRpm: number;
  readonly damageExposure: number;
  readonly engineFailed: boolean;
}

export const INITIAL_SIMULATION_INPUT: SimulationInput = {
  engineOn: false,
  shiftMode: "MT",
  throttle: 0,
  brake: 0,
  roadSpeedLimitDisabled: false,
};

export function createSimulationState(vehicle: Vehicle): SimulationState {
  return {
    ...INITIAL_SIMULATION_INPUT,
    ...INITIAL_TRANSMISSION_STATE,
    shiftMode: vehicle.kind === "endurance" || vehicle.physics.electricDrive ? "AT" : INITIAL_SIMULATION_INPUT.shiftMode,
    vehicleId: vehicle.id,
    pitZone: vehicle.kind === "endurance" ? "box" : null,
    pitDistanceM: 0,
    pitAwaitingPowerOff: false,
    powerOn: false,
    enginePhase: "off",
    crankingSeconds: 0,
    runningSeconds: 0,
    engineWarmth: 0,
    idleTargetRpm: vehicle.physics.idleRpm,
    starter: 0,
    electricEnergyKj: (vehicle.physics.electricDrive?.batteryCapacityKwh ?? 0) * 3600,
    electricPowerKw: 0,
    motorAngularVelocity: 0,
    motorLoad: 0,
    engineAngularVelocity: 0,
    wheelAngularVelocity: 0,
    vehicleSpeed: 0,
    crankAngleRad: 0,
    superchargerAngularVelocity: 0,
    superchargerAngleRad: 0,
    turboBoostBar: 0,
    turboRelease: 0,
    hybridEnergyKj: vehicle.physics.hybridAssist?.capacityKj ?? 0,
    hybridPowerKw: 0,
    engineTorqueNm: 0,
    combustionTorqueNm: 0,
    shiftCut: 0,
    revMatchThrottle: 0,
    vtecEngagement: 0,
    vvaEngagement: 0,
    limiterCut: false,
    launchActive: false,
    lopePhaseRad: 0,
    perfTimer: INITIAL_PERFORMANCE_TIMER,
    drivetrainTorqueNm: 0,
    clutchSlipRadPerSecond: 0,
    mechanicalOverRev: false,
    overRevSeconds: 0,
    peakOverRevRpm: 0,
    damageExposure: 0,
    engineFailed: false,
  };
}

export function rpmFromRadiansPerSecond(angularVelocity: number): number {
  return angularVelocity * 60 / RAD_PER_REVOLUTION;
}

function radiansPerSecondFromRpm(rpm: number): number {
  return rpm * RAD_PER_REVOLUTION / 60;
}

function unitInterval(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function advanceIgnition(state: SimulationState, input: SimulationInput, vehicle: Vehicle, rpm: number, roadSpeed: number) {
  const { physics } = vehicle;
  const electric = physics.electricDrive;
  const powerOn = input.engineOn && !state.engineFailed && !state.pitAwaitingPowerOff;
  const manualNeutralStart = input.shiftMode === "MT" && state.gear === 0 && input.throttle > 0.12;
  const canStart = powerOn && (!electric || state.engineOn || state.enginePhase === "cranking"
    || roadSpeed * 3.6 >= electric.engineStartKmh || state.electricEnergyKj <= 4 || manualNeutralStart);
  const crankTime = electric ? 0.24 : 0.34 + 0.14 * (1 - state.engineWarmth);
  const engineOn = canStart && (state.engineOn || state.crankingSeconds >= crankTime || rpm >= 0.8 * physics.idleRpm);
  const cranking = canStart && !engineOn;
  const enginePhase: EnginePhase = engineOn ? "running" : cranking ? "cranking" : powerOn ? "electric" : "off";
  const dt = FIXED_STEP_SECONDS;
  const runningSeconds = engineOn ? Math.min(3, state.runningSeconds + dt) : 0;
  const warmupSeconds = vehicle.kind ? 33 : 24;
  const engineWarmth = unitInterval(state.engineWarmth + dt * (engineOn ? (1 + 0.35 * input.throttle) / warmupSeconds : -1 / 220));
  const coldIdleRaise = vehicle.kind ? Math.min(610, physics.idleRpm * 0.61) : 275;
  const holdEnd = vehicle.kind ? 0.24 : 0.14;
  const coldIdleFactor = unitInterval((1 - engineWarmth) / (1 - holdEnd)) ** 1.3;
  const catchFlare = engineOn && runningSeconds < 3
    ? (170 + 110 * (1 - engineWarmth)) * (Math.exp(-runningSeconds / 0.65) - Math.exp(-3 / 0.65)) : 0;
  const idleTargetRpm = physics.idleRpm + coldIdleRaise * coldIdleFactor + catchFlare;
  const crankingRpm = electric ? Math.min(1250, physics.idleRpm * 0.68) : Math.min(320, physics.idleRpm * 0.36);

  return {
    engineOn, powerOn, enginePhase, runningSeconds, engineWarmth, idleTargetRpm, crankingRpm,
    crankingSeconds: cranking ? state.crankingSeconds + dt : 0,
    starter: cranking ? 1 : 0,
  };
}

function advanceElectricDrive(
  state: SimulationState, electric: Vehicle["physics"]["electricDrive"], powerOn: boolean, gear: number,
  roadSpeed: number, throttle: number, brake: number, brakeForce: number, wheelRadius: number, driveForceLimit: number,
  coupling: number, combustionScale: number,
) {
  const energy = state.electricEnergyKj;
  if (!electric || !powerOn || gear <= 0) return { torqueNm: 0, electricPowerKw: 0, electricEnergyKj: energy, motorLoad: 0 };
  const dt = FIXED_STEP_SECONDS;
  const capacityKj = electric.batteryCapacityKwh * 3600;
  const regenPowerKw = electric.regenPowerKw ?? electric.motorPowerKw;
  if (brakeForce > 0 && (throttle <= 0.15 || brake >= throttle * 0.5)) {
    const recoverKw = Math.min(regenPowerKw, 0.76 * brakeForce * roadSpeed / 1000, (capacityKj - energy) / dt);
    return { torqueNm: 0, electricPowerKw: -recoverKw, electricEnergyKj: energy + recoverKw * dt,
      motorLoad: -Math.min(1, recoverKw / electric.motorPowerKw) };
  }
  if (regenPowerKw > 0 && throttle <= 0.06 && brake === 0 && coupling >= 0.9 && roadSpeed > 12) {
    const speedFactor = unitInterval((roadSpeed - 12) / 35);
    const overrunKw = Math.min(0.28 * regenPowerKw * speedFactor, (capacityKj - energy) / dt);
    const dragTorqueNm = -overrunKw * 1000 * wheelRadius / roadSpeed;
    return { torqueNm: dragTorqueNm, electricPowerKw: -overrunKw, electricEnergyKj: energy + overrunKw * dt,
      motorLoad: -Math.min(1, overrunKw / electric.motorPowerKw) };
  }

  const powerSpeed = Math.max(0.7, roadSpeed);
  const driveDemand = throttle * (1 - 0.5 * brake) * (1 - coupling);
  const powerKw = Math.min(energy / dt, electric.motorPowerKw) * driveDemand * combustionScale;
  const force = Math.min(electric.launchTorqueNm / wheelRadius * driveDemand,
    powerKw * 1000 / powerSpeed, driveForceLimit);
  const electricPowerKw = force * powerSpeed / 1000;
  return { torqueNm: force * wheelRadius, electricPowerKw, electricEnergyKj: Math.max(0, energy - electricPowerKw * dt),
    motorLoad: force * wheelRadius / electric.launchTorqueNm };
}

export function targetLaunchRpm(vehicle: Vehicle): number {
  const { idleRpm, peakTorqueRpm, referenceRpm } = vehicle.physics;
  if (vehicle.kind === "formula1") return Math.round(Math.min(referenceRpm * 0.72, Math.max(8500, peakTorqueRpm * 0.86)));
  if (vehicle.kind === "endurance") return Math.round(Math.min(referenceRpm * 0.64, Math.max(4500, peakTorqueRpm * 0.78)));
  if (vehicle.kind === "car") return Math.round(Math.min(referenceRpm * 0.62, Math.max(idleRpm + 2900, Math.min(5400, peakTorqueRpm * 0.92))));
  if (vehicle.twoStroke) return Math.round(Math.max(7200, vehicle.twoStroke.powerbandStartRpm));
  return Math.round(Math.min(referenceRpm * 0.64, Math.max(5800, peakTorqueRpm * 0.76)));
}

function advanceTurbo(
  state: SimulationState, vehicle: Vehicle, rpm: number, throttle: number, shiftCut: number, inGear: boolean, antiLagActive: boolean,
) {
  const turbo = vehicle.turbocharger;
  if (!turbo) return { turboBoostBar: 0, turboRelease: 0 };
  const spoolStartRpm = turbo.spoolStartRpm ?? vehicle.physics.idleRpm + 500;
  const fullBoostRpm = Math.max(spoolStartRpm + 850, vehicle.physics.peakTorqueRpm);
  const flow = antiLagActive
    ? unitInterval((rpm - spoolStartRpm * 0.75) / Math.max(800, (fullBoostRpm - spoolStartRpm) * 0.65))
    : unitInterval((rpm - spoolStartRpm) / (fullBoostRpm - spoolStartRpm));
  const opening = antiLagActive ? Math.max(throttle, 0.92) : throttle * (1 - shiftCut);
  const loadFactor = antiLagActive ? 0.94 : inGear ? 1 : 0.44;
  const target = turbo.maxBoostBar * flow * opening ** 1.4 * loadFactor;
  const pressure = state.turboBoostBar;
  const releaseStarts = !antiLagActive && state.throttle * (1 - state.shiftCut) >= 0.48 && opening < 0.48 && pressure >= 0.12;
  const spoolTau = antiLagActive ? 0.11 : inGear ? 0.24 : 0.16;
  const decay = target > pressure ? spoolTau : opening < 0.45 ? 0.070 : 0.18;
  const fullReleasePressure = Math.max(0.28, Math.min(0.78, turbo.maxBoostBar * 0.58));
  return {
    turboBoostBar: pressure + (target - pressure) * (1 - Math.exp(-FIXED_STEP_SECONDS / decay)),
    turboRelease: releaseStarts
      ? Math.min(1, pressure / fullReleasePressure)
      : state.turboRelease * Math.exp(-FIXED_STEP_SECONDS / 0.082),
  };
}

export function engineFullThrottleTorqueAtRpm(rpm: number, vehicle: Vehicle): number {
  const { physics, geometry, twoStroke } = vehicle;
  let baseTorque: number;
  if (rpm <= physics.peakTorqueRpm) {
    const lowRpmRatio = physics.lowRpmTorqueRatio ?? 0.44;
    const progress = Math.max(0, rpm / physics.peakTorqueRpm);
    baseTorque = physics.peakTorqueNm * (lowRpmRatio + (1 - lowRpmRatio) * progress ** 1.4);
  } else {
    const torqueAtPeakPower = physics.peakPowerPs * WATTS_PER_METRIC_HP
      / radiansPerSecondFromRpm(physics.peakPowerRpm);
    const peakTorqueEndRpm = physics.peakTorqueEndRpm ?? physics.peakTorqueRpm;
    if (rpm <= peakTorqueEndRpm) {
      baseTorque = physics.peakTorqueNm;
    } else if (rpm > physics.peakPowerRpm) {
      const overPeak = unitInterval((rpm - physics.peakPowerRpm) / Math.max(200, physics.fuelCutRpm - physics.peakPowerRpm));
      baseTorque = torqueAtPeakPower * (physics.peakPowerRpm / rpm) * (1 - 0.12 * overPeak ** 2);
    } else {
      const progress = unitInterval((rpm - peakTorqueEndRpm) / Math.max(100, physics.peakPowerRpm - peakTorqueEndRpm));
      baseTorque = physics.peakTorqueNm + (torqueAtPeakPower - physics.peakTorqueNm) * progress;
    }
  }

  // Two-stroke expansion-chamber scavenging: docile below the pipe, steep resonant surge into the powerband.
  if (twoStroke) {
    const pipeProgress = unitInterval((rpm - twoStroke.powerbandStartRpm + 900) / Math.max(900, twoStroke.powerbandPeakRpm - twoStroke.powerbandStartRpm + 900));
    const smoothPipe = pipeProgress * pipeProgress * (3 - 2 * pipeProgress);
    baseTorque *= 0.56 + 0.44 * smoothPipe;
  }

  const vtec = geometry.vtec;
  if (vtec) {
    const highCam = unitInterval((rpm - vtec.switchRpm + 80) / 160);
    const lowCamDip = physics.peakTorqueRpm < vtec.switchRpm ? unitInterval((rpm - vtec.switchRpm + 80) / 320) : 1;
    baseTorque *= 1 - 0.10 * lowCamDip * (1 - highCam);
  }
  return baseTorque;
}

export function stepSimulation(state: SimulationState, input: SimulationInput, vehicle: Vehicle): SimulationState {
  const { physics } = vehicle;
  const radius = physics.rollingRadiusM;
  const throttle = unitInterval(input.throttle);
  const brake = unitInterval(input.brake);
  const dt = FIXED_STEP_SECONDS;
  const engineSpeed = state.engineAngularVelocity;
  const wheelSpeed = state.wheelAngularVelocity;
  const roadSpeed = wheelSpeed * radius;
  const roadSpeedKmh = roadSpeed * 3.6;
  const rpm = rpmFromRadiansPerSecond(engineSpeed);
  const ignition = advanceIgnition(state, input, vehicle, rpm, roadSpeed);
  const { powerOn, engineOn } = ignition;
  let pitZone = state.pitZone;
  if (pitZone === "box" && powerOn) pitZone = "exit";
  else if (pitZone === "track" && input.pitReturn && roadSpeedKmh <= PIT_SPEED_LIMIT_KMH) pitZone = "entry";
  const hotIdleSpeed = radiansPerSecondFromRpm(physics.idleRpm);
  const idleSpeed = radiansPerSecondFromRpm(ignition.idleTargetRpm);
  // Launch Control (2-Step): holds engine at optimal launch RPM when stationary in Neutral or Brake+Throttle in 1st.
  const launchHold = Boolean(
    input.launchControl && engineOn && throttle >= 0.45 && roadSpeed < 0.65
      && (state.gear === 0 || (state.gear === 1 && brake >= 0.25)),
  );
  const transmissionBrake = launchHold && input.shiftMode === "AT" && state.gear === 0 && brake >= 0.25 ? 0 : brake;
  const { transmission, clutchScale: rawClutchScale, combustionScale, revMatchRpm } = advanceTransmission(state, {
    engineOn: physics.electricDrive ? powerOn : engineOn,
    shiftMode: input.shiftMode,
    throttle,
    brake: transmissionBrake,
    engineRpm: rpm,
    wheelAngularVelocity: wheelSpeed,
    vehicleSpeed: roadSpeed,
  }, vehicle, dt);
  const clutchScale = launchHold && brake >= 0.25 ? 0 : rawClutchScale;
  const { gear } = transmission;
  const ratio = getOverallRatio(vehicle, gear);
  const mass = physics.curbMassKg + OPERATOR_MASS_KG;
  const efficiency = physics.drivelineEfficiency ?? 1;
  const airflowPressure = 0.5 * AIR_DENSITY_KG_M3 * roadSpeed ** 2;
  const weight = mass * GRAVITY_MPS2;
  const normalForce = weight + airflowPressure * (physics.downforceAreaM2 ?? 0);
  const brakeForce = brake * (physics.maxBrakeAccelerationG ?? 0.72) * normalForce;
  const driveForceLimit = (physics.maxDriveAccelerationG ?? Infinity) * normalForce;
  const matchedEngineSpeed = wheelSpeed * ratio;

  const friction = physics.frictionNm + physics.frictionNmPerRadPerSecond * engineSpeed;
  const closedThrottle = 1 - throttle;
  const pumping = closedThrottle * physics.pumpingNmPerRadPerSecond * engineSpeed;
  // The unloaded coast-down is calibrated separately from in-gear engine braking.
  const neutralOverrun = gear === 0 ? unitInterval((engineSpeed - hotIdleSpeed) / (2 * hotIdleSpeed)) : 0;
  const unloadedDrag = 4 * pumping * closedThrottle * neutralOverrun;
  const engineLoss = friction + pumping + unloadedDrag;
  const gearFuelCutRpm = physics.gearFuelCutRpm?.[gear];
  const launchCeilingRpm = targetLaunchRpm(vehicle);
  const fuelCutRpm = launchHold ? launchCeilingRpm : (gearFuelCutRpm ?? physics.fuelCutRpm);
  const allowLimiterBounce = engineOn && throttle > 0.35 && (launchHold || gear === 0 || input.shiftMode === "MT" || gear <= 3);
  const limiterBandRpm = launchHold ? 155 : Math.min(330, Math.max(175, fuelCutRpm * 0.023));
  const limiterCut = allowLimiterBounce
    ? (rpm >= fuelCutRpm - 18 || (state.limiterCut && rpm > fuelCutRpm - limiterBandRpm))
    : false;
  const revFuel = allowLimiterBounce
    ? (limiterCut ? 0 : 1)
    : unitInterval((fuelCutRpm - rpm) / FUEL_CUT_WINDOW_RPM);
  const roadLimit = input.roadSpeedLimitDisabled ? Infinity : (physics.speedLimitKmh ?? Infinity);
  const speedLimit = pitZone === "exit" || pitZone === "entry" ? Math.min(PIT_SPEED_LIMIT_KMH, roadLimit) : roadLimit;
  const roadFuel = unitInterval((speedLimit - roadSpeedKmh) / SPEED_LIMIT_WINDOW_KMH);
  const vtec = vehicle.geometry.vtec;
  const vva = vehicle.geometry.vva;
  const vvaHigh = vva && vva.switchRpm !== null && engineOn ? unitInterval((rpm - vva.switchRpm + 90) / 180) : 0;
  const highCam = vtec && engineOn ? unitInterval((rpm - vtec.switchRpm + 80) / 160)
    * unitInterval((throttle - 0.2) / 0.28) * unitInterval((ignition.engineWarmth - 0.08) / 0.20) : 0;
  const rawWotTorque = engineFullThrottleTorqueAtRpm(rpm, vehicle);
  const lowCamDip = vtec
    ? (physics.peakTorqueRpm < vtec.switchRpm ? unitInterval((rpm - vtec.switchRpm + 80) / 320) : 1)
    : 0;
  const steadyHighCam = vtec ? unitInterval((rpm - vtec.switchRpm + 80) / 160) : 0;
  const vtecWarmAdjust = vtec && highCam !== steadyHighCam
    ? (1 - 0.10 * lowCamDip * (1 - highCam)) / Math.max(0.5, 1 - 0.10 * lowCamDip * (1 - steadyHighCam))
    : 1;
  const antiLagBonus = input.launchControl && vehicle.turbocharger && vehicle.turbocharger.maxBoostBar > 0 && roadSpeed < 20
    ? 1 + 0.10 * Math.min(1, state.turboBoostBar / vehicle.turbocharger.maxBoostBar)
    : 1;
  const availableCombustion = (rawWotTorque * vtecWarmAdjust * antiLagBonus + friction) * Math.min(revFuel, roadFuel);
  const lopeActive = Boolean(input.rotaryLope && vehicle.geometry.rotary && engineOn && throttle < 0.12 && gear === 0);
  const nextLopePhase = lopeActive ? (state.lopePhaseRad + RAD_PER_REVOLUTION * 5.0 * dt) % RAD_PER_REVOLUTION : 0;
  const lopeKick = Math.max(0, Math.sin(nextLopePhase)) ** 2.4;
  const idleCombustion = lopeActive
    ? Math.min(0.65 * availableCombustion, Math.max(0, engineLoss * 3.2 * lopeKick + 0.55 * (idleSpeed - engineSpeed)))
    : Math.min(0.65 * availableCombustion, Math.max(0, engineLoss + 0.42 * (idleSpeed - engineSpeed)));
  const matchingCharge = unitInterval((revMatchRpm - rpm) / 1400);
  const matchingCombustion = availableCombustion * matchingCharge;
  const driveTorqueLimit = ratio ? driveForceLimit * radius / (ratio * efficiency) : Infinity;
  const throttleCombustion = Math.min(throttle * availableCombustion * combustionScale, driveTorqueLimit + engineLoss);
  const requestedCombustion = engineOn
    ? Math.max(throttleCombustion, idleCombustion * combustionScale, matchingCombustion)
    : 0;
  const hybrid = physics.hybridAssist;
  const combinedCap = hybrid?.totalPowerCapKw;
  const combustion = combinedCap !== undefined && engineSpeed > 0
    ? Math.min(requestedCombustion, engineLoss + 1000 * combinedCap / engineSpeed) : requestedCombustion;
  let assistTorque = 0;
  let hybridPowerKw = 0;
  if (hybrid && engineOn && gear > 0 && roadSpeed > 3) {
    if (brake > 0 && (throttle <= 0.2 || brake >= throttle * 0.5)) {
      // Brake-by-wire blends MGU harvesting into the requested braking deceleration.
      hybridPowerKw = -Math.min(hybrid.regenPowerKw, 0.82 * brakeForce * roadSpeed / 1000,
        (hybrid.capacityKj - state.hybridEnergyKj) / dt);
    } else if (throttle <= 0.06 && brake === 0 && clutchScale >= 0.9 && state.shift === null
      && engineSpeed > hotIdleSpeed * 1.25 && roadSpeed > 12) {
      // Lift-and-coast overrun harvesting: MGU-K applies generator drag torque on the crankshaft.
      const overrunShare = hybrid.taperStartKmh !== undefined ? 0.38 : 0.30;
      const rpmWindow = unitInterval((rpm - physics.idleRpm * 1.25) / (physics.referenceRpm * 0.45));
      const speedWindow = unitInterval((roadSpeed - 12) / 32);
      const overrunKw = Math.min(
        hybrid.regenPowerKw * overrunShare * rpmWindow * speedWindow,
        (hybrid.capacityKj - state.hybridEnergyKj) / dt,
      );
      assistTorque = -overrunKw * 1000 / engineSpeed;
      hybridPowerKw = -overrunKw;
    } else if (throttle > 0.55 && brake < 0.35 && engineSpeed > idleSpeed && clutchScale >= 0.95
      && (hybrid.minDeploymentKmh === undefined || (pitZone === "track" && roadSpeedKmh >= hybrid.minDeploymentKmh))) {
      const taper = hybrid.taperStartKmh !== undefined && hybrid.taperEndKmh !== undefined
        ? unitInterval((hybrid.taperEndKmh - roadSpeedKmh) / (hybrid.taperEndKmh - hybrid.taperStartKmh))
        : 1;
      const requestedKw = hybrid.peakPowerKw * taper * throttle * (1 - brake) * combustionScale * Math.min(revFuel, roadFuel);
      const remainingKw = Math.min(requestedKw, state.hybridEnergyKj / dt);
      // A combined-power profile describes the total demand. Its motor replaces a share of ICE torque.
      const assistLimit = combinedCap === undefined ? driveTorqueLimit - combustion + engineLoss : combustion - engineLoss;
      assistTorque = Math.min(remainingKw * 1000 / engineSpeed, Math.max(0, assistLimit));
      hybridPowerKw = assistTorque * engineSpeed / 1000;
    }
  }
  const combustionTorque = combinedCap === undefined || assistTorque <= 0 ? combustion : combustion - assistTorque;
  const starterTorque = ignition.starter
    ? physics.engineInertiaKgM2 * (radiansPerSecondFromRpm(ignition.crankingRpm) - engineSpeed) / 0.075 + engineLoss : 0;
  const engineTorque = combustionTorque + assistTorque + starterTorque - engineLoss;
  const startCoupling = physics.electricDrive ? unitInterval((ignition.runningSeconds - 0.08) / 0.32) : 1;
  const electric = advanceElectricDrive(state, physics.electricDrive, powerOn, gear, roadSpeed,
    throttle, brake, brakeForce, radius, driveForceLimit, startCoupling, combustionScale * roadFuel);
  const slip = engineSpeed - matchedEngineSpeed;
  const launchShift = input.shiftMode === "MT" && transmission.shift?.fromGear === 0 && transmission.shift.targetGear === 1
    && transmission.shift.startRpm >= physics.referenceRpm * 0.36;
  const launchEngagement = Math.max(throttle, launchShift ? 0.48 : 0)
    * unitInterval((engineSpeed - idleSpeed * 1.05) / (0.5 * hotIdleSpeed));
  const rollingEngagement = unitInterval((matchedEngineSpeed - hotIdleSpeed * 0.8) / (0.5 * hotIdleSpeed));
  // Pure rolling reflects the vehicle and operator mass at the wheel.
  const effectiveWheelInertia = physics.wheelInertiaKgM2 + mass * radius ** 2;
  const brakingAndRollingForce = brakeForce + weight * ROLLING_RESISTANCE;
  const dragForce = airflowPressure * physics.dragAreaM2;
  const freelyBrakedWheelSpeed = wheelSpeed + dt * (electric.torqueNm - (brakingAndRollingForce + dragForce) * radius) / effectiveWheelInertia;
  const freeEngineSpeed = engineSpeed + dt * engineTorque / physics.engineInertiaKgM2;

  let clutchTorque = 0;
  let drivetrainTorque = 0;
  if (engineOn && gear !== 0) {
    // Static friction can hold zero slip while transmitting torque once the clutch is fully engaged.
    const speedDifference = freeEngineSpeed - freelyBrakedWheelSpeed * ratio;
    const wheelTorqueRatio = speedDifference < 0 ? ratio / efficiency : ratio * efficiency;
    const torqueToSynchronize = speedDifference
      / (dt * (1 / physics.engineInertiaKgM2 + ratio * wheelTorqueRatio / effectiveWheelInertia));
    const fullCapacity = torqueToSynchronize < 0 ? physics.slipperCapacityNm : physics.clutchCapacityNm;
    const gripTorque = Math.max(0, driveForceLimit * radius - electric.torqueNm) / (ratio * efficiency);
    const capacity = Math.min(fullCapacity, torqueToSynchronize > 0 && physics.electricDrive ? gripTorque : Infinity)
      * Math.max(launchEngagement, rollingEngagement) * clutchScale * startCoupling;
    const slipTorque = Math.abs(slip) * physics.clutchDampingNmPerRadPerSecond;
    const couplingLimit = rollingEngagement === 1 && clutchScale === 1 ? capacity : Math.min(capacity, slipTorque);
    clutchTorque = Math.sign(torqueToSynchronize) * Math.min(Math.abs(torqueToSynchronize), couplingLimit);
    drivetrainTorque = clutchTorque * wheelTorqueRatio;
  }
  const nextWheelSpeed = Math.max(0, freelyBrakedWheelSpeed + dt * drivetrainTorque / effectiveWheelInertia);
  const nextRoadSpeed = nextWheelSpeed * radius;
  const nextRoadSpeedKmh = nextRoadSpeed * 3.6;
  let pitDistanceM = 0;
  let parked = false;
  if (pitZone === "exit" || pitZone === "entry") {
    const previousDistance = pitZone === state.pitZone ? state.pitDistanceM : 0;
    const distance = previousDistance + (roadSpeed + nextRoadSpeed) * dt / 2;
    if (pitZone === "exit" && distance >= PIT_EXIT_LENGTH_M) pitZone = "track";
    else if (pitZone === "entry" && distance >= PIT_ENTRY_LENGTH_M && nextRoadSpeed * 3.6 <= 1) {
      pitZone = "box";
      parked = true;
    } else pitDistanceM = pitZone === "entry" ? Math.min(PIT_ENTRY_LENGTH_M, distance) : distance;
  }
  let perfTimer = state.perfTimer;
  if (!engineOn || state.engineFailed || parked) {
    perfTimer = INITIAL_PERFORMANCE_TIMER;
  } else if (nextRoadSpeed <= 0.08 && roadSpeed <= 0.08) {
    perfTimer = perfTimer.zeroTo100Seconds !== null || perfTimer.quarterMileSeconds !== null
      ? { ...perfTimer, armed: true, running: false, elapsedSeconds: 0, distanceM: 0 }
      : INITIAL_PERFORMANCE_TIMER;
  } else if (perfTimer.armed && !perfTimer.running && roadSpeed <= 0.25 && nextRoadSpeed > 0.08 && throttle > 0.15 && brake < 0.25) {
    const stepDist = (roadSpeed + nextRoadSpeed) * 0.5 * dt;
    perfTimer = {
      armed: false,
      running: true,
      elapsedSeconds: dt,
      distanceM: stepDist,
      zeroTo100Seconds: nextRoadSpeedKmh >= 100 ? dt : null,
      zeroTo200Seconds: nextRoadSpeedKmh >= 200 ? dt : null,
      quarterMileSeconds: stepDist >= 400 ? dt : null,
      quarterMileSpeedKmh: stepDist >= 400 ? nextRoadSpeedKmh : null,
    };
  } else if (perfTimer.running) {
    const prevElapsed = perfTimer.elapsedSeconds;
    const prevDist = perfTimer.distanceM;
    const nextElapsed = prevElapsed + dt;
    const stepDist = (roadSpeed + nextRoadSpeed) * 0.5 * dt;
    const nextDist = prevDist + stepDist;
    const speedDelta = Math.max(1e-6, nextRoadSpeedKmh - roadSpeedKmh);
    const zeroTo100Seconds = perfTimer.zeroTo100Seconds ?? (nextRoadSpeedKmh >= 100
      ? prevElapsed + dt * unitInterval((100 - roadSpeedKmh) / speedDelta) : null);
    const zeroTo200Seconds = perfTimer.zeroTo200Seconds ?? (nextRoadSpeedKmh >= 200
      ? prevElapsed + dt * unitInterval((200 - roadSpeedKmh) / speedDelta) : null);
    const quarterFraction = stepDist > 1e-6 ? unitInterval((400 - prevDist) / stepDist) : 1;
    const quarterMileSeconds = perfTimer.quarterMileSeconds ?? (nextDist >= 400
      ? prevElapsed + dt * quarterFraction : null);
    const quarterMileSpeedKmh = perfTimer.quarterMileSpeedKmh ?? (nextDist >= 400
      ? roadSpeedKmh + (nextRoadSpeedKmh - roadSpeedKmh) * quarterFraction : null);
    const finishedAll = zeroTo100Seconds !== null && zeroTo200Seconds !== null && quarterMileSeconds !== null;
    perfTimer = {
      armed: false,
      running: !finishedAll && nextElapsed < 90,
      elapsedSeconds: nextElapsed,
      distanceM: nextDist,
      zeroTo100Seconds,
      zeroTo200Seconds,
      quarterMileSeconds,
      quarterMileSpeedKmh,
    };
  }
  const nextEngineSpeed = Math.max(0, freeEngineSpeed - dt * clutchTorque / physics.engineInertiaKgM2);
  const crankAdvance = dt * (engineSpeed + nextEngineSpeed) / 2;
  const superchargerRatio = vehicle.supercharger?.driveRatio ?? 0;
  const nextRpm = rpmFromRadiansPerSecond(nextEngineSpeed);
  const overRevThresholdRpm = Math.max(physics.referenceRpm, gearFuelCutRpm ?? physics.fuelCutRpm);
  const mechanicalOverRev = nextRpm > overRevThresholdRpm && (clutchTorque < 0 || (state.mechanicalOverRev && gear > 0));
  const newOverRev = mechanicalOverRev && !state.mechanicalOverRev;
  // An illustrative accumulated severity, with no prediction of a real engine's failure limit.
  const damageRate = Math.max(0, (nextRpm / overRevThresholdRpm - 1.10) / 0.10);
  const damageExposure = Math.min(1, state.damageExposure + (mechanicalOverRev && engineOn ? dt * damageRate : 0));
  const engineFailed = state.engineFailed || damageExposure >= 1;
  const activeShift = transmission.shift;
  const shiftCut = engineOn && activeShift && activeShift.fromGear > 0 && activeShift.targetGear > 0
    ? throttle * (1 - combustionScale) * (1 - matchingCharge)
    : 0;
  const running = engineOn && !engineFailed && !parked;

  return {
    ...transmission,
    ...(parked ? { ...INITIAL_TRANSMISSION_STATE, shiftMode: transmission.shiftMode } : {}),
    vehicleId: vehicle.id,
    pitZone,
    pitDistanceM,
    // Wait for the old ignition command to clear even if one frame contains several physics steps.
    pitAwaitingPowerOff: input.engineOn && (parked || state.pitAwaitingPowerOff),
    powerOn: powerOn && !engineFailed && !parked,
    enginePhase: engineFailed || parked ? "off" : ignition.enginePhase,
    engineOn: running,
    crankingSeconds: ignition.crankingSeconds,
    runningSeconds: ignition.runningSeconds,
    engineWarmth: ignition.engineWarmth,
    idleTargetRpm: ignition.idleTargetRpm,
    starter: parked ? 0 : ignition.starter,
    electricPowerKw: electric.electricPowerKw,
    electricEnergyKj: electric.electricEnergyKj,
    motorAngularVelocity: physics.electricDrive && powerOn && !parked ? Math.max(0, nextWheelSpeed * ratio) : 0,
    motorLoad: electric.motorLoad,
    throttle,
    brake,
    roadSpeedLimitDisabled: input.roadSpeedLimitDisabled,
    engineAngularVelocity: nextEngineSpeed,
    wheelAngularVelocity: nextWheelSpeed,
    vehicleSpeed: nextRoadSpeed,
    crankAngleRad: (state.crankAngleRad + crankAdvance) % RAD_PER_ENGINE_CYCLE,
    superchargerAngularVelocity: nextEngineSpeed * superchargerRatio,
    superchargerAngleRad: (state.superchargerAngleRad + crankAdvance * superchargerRatio) % RAD_PER_REVOLUTION,
    ...(running ? advanceTurbo(state, vehicle, rpm, throttle, shiftCut, gear > 0, launchHold)
      : { turboBoostBar: 0, turboRelease: 0 }),
    hybridEnergyKj: Math.max(0, Math.min(hybrid?.capacityKj ?? 0, state.hybridEnergyKj - hybridPowerKw * dt)),
    hybridPowerKw: engineFailed ? 0 : hybridPowerKw,
    engineTorqueNm: engineTorque,
    combustionTorqueNm: parked ? 0 : combustionTorque,
    shiftCut: parked ? 0 : shiftCut,
    revMatchThrottle: running ? Math.max(0, matchingCharge - throttle * combustionScale) * revFuel * roadFuel : 0,
    vtecEngagement: running ? highCam : 0,
    vvaEngagement: running ? vvaHigh : 0,
    limiterCut: running ? limiterCut : false,
    launchActive: running ? launchHold : false,
    lopePhaseRad: running ? nextLopePhase : 0,
    perfTimer,
    drivetrainTorqueNm: drivetrainTorque,
    clutchSlipRadPerSecond: gear === 0 || !engineOn ? 0 : nextEngineSpeed - nextWheelSpeed * ratio,
    mechanicalOverRev,
    overRevSeconds: mechanicalOverRev ? (newOverRev ? dt : state.overRevSeconds + dt) : state.overRevSeconds,
    peakOverRevRpm: mechanicalOverRev ? Math.max(newOverRev ? 0 : state.peakOverRevRpm, nextRpm) : state.peakOverRevRpm,
    damageExposure,
    engineFailed,
  };
}

export function advanceSimulation(
  state: SimulationState,
  input: SimulationInput,
  vehicle: Vehicle,
  elapsedSeconds: number,
  remainderSeconds = 0,
): { state: SimulationState; remainderSeconds: number } {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.min(MAX_FRAME_SECONDS, elapsedSeconds)) : 0;
  const accumulated = remainderSeconds + elapsed;
  const steps = Math.floor((accumulated + 1e-12) / FIXED_STEP_SECONDS);

  for (let index = 0; index < steps; index += 1) {
    state = stepSimulation(state, input, vehicle);
  }

  return { state, remainderSeconds: Math.max(0, accumulated - steps * FIXED_STEP_SECONDS) };
}
