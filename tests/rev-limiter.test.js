import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const variants = [
  { type: 'na' }, { type: 'turbo', size: 'small' },
  { type: 'turbo', size: 'large' }, { type: 'supercharger' }
];

function setup(id, variant, mode = 'amt') {
  const engine = new EngineModel(id, 'oem', () => 0.5);
  engine.setForcedInduction(variant.type);
  engine.setMaxBoost(1);
  if (variant.size) engine.setTurboSize(variant.size);
  const drive = new Drivetrain(engine);
  drive.setMode(mode);
  engine.setRunning(true);
  return { engine, drive };
}

test('all engine architectures hold full-throttle neutral near their limiter without a broad RPM cycle', () => {
  for (const id of Object.keys(ENGINE_CONFIGS)) for (const variant of variants) {
    const { engine, drive } = setup(id, variant);
    let min = Infinity, max = 0;
    for (let frame = 0; frame < 12 * 60; frame++) {
      drive.update(1 / 60, 1, 0);
      if (frame > 8 * 60) {
        min = Math.min(min, engine.rpm);
        max = Math.max(max, engine.rpm);
      }
    }
    const label = `${id}/${variant.type}/${variant.size || ''}`;
    assert.ok(min > engine.redlineRPM - engine.revLimitControlRange, label);
    assert.ok(max < engine.redlineRPM * 1.01, label);
    assert.ok(max - min < engine.revLimitControlRange, label);
    assert.equal(drive.currentGear, 0);
  }
});

for (const mode of ['at', 'amt']) {
  test(`${mode}: sixth at a 10000 RPM limit retains wheel speed during sustained full throttle`, () => {
    for (const id of ['i2_180', 'v2_90']) for (const variant of variants) {
      const { engine, drive } = setup(id, variant, mode);
      engine.setRedlineRPM(10000);
      assert.equal(engine.redlineRPM, 10000);
      // Start already synchronized in sixth at the limiter, then keep the
      // actual pedal down for 60 seconds. Road drag, boost, engine inertia and
      // AT's shift decisions remain active throughout this reproduction.
      drive.currentGear = 6;
      drive.atSelector = mode === 'at' ? 'D' : 'N';
      drive.shiftState = 'locked';
      engine.rpm = 10000;
      engine.manifoldThrottle = 1;
      drive.speedKmh = drive.calcSpeedFromRPM(6, engine.rpm);
      let min = Infinity, max = 0;
      for (let frame = 0; frame < 60 * 60; frame++) {
        drive.update(1 / 60, 1, 0);
        assert.equal(drive.currentGear, 6, 'no unwanted top-gear hunting');
        assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(6, drive.speedKmh)) < 1e-7,
          'RPM must continue to follow road speed, rather than a display clamp');
        if (frame > 15 * 60) {
          min = Math.min(min, engine.rpm);
          max = Math.max(max, engine.rpm);
        }
      }
      const label = `${id}/${variant.type}/${variant.size || ''}`;
      assert.ok(min > 9800 && max <= 10001, label);
      assert.ok(max - min < 25, `${label}: no slow speed/RPM sawtooth`);
    }
  });
}

test('a limiter immediately returns full combustion below its control band, even with a held pedal', () => {
  const { engine } = setup('i2_180', { type: 'na' });
  engine.setRedlineRPM(10000);
  engine.manifoldThrottle = 1;
  engine.rpm = 10000;
  engine.prepareStep(PHYSICS_STEP, 1);
  assert.equal(engine.combustionTorque, 0);
  assert.equal(engine.isRevLimitingCut, true);
  engine.rpm = 9700;
  engine.prepareStep(PHYSICS_STEP, 1);
  assert.equal(engine.isRevLimiting, false);
  assert.equal(engine.revLimiterCutAmount, 0);
  assert.ok(engine.netTorque > 0);
  assert.ok(engine.combustionTorque > engine.currentEngineDrag);
});

test('lifting the pedal clears progressive cuts; overspeed still gets a hard combustion cut', () => {
  const { engine } = setup('v2_90', { type: 'supercharger' });
  engine.rpm = engine.redlineRPM - 25;
  engine.manifoldThrottle = 1;
  engine.prepareStep(PHYSICS_STEP, 1);
  assert.ok(engine.snapshot().revLimiterCutAmount > 0);
  engine.prepareStep(PHYSICS_STEP, 0);
  assert.equal(engine.revLimiterCutAmount, 0);
  assert.equal(engine.revLimiterBounceTimer, 0);
  engine.rpm = engine.redlineRPM + 20;
  engine.prepareStep(PHYSICS_STEP, 0);
  assert.equal(engine.revLimiterCutAmount, 1);
  assert.equal(engine.combustionTorque, 0);
  engine.setRunning(false);
  assert.equal(engine.revLimiterCutAmount, 0);
});
