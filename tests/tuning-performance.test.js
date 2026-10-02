import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { gearingSummary, performanceAssessment } from '../src/physics/PerformanceAnalysis.js';
import { capturePerformanceSetup, setupCaption, PerformancePanel } from '../src/controls/PerformancePanel.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';

test('all engines gain usable steady torque with CC while fixed ratios retain the same redline wheel speeds', () => {
  for (const id of Object.keys(ENGINE_CONFIGS)) {
    const e = new EngineModel(id, 'oem'), d = new Drivetrain(e);
    const before = e.dynoData, gearing = gearingSummary(e, d);
    e.setDisplacement(e.config.maxDisplacement);
    assert.ok(e.dynoData.maxHp > before.maxHp, id);
    assert.ok(e.dynoData.maxTorque > before.maxTorque, id);
    assert.deepEqual(gearingSummary(e, d), gearing, `${id}: increasing CC cannot invent longer gearing`);
  }
});

test('final drive changes actual wheel ratios, redline speeds and performance setup; restores exactly', () => {
  const e = new EngineModel('i4_cross', 'oem'), d = new Drivetrain(e);
  const base = gearingSummary(e, d), ratio = d.finalDrive;
  assert.equal(d.setFinalDriveScale(0.8), true);
  for (const [i, row] of gearingSummary(e, d).entries()) {
    assert.ok(Math.abs(row.redlineSpeed - base[i].redlineSpeed / 0.8) < 1e-8);
    assert.equal(row.nextRPM, base[i].nextRPM, 'final drive does not change adjacent-gear RPM drop');
  }
  assert.ok(Math.abs(d.calcRPMFromSpeed(6, 100) - 0.8 * new Drivetrain(e).calcRPMFromSpeed(6, 100)) < 1e-8);
  const setup = capturePerformanceSetup(e, d);
  assert.equal(setup.finalDrive, ratio * 0.8); assert.match(setupCaption(setup), /終傳/);
  d.gearRatios[1] = 9; assert.notEqual(setup.gearRatios[1], 9, 'saved ratios are immutable');
  assert.equal(d.setFinalDriveScale(1), true); assert.equal(d.finalDrive, ratio);
  d.speedKmh = 2; assert.equal(d.setFinalDriveScale(0.75), false); assert.equal(d.finalDrive, ratio);
  d.speedKmh = 0; d.configureVehicle(); assert.deepEqual(gearingSummary(e, d), base);
});

test('a final drive change cancels an armed performance comparison rather than mixing setups', () => {
  const e = new EngineModel('honda_k20a', 'oem'), d = new Drivetrain(e);
  e.setRunning(true); d.setAtSelector('D');
  const panel = Object.create(PerformancePanel.prototype);
  Object.assign(panel, { engine: e, drive: d, meter: new PerformanceMeter(), signature: JSON.stringify(capturePerformanceSetup(e, d)) });
  panel.meter.arm({time:0,speed:0,distance:0,gear:1,running:true}, capturePerformanceSetup(e, d));
  d.setFinalDriveScale(1.1); panel.beforeStep(); assert.equal(panel.meter.state, 'cancelled');
});

test('the live limiter explanation distinguishes grip from gearing using a real CP4 run', () => {
  const e = new EngineModel('i4_cross', 'oem'), d = new Drivetrain(e);
  e.setDisplacement(1300); e.setRunning(true); d.setAtSelector('D');
  let gripSeen = false;
  for (let frame = 0; frame < 90 * 30; frame++) {
    d.update(1 / 30, 1, 0);
    if (performanceAssessment(e, d).reason === 'traction') gripSeen = true;
  }
  assert.equal(gripSeen, true);
  const result = performanceAssessment(e, d);
  assert.equal(d.currentGear, d.maxGear, 'AT must not settle on the limiter in an intermediate gear');
  assert.equal(result.reason, 'gearing'); assert.ok(result.theoreticalTop > d.speedKmh);
  assert.equal(result.shaftPowerKW, 0);
});

test('CC improves a power-limited car launch, and longer gearing lets a tuned CP4 exceed its old wheel-speed limit', () => {
  function run(id, cc, scale = 1) {
    const e = new EngineModel(id, 'oem'), d = new Drivetrain(e);
    e.setDisplacement(cc); d.setFinalDriveScale(scale); e.setRunning(true); d.setAtSelector('D');
    let to100 = null;
    for (let f = 0; f < 90 * 30; f++) {
      d.update(1 / 30, 1, 0); if (to100 === null && d.speedKmh >= 100) to100 = (f + 1) / 30;
    }
    return { to100, speed: d.speedKmh, gearing: d.calcSpeedFromRPM(d.maxGear, e.redlineRPM) };
  }
  const stock = run('honda_k20a', 1998), bigger = run('honda_k20a', 2400);
  assert.ok(bigger.to100 < stock.to100 * 0.94);
  const r1 = run('i4_cross', 1300), longer = run('i4_cross', 1300, 0.85);
  assert.ok(longer.speed > r1.gearing);
});

test('holding AMT first gear at redline explains the limiter instead of claiming continued acceleration', () => {
  const e = new EngineModel('i4_cross', 'oem'), d = new Drivetrain(e);
  e.setRunning(true); d.setMode('amt'); d.setAmtGear(1);
  for (let frame = 0; frame < 12 * 60; frame++) d.update(1 / 60, 1, 0);
  assert.equal(d.currentGear, 1);
  assert.ok(e.rpm > e.redlineRPM - e.revLimitControlRange * 1.3);
  const result = performanceAssessment(e, d);
  assert.equal(result.reason, 'limiter');
  assert.match(result.text, /AMT.*升檔/);
});

test('full-throttle AT shifts at a traction crossover instead of a universal redline fraction', () => {
  const e = new EngineModel('i2_180', 'oem'), d = new Drivetrain(e);
  e.setRunning(true); d.setAtSelector('D'); d.currentGear = 5; d.shiftState = 'locked'; d.atShiftCooldown = 0;
  e.rpm = 11300; d.speedKmh = d.calcSpeedFromRPM(5, e.rpm);
  const current = e.steadyTorqueAtRPM(e.rpm) * d.gearRatios[5];
  const next = e.steadyTorqueAtRPM(d.calcRPMFromSpeed(6, d.speedKmh)) * d.gearRatios[6];
  assert.ok(next > current * 1.035);
  d.automaticShift(1 / 240, 1); assert.equal(d.targetGear, 6);
});
