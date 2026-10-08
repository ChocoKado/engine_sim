import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/app.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';
import { PerformancePanel, capturePerformanceSetup, setupCaption } from '../src/controls/PerformancePanel.js';

test('garage hardware cannot be installed while firing or while the vehicle is moving', () => {
  const engine = new EngineModel('i4_cross');
  const drivetrain = new Drivetrain(engine);
  let synchronized = 0;
  const app = { engine, drivetrain, syncTuningUI() { synchronized++; } };
  engine.setRunning(true);
  assert.equal(App.prototype.installModification.call(app, 'flywheel', 'light'), false);
  assert.equal(engine.modifications.flywheel, 'stock');
  engine.setRunning(false);
  drivetrain.speedKmh = 20;
  assert.equal(App.prototype.installModification.call(app, 'flywheel', 'light'), false);
  assert.equal(engine.modifications.flywheel, 'stock');
  drivetrain.speedKmh = 0;
  assert.equal(App.prototype.installModification.call(app, 'flywheel', 'light'), true);
  assert.equal(engine.modifications.flywheel, 'light');
  assert.equal(synchronized, 1);
});

test('flywheel-only changes invalidate a pending performance run even though peak HP is unchanged', () => {
  const engine = new EngineModel('honda_k20a');
  const drive = new Drivetrain(engine);
  const panel = Object.create(PerformancePanel.prototype);
  const setup = capturePerformanceSetup(engine, drive);
  Object.assign(panel, { engine, drive, meter: new PerformanceMeter(), signature: JSON.stringify(setup) });
  panel.meter.arm({ time: 0, speed: 0, distance: 0, running: true, gear: 1 }, setup);
  engine.setModification('flywheel', 'light');
  assert.equal(engine.dynoData.maxHp, setup.peakHP);
  panel.beforeStep();
  assert.equal(panel.meter.state, 'cancelled');
  assert.equal(setup.modifications.flywheel, 'stock');
  assert.match(setupCaption(capturePerformanceSetup(engine, drive)), /改裝 飛輪/);
});

test('older performance history remains readable without a hardware field', () => {
  const engine = new EngineModel('honda_k20a');
  const setup = capturePerformanceSetup(engine, new Drivetrain(engine));
  delete setup.modifications;
  assert.doesNotThrow(() => setupCaption(setup));
  assert.doesNotMatch(setupCaption(setup), /改裝/);
});
