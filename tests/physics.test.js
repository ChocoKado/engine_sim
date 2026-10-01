import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { GaugeRenderer } from '../src/visuals/GaugeRenderer.js';

const setup = (id = 'i4_flat', mode = 'amt', running = true) => {
  const engine = new EngineModel(id, 'straight', () => 0.2);
  const drive = new Drivetrain(engine);
  engine.setRunning(running);
  drive.setMode(mode);
  if (mode === 'at') drive.setAtSelector('D');
  else drive.setAmtGear(1);
  return { engine, drive };
};
const run = (drive, seconds, throttle = 1, brake = 0, fps = 60) => {
  const events = [];
  let state;
  for (let i = 0; i < seconds * fps; i++) {
    state = drive.update(1 / fps, throttle, brake);
    events.push(...state.engine.popEvents);
    assert.ok(Number.isFinite(state.engine.rpm) && Number.isFinite(drive.speedKmh));
    if (drive.shiftState === 'locked') {
      assert.ok(Math.abs(drive.engine.rpm - drive.calcRPMFromSpeed(drive.currentGear, drive.speedKmh)) < 1e-7);
    }
  }
  return { state, events };
};

for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    test(id + ' / ' + mode + ': launch, accelerate and brake to idle', () => {
      const { engine, drive } = setup(id, mode);
      run(drive, 10);
      assert.ok(engine.rpm > engine.idleRPM * 1.5, 'throttle must lift RPM above idle');
      assert.ok(drive.speedKmh > 15, 'launch must transmit usable torque');
      run(drive, 15);
      assert.ok(engine.rpm < engine.redlineRPM * 1.025, 'fuel cut must limit actual vehicle speed');
      if (mode === 'amt') assert.equal(drive.currentGear, 1, 'AMT must not shift automatically');
      run(drive, 10, 0, 1);
      assert.equal(drive.speedKmh, 0);
      assert.ok(Math.abs(engine.rpm - engine.idleRPM) < 5);
    });
  }
}

test('off engine cannot accelerate; shutdown coasts and eliminates all combustion', () => {
  const { engine, drive } = setup('i4_flat', 'at', false);
  run(drive, 3);
  assert.equal(engine.rpm, 0);
  assert.equal(drive.speedKmh, 0);
  engine.setRunning(true);
  run(drive, 6);
  const before = drive.speedKmh;
  const beforeRPM = engine.rpm;
  engine.setRunning(false);
  const { events } = run(drive, 2);
  assert.ok(drive.speedKmh > 0 && drive.speedKmh < before);
  assert.ok(engine.rpm < beforeRPM, 'crankshaft should spin down after shutdown');
  assert.equal(engine.getCurrentDynoOutput().hp, 0);
  assert.equal(events.length, 0);
  assert.ok(engine.cylinderStates.every(c => !c.isFiring));
  run(drive, 4);
  assert.equal(engine.rpm, 0);
});

test('neutral revs faster than loaded launch and returns smoothly to idle', () => {
  const neutral = setup();
  neutral.drive.setAmtGear(0);
  const loaded = setup();
  run(neutral.drive, 1);
  run(loaded.drive, 1);
  assert.ok(neutral.engine.rpm > loaded.engine.rpm * 1.5);
  run(neutral.drive, 6, 0);
  assert.ok(Math.abs(neutral.engine.rpm - neutral.engine.idleRPM) < 5);
});

test('18 Hz limiter and motion are independent of display FPS', () => {
  const outcomes = [15, 30, 60, 120, 144, 240].map(fps => {
    const { engine, drive } = setup();
    drive.setAmtGear(0);
    engine.rpm = engine.redlineRPM;
    engine.manifoldThrottle = 1;
    const { events } = run(drive, 2, 1, 0, fps);
    assert.ok(events.length >= 35 && events.length <= 36);
    return [engine.rpm, events.map(e => e.timestamp)];
  });
  for (const result of outcomes) assert.deepEqual(result, outcomes[0]);
});

test('fuel cut removes wheel thrust, not just the tachometer display', () => {
  const { engine, drive } = setup();
  engine.rpm = engine.redlineRPM;
  engine.manifoldThrottle = 1;
  drive.speedKmh = drive.calcSpeedFromRPM(1, engine.rpm);
  drive.shiftState = 'locked';
  const before = drive.speedKmh;
  drive.update(PHYSICS_STEP, 1, 0);
  assert.equal(engine.isRevLimitingCut, true);
  assert.equal(engine.combustionTorque, 0);
  assert.ok(drive.speedKmh < before);
  run(drive, 20);
  assert.ok(engine.rpm <= engine.redlineRPM * 1.01);
});

test('upshift matches the new ratio; AT and AMT use different smooth transitions', () => {
  const durations = [];
  for (const mode of ['at', 'amt']) {
    const { engine, drive } = setup('i4_flat', mode);
    engine.rpm = 10000;
    engine.manifoldThrottle = 1;
    drive.speedKmh = drive.calcSpeedFromRPM(1, 10000);
    drive.shiftState = 'locked';
    assert.equal(drive.shiftUp(), true);
    durations.push(drive.shiftDuration);
    drive.update(PHYSICS_STEP, 0, 0);
    assert.ok(engine.rpm > 9900, 'no instantaneous pitch jump at shift start');
    run(drive, 0.65, 0);
    assert.equal(drive.currentGear, 2);
    // Synchronizing the crank transfers momentum to the chassis, so matching
    // uses the vehicle's CURRENT speed rather than freezing its pre-shift speed.
    assert.ok(engine.rpm > 5800 && engine.rpm < 6900);
    assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(2, drive.speedKmh)) < 1e-7);
  }
  assert.ok(durations[0] > durations[1]);
});

test('AT shifts up and returns to first when stopping', () => {
  const { drive } = setup('i4_flat', 'at');
  run(drive, 30);
  assert.ok(drive.currentGear >= 2);
  run(drive, 15, 0, 1);
  assert.equal(drive.currentGear, 1);
});

test('moving park/reverse and overrev downshifts are rejected without losing momentum', () => {
  const { engine, drive } = setup('i4_flat', 'at');
  drive.speedKmh = 100;
  assert.equal(drive.setAtSelector('P'), false);
  assert.equal(drive.speedKmh, 100);
  assert.equal(drive.setAtSelector('R'), false);
  assert.equal(drive.setAtSelector('N'), true);
  assert.equal(drive.setAtSelector('R'), false, 'neutral cannot bypass direction protection');
  drive.setMode('amt');
  drive.currentGear = 3;
  drive.speedKmh = drive.calcSpeedFromRPM(3, 10000);
  engine.rpm = 10000;
  assert.equal(drive.setAmtGear(1), false);
  assert.equal(drive.currentGear, 3);
  assert.equal(drive.setAmtGear(-1), false);
});

test('reverse accelerates backwards, brakes to zero and can then select forward', () => {
  const { drive } = setup('i4_flat', 'at');
  assert.equal(drive.setAtSelector('R'), true);
  run(drive, 5);
  assert.ok(drive.speedKmh < -10);
  assert.equal(drive.setAtSelector('D'), false);
  run(drive, 5, 0, 1);
  assert.equal(drive.speedKmh, 0);
  assert.equal(drive.setAtSelector('D'), true);
});

test('off engine can select a rolling gear and restart without getting stuck in D0', () => {
  const { engine, drive } = setup('i4_flat', 'at', false);
  drive.setAtSelector('N');
  drive.speedKmh = 160;
  assert.equal(drive.setAtSelector('D'), true);
  run(drive, 1);
  assert.ok(drive.currentGear > 0);
  engine.setRunning(true);
  run(drive, 2);
  assert.ok(drive.currentGear > 0);
});

test('brake holds launch and AT creep, while AMT remains still with no throttle', () => {
  for (const mode of ['at', 'amt']) {
    const { drive } = setup('i4_flat', mode);
    run(drive, 2, 1, 1);
    assert.equal(drive.speedKmh, 0);
  }
  const auto = setup('i4_flat', 'at');
  run(auto.drive, 5, 0);
  assert.ok(auto.drive.speedKmh > 0 && auto.drive.speedKmh < 7);
  const manual = setup();
  run(manual.drive, 5, 0);
  assert.equal(manual.drive.speedKmh, 0);
});

test('backfire has one shared event schema, flames consume each event once', () => {
  const { engine, drive } = setup();
  drive.setAmtGear(0);
  run(drive, 1);
  const { events } = run(drive, 0.5, 0);
  assert.ok(events.some(e => e.kind === 'overrun' && e.hasFlame));
  const gauge = Object.create(GaugeRenderer.prototype);
  gauge.lastPopId = 0;
  const flames = [];
  gauge.triggerBackfireFlame = intensity => flames.push(intensity);
  gauge.consumePopEvents(events);
  gauge.consumePopEvents(events);
  assert.equal(flames.length, events.filter(e => e.hasFlame).length);
  engine.setExhaust('oem');
  engine.popEvents = [];
  engine.createPop('limiter');
  assert.equal(engine.popEvents.length, 0);
});
