import type { Vehicle } from "../data/vehicles";
import { advanceTransmission, getOverallRatio, INITIAL_TRANSMISSION_STATE } from "./transmission.ts";
import type { ShiftMode, TransmissionState } from "./transmission.ts";

export const FIXED_STEP_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 0.1;
const RAD_PER_REVOLUTION = 2 * Math.PI;
const RAD_PER_ENGINE_CYCLE = 2 * RAD_PER_REVOLUTION;
const GRAVITY_MPS2 = 9.80665;
const RIDER_MASS_KG = 75;
const ROLLING_RESISTANCE = 0.015;
const AIR_DENSITY_KG_M3 = 1.225;
const MAX_BRAKE_DECELERATION_MPS2 = 0.72 * GRAVITY_MPS2;
const REAR_BRAKE_SHARE = 0.34;
const STATIC_REAR_WEIGHT_SHARE = 0.53;
const WATTS_PER_METRIC_HP = 735.49875;

export interface SimulationInput {
  readonly engineOn: boolean;
  readonly shiftMode: ShiftMode;
  readonly throttle: number;
  readonly brake: number;
}

export interface SimulationState extends SimulationInput, TransmissionState {
  readonly vehicleId: string;
  readonly engineAngularVelocity: number;
  readonly wheelAngularVelocity: number;
  readonly vehicleSpeed: number;
  readonly crankAngleRad: number;
  readonly engineTorqueNm: number;
  readonly combustionTorqueNm: number;
  readonly shiftCut: number;
  readonly drivetrainTorqueNm: number;
  readonly clutchSlipRadPerSecond: number;
  readonly tireSlipRatio: number;
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
};

export function createSimulationState(vehicle: Vehicle): SimulationState {
  return {
    ...INITIAL_SIMULATION_INPUT,
    ...INITIAL_TRANSMISSION_STATE,
    vehicleId: vehicle.id,
    engineAngularVelocity: 0,
    wheelAngularVelocity: 0,
    vehicleSpeed: 0,
    crankAngleRad: 0,
    engineTorqueNm: 0,
    combustionTorqueNm: 0,
    shiftCut: 0,
    drivetrainTorqueNm: 0,
    clutchSlipRadPerSecond: 0,
    tireSlipRatio: 0,
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

function fullThrottleTorqueNm(rpm: number, physics: Vehicle["physics"]): number {
  if (rpm <= physics.peakTorqueRpm) {
    const progress = rpm / physics.peakTorqueRpm;
    return physics.peakTorqueNm * (0.38 + 0.62 * progress ** 0.78);
  }

  const torqueAtPeakPower = physics.peakPowerPs * WATTS_PER_METRIC_HP
    / radiansPerSecondFromRpm(physics.peakPowerRpm);
  const progress = unitInterval((rpm - physics.peakTorqueRpm) / (physics.peakPowerRpm - physics.peakTorqueRpm));
  return physics.peakTorqueNm + (torqueAtPeakPower - physics.peakTorqueNm) * progress;
}

function integrateRoad(wheelSpeed: number, roadSpeed: number, driveTorque: number, brake: number, vehicle: Vehicle) {
  const { rollingRadiusM: radius, wheelInertiaKgM2: wheelInertia, curbMassKg, dragAreaM2, rearGripCoefficient } = vehicle.physics;
  const mass = curbMassKg + RIDER_MASS_KG;
  const dt = FIXED_STEP_SECONDS;
  const brakingForce = mass * brake * MAX_BRAKE_DECELERATION_MPS2;
  const rollingForce = mass * GRAVITY_MPS2 * ROLLING_RESISTANCE;
  const dragForce = 0.5 * AIR_DENSITY_KG_M3 * dragAreaM2 * roadSpeed ** 2;

  const freeRoadSpeed = roadSpeed - dt * (brakingForce * (1 - REAR_BRAKE_SHARE) + rollingForce + dragForce) / mass;
  const freeWheelSpeed = wheelSpeed + dt * (driveTorque - brakingForce * REAR_BRAKE_SHARE * radius) / wheelInertia;

  // The tire can enforce pure rolling only when the required contact force is within the grip estimate.
  const slipSpeed = freeWheelSpeed * radius - freeRoadSpeed;
  const forceForPureRolling = slipSpeed / (dt * (radius ** 2 / wheelInertia + 1 / mass));
  const gripLimit = rearGripCoefficient * mass * GRAVITY_MPS2 * STATIC_REAR_WEIGHT_SHARE;
  const tireForce = Math.min(gripLimit, Math.max(-gripLimit, forceForPureRolling));
  const vehicleSpeed = Math.max(0, freeRoadSpeed + dt * tireForce / mass);
  const wheelAngularVelocity = Math.max(0, freeWheelSpeed - dt * tireForce * radius / wheelInertia);
  const wheelSurfaceSpeed = wheelAngularVelocity * radius;

  return {
    vehicleSpeed,
    wheelAngularVelocity,
    tireSlipRatio: (wheelSurfaceSpeed - vehicleSpeed) / Math.max(0.5, vehicleSpeed, wheelSurfaceSpeed),
  };
}

export function stepSimulation(state: SimulationState, input: SimulationInput, vehicle: Vehicle): SimulationState {
  const { physics } = vehicle;
  const throttle = unitInterval(input.throttle);
  const brake = unitInterval(input.brake);
  const dt = FIXED_STEP_SECONDS;
  const engineOn = input.engineOn && !state.engineFailed;
  const engineSpeed = state.engineAngularVelocity;
  const wheelSpeed = state.wheelAngularVelocity;
  const roadSpeed = state.vehicleSpeed;
  const rpm = rpmFromRadiansPerSecond(engineSpeed);
  const idleSpeed = radiansPerSecondFromRpm(physics.idleRpm);
  const { transmission, clutchScale, combustionScale, revMatchRpm } = advanceTransmission(state, {
    engineOn,
    shiftMode: input.shiftMode,
    throttle,
    brake,
    engineRpm: rpm,
    wheelAngularVelocity: wheelSpeed,
    vehicleSpeed: roadSpeed,
  }, vehicle, dt);
  const { gear } = transmission;
  const ratio = getOverallRatio(vehicle, gear);

  const friction = physics.frictionNm + physics.frictionNmPerRadPerSecond * engineSpeed;
  const pumping = (1 - throttle) * physics.pumpingNmPerRadPerSecond * engineSpeed;
  const highRpmTaper = 1 - unitInterval((rpm - physics.peakPowerRpm) / (physics.fuelCutRpm - physics.peakPowerRpm));
  const availableCombustion = (fullThrottleTorqueNm(rpm, physics) + friction) * highRpmTaper;
  const idleCombustion = Math.min(0.65 * availableCombustion, Math.max(0, friction + pumping + 0.42 * (idleSpeed - engineSpeed)));
  const matchingCharge = unitInterval((revMatchRpm - rpm) / 1400);
  const matchingCombustion = availableCombustion * matchingCharge;
  const combustion = engineOn
    ? Math.max(throttle * availableCombustion * combustionScale, idleCombustion * combustionScale, matchingCombustion)
    : 0;
  const engineTorque = combustion - friction - pumping;

  const matchedEngineSpeed = wheelSpeed * ratio;
  const slip = engineSpeed - matchedEngineSpeed;
  const launchEngagement = throttle * unitInterval((engineSpeed - idleSpeed * 1.05) / (0.5 * idleSpeed));
  const rollingEngagement = unitInterval((matchedEngineSpeed - idleSpeed * 0.8) / (0.5 * idleSpeed));
  const fullCapacity = slip < 0 ? physics.slipperCapacityNm : physics.clutchCapacityNm;
  const capacity = fullCapacity * Math.max(launchEngagement, rollingEngagement) * clutchScale;
  // A finite-capacity friction coupling can push or back-drive the engine without snapping RPM to wheel speed.
  const roadMassInertia = (physics.curbMassKg + RIDER_MASS_KG) * physics.rollingRadiusM ** 2;
  const effectiveWheelInertia = physics.wheelInertiaKgM2 + roadMassInertia * (1 - unitInterval(Math.abs(state.tireSlipRatio) / 0.1));
  const torqueToSynchronize = Math.abs(slip) / (dt * (1 / physics.engineInertiaKgM2 + ratio ** 2 / effectiveWheelInertia));
  const clutchTorque = engineOn && gear !== 0
    ? Math.sign(slip) * Math.min(Math.abs(slip) * physics.clutchDampingNmPerRadPerSecond, capacity, torqueToSynchronize)
    : 0;
  const drivetrainTorque = clutchTorque * ratio;

  const nextEngineSpeed = Math.max(0, engineSpeed + dt * (engineTorque - clutchTorque) / physics.engineInertiaKgM2);
  const road = integrateRoad(wheelSpeed, roadSpeed, drivetrainTorque, brake, vehicle);
  const nextRpm = rpmFromRadiansPerSecond(nextEngineSpeed);
  const mechanicalOverRev = nextRpm > physics.referenceRpm && (clutchTorque < 0 || state.mechanicalOverRev);
  const newOverRev = mechanicalOverRev && !state.mechanicalOverRev;
  // An illustrative accumulated severity, with no prediction of a real engine's failure limit.
  const damageRate = Math.max(0, (nextRpm / physics.referenceRpm - 1.10) / 0.10);
  const damageExposure = Math.min(1, state.damageExposure + (mechanicalOverRev && engineOn ? dt * damageRate : 0));
  const engineFailed = state.engineFailed || damageExposure >= 1;
  const activeShift = transmission.shift;
  const shiftCut = engineOn && activeShift && activeShift.fromGear > 0 && activeShift.targetGear > 0
    ? throttle * (1 - combustionScale) * (1 - matchingCharge)
    : 0;

  return {
    ...transmission,
    vehicleId: vehicle.id,
    engineOn: engineOn && !engineFailed,
    throttle,
    brake,
    engineAngularVelocity: nextEngineSpeed,
    ...road,
    crankAngleRad: (state.crankAngleRad + dt * (engineSpeed + nextEngineSpeed) / 2) % RAD_PER_ENGINE_CYCLE,
    engineTorqueNm: engineTorque,
    combustionTorqueNm: combustion,
    shiftCut,
    drivetrainTorqueNm: drivetrainTorque,
    clutchSlipRadPerSecond: gear === 0 || !engineOn ? 0 : nextEngineSpeed - road.wheelAngularVelocity * ratio,
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
