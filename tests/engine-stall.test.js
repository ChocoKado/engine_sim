import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';

function applyStallingLoad(engine) {
  // A 100 Nm resisting crankshaft load exceeds the R1's idle torque. Advance
  // the real inertia equation until the crank stops; do not assign its RPM.
  for (let step = 0; step < 240 && engine.rpm > 0; step++) {
    engine.prepareStep(dt, 0);
    engine.advanceStep(dt, { loadTorque: 100 });
  }
  assert.equal(engine.rpm, 0);
}

test('a crank stopped by excessive load reports stalled and cannot restart from throttle alone', () => {
  const e = new EngineModel('i4_cross', 'oem');
  e.setRunning(true);
  e.setECUMode('hard'); e.setLimiterHz(32); e.setLimiterDepth(1);
  applyStallingLoad(e);
  assert.equal(e.isIgnitionOn, false);
  assert.equal(e.isStalled, true);
  assert.equal(e.snapshot().isStalled, true);
  assert.equal(e.combustionTorque, 0);
  assert.equal(e.ignitionCut, false);
  assert.equal(e.revLimiterCutAmount, 0);
  assert.equal(e.popEvents.length, 0);
  assert.equal(e.bovEvents.length, 0);
  assert.ok(e.cylinderStates.every(c => !c.isFiring && c.sparkTimer === 0));
  for (let step = 0; step < 240; step++) { e.prepareStep(dt, 1); e.advanceStep(dt); }
  assert.equal(e.rpm, 0);
  assert.equal(e.combustionTorque, 0);
  assert.equal(e.isStalled, true);
  // One deliberate starter action clears the stall and preserves ECU tuning.
  e.setRunning(true);
  assert.equal(e.isStalled, false);
  assert.equal(e.isIgnitionOn, true);
  assert.equal(e.rpm, e.idleRPM);
  assert.equal(e.limiter.mode, 'hard');
  assert.equal(e.limiter.hz, 32);
  assert.equal(e.limiter.depth, 1);
  for (let step = 0; step < 240; step++) { e.prepareStep(dt, 1); e.advanceStep(dt); }
  assert.ok(e.rpm > e.idleRPM * 2);
});

test('stall clears combustion events while a free turbo rotor coasts down physically', () => {
  const e = new EngineModel('i4_cross', 'straight');
  e.setForcedInduction('turbo'); e.setRunning(true);
  for (let step = 0; step < 240; step++) { e.prepareStep(dt, 1); e.advanceStep(dt); }
  assert.ok(e.induction.turboRPM > 0, 'exhaust actually spools the rotor before applying load');
  applyStallingLoad(e);
  assert.ok(e.induction.turboRPM > 0, 'stopping combustion does not erase rotor energy');
  const stalledRotorRPM = e.induction.turboRPM;
  e.prepareStep(dt, 1); e.advanceStep(dt);
  assert.ok(e.induction.turboRPM > 0 && e.induction.turboRPM < stalledRotorRPM);
  assert.equal(e.boostPressure, 0);
  assert.equal(e.bovEvents.length, 0);
  assert.equal(e.combustionTorque, 0);
});

test('manual shutdown and model changes clear the stall marker consistently', () => {
  const e = new EngineModel('i4_cross');
  assert.equal(e.isStalled, false);
  e.setRunning(true); applyStallingLoad(e);
  e.setRunning(false);
  assert.equal(e.isStalled, false);
  assert.equal(e.isIgnitionOn, false);
  e.setRunning(true); applyStallingLoad(e);
  e.setConfig('rotary_2');
  assert.equal(e.isStalled, false);
  assert.equal(e.isIgnitionOn, false);
  assert.equal(e.rpm, 0);
});

test('the drivetrain and acceleration meter observe the actual stall and one explicit restart', () => {
  const e = new EngineModel('i4_cross', 'oem'), d = new Drivetrain(e), meter = new PerformanceMeter();
  e.setRunning(true); d.setAtSelector('D');
  meter.arm({ time: e.time, speed: 0, distance: 0, running: true, gear: 1 }, { model: 'R1' });
  d.onStep = sample => meter.sample(sample);
  applyStallingLoad(e);
  d.update(1 / 30, 1, 0);
  assert.equal(meter.state, 'cancelled');
  assert.equal(d.speedKmh, 0);
  assert.equal(d.shiftState, 'idle');
  e.setRunning(true);
  for (let step = 0; step < 240; step++) d.update(dt, 1, 0);
  assert.equal(e.isStalled, false);
  assert.equal(e.isIgnitionOn, true);
  assert.ok(d.speedKmh > 8);
});
