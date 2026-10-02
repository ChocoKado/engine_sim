import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceMeter, QUARTER_MILE_METERS, readPerformanceHistory, savePerformanceHistory } from '../src/physics/PerformanceMeter.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { capturePerformanceSetup, PerformancePanel } from '../src/controls/PerformancePanel.js';

const setup = { model: 'Test engine', mass: 1200 };
const sample = (time, speed, distance = 0) => ({ time, speed, distance, running: true, gear: 1 });
test('timing interpolates speed and quarter-mile crossings independent of sample frequency', () => {
  const run = dt => {
    const meter = new PerformanceMeter(); meter.arm(sample(0, 0), setup);
    // Uniform 10 km/h per second acceleration: 100 at 10 s, 200 at 20 s.
    for (let t = dt; t < 21; t += dt) meter.sample(sample(t, 10 * t, 10 / 3.6 * t * t / 2));
    return meter.result;
  };
  for (const dt of [1 / 240, 1 / 60, 0.25]) {
    const result = run(dt); assert.ok(result);
    assert.ok(Math.abs(result.metrics.zeroTo100 - 10) < 1e-9);
    assert.ok(Math.abs(result.metrics.hundredTo200 - 10) < 1e-9);
    assert.ok(Math.abs(result.metrics.quarterMile - Math.sqrt(QUARTER_MILE_METERS * 2 / (10 / 3.6))) < 0.001);
    assert.ok(Math.abs(result.metrics.finishSpeed - result.metrics.quarterMile * 10) < 1e-9);
  }
});

test('rolling test starts at the 100 crossing, independently of how long preparation takes', () => {
  const m = new PerformanceMeter(); m.arm(sample(50, 80), setup, 'rolling');
  m.sample(sample(51, 90)); assert.equal(m.state, 'armed');
  m.sample(sample(53, 110)); m.sample(sample(56, 210));
  assert.equal(m.state, 'complete'); assert.equal(m.metrics.zeroTo100, null); assert.equal(m.metrics.quarterMile, null);
  assert.ok(Math.abs(m.metrics.hundredTo200 - 3.7) < 1e-9);
});

test('invalid starts, shutdown, neutral/reverse and cancelled runs cannot produce saved records', () => {
  const m = new PerformanceMeter();
  assert.equal(m.arm({ ...sample(0, 0), running: false }, setup), false);
  assert.equal(m.arm({ ...sample(0, 0), gear: 0 }, setup), false);
  assert.equal(m.arm(sample(0, 20), setup), false);
  assert.equal(m.arm(sample(0, 100), setup, 'rolling'), false);
  m.arm(sample(0, 0), setup); m.sample(sample(1, 10));
  m.sample({ ...sample(2, 20), running: false }); assert.equal(m.state, 'cancelled'); assert.equal(m.result, null);
  m.arm(sample(0, 0), setup); m.sample({ ...sample(1, -2), gear: -1 }); assert.equal(m.state, 'cancelled');
  m.arm(sample(0, 0), setup); m.sample({ ...sample(1, 0), gear: 0 }); assert.equal(m.state, 'cancelled');
  m.arm(sample(0, 0), setup); m.cancel('changed setup'); m.sample(sample(30, 300)); assert.equal(m.result, null);
});
test('ready standing tests hold creep until throttle is applied, then release the launch brake', () => {
  const e = new EngineModel('honda_k20a'); const d = new Drivetrain(e); const m = new PerformanceMeter();
  e.setRunning(true); d.setAtSelector('D'); m.arm(sample(0, 0), capturePerformanceSetup(e, d));
  const panel = Object.create(PerformancePanel.prototype); panel.meter = m;
  d.onStep = s => m.sample(s);
  for (let i = 0; i < 240; i++) d.update(1 / 240, 0, panel.brakeForLaunch(0, 0));
  assert.equal(m.state, 'armed'); assert.equal(d.speedKmh, 0);
  assert.equal(panel.brakeForLaunch(1, 0), 0);
  for (let i = 0; i < 240; i++) d.update(1 / 240, 1, panel.brakeForLaunch(1, 0));
  assert.equal(m.state, 'running'); assert.ok(d.speedKmh > 8);
});

test('changing any performance setting invalidates an armed or running test', () => {
  const e = new EngineModel('honda_k20a'); const d = new Drivetrain(e); const panel = Object.create(PerformancePanel.prototype);
  panel.engine = e; panel.drive = d; panel.meter = new PerformanceMeter();
  e.setRunning(true); d.setAtSelector('D');
  const original = capturePerformanceSetup(e, d); panel.signature = JSON.stringify(original);
  panel.meter.arm(sample(0, 0), original); e.setVtecEnabled(false); panel.beforeStep();
  assert.equal(panel.meter.state, 'cancelled'); assert.match(panel.meter.message, /變更/);
});

test('manual finish saves only completed metrics and captures settings immutably', () => {
  const m = new PerformanceMeter(); const selected = { model: 'Honda', mass: 1300 };
  m.arm(sample(0, 0), selected); selected.mass = 3000;
  m.sample(sample(10, 120, 100)); m.stop();
  assert.equal(m.result.setup.mass, 1300); assert.equal(m.result.reason, 'stopped');
  assert.equal(m.result.metrics.quarterMile, null); assert.equal(m.result.metrics.hundredTo200, null);
  const n = new PerformanceMeter(); n.arm(sample(0, 0), setup); n.stop(); assert.equal(n.result, null);
});

test('history tolerates missing/corrupt/blocked storage and persists bounded valid runs', () => {
  const m = new PerformanceMeter(); m.arm(sample(0, 0), setup); m.sample(sample(10, 110)); m.stop();
  let saved = ''; const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  assert.equal(savePerformanceHistory(storage, Array(10).fill(m.result)), true);
  assert.equal(readPerformanceHistory(storage).length, 8);
  saved = '{broken'; assert.deepEqual(readPerformanceHistory(storage), []);
  saved = JSON.stringify([{ ...m.result, metrics: { zeroTo100: '1.23' } }]); assert.deepEqual(readPerformanceHistory(storage), []);
  assert.equal(savePerformanceHistory({ setItem: () => { throw Error('blocked'); } }, []), false);
});

test('real drivetrain supplies 240 Hz distance/time samples and a working standing test', () => {
  const e = new EngineModel('honda_k20a', 'oem'); const d = new Drivetrain(e); const m = new PerformanceMeter();
  e.setRunning(true); d.setAtSelector('D');
  const initial = { ...sample(0, 0), distance: d.distanceMeters };
  assert.equal(m.arm(initial, capturePerformanceSetup(e, d)), true);
  let count = 0; d.onStep = s => { count++; m.sample(s); };
  for (let frame = 0; frame < 40 * 15; frame++) d.update(1 / 15, 1, 0);
  assert.equal(count, 40 * 240);
  assert.ok(m.metrics.zeroTo100 > 3 && m.metrics.zeroTo100 < 15);
  assert.ok(m.metrics.quarterMile > m.metrics.zeroTo100 && m.metrics.quarterMile < 30);
  assert.ok(d.distanceMeters > 402.336);
});
