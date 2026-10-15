import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ThermalModel } from '../src/physics/ThermalModel.js';
import { isModificationSupported } from '../src/physics/Modifications.js';

const run = (drive, seconds, throttle = 0) => {
  for (let n = 0; n < Math.round(seconds / dt); n++) drive.update(dt, throttle, 0);
};
const thermalRun = (model, seconds, settings) => {
  for (let n = 0; n < Math.round(seconds / dt); n++) model.update(dt, settings);
};

test('warm road engines preserve nominal output while cold oil increases actual drag and lowers available output', () => {
  const warm = new EngineModel('i4_cross', 'oem'), cold = new EngineModel('i4_cross', 'oem');
  cold.setThermalMode('cold');
  for (const engine of [warm, cold]) {
    engine.setRunning(true); engine.rpm = 6000; engine.manifoldThrottle = 1;
    engine.prepareStep(dt, 1);
  }
  assert.equal(warm.thermalPowerFactor, 1);
  assert.equal(warm.thermalDragFactor, 1);
  assert.ok(cold.netTorque < warm.netTorque);
  assert.ok(cold.currentEngineDrag > warm.currentEngineDrag);
  assert.equal(cold.thermalState, 'cold');
  assert.ok(cold.coolantTemperatureC < 30 && cold.oilTemperatureC < 30);
  assert.equal(cold.setThermalMode('invalid'), false);
  cold.setThermalMode('warm');
  assert.equal(cold.oilTemperatureC, 92);
  assert.equal(cold.coolantTemperatureC, 88);
  assert.equal(cold.thermalPowerFactor, 1);
});

test('cold temperatures warm from actual heat input and retain different coolant/oil response times', () => {
  const model = new ThermalModel({ layout: 'inline', defaultDisplacement: 2000 });
  model.setMode('cold');
  thermalRun(model, 240, { running: true, shaftPowerKW: 60, ratedPowerKW: 150,
    displacementCC: 2000, speedKmh: 45 });
  assert.ok(model.bodyTemperatureC > 80);
  assert.ok(model.oilTemperatureC > 80);
  assert.ok(Math.abs(model.bodyTemperatureC - model.oilTemperatureC) > 1);
  assert.equal(model.thermalPowerFactor, 1);
  assert.equal(model.thermalState, 'normal');
  const before = model.oilTemperatureC;
  thermalRun(model, 30, { running: false, ratedPowerKW: 150, displacementCC: 2000 });
  assert.ok(model.oilTemperatureC < before && model.oilTemperatureC > 25,
    'switching off the engine cannot instantly erase stored oil heat');
});

test('sustained excessive load produces heat fade; radiator capacity and a real fan improve heat rejection rather than nominal HP', () => {
  const stock = new ThermalModel({ layout: 'inline', defaultDisplacement: 2000 });
  const upgraded = new ThermalModel({ layout: 'inline', defaultDisplacement: 2000 });
  const fanOff = new ThermalModel({ layout: 'inline', defaultDisplacement: 2000 });
  fanOff.setCoolingFan(false);
  const settings = { running: true, shaftPowerKW: 250, ratedPowerKW: 150, displacementCC: 2000, speedKmh: 0 };
  thermalRun(stock, 180, settings);
  thermalRun(upgraded, 180, { ...settings, radiator: 'upgraded' });
  thermalRun(fanOff, 180, settings);
  assert.equal(stock.thermalState, 'overheating');
  assert.ok(stock.thermalPowerFactor < 0.9);
  assert.ok(upgraded.bodyTemperatureC < stock.bodyTemperatureC - 10);
  assert.ok(upgraded.thermalPowerFactor > stock.thermalPowerFactor);
  assert.ok(fanOff.bodyTemperatureC > stock.bodyTemperatureC);
  assert.ok(fanOff.thermalPowerFactor < stock.thermalPowerFactor);
  assert.equal(stock.radiatorFanOn, true);
  assert.equal(fanOff.radiatorFanOn, false);
  const engine = new EngineModel('i4_cross', 'oem');
  const hp = engine.dynoData.maxHp;
  assert.equal(engine.setModification('radiator', 'upgraded'), true);
  assert.equal(engine.dynoData.maxHp, hp);
  assert.equal(isModificationSupported({ layout: 'radial' }, 'na', 'radiator'), false);
  assert.equal(isModificationSupported({ layout: 'turbine' }, 'na', 'radiator'), false);
  assert.equal(isModificationSupported({ layout: 'turbojet' }, 'na', 'radiator'), false);
});

test('overheating changes the live crank output and exported heat state, then warm reset restores baseline', () => {
  const engine = new EngineModel('i4_cross', 'oem');
  engine.setForcedInduction('supercharger'); engine.setMaxBoost(3); engine.setRunning(true);
  engine.setCoolingFan(false);
  let baseline = 0;
  for (let n = 0; n < 150 / dt; n++) {
    engine.rpm = 8000;
    engine.prepareStep(dt, 1);
    engine.advanceStep(dt, { coupledRPM: 8000 });
    if (n === Math.round(4 / dt)) baseline = engine.netTorque;
  }
  assert.ok(engine.thermalPowerFactor < 0.9);
  assert.ok(engine.netTorque < baseline * 0.95);
  const snapshot = engine.snapshot();
  for (const key of ['coolantTemperatureC', 'oilTemperatureC', 'chargeTemperatureC',
    'thermalPowerFactor', 'thermalState', 'radiatorFanOn']) assert.equal(snapshot[key], engine[key]);
  engine.setThermalMode('warm');
  engine.prepareStep(dt, 1);
  assert.ok(engine.netTorque > baseline * 0.99);
});

test('air-cooled radials and aviation engines do not expose a fictitious water temperature or radiator fan', () => {
  for (const id of ['radial_7', 'gas_turbine', 'turbojet']) {
    const engine = new EngineModel(id, 'oem');
    engine.setCoolingFan(true);
    assert.equal(engine.snapshot().coolantTemperatureC, null);
    assert.equal(engine.snapshot().radiatorFanOn, false);
    assert.ok(Number.isFinite(engine.oilTemperatureC));
  }
});

test('normal jet start follows purge, light-off and running with shared combustion and temperature state', () => {
  const engine = new EngineModel('turbojet'), drive = new Drivetrain(engine);
  assert.equal(engine.setStartScenario('normal'), true);
  engine.setRunning(true);
  const states = new Set();
  for (let n = 0; n < 20 / dt; n++) {
    drive.update(dt, 0, 0); states.add(engine.startState);
    if (engine.startState === 'purge') assert.equal(engine.isCombusting, false);
  }
  assert.deepEqual([...states], ['purge', 'lightoff', 'running']);
  assert.equal(engine.faultCode, '');
  assert.equal(engine.isCombusting, true);
  assert.ok(engine.fuelFlowKgS > 0 && engine.exhaustTemperatureC > 200);
  assert.equal(engine.setStartScenario('hot-start'), false);
});

test('no-lightoff injects unburned fuel without fake combustion, times out, cuts fuel and dry-motors to purge', () => {
  const engine = new EngineModel('turbojet'), drive = new Drivetrain(engine);
  engine.setStartScenario('no-lightoff'); engine.setRunning(true);
  let injected = false, maxResidue = 0;
  for (let n = 0; n < 15 / dt && !engine.faultCode; n++) {
    drive.update(dt, 0, 0);
    injected ||= engine.fuelFlowKgS > 0;
    maxResidue = Math.max(maxResidue, engine.unburnedFuelKg);
    assert.equal(engine.isCombusting, false);
    assert.equal(engine.thrustN, 0);
    assert.ok(engine.exhaustTemperatureC < 30);
  }
  assert.equal(injected, true);
  assert.ok(maxResidue > 0.2);
  assert.equal(engine.faultCode, 'NO_LIGHTOFF');
  assert.equal(engine.startState, 'abort');
  assert.equal(engine.isIgnitionOn, false);
  assert.equal(engine.fuelFlowKgS, 0);
  assert.equal(engine.resetStartFault(), false);
  run(drive, 2);
  assert.equal(engine.startState, 'purge');
  assert.equal(engine.starterActive, true);
  assert.ok(engine.unburnedFuelKg < maxResidue * 0.2);
  assert.equal(engine.fuelFlowKgS, 0);
  run(drive, 40);
  assert.equal(engine.resetStartFault(), true);
  assert.equal(engine.setStartScenario('normal'), true);
  engine.setRunning(true); run(drive, 20);
  assert.equal(engine.startState, 'running');
  assert.equal(engine.faultCode, '');
});

test('hot-start is a real low-airflow temperature excursion followed by protected abort, residual flame and purge', () => {
  const engine = new EngineModel('turbojet'), drive = new Drivetrain(engine);
  engine.setStartScenario('hot-start'); engine.setRunning(true);
  let maxEGT = 15, lightoff = false;
  for (let n = 0; n < 15 / dt && !engine.faultCode; n++) {
    drive.update(dt, 0, 0);
    lightoff ||= engine.isCombusting;
    maxEGT = Math.max(maxEGT, engine.exhaustTemperatureC);
  }
  assert.equal(lightoff, true);
  assert.ok(maxEGT > 850);
  assert.ok(engine.corePercent < 40);
  assert.equal(engine.faultCode, 'HOT_START');
  assert.equal(engine.startState, 'abort');
  assert.equal(engine.fuelFlowKgS, 0);
  assert.equal(engine.thrustN, 0);
  assert.equal(engine.isCombusting, false);
  assert.ok(engine.faultFireAmount > 0.9);
  const captured = engine.snapshot();
  assert.equal(captured.faultCode, engine.faultCode);
  assert.equal(captured.faultFireAmount, engine.faultFireAmount);
  run(drive, 1);
  assert.equal(engine.startState, 'purge');
  assert.ok(engine.faultFireAmount < 0.1);
  assert.ok(engine.exhaustTemperatureC < maxEGT);
  engine.setRunning(true);
  assert.equal(engine.isIgnitionOn, false, 'an unresolved fault cannot silently restart combustion');
  run(drive, 40);
  assert.equal(engine.resetStartFault(), true);
});
