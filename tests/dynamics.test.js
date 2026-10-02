import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { converterCharacteristics } from '../src/physics/VehicleProfiles.js';

function setup(id = 'i4_flat', mode = 'amt') {
  const engine = new EngineModel(id);
  const drive = new Drivetrain(engine);
  engine.setRunning(true);
  drive.setMode(mode);
  mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
  return { engine, drive };
}

for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    test(`${id}/${mode}: early launch, continuous lock-up, usable partial throttle`, () => {
      for (const throttle of [0.25, 1]) {
        const { engine, drive } = setup(id, mode);
        let previousAcceleration = 0;
        for (let frame = 0; frame < 3 / dt; frame++) {
          const beforeSpeed = drive.speedKmh;
          const beforeRPM = engine.rpm;
          const beforeState = drive.shiftState;
          drive.update(dt, throttle, 0);
          const acceleration = (drive.speedKmh - beforeSpeed) / 3.6 / dt;
          assert.ok(acceleration < 9.1, 'tire grip limits thrust for every engine');
          assert.ok(Math.abs(engine.rpm - beforeRPM) < engine.redlineRPM * 0.025, 'RPM cannot teleport');
          if (beforeState === 'launching' && drive.shiftState === 'locked') {
            assert.ok(Math.abs(acceleration - previousAcceleration) < 0.8,
              `no acceleration step at lock-up: ${acceleration - previousAcceleration}`);
          }
          if (frame === 239) {
            // OEM Ninja 400 power and the experimental aircraft load rig must
            // not inherit the earlier 60 HP/vehicle acceleration benchmark.
            const minimum = throttle === 1 ? (['i2_180', 'radial_7'].includes(id) ? 5 : 8) : 1;
            assert.ok(drive.speedKmh > minimum, 'respond within the first second');
          }
          previousAcceleration = acceleration;
        }
      }
    });

    test(`${id}/${mode}: up/downshift synchronize without RPM discontinuities`, () => {
      const { engine, drive } = setup(id, mode);
      for (const [from, to, fraction] of [[1, 2, 0.7], [2, 1, 0.45]]) {
        drive.currentGear = from;
        drive.shiftState = 'locked';
        engine.rpm = engine.redlineRPM * fraction;
        engine.manifoldThrottle = 0.6;
        drive.speedKmh = drive.calcSpeedFromRPM(from, engine.rpm);
        assert.equal(drive.startShift(to), true);
        let frames = 0;
        while (drive.shiftState === 'shifting' && frames < 2 / dt) {
          const before = engine.rpm;
          drive.update(dt, 0.6, 0);
          assert.ok(Math.abs(engine.rpm - before) < engine.redlineRPM * 0.025, 'bounded pitch change');
          assert.ok(engine.rpm < engine.redlineRPM, 'no flare into limiter while shifting');
          frames++;
        }
        assert.ok(frames * dt > 0.15 && frames * dt < 1.2, `synchronization duration ${frames * dt}`);
        assert.equal(drive.currentGear, to);
        assert.equal(drive.shiftState, 'locked');
        assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(to, drive.speedKmh)) < 0.001);
      }
    });
  }
}

test('converter multiplication tapers and cannot create power', () => {
  for (let ratio = 0; ratio <= 1; ratio += 0.01) {
    const { capacity, torqueRatio } = converterCharacteristics(ratio);
    assert.ok(capacity >= 0 && capacity <= 1);
    assert.ok(torqueRatio * ratio <= 1.001);
  }
});

test('clutch synchronization conserves or dissipates kinetic energy', () => {
  const { engine, drive } = setup();
  engine.rpm = 10000;
  drive.speedKmh = drive.calcSpeedFromRPM(2, 6000);
  const energy = () => 0.5 * engine.inertia * (engine.rpm * Math.PI / 30) ** 2
    + 0.5 * drive.vehicleMass * 1.035 * (drive.speedKmh / 3.6) ** 2;
  for (let i = 0; i < 240; i++) {
    engine.netTorque = 0;
    const before = energy();
    drive.couple(dt, 2, 150);
    assert.ok(energy() <= before + 0.01, 'synchronization cannot add energy');
  }
});

test('more load slows acceleration without pinning the engine to a scripted launch RPM', () => {
  const light = setup('i4_flat', 'at'), heavy = setup('i4_flat', 'at');
  heavy.drive.setVehicleMass(1250);
  const rpm = [];
  for (let i = 0; i < 720; i++) {
    light.drive.update(dt, 1, 0);
    heavy.drive.update(dt, 1, 0);
    if (i % 120 === 119) rpm.push(heavy.engine.rpm);
  }
  assert.ok(light.drive.speedKmh > heavy.drive.speedKmh * 2);
  assert.ok(rpm[5] - rpm[2] > 100, 'turbine speed must affect pump RPM');
});

test('continuous exhaust torque curve has no artificial 65% redline step', () => {
  for (const id of Object.keys(ENGINE_CONFIGS)) {
    const engine = new EngineModel(id, 'straight');
    const a = engine.torqueAtRPM(engine.redlineRPM * 0.65 - 0.01);
    const b = engine.torqueAtRPM(engine.redlineRPM * 0.65 + 0.01);
    assert.ok(Math.abs(a - b) < 0.01);
  }
});

test('closed throttle in gear keeps road-speed RPM; neutral decelerates the crank separately', () => {
  const { engine, drive } = setup();
  drive.currentGear = 2;
  drive.shiftState = 'locked';
  engine.rpm = 8000;
  drive.speedKmh = drive.calcSpeedFromRPM(2, 8000);
  for (let i = 0; i < 120; i++) drive.update(dt, 0, 0);
  assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(2, drive.speedKmh)) < 0.01);
  const before = engine.rpm;
  drive.setAmtGear(0);
  for (let i = 0; i < 240; i++) drive.update(dt, 0, 0);
  assert.ok(engine.rpm < before * 0.7);
});

test('gear changes and launch do not depend on display FPS', () => {
  const outcomes = [30, 60, 144].map(fps => {
    const { engine, drive } = setup('i4_flat', 'at');
    for (let i = 0; i < 12 * fps; i++) drive.update(1 / fps, 1, 0);
    return [engine.rpm, drive.speedKmh, drive.currentGear];
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('exhaust profiles have ordered burst strength, flame energy and overrun density', () => {
  const results = ['oem', 'akrapovic', 'sc_project', 'straight'].map(exhaust => {
    let seed = 42;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
    const e = new EngineModel('i4_flat', exhaust, random);
    e.setRunning(true);
    let count = 0, energy = 0, flameEnergy = 0;
    for (let burst = 0; burst < 50; burst++) {
      e.rpm = e.redlineRPM * 0.8;
      e.manifoldThrottle = e.prevThrottle = 1;
      for (let frame = 0; frame < 240; frame++) {
        e.prepareStep(dt, 0);
        for (const pop of e.popEvents) {
          count++;
          energy += pop.intensity;
          if (pop.hasFlame) flameEnergy += pop.flameIntensity * pop.flameDuration;
        }
      }
    }
    return { count, energy, flameEnergy };
  });
  assert.deepEqual(results[0], { count: 0, energy: 0, flameEnergy: 0 });
  for (let i = 1; i < results.length; i++) {
    for (const key of ['count', 'energy', 'flameEnergy']) assert.ok(results[i][key] > results[i - 1][key]);
  }
});
