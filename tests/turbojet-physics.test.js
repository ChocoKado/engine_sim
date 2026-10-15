import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { VEHICLE_PROFILES } from '../src/physics/VehicleProfiles.js';
import { MODIFICATION_CATALOG, isModificationSupported } from '../src/physics/Modifications.js';

const fixture = () => {
  const engine = new EngineModel('turbojet', 'oem', () => 0.5);
  const drive = new Drivetrain(engine);
  return { engine, drive };
};
const run = ({ drive }, seconds, throttle = 0, fps = 60) => {
  let state;
  for (let n = 0; n < Math.round(seconds * fps); n++) state = drive.update(1 / fps, throttle, 0);
  return state;
};
const running = throttle => {
  const state = fixture();
  state.engine.setRunning(true);
  run(state, 40, throttle);
  return state;
};

test('J85 uses published static thrust and a percent core reference, without invented displacement, horsepower or gears', () => {
  const { engine, drive } = fixture();
  const config = ENGINE_CONFIGS.turbojet;
  assert.equal(config.propulsionKind, 'turbojet');
  assert.equal(config.coreRPMKind, 'normalized-animation-reference');
  assert.equal(config.ratedDryThrustN, 15500);
  assert.ok(Math.abs(config.ratedAfterburnerThrustN - 22241.1080763) < 0.001);
  assert.equal(config.compressorStages, 9);
  assert.equal(config.turbineStages, 2);
  assert.equal(config.torquePoints, undefined);
  assert.equal(config.ratedPowerKW, undefined);
  assert.equal(engine.displacement, 0);
  assert.deepEqual(engine.cylinderStates, []);
  assert.equal(VEHICLE_PROFILES.turbojet.gearingKind, 'not-applicable');
  assert.equal(drive.maxGear, 0);
  assert.deepEqual(drive.gearRatios, { 0: 0 });
  assert.equal(drive.getGearDisplay(), 'TEST');
  assert.equal(engine.dynoData.outputKind, 'thrust');
  assert.equal(engine.dynoData.maxHp, 0);
});

test('starter spools from rest before light-off, then settles to an estimated continuous-combustion idle', () => {
  const state = fixture();
  const { engine } = state;
  engine.setRunning(true);
  assert.equal(engine.rpm, 0, 'the start command cannot teleport the shaft to idle');
  run(state, 1, 0);
  assert.ok(engine.corePercent > 0 && engine.corePercent < 10);
  assert.equal(engine.starterActive, true);
  assert.equal(engine.isCombusting, false);
  assert.equal(engine.fuelFlowKgS, 0);
  assert.equal(engine.thrustN, 0);
  run(state, 30, 0);
  assert.equal(engine.starterActive, false);
  assert.equal(engine.isCombusting, true);
  assert.ok(Math.abs(engine.corePercent - 55) < 0.001);
  assert.ok(engine.thrustN > 0 && engine.thrustN < engine.config.ratedDryThrustN * 0.2);
  assert.ok(engine.fuelFlowKgS > 0 && engine.exhaustTemperatureC > 15);
});

test('sea-level dry design point keeps NASA pressure ratio, flow and turbine-exit temperature with 15.5 kN thrust', () => {
  const { engine } = running(1);
  assert.ok(Math.abs(engine.corePercent - 100) < 0.001);
  assert.ok(Math.abs(engine.pressureRatio - 8.30) < 0.001);
  assert.ok(Math.abs(engine.massFlowKgS - 24.05) < 0.001);
  assert.ok(Math.abs(engine.exhaustTemperatureC - 726.85) < 0.01);
  assert.ok(Math.abs(engine.thrustN - 15500) < 1);
  // The reduced constant-cp heat balance is close to NASA's reported 0.448 kg/s,
  // but is not falsely described as reproducing a full measured fuel-flow map.
  assert.ok(Math.abs(engine.fuelFlowKgS - 0.448) / 0.448 < 0.05);
  assert.ok(engine.compressorExitTemperatureC < engine.turbineInletTemperatureC);
  assert.ok(engine.exhaustTemperatureC < engine.turbineInletTemperatureC);
});

test('afterburner adds downstream fuel, jet velocity and nozzle opening rather than changing core RPM or turbine EGT', () => {
  const dry = running(1), wet = running(1);
  const before = wet.engine.snapshot();
  assert.equal(wet.engine.setAfterburnerEnabled(true), true);
  run(wet, 0.1, 1);
  assert.ok(wet.engine.afterburnerAmount > 0 && wet.engine.afterburnerAmount < 0.5);
  run(wet, 9.9, 1);
  run(dry, 10, 1);
  const e = wet.engine;
  assert.ok(Math.abs(e.thrustN - e.config.ratedAfterburnerThrustN) < 1);
  assert.ok(e.fuelFlowKgS > before.fuelFlowKgS * 2);
  assert.ok(e.jetVelocity > before.jetVelocity * 1.3);
  assert.ok(e.nozzleAreaRatio > 1.35);
  assert.ok(e.nozzleTemperatureC > e.exhaustTemperatureC + 500);
  assert.equal(e.coreRPM, dry.engine.coreRPM);
  assert.equal(e.pressureRatio, dry.engine.pressureRatio);
  assert.equal(e.massFlowKgS, dry.engine.massFlowKgS);
  assert.equal(e.exhaustTemperatureC, dry.engine.exhaustTemperatureC);
  e.setAfterburnerEnabled(false);
  run(wet, 5, 1);
  assert.ok(Math.abs(e.thrustN - 15500) < 1);
  assert.ok(Math.abs(e.nozzleAreaRatio - 1) < 0.001);
});

test('an armed augmentor cannot light during the starter sequence, idle or low-power operation', () => {
  const state = fixture();
  const e = state.engine;
  e.setRunning(true); e.setAfterburnerEnabled(true);
  run(state, 1, 1);
  assert.equal(e.isCombusting, false);
  assert.equal(e.afterburnerAmount, 0);
  run(state, 30, 0);
  assert.equal(e.afterburnerEnabled, true);
  assert.equal(e.afterburnerAmount, 0);
  run(state, 15, 0.6);
  assert.equal(e.afterburnerAmount, 0);
  assert.ok(e.thrustN < e.config.ratedDryThrustN);
});

test('throttle increases and releases retain finite spool lag and continuous shaft speed', () => {
  const state = running(0), e = state.engine;
  const idle = e.coreRPM;
  run(state, 0.1, 1);
  assert.ok(e.coreRPM > idle && e.coreRPM < e.redlineRPM * 0.65);
  run(state, 15, 1);
  assert.ok(e.corePercent > 99.9);
  let previous = e.coreRPM;
  for (let n = 0; n < 6 / dt; n++) {
    state.drive.update(dt, 0, 1);
    assert.ok(e.coreRPM <= previous + 1e-6);
    assert.ok(previous - e.coreRPM < e.redlineRPM * 0.001);
    assert.equal(e.isRevLimiting, false);
    previous = e.coreRPM;
  }
  assert.ok(e.corePercent > 55 && e.corePercent < 58);
});

test('fuel shutdown stops combustion immediately while core airflow and measured heat coast down', () => {
  const state = running(1), e = state.engine;
  e.setAfterburnerEnabled(true); run(state, 5, 1);
  const before = e.snapshot();
  e.setRunning(false);
  assert.equal(e.coreRPM, before.coreRPM);
  assert.equal(e.isCombusting, false);
  assert.equal(e.fuelFlowKgS, 0);
  assert.equal(e.thrustN, 0);
  assert.equal(e.afterburnerAmount, 0);
  assert.equal(e.afterburnerEnabled, false);
  run(state, 1, 1);
  assert.ok(e.coreRPM > 0 && e.coreRPM < before.coreRPM);
  assert.ok(e.massFlowKgS > 0 && e.massFlowKgS < before.massFlowKgS);
  assert.ok(e.exhaustTemperatureC > 15 && e.exhaustTemperatureC < before.exhaustTemperatureC);
  assert.equal(e.fuelFlowKgS, 0);
  assert.equal(e.thrustN, 0);
  run(state, 40, 1);
  assert.equal(e.coreRPM, 0);
  assert.equal(e.massFlowKgS, 0);
});

test('the bench rejects automotive commands and cannot turn wheel speed, braking or stored clutch state into a core RPM discontinuity', () => {
  const state = running(0.7), { engine, drive } = state;
  for (const rejected of [() => drive.setMode('at'), () => drive.setMode('amt'),
    () => drive.setAtSelector('D'), () => drive.setAtSelector('R'),
    () => drive.setAmtGear(1), () => drive.startShift(1), () => drive.shiftUp(), () => drive.shiftDown(),
    () => drive.setFinalDriveScale(1.25), () => drive.setVehicleMass(3000)]) assert.equal(rejected(), false);
  assert.equal(drive.calcRPMFromSpeed(1, 300), 0);
  assert.equal(drive.calcSpeedFromRPM(1, 17000), 0);
  assert.equal(drive.couple(dt, 1, 99999), false);
  const before = engine.coreRPM;
  drive.currentGear = 3; drive.speedKmh = 300; drive.distanceMeters = 1000;
  drive.shiftState = 'shifting'; drive.cutAmount = 1;
  const snapshot = drive.update(dt, 0.7, 1);
  assert.ok(Math.abs(engine.coreRPM - before) < 1);
  assert.equal(snapshot.mode, 'bench');
  assert.equal(snapshot.gearDisplay, 'TEST');
  assert.equal(snapshot.currentGear, 0);
  assert.equal(snapshot.gearRatio, 0);
  assert.equal(snapshot.cutAmount, 0);
  assert.equal(snapshot.isShifting, false);
  assert.equal(drive.speedKmh, 0);
  assert.equal(drive.distanceMeters, 0);
});

test('piston tuning, displacement, firing cuts and exhaust packages cannot alter a running jet cycle', () => {
  const state = running(1), e = state.engine;
  const before = e.snapshot();
  assert.equal(e.setForcedInduction('supercharger'), false);
  assert.equal(e.setForcedInduction('turbo'), false);
  assert.equal(e.setMaxBoost(3), false);
  assert.equal(e.setTurboSize('large'), false);
  assert.equal(e.setBovType('flutter'), false);
  assert.equal(e.setDisplacement(8000), false);
  assert.equal(e.setRedlineRPM(19500), false);
  assert.equal(e.setExhaust('straight'), false);
  for (const part of MODIFICATION_CATALOG) {
    assert.equal(isModificationSupported(e.config, 'supercharger', part.id), false);
    assert.equal(e.setModification(part.id, part.options[1].value), false);
  }
  e.setECUMode('hard'); e.setLimiterHz(32); e.setLimiterDepth(1);
  e.prepareStep(dt, 1, { torqueScale: 0, idleLoad: 9999 });
  const coreBeforeCoupling = e.coreRPM;
  e.advanceStep(dt, { coupledRPM: 100, loadTorque: 99999 });
  e.createPop('limiter');
  assert.equal(e.coreRPM, coreBeforeCoupling);
  assert.equal(e.displacement, 0);
  assert.equal(e.maxBoost, 0);
  assert.equal(e.forcedInduction, 'na');
  assert.equal(e.exhaust.id, 'oem');
  assert.equal(e.isRevLimiting, false);
  assert.equal(e.revLimiterCutAmount, 0);
  assert.equal(e.combustionTorque, 0);
  assert.equal(e.netTorque, 0);
  assert.deepEqual(e.popEvents, []);
  assert.ok(Math.abs(e.thrustN - before.thrustN) < 0.001);
  assert.equal(e.getCurrentDynoOutput().hp, 0);
});

test('static momentum thrust uses air plus fuel flow and exported readings share one coherent live state', () => {
  const state = running(1), e = state.engine;
  e.setAfterburnerEnabled(true); run(state, 5, 1);
  const snapshot = e.snapshot();
  assert.ok(Math.abs(snapshot.thrustN - (snapshot.massFlowKgS + snapshot.fuelFlowKgS) * snapshot.jetVelocity) < 1e-7);
  for (const key of ['coreRPM', 'corePercent', 'thrustN', 'exhaustTemperatureC', 'afterburnerAmount',
    'afterburnerEnabled', 'pressureRatio', 'massFlowKgS', 'nozzleAreaRatio', 'jetVelocity', 'isCombusting']) {
    assert.equal(snapshot[key], e[key], key);
  }
  assert.equal(snapshot.rpm, snapshot.coreRPM);
  assert.equal(snapshot.dyno.outputKind, 'thrust');
});

test('core, augmentor and bench state do not depend on display frame rate', () => {
  const results = [15, 30, 60, 144, 240].map(fps => {
    const state = fixture(); state.engine.setRunning(true);
    run(state, 15, 1, fps); state.engine.setAfterburnerEnabled(true);
    run(state, 3, 1, fps); run(state, 2, 0.2, fps);
    return [state.engine.coreRPM, state.engine.thrustN, state.engine.fuelFlowKgS,
      state.engine.afterburnerAmount, state.engine.exhaustTemperatureC, state.drive.speedKmh];
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('switching from the bench back to a road engine removes jet state and restores the original transmission', () => {
  const state = running(1), { engine, drive } = state;
  engine.setConfig('i4_cross'); drive.configureVehicle();
  assert.equal(engine.jet, null);
  assert.equal(engine.coreRPM, undefined);
  assert.equal(engine.thrustN, undefined);
  assert.equal(engine.snapshot().coreRPM, undefined);
  assert.equal(drive.mode, 'at');
  assert.equal(drive.maxGear, 6);
  assert.ok(engine.displacement > 0 && engine.dynoData.maxHp > 190);
  assert.equal(drive.setAtSelector('D'), true);
  run(state, 3, 1);
  assert.ok(drive.speedKmh > 20);
  engine.setConfig('turbojet'); drive.configureVehicle();
  assert.equal(drive.mode, 'bench');
  assert.equal(drive.currentGear, 0);
  assert.equal(drive.speedKmh, 0);
  assert.equal(drive.distanceMeters, 0);
});

test('the legacy turboshaft road demonstration is explicitly estimated and rejects piston hardware and external compressors', () => {
  const e = new EngineModel('gas_turbine', 'oem');
  assert.equal(e.config.curveKind, 'estimate');
  assert.equal(VEHICLE_PROFILES.gas_turbine.gearingKind, 'experimental');
  assert.match(e.config.description, /單軸簡化.*未模擬.*雙軸/);
  assert.equal(e.setForcedInduction('turbo'), false);
  assert.equal(e.setForcedInduction('supercharger'), false);
  for (const part of MODIFICATION_CATALOG) assert.equal(e.setModification(part.id, part.options[1].value), false);
  assert.equal(e.forcedInduction, 'na');
});
