import assert from "node:assert/strict";
import test from "node:test";
import { vehicles } from "../data/vehicles.ts";
import { createSimulationState, INITIAL_SIMULATION_INPUT, rpmFromRadiansPerSecond, stepSimulation } from "../lib/simulation.ts";
import { advanceTransmission, enqueueShift, getOverallRatio, INITIAL_TRANSMISSION_STATE } from "../lib/transmission.ts";

const mt = { ...INITIAL_SIMULATION_INPUT, engineOn: true };
const at = { ...mt, shiftMode: "AT" };

function run(vehicle, state, input, ticks) {
  const result = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    state = stepSimulation(state, input, vehicle);
    result.push(state);
  }
  return result;
}

function rolling(vehicle, gear, speed) {
  const wheelAngularVelocity = speed / vehicle.physics.rollingRadiusM;
  return {
    ...createSimulationState(vehicle),
    engineOn: true,
    gear,
    vehicleSpeed: speed,
    wheelAngularVelocity,
    engineAngularVelocity: wheelAngularVelocity * getOverallRatio(vehicle, gear),
  };
}

function speedForRpm(vehicle, gear, rpm) {
  return rpm * Math.PI / 30 * vehicle.physics.rollingRadiusM / getOverallRatio(vehicle, gear);
}

test("manual requests shift through phases and skip neutral from first to second", () => {
  const vehicle = vehicles[0];
  let initial = createSimulationState(vehicle);
  initial = enqueueShift(enqueueShift(initial, 1), 1);
  const trace = run(vehicle, initial, mt, 200);
  assert.equal(trace[0].gear, 0);
  const gears = [...new Set(trace.map(({ gear }) => gear))];
  assert.deepEqual(gears, [0, 1, 2]);
  assert.ok(new Set(trace.flatMap(({ shift }) => shift ? [shift.phase] : [])).size >= 3);
  assert.equal(trace.at(-1).shift, null);
  const backToNeutral = run(vehicle, enqueueShift(enqueueShift(trace.at(-1), -1), -1), mt, 200).at(-1);
  assert.equal(backToNeutral.gear, 0);
});

for (const vehicle of vehicles) {
  test(`${vehicle.name}: loaded upshift interrupts drive and reports actual RPM before and after`, () => {
    const input = { ...mt, throttle: 1 };
    const speedAt10000 = speedForRpm(vehicle, 3, 10000);
    const before = run(vehicle, rolling(vehicle, 3, speedAt10000), input, 18).at(-1);
    const trace = run(vehicle, enqueueShift(before, 1), input, 60);
    const cut = trace.filter((state) => state.shift?.phase === "disengage");
    assert.ok(cut.length >= 7);
    assert.ok(cut.every((state) => Math.abs(state.drivetrainTorqueNm) < 1e-9 && state.shiftCut > 0.8));
    const after = trace.at(-1);
    assert.equal(after.lastShift.fromGear, 3);
    assert.equal(after.lastShift.targetGear, 4);
    assert.equal(after.lastShift.startRpm, rpmFromRadiansPerSecond(before.engineAngularVelocity));
    assert.ok(after.lastShift.startRpm - after.lastShift.endRpm > 900);
    assert.ok(after.drivetrainTorqueNm > 0 && after.shiftCut === 0);
  });

  test(`${vehicle.name}: rapid MT downshifts can back-drive above fuel cutoff`, () => {
    const speed = { "yamaha-r15": 45, "yamaha-r3": 55 }[vehicle.id]
      ?? speedForRpm(vehicle, 3, 1.23 * vehicle.physics.fuelCutRpm);
    const initial = rolling(vehicle, 6, speed);
    const requested = enqueueShift(enqueueShift(enqueueShift(initial, -1), -1), -1);
    const trace = run(vehicle, requested, mt, 220);
    assert.deepEqual([...new Set(trace.map(({ gear }) => gear))], [6, 5, 4, 3]);
    const mechanicallyOverRevving = trace.filter((state) => state.mechanicalOverRev);
    assert.ok(mechanicallyOverRevving.some((state) => rpmFromRadiansPerSecond(state.engineAngularVelocity) > vehicle.physics.fuelCutRpm));
    assert.ok(mechanicallyOverRevving.some((state) => state.engineTorqueNm < 0 && state.drivetrainTorqueNm < 0));
    assert.ok(trace.at(-1).overRevSeconds > 0);
  });

  test(`${vehicle.name}: AT rejects an unsafe target even at low engine RPM`, () => {
    const initial = { ...INITIAL_TRANSMISSION_STATE, gear: 6, shiftMode: "AT" };
    const step = (speed) => advanceTransmission(initial, {
      engineOn: true, shiftMode: "AT", throttle: 1, brake: 0,
      engineRpm: 2500, wheelAngularVelocity: speed / vehicle.physics.rollingRadiusM, vehicleSpeed: speed,
    }, vehicle, 1 / 120);
    assert.equal(step(speedForRpm(vehicle, 5, vehicle.physics.referenceRpm)).transmission.shift, null);
    assert.equal(step(15).transmission.shift?.targetGear, 5);
    const idle = run(vehicle, createSimulationState(vehicle), at, 250).at(-1);
    assert.equal(idle.gear, 0);
    const launches = run(vehicle, idle, { ...at, throttle: 1 }, 420);
    assert.ok(launches.some((state) => state.gear === 1 && state.vehicleSpeed > 1));
    assert.ok(launches.every((state) => !state.mechanicalOverRev));
  });
}

test("turning on AT before engagement rechecks a pending risky downshift", () => {
  const vehicle = vehicles[0];
  const requested = enqueueShift(rolling(vehicle, 6, 50), -1);
  const unloading = run(vehicle, requested, mt, 5).at(-1);
  assert.equal(unloading.shift.targetGear, 5);
  const protectedShift = run(vehicle, unloading, at, 45);
  assert.ok(protectedShift.every((state) => state.gear === 6));
});

test("only sustained severe wheel back-drive triggers the illustrative, resettable failure", () => {
  const vehicle = vehicles[0];
  const onThrottle = run(vehicle, createSimulationState(vehicle), { ...mt, throttle: 1 }, 1000).at(-1);
  assert.equal(onThrottle.damageExposure, 0);
  assert.equal(onThrottle.engineFailed, false);

  const initial = rolling(vehicle, 1, 30);
  const backDriven = { ...initial, engineAngularVelocity: initial.engineAngularVelocity * 0.55 };
  const trace = run(vehicle, backDriven, mt, 180);
  assert.ok(trace.some((state) => state.mechanicalOverRev && !state.engineFailed));
  const failed = trace.at(-1);
  assert.equal(failed.damageExposure, 1);
  assert.equal(failed.engineFailed, true);
  assert.equal(failed.engineOn, false);
  assert.equal(stepSimulation(failed, { ...mt, throttle: 1 }, vehicle).combustionTorqueNm, 0);
  assert.equal(createSimulationState(vehicle).engineFailed, false);
});
