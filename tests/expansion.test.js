import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { CamControl, camValveLift } from '../src/physics/CamControl.js';
import { boxerKinematics, rotaryKinematics, rotaryHousingPoint } from '../src/visuals/MechanicalKinematics.js';
import { CombustionDSP } from '../src/audio/CombustionDSP.js';

test('VTEC follows RPM and load with hysteresis, and unloads on throttle release', () => {
  const cam = new CamControl(ENGINE_CONFIGS.honda_k20a);
  for (let i = 0; i < 120; i++) cam.update(dt, 6000, 0.8, true);
  assert.equal(cam.highCam, true); assert.ok(cam.blend > 0.99);
  cam.update(dt, 5700, 0.8, true); assert.equal(cam.highCam, true);
  cam.update(dt, 5500, 0.8, true); assert.equal(cam.highCam, false);
  for (let i = 0; i < 120; i++) cam.update(dt, 7000, 0.1, true);
  assert.equal(cam.highCam, false); assert.ok(cam.blend < 0.01);
  cam.setEnabled(false); cam.update(dt, 8000, 1, true); assert.equal(cam.highCam, false);
});
test('high cam has more lift, a longer opening window and overlap in the mechanical view', () => {
  assert.equal(camValveLift(200, 0).intake, 0);
  assert.ok(camValveLift(200, 1).intake > 0);
  assert.ok(camValveLift(90, 1).intake > camValveLift(90, 0).intake);
  assert.ok(camValveLift(10, 1).intake > 0 && camValveLift(10, 1).exhaust > 0);
});

for (const id of ['honda_f20c', 'honda_k20a']) {
  test(`${id}: disabling VTEC reduces high-RPM output without multiplying OEM horsepower`, () => {
    const e = new EngineModel(id, 'oem');
    const on = e.steadyTorqueAtRPM(e.config.ratedPowerRPM);
    assert.ok(Math.abs(on * e.config.ratedPowerRPM * Math.PI / 30000 - e.config.ratedPowerKW) < 0.001);
    const lowRPM = e.steadyTorqueAtRPM(3000);
    e.setVtecEnabled(false);
    assert.ok(e.steadyTorqueAtRPM(e.config.ratedPowerRPM) < on * 0.85);
    assert.equal(e.steadyTorqueAtRPM(3000), lowRPM);
    assert.ok(e.dynoData.maxHp < e.config.ratedPowerKW / 0.745699872);
    e.setVtecEnabled(true); e.setVtecRPM(9000); assert.ok(e.cam.engageRPM <= e.cam.spec.maxRPM);
    e.setRedlineRPM(e.config.minRedlineRPM);
    assert.ok(e.cam.engageRPM <= e.redlineRPM - 350);
    e.setConfig('i4_flat'); assert.equal(e.cam.spec, null);
  });
}

for (const mode of ['soft', 'hard', 'sequential']) {
  test(`${mode}: every architecture stays in a narrow neutral limit band at cadence extremes`, () => {
    for (const id of Object.keys(ENGINE_CONFIGS)) for (const hz of [8, 32]) {
      const e = new EngineModel(id, 'oem'); const d = new Drivetrain(e);
      e.setRunning(true); e.setECUMode(mode); e.setLimiterHz(hz); e.setLimiterDepth(1);
      let min = Infinity, max = -Infinity;
      for (let frame = 0; frame < 6 / dt; frame++) {
        d.update(dt, 1, 0);
        if (frame * dt > 4) { min = Math.min(min, e.rpm); max = Math.max(max, e.rpm); }
      }
      assert.ok(min > e.redlineRPM - e.revLimitControlRange - 80, `${id} ${hz} Hz minimum ${min}`);
      assert.ok(max < e.redlineRPM + 200, `${id} overspeed ${max}`);
      assert.ok(max - min < 350, `${id} RPM hunting ${max - min}`);
      e.rpm = e.redlineRPM - 500; e.prepareStep(dt, 1);
      assert.equal(e.revLimiterCutAmount, 0, 'immediate recovery below band');
    }
  });
  test(`${mode}: sixth at 10000 RPM never repeats the 7000 RPM power-loss loop`, () => {
    const e = new EngineModel('i2_180', 'straight'); const d = new Drivetrain(e);
    e.setRunning(true); e.setRedlineRPM(10000); e.setECUMode(mode); e.setLimiterHz(8); e.setLimiterDepth(1);
    d.setMode('amt'); d.currentGear = 6; d.shiftState = 'locked';
    e.rpm = 10000; e.manifoldThrottle = 1; d.speedKmh = d.calcSpeedFromRPM(6, e.rpm);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 30 / dt; i++) {
      d.update(dt, 1, 0); min = Math.min(min, e.rpm); max = Math.max(max, e.rpm);
      assert.equal(d.currentGear, 6);
    }
    assert.ok(min > 9600, `${min} RPM`); assert.ok(max - min < 400);
  });
}

test('boxer opposed pistons move together using separate opposite crankpins and rigid rods', () => {
  for (let degrees = 0; degrees <= 720; degrees += 3) {
    const [left, right] = boxerKinematics(degrees);
    assert.equal(left.wristX, -right.wristX); assert.equal(left.jointX, -right.jointX);
    assert.equal(left.jointY, -right.jointY);
    for (const k of [left, right]) assert.ok(Math.abs(Math.hypot(k.wristX - k.jointX, k.jointY) - 112) < 1e-9);
  }
});

test('rotary apexes remain on the epitrochoid and one rotor turn takes three shaft turns', () => {
  for (let degrees = 0; degrees <= 1080; degrees += 2) {
    const k = rotaryKinematics(degrees);
    for (const apex of k.apexes) {
      const wall = rotaryHousingPoint(apex.t);
      assert.ok(Math.hypot(apex.x - wall.x, apex.y - wall.y) < 1e-9);
    }
  }
  const start = rotaryKinematics(0), oneShaftTurn = rotaryKinematics(360), threeShaftTurns = rotaryKinematics(1080);
  assert.ok(Math.abs(oneShaftTurn.angle - start.angle - Math.PI * 2 / 3) < 1e-9);
  assert.ok(Math.abs(threeShaftTurns.apexes[0].x - start.apexes[0].x) < 1e-9);
});

test('rotary state has three port-driven chambers per rotor and car inertia, not motorcycle inertia', () => {
  const e = new EngineModel('rotary_2', 'oem'); e.setRunning(true);
  e.rpm = 3000; e.prepareStep(dt, 0.8); e.advanceStep(dt, { coupledRPM: 3000 });
  assert.equal(e.config.cycleDegrees, 360); assert.equal(e.config.mechanicalCycleDegrees, 1080);
  assert.ok(e.inertia > 0.09);
  for (const rotor of e.cylinderStates) {
    assert.equal(rotor.chambers.length, 3); assert.equal(rotor.intakeValve, 0); assert.equal(rotor.exhaustValve, 0);
    assert.ok(rotor.chambers.every(c => Number.isFinite(c.pressure)));
  }
});

test('ECU modes/cadences and rotary combustion cycles change actual pressure samples', () => {
  const render = (mode, hz = 18, config = ENGINE_CONFIGS.i4_flat) => {
    const dsp = new CombustionDSP(48000); dsp.configure(config);
    return dsp.process(new Float32Array(24000), { rpm: 8000, load: 1, limiter: 0.55, limiterMode: mode, limiterHz: hz, limiterDepth: 1 });
  };
  const a = render(0), b = render(1), c = render(2), fast = render(1, 32);
  const diff = (x, y) => Math.sqrt(x.reduce((s, n, i) => s + (n - y[i]) ** 2, 0) / x.length);
  assert.ok(diff(a, b) > 0.04); assert.ok(diff(b, c) > 0.04); assert.ok(diff(b, fast) > 0.04);
  const rotary = new CombustionDSP(48000); rotary.configure(ENGINE_CONFIGS.rotary_2);
  rotary.rpm = 6000; rotary.process(new Float32Array(480), { rpm: 6000 });
  assert.ok(Math.abs(rotary.phase) < 1e-9 || Math.abs(rotary.phase - 1) < 1e-9, 'one combustion cycle per shaft revolution');
  const fourStroke = new CombustionDSP(48000); fourStroke.rpm = 6000;
  fourStroke.process(new Float32Array(480), { rpm: 6000 }); assert.ok(Math.abs(fourStroke.phase - 0.5) < 1e-9);
});
