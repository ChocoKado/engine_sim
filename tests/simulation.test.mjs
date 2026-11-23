import assert from "node:assert/strict";
import test from "node:test";
import { vehicles } from "../data/vehicles.ts";
import {
  advanceSimulation,
  createSimulationState,
  FIXED_STEP_SECONDS,
  INITIAL_SIMULATION_INPUT,
  rpmFromRadiansPerSecond,
  stepSimulation,
} from "../lib/simulation.ts";

const running = { ...INITIAL_SIMULATION_INPUT, engineOn: true };

function simulate(vehicle, input, ticks, initial = createSimulationState(vehicle)) {
  let state = initial;
  for (let tick = 0; tick < ticks; tick += 1) state = stepSimulation(state, input, vehicle);
  return state;
}

function rollingInSecond(vehicle) {
  const { physics } = vehicle;
  const speed = 12;
  const wheelOmega = speed / physics.rollingRadiusM;
  return {
    ...createSimulationState(vehicle),
    ...running,
    gear: 2,
    vehicleSpeed: speed,
    wheelAngularVelocity: wheelOmega,
    engineAngularVelocity: wheelOmega * physics.primaryRatio * physics.gearRatios[1] * physics.finalDriveRatio,
  };
}

for (const vehicle of vehicles) {
  test(`${vehicle.name}: neutral throttle reaches 10,000 RPM without moving the wheel`, () => {
    const idle = simulate(vehicle, running, 240);
    const revving = simulate(vehicle, { ...running, throttle: 1 }, 174, idle);
    assert.ok(rpmFromRadiansPerSecond(revving.engineAngularVelocity) >= 10_000);
    assert.equal(revving.wheelAngularVelocity, 0);
  });

  test(`${vehicle.name}: neutral revs independently of wheel speed and brakes`, () => {
    const idle = simulate(vehicle, running, 240);
    assert.ok(Math.abs(rpmFromRadiansPerSecond(idle.engineAngularVelocity) - vehicle.physics.idleRpm) < 1);
    const input = { ...running, throttle: 1 };
    const revving = simulate(vehicle, input, 120, idle);
    assert.ok(revving.engineAngularVelocity > idle.engineAngularVelocity * 2);
    assert.equal(revving.wheelAngularVelocity, 0);
    assert.equal(revving.vehicleSpeed, 0);
    assert.equal(revving.drivetrainTorqueNm, 0);
    assert.equal(simulate(vehicle, { ...input, brake: 1 }, 120, idle).engineAngularVelocity, revving.engineAngularVelocity);
    const rolling = { ...rollingInSecond(vehicle), gear: 0 };
    const neutralCoast = simulate(vehicle, running, 60, rolling);
    const neutralBrake = simulate(vehicle, { ...running, brake: 1 }, 60, rolling);
    assert.ok(neutralBrake.vehicleSpeed < neutralCoast.vehicleSpeed);
    assert.equal(neutralBrake.engineAngularVelocity, neutralCoast.engineAngularVelocity);
  });

  test(`${vehicle.name}: first-gear launch transfers torque through a slipping clutch`, () => {
    const idle = simulate(vehicle, running, 120);
    const input = { ...running, throttle: 1 };
    const firstGear = { ...idle, gear: 1 };
    const firstTick = stepSimulation(firstGear, input, vehicle);
    const launch = simulate(vehicle, input, 120, firstGear);
    assert.ok(firstTick.vehicleSpeed < 0.1);
    assert.ok(launch.vehicleSpeed > 1);
    assert.ok(launch.drivetrainTorqueNm > 0);
    assert.ok(launch.clutchSlipRadPerSecond > 0);
    const wheelSurfaceSpeed = launch.wheelAngularVelocity * vehicle.physics.rollingRadiusM;
    assert.ok(wheelSurfaceSpeed + 1e-9 >= launch.vehicleSpeed);
    assert.ok(launch.tireSlipRatio >= -1e-9 && launch.tireSlipRatio < 1);
    assert.ok(launch.crankAngleRad >= 0 && launch.crankAngleRad < 4 * Math.PI);
  });

  test(`${vehicle.name}: engine braking and wheel brakes act through the drivetrain`, () => {
    const initial = rollingInSecond(vehicle);
    const coast = simulate(vehicle, running, 60, { ...initial, gear: 0 });
    const engineBrake = simulate(vehicle, running, 60, initial);
    const braked = simulate(vehicle, { ...running, brake: 1 }, 60, initial);
    assert.ok(engineBrake.drivetrainTorqueNm < 0);
    assert.ok(engineBrake.vehicleSpeed < coast.vehicleSpeed);
    assert.ok(braked.vehicleSpeed < engineBrake.vehicleSpeed);
    assert.ok(braked.engineAngularVelocity < engineBrake.engineAngularVelocity);
    const stopped = simulate(vehicle, { ...running, brake: 1 }, 480, initial);
    assert.equal(stopped.vehicleSpeed, 0);
    assert.equal(stopped.wheelAngularVelocity, 0);
  });
}

test("fixed steps give the same state across frame schedules and bound elapsed-time catch-up", () => {
  const vehicle = vehicles[0];
  const initial = { ...createSimulationState(vehicle), gear: 1 };
  const input = { ...running, throttle: 1 };
  const reference = simulate(vehicle, input, 120, initial);
  let frame = { state: initial, remainderSeconds: 0 };
  for (let index = 0; index < 50; index += 1) {
    frame = advanceSimulation(frame.state, input, vehicle, 0.02, frame.remainderSeconds);
  }
  assert.deepEqual(frame.state, reference);
  assert.ok(frame.remainderSeconds < FIXED_STEP_SECONDS);
  assert.equal(advanceSimulation(initial, input, vehicle, 0.001).state, initial);
  assert.deepEqual(advanceSimulation(initial, input, vehicle, 60).state, simulate(vehicle, input, 12, initial));
});

test("per-bike parameters give distinct profiles, and ignition off transfers no drive torque", () => {
  const input = { ...running, throttle: 1 };
  const results = vehicles.map((vehicle) => simulate(vehicle, input, 240, { ...createSimulationState(vehicle), gear: 1 }));
  assert.ok(results[1].vehicleSpeed > results[0].vehicleSpeed);
  const [vehicle] = vehicles;
  const off = simulate(vehicle, { ...INITIAL_SIMULATION_INPUT, throttle: 1 }, 240, results[0]);
  assert.equal(off.drivetrainTorqueNm, 0);
  assert.ok(off.vehicleSpeed < results[0].vehicleSpeed);
  assert.ok(off.engineAngularVelocity < results[0].engineAngularVelocity);
});

test("limited rear grip permits wheel spin, while neutral braking cannot reverse either speed", () => {
  const vehicle = {
    ...vehicles[0],
    physics: { ...vehicles[0].physics, rearGripCoefficient: 0.18 },
  };
  const firstGear = { ...createSimulationState(vehicle), gear: 1 };
  const launch = simulate(vehicle, { ...running, throttle: 1 }, 200, firstGear);
  const wheelSurfaceSpeed = launch.wheelAngularVelocity * vehicle.physics.rollingRadiusM;
  assert.ok(launch.tireSlipRatio > 0.25 && launch.tireSlipRatio <= 1);
  assert.ok(wheelSurfaceSpeed > launch.vehicleSpeed && launch.vehicleSpeed > 0);

  const stopped = simulate(vehicle, { ...running, brake: 1 }, 240, { ...launch, gear: 0 });
  assert.equal(stopped.vehicleSpeed, 0);
  assert.equal(stopped.wheelAngularVelocity, 0);
});
