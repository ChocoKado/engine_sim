import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';

test('R1 reaches 300+ in sixth within real gearing, rather than using fourth as its top gear', () => {
  const engine = new EngineModel('i4_cross', 'oem');
  const drive = new Drivetrain(engine);
  engine.setRunning(true);
  drive.setAtSelector('D');
  for (let i = 0; i < 90 * 60; i++) drive.update(1 / 60, 1, 0);
  assert.equal(drive.currentGear, 6);
  assert.ok(drive.speedKmh > 300 && drive.speedKmh < drive.calcSpeedFromRPM(6, engine.redlineRPM));
  assert.ok(drive.calcSpeedFromRPM(4, engine.redlineRPM) < 260);
});

test('all seven-speed cars can actually engage seventh under power', () => {
  for (const id of ['v8_flat', 'v12', 'w16']) {
    const engine = new EngineModel(id, 'oem');
    const drive = new Drivetrain(engine);
    engine.setRunning(true);
    drive.setAtSelector('D');
    for (let i = 0; i < 90 * 60; i++) drive.update(1 / 60, 1, 0);
    assert.equal(drive.currentGear, 7, id);
    assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(7, drive.speedKmh)) < 1e-7, id);
  }
});

test('larger displacement increases torque and inertia; higher redline does not invent more low-RPM torque', () => {
  const engine = new EngineModel('v8_cross', 'oem');
  const torque = engine.steadyTorqueAtRPM(3500), inertia = engine.inertia;
  engine.setDisplacement(engine.displacement * 1.2);
  assert.ok(engine.steadyTorqueAtRPM(3500) > torque * 1.19);
  assert.ok(engine.inertia > inertia);
  const tunedTorque = engine.steadyTorqueAtRPM(3500);
  engine.setRedlineRPM(engine.redlineRPM + 500);
  assert.equal(engine.steadyTorqueAtRPM(3500), tunedTorque);
});

test('a shift cut is preserved at low display FPS and AMT cuts more sharply than AT', () => {
  const cuts = [];
  for (const mode of ['at', 'amt']) {
    const engine = new EngineModel('i4_cross', 'oem');
    const drive = new Drivetrain(engine);
    engine.setRunning(true);
    drive.setMode(mode);
    mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
    engine.rpm = 11000;
    engine.manifoldThrottle = 1;
    drive.speedKmh = drive.calcSpeedFromRPM(1, engine.rpm);
    drive.shiftState = 'locked';
    drive.shiftUp();
    const state = drive.update(1 / 15, 1, 0);
    assert.equal(state.isShifting, true);
    assert.equal(state.isUpshift, true);
    assert.ok(state.cutAmount > 0.5);
    assert.ok(engine.rpm < 11000 && engine.rpm > engine.idleRPM);
    assert.equal(state.engine.bovEvents.length, 0);
    cuts.push(state.cutAmount);
  }
  assert.ok(cuts[1] > cuts[0]);
});

test('boosted AT launch respects converter torque multiplication without flaring against the limiter', () => {
  for (const induction of ['turbo', 'supercharger']) {
    const engine = new EngineModel('i4_cross', 'oem');
    const drive = new Drivetrain(engine);
    engine.setForcedInduction(induction);
    engine.setMaxBoost(1);
    engine.setRunning(true);
    drive.setAtSelector('D');
    // Brakes hold the vehicle, so the converter must find a finite stall
    // operating point. More engine torque must not evade tyre traction control.
    for (let i = 0; i < 5 * 60; i++) drive.update(1 / 60, 1, 1);
    assert.equal(drive.speedKmh, 0);
    assert.ok(engine.rpm > engine.idleRPM * 2 && engine.rpm < engine.redlineRPM * 0.8, induction);
    assert.equal(engine.isRevLimiting, false);
    for (let i = 0; i < 2 * 60; i++) drive.update(1 / 60, 1, 0);
    assert.ok(drive.speedKmh > 30, induction);
  }
});
