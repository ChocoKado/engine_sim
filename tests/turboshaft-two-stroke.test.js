import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { TurboshaftModel } from '../src/physics/TurboshaftModel.js';
import { twoStrokePortState } from '../src/physics/TwoStrokeMechanics.js';
import { radialEngineKinematics, radialKinematics, radialFiringAngles } from '../src/physics/RadialMechanics.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { rotaryShaftPhase, rotaryChamberState } from '../src/physics/RotaryMechanics.js';

test('M250 keeps gas-generator N1 independent of free-turbine N2 and the fixed reduction output', () => {
  const engine = new EngineModel('gas_turbine', 'oem');
  engine.setRunning(true);
  for (let n = 0; n < 20 / dt; n++) {
    engine.prepareStep(dt, 1); engine.advanceStep(dt, { coupledRPM: 4000 });
  }
  assert.ok(engine.corePercent > 99.9);
  assert.ok(Math.abs(engine.powerTurbineRPM - 4000 * 33290 / 6016) < 1e-8);
  const n1 = engine.coreRPM;
  engine.advanceStep(dt, { coupledRPM: 2000 });
  assert.equal(engine.rpm, 2000);
  assert.equal(engine.coreRPM, n1, 'road synchronization cannot assign N1 from the new gear');
  assert.ok(Math.abs(engine.powerTurbineRPM - 2000 * 33290 / 6016) < 1e-8);
  engine.advanceStep(dt, { coupledRPM: 0 });
  assert.equal(engine.rpm, 0);
  assert.equal(engine.powerTurbineRPM, 0);
  assert.equal(engine.isCombusting, true, 'a held free turbine does not extinguish the gas generator');
  assert.ok(engine.coreRPM > 50000);
});

test('free turbine has finite stall torque and cannot deliver more shaft power than its gas power budget', () => {
  const model = new TurboshaftModel({});
  model.setRunning(true);
  for (let n = 0; n < 30 / dt; n++) model.update(dt, { throttle: 1, outputRPM: 5000 });
  for (const ratio of [0, 0.25, 0.5, 0.75, 0.98, 1, 1.1]) {
    model.update(dt, { throttle: 1, outputRPM: 6016 * ratio });
    const state = model.snapshot();
    assert.ok(Number.isFinite(state.shaftTorqueNm));
    assert.ok(state.shaftPowerKW <= state.gasGeneratorPowerKW + 0.001);
    if (!ratio) assert.equal(state.shaftPowerKW, 0);
    if (ratio === 0.98) assert.ok(Math.abs(state.shaftPowerKW - 313) < 0.2);
    if (ratio >= 1) assert.equal(state.shaftTorqueNm, 0);
  }
  assert.ok(Math.abs(model.steadyTorqueAtRPM(6016) * 6016 * Math.PI / 30000 - 313) < 1e-8);
});

test('turboshaft road load moves through its own two-speed transmission and braking leaves N1 alive independently', () => {
  const engine = new EngineModel('gas_turbine', 'oem'), drive = new Drivetrain(engine);
  engine.setRunning(true); drive.setAtSelector('D');
  let maxOutput = 0, reachedSecond = false;
  for (let n = 0; n < 30 / dt; n++) {
    drive.update(dt, 1, 0);
    maxOutput = Math.max(maxOutput, engine.rpm);
    reachedSecond ||= drive.currentGear === 2;
  }
  assert.equal(drive.maxGear, 2);
  assert.equal(reachedSecond, true);
  assert.ok(drive.speedKmh > 100);
  assert.ok(maxOutput <= 6016);
  for (let n = 0; n < 15 / dt; n++) drive.update(dt, 0, 1);
  assert.equal(drive.speedKmh, 0);
  assert.ok(engine.corePercent > 59 && engine.corePercent < 62);
  assert.equal(engine.isCombusting, true);
  assert.ok(engine.rpm < engine.coreRPM * 0.1);
  const n1 = engine.coreRPM, n2 = engine.powerTurbineRPM;
  engine.setRunning(false);
  for (let n = 0; n < 2 / dt; n++) drive.update(dt, 1, 0);
  assert.ok(engine.coreRPM > 0 && engine.coreRPM < n1);
  assert.ok(engine.powerTurbineRPM < n2);
  assert.equal(engine.isCombusting, false);
  assert.equal(engine.fuelFlowKgS, 0);
});

test('two-stroke port windows repeat every 360 degrees with exhaust leading transfer and no cam valves', () => {
  for (const angle of [0, 90, 120, 180, 240, 300]) {
    assert.deepEqual(twoStrokePortState(angle), twoStrokePortState(angle + 360));
  }
  assert.equal(twoStrokePortState(0).isIgnitionPhase, true);
  assert.equal(twoStrokePortState(120).portPhase, 'blowdown');
  assert.equal(twoStrokePortState(120).transferPort, 0);
  assert.ok(twoStrokePortState(120).exhaustPort > 0);
  assert.ok(twoStrokePortState(180).transferPort > 0.99);
  assert.equal(twoStrokePortState(180).portPhase, 'scavenging');
  assert.equal(twoStrokePortState(300).portPhase, 'compression');
  const engine = new EngineModel('two_stroke_2', 'oem');
  engine.setRunning(true);
  engine.manifoldThrottle = 1;
  engine.crankAngle = 359;
  const firing = [false, false], rises = [0, 0];
  for (let n = 0; n < 720; n++) {
    engine.prepareStep(1 / 36000, 1);
    engine.advanceStep(1 / 36000, { coupledRPM: 6000 });
    for (const cylinder of engine.cylinderStates) {
      assert.equal(cylinder.intakeValve, 0);
      assert.equal(cylinder.exhaustValve, 0);
      if (cylinder.isFiring && !firing[cylinder.index]) rises[cylinder.index]++;
      firing[cylinder.index] = cylinder.isFiring;
      assert.equal(cylinder.transferPort, twoStrokePortState(cylinder.phaseAngle, engine.config).transferPort);
    }
  }
  assert.deepEqual(rises, [2, 2], 'each cylinder combusts once per shaft revolution');
  assert.equal(engine.setModification('camshaft', 'sport'), false);
});

test('a two-stroke expansion chamber moves the resonant powerband rather than adding uniform torque', () => {
  const engine = new EngineModel('two_stroke_2', 'oem');
  const low = engine.steadyTorqueAtRPM(3000), high = engine.steadyTorqueAtRPM(8000);
  assert.equal(engine.setModification('headers', 'tuned'), true);
  assert.ok(engine.steadyTorqueAtRPM(3000) < low);
  assert.ok(engine.steadyTorqueAtRPM(8000) > high * 1.05);
  assert.equal(engine.snapshot().cycleKind, 'two-stroke');
});

test('R-2800 uses two rigid nine-cylinder master-rod assemblies with shared row clocking and cycle phases', () => {
  const config = ENGINE_CONFIGS.radial_18;
  assert.equal(config.radialRows, 2);
  assert.equal(config.cylindersPerRow, 9);
  for (let angle = 0; angle <= 720; angle += 9) {
    const geometry = radialEngineKinematics(angle, config);
    assert.equal(geometry.length, 18);
    assert.equal(geometry.filter(c => c.localIndex === 0).length, 2);
    for (const c of geometry) {
      assert.equal(c.row, c.index < 9 ? 0 : 1);
      assert.ok(Math.abs(Math.hypot(c.wristX - c.jointX, c.wristY - c.jointY) - c.rodLength) < 1e-8);
      assert.ok(c.pistonPos >= 0 && c.pistonPos <= 1);
    }
    const rearLocal = radialKinematics(angle + 160, 9);
    const r = 20 * Math.PI / 180;
    for (let i = 0; i < 9; i++) {
      assert.ok(Math.abs(geometry[i + 9].wristX - (rearLocal[i].wristX * Math.cos(r) - rearLocal[i].wristY * Math.sin(r))) < 1e-8);
    }
  }
  for (const [index, firingAngle] of config.firingAngles.entries()) {
    const c = radialEngineKinematics(firingAngle, config)[index];
    assert.equal(c.phaseAngle, 360);
    assert.ok(c.pistonPos < 0.001, `${index}: compression firing must align with its own row TDC`);
  }
  assert.equal(radialFiringAngles(7).length, 7, 'the original seven-cylinder helper stays intact');
  const engine = new EngineModel('radial_18', 'oem');
  assert.equal(engine.setForcedInduction('supercharger'), false);
  assert.equal(engine.setMaxBoost(3), false);
  assert.equal(engine.setModification('pulley', 'overdrive'), false);
  assert.equal(engine.setModification('intercooler', 'upgraded'), false);
  assert.equal(engine.setModification('radiator', 'upgraded'), false);
});

test('each absolute R26B firing event aligns its own rotor chamber to combustion TDC across all three faces', () => {
  const engine = new EngineModel('rotary_4', 'oem');
  engine.setRunning(true); engine.manifoldThrottle = 1;
  for (const turn of [0, 360, 720]) {
    for (const [index, event] of engine.config.firingAngles.entries()) {
      engine.crankAngle = turn + event;
      engine.advanceStep(0, { coupledRPM: 8000 });
      const cylinder = engine.cylinderStates[index];
      const phase = rotaryShaftPhase(turn + event, event, 'absolute');
      assert.equal(cylinder.phaseAngle, phase);
      assert.equal(cylinder.isFiring, true);
      const active = cylinder.chambers.filter(chamber => chamber.isIgnitionPhase);
      assert.equal(active.length, 1);
      assert.equal(active[0].phaseAngle, 540);
      assert.equal(active[0].stroke, 'power');
      assert.equal(active[0].volume, 0.1);
      for (const other of engine.cylinderStates.filter(c => c.index !== index)) assert.equal(other.isFiring, false);
      assert.ok(Array.from({ length: 3 }, (_, face) => rotaryChamberState(phase, face))
        .some(chamber => chamber.phaseAngle === 540));
    }
  }
  assert.equal(rotaryShaftPhase(100, 180), 280, 'the original additive RENESIS phase stays compatible');
});
