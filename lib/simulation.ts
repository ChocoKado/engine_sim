import type { Vehicle } from "../data/vehicles";
import { advanceTransmission, getOverallRatio, INITIAL_TRANSMISSION_STATE } from "./transmission.ts";
import type { ShiftMode, TransmissionState } from "./transmission.ts";

export const FIXED_STEP_SECONDS = 1 / 120;
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

export interface SimulationInput {
  readonly engineOn: boolean;
  readonly shiftMode: ShiftMode;
  readonly throttle: number;
  readonly brake: number;
  readonly roadSpeedLimitDisabled: boolean;
}

export interface SimulationState extends SimulationInput, TransmissionState {
  readonly vehicleId: string;
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
    vehicleId: vehicle.id,
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

function advanceTurbo(
  state: SimulationState, vehicle: Vehicle, rpm: number, throttle: number, shiftCut: number, inGear: boolean,
) {
  const turbo = vehicle.turbocharger;
  if (!turbo) return { turboBoostBar: 0, turboRelease: 0 };
  const spoolStartRpm = turbo.spoolStartRpm ?? vehicle.physics.idleRpm + 500;
  const fullBoostRpm = Math.max(spoolStartRpm + 850, vehicle.physics.peakTorqueRpm);
  const flow = unitInterval((rpm - spoolStartRpm) / (fullBoostRpm - spoolStartRpm));
  const opening = throttle * (1 - shiftCut);
  const target = turbo.maxBoostBar * flow * opening ** 1.4 * (inGear ? 1 : 0.24);
  const pressure = state.turboBoostBar;
  const releaseStarts = state.throttle * (1 - state.shiftCut) >= 0.48 && opening < 0.48 && pressure >= 0.12;
  const decay = target > pressure ? 0.24 : opening < 0.45 ? 0.070 : 0.18;
  return {
    turboBoostBar: pressure + (target - pressure) * (1 - Math.exp(-FIXED_STEP_SECONDS / decay)),
    turboRelease: releaseStarts
      ? Math.min(1, pressure / 0.8)
      : state.turboRelease * Math.exp(-FIXED_STEP_SECONDS / 0.082),
  };
}

function fullThrottleTorqueNm(rpm: number, physics: Vehicle["physics"]): number {
  if (rpm <= physics.peakTorqueRpm) {
    const lowRpmRatio = physics.lowRpmTorqueRatio ?? 0.44;
    const progress = rpm / physics.peakTorqueRpm;
    return physics.peakTorqueNm * (lowRpmRatio + (1 - lowRpmRatio) * progress ** 1.4);
  }

  const torqueAtPeakPower = physics.peakPowerPs * WATTS_PER_METRIC_HP
    / radiansPerSecondFromRpm(physics.peakPowerRpm);
  const peakTorqueEndRpm = physics.peakTorqueEndRpm ?? physics.peakTorqueRpm;
  if (rpm <= peakTorqueEndRpm) return physics.peakTorqueNm;
  if (rpm > physics.peakPowerRpm) {
    const overPeak = unitInterval((rpm - physics.peakPowerRpm) / (physics.fuelCutRpm - physics.peakPowerRpm));
    // Power falls gradually past its rated peak. The rev limiter acts on fuel separately.
    return torqueAtPeakPower * (physics.peakPowerRpm / rpm) * (1 - 0.12 * overPeak ** 2);
  }

  const progress = unitInterval((rpm - peakTorqueEndRpm) / (physics.peakPowerRpm - peakTorqueEndRpm));
  return physics.peakTorqueNm + (torqueAtPeakPower - physics.peakTorqueNm) * progress;
}

export function stepSimulation(state: SimulationState, input: SimulationInput, vehicle: Vehicle): SimulationState {
  const { physics } = vehicle;
  const radius = physics.rollingRadiusM;
  const throttle = unitInterval(input.throttle);
  const brake = unitInterval(input.brake);
  const dt = FIXED_STEP_SECONDS;
  const engineOn = input.engineOn && !state.engineFailed;
  const engineSpeed = state.engineAngularVelocity;
  const wheelSpeed = state.wheelAngularVelocity;
  const roadSpeed = wheelSpeed * radius;
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
  const mass = physics.curbMassKg + OPERATOR_MASS_KG;
  const efficiency = physics.drivelineEfficiency ?? 1;
  const airflowPressure = 0.5 * AIR_DENSITY_KG_M3 * roadSpeed ** 2;
  const weight = mass * GRAVITY_MPS2;
  const normalForce = weight + airflowPressure * (physics.downforceAreaM2 ?? 0);
  const brakeForce = brake * (physics.maxBrakeAccelerationG ?? 0.72) * normalForce;

  const friction = physics.frictionNm + physics.frictionNmPerRadPerSecond * engineSpeed;
  const closedThrottle = 1 - throttle;
  const pumping = closedThrottle * physics.pumpingNmPerRadPerSecond * engineSpeed;
  // The unloaded coast-down is calibrated separately from in-gear engine braking.
  const neutralOverrun = gear === 0 ? unitInterval((engineSpeed - idleSpeed) / (2 * idleSpeed)) : 0;
  const unloadedDrag = 4 * pumping * closedThrottle * neutralOverrun;
  const engineLoss = friction + pumping + unloadedDrag;
  const gearFuelCutRpm = physics.gearFuelCutRpm?.[gear];
  const fuelCutRpm = gearFuelCutRpm ?? physics.fuelCutRpm;
  const revFuel = unitInterval((fuelCutRpm - rpm) / FUEL_CUT_WINDOW_RPM);
  const roadFuel = input.roadSpeedLimitDisabled || physics.speedLimitKmh === undefined ? 1
    : unitInterval((physics.speedLimitKmh - roadSpeed * 3.6) / SPEED_LIMIT_WINDOW_KMH);
  const availableCombustion = (fullThrottleTorqueNm(rpm, physics) + friction) * Math.min(revFuel, roadFuel);
  const idleCombustion = Math.min(0.65 * availableCombustion, Math.max(0, engineLoss + 0.42 * (idleSpeed - engineSpeed)));
  const matchingCharge = unitInterval((revMatchRpm - rpm) / 1400);
  const matchingCombustion = availableCombustion * matchingCharge;
  const driveTorqueLimit = ratio && physics.maxDriveAccelerationG !== undefined
    ? physics.maxDriveAccelerationG * normalForce * radius / (ratio * efficiency)
    : Infinity;
  const throttleCombustion = Math.min(throttle * availableCombustion * combustionScale, driveTorqueLimit + engineLoss);
  const combustion = engineOn
    ? Math.max(throttleCombustion, idleCombustion * combustionScale, matchingCombustion)
    : 0;
  const hybrid = physics.hybridAssist;
  let assistTorque = 0;
  let hybridPowerKw = 0;
  if (hybrid && engineOn && gear > 0 && roadSpeed > 3) {
    if (brake > 0) {
      hybridPowerKw = -Math.min(hybrid.regenPowerKw, 0.82 * brakeForce * roadSpeed / 1000,
        (hybrid.capacityKj - state.hybridEnergyKj) / dt);
    } else if (throttle > 0.55 && engineSpeed > idleSpeed && clutchScale >= 0.95) {
      const taper = hybrid.taperStartKmh !== undefined && hybrid.taperEndKmh !== undefined
        ? unitInterval((hybrid.taperEndKmh - 3.6 * roadSpeed) / (hybrid.taperEndKmh - hybrid.taperStartKmh))
        : 1;
      const requestedKw = hybrid.peakPowerKw * taper * throttle * combustionScale * Math.min(revFuel, roadFuel);
      const remainingKw = Math.min(requestedKw, state.hybridEnergyKj / dt);
      assistTorque = Math.min(remainingKw * 1000 / engineSpeed, Math.max(0, driveTorqueLimit - combustion + engineLoss));
      hybridPowerKw = assistTorque * engineSpeed / 1000;
    }
  }
  const engineTorque = combustion + assistTorque - engineLoss;

  const matchedEngineSpeed = wheelSpeed * ratio;
  const slip = engineSpeed - matchedEngineSpeed;
  const launchEngagement = throttle * unitInterval((engineSpeed - idleSpeed * 1.05) / (0.5 * idleSpeed));
  const rollingEngagement = unitInterval((matchedEngineSpeed - idleSpeed * 0.8) / (0.5 * idleSpeed));
  // Pure rolling reflects the vehicle and operator mass at the wheel.
  const effectiveWheelInertia = physics.wheelInertiaKgM2 + mass * radius ** 2;
  const brakingAndRollingForce = brakeForce + weight * ROLLING_RESISTANCE;
  const dragForce = airflowPressure * physics.dragAreaM2;
  const freelyBrakedWheelSpeed = wheelSpeed - dt * (brakingAndRollingForce + dragForce) * radius / effectiveWheelInertia;
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
    const capacity = fullCapacity * Math.max(launchEngagement, rollingEngagement) * clutchScale;
    const slipTorque = Math.abs(slip) * physics.clutchDampingNmPerRadPerSecond;
    const couplingLimit = rollingEngagement === 1 && clutchScale === 1 ? capacity : Math.min(capacity, slipTorque);
    clutchTorque = Math.sign(torqueToSynchronize) * Math.min(Math.abs(torqueToSynchronize), couplingLimit);
    drivetrainTorque = clutchTorque * wheelTorqueRatio;
  }
  const nextWheelSpeed = Math.max(0, freelyBrakedWheelSpeed + dt * drivetrainTorque / effectiveWheelInertia);
  const nextEngineSpeed = Math.max(0, freeEngineSpeed - dt * clutchTorque / physics.engineInertiaKgM2);
  const crankAdvance = dt * (engineSpeed + nextEngineSpeed) / 2;
  const superchargerRatio = vehicle.supercharger?.driveRatio ?? 0;
  const nextRpm = rpmFromRadiansPerSecond(nextEngineSpeed);
  const overRevThresholdRpm = Math.max(physics.referenceRpm, gearFuelCutRpm ?? 0);
  const mechanicalOverRev = nextRpm > overRevThresholdRpm && (clutchTorque < 0 || state.mechanicalOverRev);
  const newOverRev = mechanicalOverRev && !state.mechanicalOverRev;
  // An illustrative accumulated severity, with no prediction of a real engine's failure limit.
  const damageRate = Math.max(0, (nextRpm / overRevThresholdRpm - 1.10) / 0.10);
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
    roadSpeedLimitDisabled: input.roadSpeedLimitDisabled,
    engineAngularVelocity: nextEngineSpeed,
    wheelAngularVelocity: nextWheelSpeed,
    vehicleSpeed: nextWheelSpeed * radius,
    crankAngleRad: (state.crankAngleRad + crankAdvance) % RAD_PER_ENGINE_CYCLE,
    superchargerAngularVelocity: nextEngineSpeed * superchargerRatio,
    superchargerAngleRad: (state.superchargerAngleRad + crankAdvance * superchargerRatio) % RAD_PER_REVOLUTION,
    ...(engineOn && !engineFailed ? advanceTurbo(state, vehicle, rpm, throttle, shiftCut, gear > 0)
      : { turboBoostBar: 0, turboRelease: 0 }),
    hybridEnergyKj: Math.max(0, Math.min(hybrid?.capacityKj ?? 0, state.hybridEnergyKj - hybridPowerKw * dt)),
    hybridPowerKw: engineFailed ? 0 : hybridPowerKw,
    engineTorqueNm: engineTorque,
    combustionTorqueNm: combustion,
    shiftCut,
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
