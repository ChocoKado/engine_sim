import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';

function fixture(id, mode, displacement, mass) {
  const engine = new EngineModel(id, 'oem', () => 0.5), drive = new Drivetrain(engine);
  engine.setForcedInduction('supercharger'); engine.setMaxBoost(3); engine.setDisplacement(displacement);
  drive.setVehicleMass(mass); drive.setMode(mode);
  engine.setRunning(true);
  mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
  const meter = new PerformanceMeter();
  const label = `${id}/${mode}/${displacement}cc/${mass}kg`;
  let phase = 'ready', minRPM = Infinity;
  drive.onStep = sample => {
    meter.sample(sample); minRPM = Math.min(minRPM, engine.rpm);
    assert.ok(engine.isIgnitionOn && !engine.isStalled && engine.rpm > engine.idleRPM * 0.25,
      `${label}/${phase}: genuine loss of combustion, RPM=${engine.rpm.toFixed(2)}, shaft=${engine.induction.shaftTorque.toFixed(2)}, net=${engine.netTorque.toFixed(2)}, bypass=${engine.induction.bypassOpening.toFixed(3)}`);
    assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh));
  };
  const tick = (throttle, brake = 0) => {
    if (mode === 'amt' && throttle > 0.02 && engine.rpm > engine.redlineRPM * 0.95
      && drive.shiftState === 'locked' && drive.currentGear < drive.maxGear) drive.shiftUp();
    drive.update(1 / 30, throttle, brake);
  };
  const wait = (seconds, throttle, brake = 0) => {
    for (let frame = 0; frame < seconds * 30; frame++) tick(throttle, brake);
  };
  const stop = () => {
    for (let frame = 0; frame < 30 * 30 && drive.speedKmh > 0; frame++) tick(0, 1);
    wait(1, 0, 1); assert.equal(drive.speedKmh, 0, `${label}/${phase}: brakes actually stop the vehicle`);
    assert.ok(engine.rpm > engine.idleRPM * 0.8, `${label}/${phase}: settles to a useful idle`);
  };
  const reset = () => {
    // The performance reset deliberately moves the fixture back to the line;
    // it cannot restart a stalled engine, hence tick detects any preceding stall.
    engine.resetCombustion(); engine.rpm = engine.isIgnitionOn ? engine.idleRPM : 0;
    drive.speedKmh = 0; drive.accumulator = 0;
    if (mode === 'at') { drive.setAtSelector('N'); drive.setAtSelector('D'); }
    else { drive.setAmtGear(0); drive.setAmtGear(1); }
    wait(1, 0, 1);
  };
  return { engine, drive, meter, tick, wait, stop, reset, setPhase: value => { phase = value; }, get minRPM() { return minRPM; } };
}

// Full Cartesian coverage, including a heavy car load on a small motorcycle
// engine. Finishing with an honest 120-second timeout is legitimate when the
// selected gearing/power cannot reach 200; a stall or silent restart is not.
for (const [id, config] of Object.entries(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    const referenceMass = new Drivetrain(new EngineModel(id)).vehicleMass;
    for (const displacement of [...new Set([config.minDisplacement, config.defaultDisplacement, config.maxDisplacement])]) {
      for (const mass of [...new Set([180, referenceMass, 3000])]) {
        test(`${id}/${mode}/${displacement}cc/${mass}kg: 3bar launch, completed run, ECU changes, braking and reset`, () => {
          const f = fixture(id, mode, displacement, mass);
          f.wait(1, 0, 1);
          f.meter.arm({ time: f.engine.time, speed: 0, distance: f.drive.distanceMeters,
            running: true, gear: 1 }, { model: id });
          f.setPhase('full acceleration');
          for (let frame = 0; frame < 121 * 30 && f.meter.state !== 'complete'; frame++) f.tick(1);
          assert.equal(f.meter.state, 'complete');
          assert.ok(f.drive.distanceMeters > 0 && f.meter.trace.length > 1,
            'the measured run moves forward even when an extreme selected load cannot reach a checkpoint');
          f.setPhase('minimum redline/hard ECU while moving');
          f.engine.setRedlineRPM(config.minRedlineRPM); f.engine.setECUMode('hard');
          f.engine.setLimiterHz(32); f.engine.setLimiterDepth(1);
          f.wait(1, 1);
          f.setPhase('braking after complete run'); f.stop();
          assert.equal(f.engine.revLimiterCutAmount, 0);
          f.setPhase('retained-gear second launch'); f.wait(3, 1);
          // A deliberately retained high AMT gear may not overcome rolling
          // resistance with a 3-tonne load. It must keep real combustion alive;
          // the subsequent first-gear reset proves the engine remains operable.
          f.stop();
          f.setPhase('performance reset after ECU change'); f.reset(); f.wait(3, 1);
          assert.ok(f.drive.speedKmh > 0, 'rearmed first gear can drive the chosen load again');
          f.setPhase('maximum redline/sequential ECU');
          f.engine.setRedlineRPM(config.maxRedlineRPM); f.engine.setECUMode('sequential');
          f.engine.setLimiterHz(8); f.engine.setLimiterDepth(0.3); f.reset(); f.wait(3, 1);
          assert.ok(f.drive.speedKmh > 0);
          assert.equal(f.engine.maxBoost, 3, 'repair cannot silently cap the selected research boost');
        });
      }
    }
  }
}
