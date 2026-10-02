import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { radialFiringAngles, radialCyclePhase, radialKinematics, radialPistonTravel } from '../src/physics/RadialMechanics.js';
import { rotaryChamberState } from '../src/physics/RotaryMechanics.js';

test('CP4 physical cylinders fire 1–3–2–4 with 270–180–90–180 degree intervals at compression TDC', () => {
  const e = new EngineModel('i4_cross', 'oem'); e.setRunning(true);
  const events = e.config.firingAngles.map((angle, index) => ({ angle, index })).sort((a, b) => a.angle - b.angle);
  assert.deepEqual(events.map(event => event.index + 1), [1, 3, 2, 4]);
  assert.deepEqual(events.map((event, index) => (events[(index + 1) % 4].angle - event.angle + 720) % 720), [270, 180, 90, 180]);
  for (const { angle, index } of events) {
    e.crankAngle = angle - 0.05; e.advanceStep(1 / 240, { coupledRPM: 4 });
    const cyl = e.cylinderStates[index];
    assert.equal(cyl.isFiring, true); assert.equal(cyl.stroke, 'power');
    assert.ok(cyl.pistonPos < 0.0001);
  }
});

test('radial cylinder pressure, ignition and piston travel share actual articulated-rod TDC', () => {
  const e = new EngineModel('radial_7', 'oem'); e.setRunning(true);
  assert.deepEqual(e.config.firingAngles, radialFiringAngles(7));
  const travel = radialPistonTravel(7);
  for (let index = 0; index < 7; index++) {
    const tdc = radialFiringAngles(7)[index];
    e.crankAngle = tdc - 0.05; e.advanceStep(1 / 240, { coupledRPM: 4 });
    const cyl = e.cylinderStates[index];
    assert.ok(cyl.pistonPos < 0.0001, `cylinder ${index + 1} at true TDC`);
    assert.equal(cyl.isFiring, true); assert.equal(cyl.stroke, 'power');
  }
  for (let a = 0; a < 720; a += 7) {
    e.crankAngle = a; e.advanceStep(0, { coupledRPM: 700 });
    const geometry = radialKinematics(a, 7);
    e.cylinderStates.forEach((cyl, index) => {
      assert.equal(cyl.phaseAngle, radialCyclePhase(a, index, 7));
      const expected = (travel[index].max - geometry[index].dist) / (travel[index].max - travel[index].min);
      assert.ok(Math.abs(cyl.pistonPos - Math.max(0, Math.min(1, expected))) < 1e-9);
    });
  }
});

test('rotary chamber pressure stages and visible geometry use one continuous volume cycle', () => {
  const e = new EngineModel('rotary_2', 'oem'); e.setRunning(true);
  for (let a = 0; a < 1080; a += 11) {
    e.crankAngle = a; e.advanceStep(0, { coupledRPM: 850 });
    e.cylinderStates.forEach(rotor => rotor.chambers.forEach((chamber, face) => {
      const expected = rotaryChamberState(a + rotor.firingOffset, face);
      assert.equal(chamber.volume, expected.volume); assert.equal(chamber.stroke, expected.stroke);
      assert.equal(chamber.isIgnitionPhase, expected.isIgnitionPhase);
      assert.ok(Number.isFinite(chamber.pressure));
    }));
  }
  assert.ok(rotaryChamberState(539).volume < 0.101);
  assert.ok(rotaryChamberState(541).volume < 0.101);
});
