import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

function stockAMT(id, redline) {
  const engine = new EngineModel(id, 'oem', () => 0.5);
  if (redline !== undefined) engine.setRedlineRPM(redline);
  const drive = new Drivetrain(engine);
  engine.setRunning(true);
  drive.setMode('amt');
  assert.equal(drive.setAmtGear(1), true);
  return { engine, drive };
}

function checkStep({ engine, drive }) {
  const before = engine.rpm;
  const status = drive.update(dt, 1, 0);
  assert.ok(engine.isIgnitionOn && !engine.isStalled, 'launch must not hide a stall');
  assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh));
  assert.equal(drive.currentGear, 1, 'AMT must retain the selected first gear');
  assert.equal(status.cutAmount, 0, 'midrange launch is not an ignition-cut event');
  assert.ok(Math.abs(engine.rpm - before) < engine.redlineRPM * 0.025,
    'RPM must advance through the drivetrain rather than jump over a hesitation');
  return { rpm: engine.rpm, speed: drive.speedKmh, delta: engine.rpm - before };
}

// A 250 ms observation window distinguishes a sustained artificial hold from
// individual integration steps. It deliberately allows much slower progress
// than even the stock aircraft engine under its ground-demonstration load.
function checkMidrangeProgress(samples, redline) {
  const windowSteps = Math.round(0.25 / dt);
  let windows = 0;
  for (let i = windowSteps; i < samples.length; i++) {
    const before = samples[i - windowSteps].rpm;
    const after = samples[i].rpm;
    if (before < redline * 0.35 || after > redline * 0.8) continue;
    assert.ok(after - before > redline * 0.002,
      `no 250 ms midrange hold: ${before.toFixed(1)} → ${after.toFixed(1)} RPM at ${(i * dt).toFixed(3)} s`);
    windows++;
  }
  assert.ok(windows > 20, 'the trace must actually cover the middle of the rev range');
}

for (const id of Object.keys(ENGINE_CONFIGS)) {
  test(`${id}: stock AMT first-gear launch crosses midrange without a synthetic RPM hold`, () => {
    const state = stockAMT(id);
    const { engine, drive } = state;
    const samples = [{ rpm: engine.rpm, speed: 0 }];
    const monotonicFocus = ['i4_cross', 'radial_7', 'rotary_2'].includes(id);
    for (let step = 0; step < 10 / dt && engine.rpm < engine.redlineRPM * 0.9; step++) {
      const sample = checkStep(state);
      if (monotonicFocus && sample.rpm > engine.redlineRPM * 0.35) {
        assert.ok(sample.delta >= -0.05, 'CP4, radial and rotary should keep gaining RPM during this stock WOT launch');
      }
      samples.push(sample);
    }
    assert.ok(engine.rpm >= engine.redlineRPM * 0.9,
      `stock first gear should reach 90% redline within 10 s, reached ${engine.rpm.toFixed(1)} RPM`);
    checkMidrangeProgress(samples, engine.redlineRPM);
    assert.equal(drive.shiftState, 'locked', 'the wheels must catch the crank before the end of the launch');
    assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(1, drive.speedKmh)) < 0.1,
      'the improved RPM response must still correspond to real road speed');
  });

  test(`${id}: changing the ECU redline preserves the low-to-midrange first-gear response`, () => {
    const config = ENGINE_CONFIGS[id];
    const low = stockAMT(id, config.minRedlineRPM);
    const high = stockAMT(id, config.maxRedlineRPM);
    // Stay below both limiter control bands; compare absolute RPM at the same
    // elapsed time, rather than comparing fractions of two different redlines.
    const endRPM = config.minRedlineRPM * 0.8;
    let reached = false;
    for (let step = 0; step < 10 / dt; step++) {
      checkStep(low);
      checkStep(high);
      assert.equal(low.engine.isRevLimiting, false);
      assert.equal(high.engine.isRevLimiting, false);
      // A lowered radial redline lies below its published torque peak, so the
      // remaining dyno-capacity calibration can differ slightly. This allows
      // that small difference, not a redline-dependent launch RPM target.
      assert.ok(Math.abs(low.engine.rpm - high.engine.rpm) <= config.minRedlineRPM * 0.003,
        'redline changes must not move the low/midrange launch curve');
      assert.ok(Math.abs(low.drive.speedKmh - high.drive.speedKmh) <= 0.2,
        'the corresponding road-speed response must stay materially unchanged');
      if (Math.max(low.engine.rpm, high.engine.rpm) >= endRPM) { reached = true; break; }
    }
    assert.ok(reached, 'both traces must cover the low-to-midrange launch');
  });
}

test('all stock engines accelerate through the same midrange while already locked in first gear', () => {
  for (const [id, config] of Object.entries(ENGINE_CONFIGS)) {
    const state = stockAMT(id);
    const { engine, drive } = state;
    engine.rpm = config.defaultRedlineRPM * 0.35;
    engine.manifoldThrottle = engine.prevThrottle = 1;
    drive.speedKmh = drive.calcSpeedFromRPM(1, engine.rpm);
    drive.shiftState = 'locked';
    const samples = [{ rpm: engine.rpm, speed: drive.speedKmh }];
    for (let step = 0; step < 8 / dt && engine.rpm < engine.redlineRPM * 0.8; step++) {
      const sample = checkStep(state);
      assert.ok(sample.delta > 0, `${id}: a locked stock WOT first gear must continue accelerating`);
      assert.equal(drive.shiftState, 'locked', `${id}: crossing midrange must not restart clutch engagement`);
      assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(1, drive.speedKmh)) < 0.1,
        `${id}: crank speed must retain the selected gear ratio`);
      samples.push(sample);
    }
    assert.ok(engine.rpm >= engine.redlineRPM * 0.8, `${id}: rolling acceleration must cover midrange`);
    checkMidrangeProgress(samples, engine.redlineRPM);
  }
});

for (const id of ['i4_cross', 'radial_7', 'rotary_2']) {
  test(`${id}: extra vehicle mass still slows AMT acceleration after the midrange fix`, () => {
    const stock = stockAMT(id);
    const heavy = stockAMT(id);
    heavy.drive.setVehicleMass(stock.drive.vehicleMass * 2);
    for (let step = 0; step < 3 / dt; step++) {
      checkStep(stock);
      checkStep(heavy);
    }
    assert.ok(heavy.drive.speedKmh < stock.drive.speedKmh * 0.8,
      'extra mass must still consume more time to accelerate the vehicle');
    assert.ok(heavy.engine.rpm < stock.engine.rpm * 0.95,
      'clutch reaction must still transfer the extra road load to the crank');
    assert.ok(heavy.drive.speedKmh > 1, 'extra load must not be replaced by a permanently frozen launch');
  });
}
