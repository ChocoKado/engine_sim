import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { MODIFICATION_CATALOG, isModificationSupported } from '../src/physics/Modifications.js';

function hold(engine, rpm, throttle = 1, seconds = 3) {
  if (!engine.isIgnitionOn) engine.setRunning(true);
  engine.rpm = rpm;
  for (let step = 0; step < seconds / dt; step++) {
    engine.prepareStep(dt, throttle);
    engine.advanceStep(dt, { coupledRPM: rpm });
  }
}

function make(id = 'i4_cross', type) {
  const engine = new EngineModel(id, 'oem', () => 0.5);
  if (type) engine.setForcedInduction(type);
  return engine;
}

function assertLiveMatchesDyno(engine, rpm) {
  hold(engine, rpm);
  assert.ok(Math.abs(engine.netTorque - engine.steadyTorqueAtRPM(rpm)) < 0.002 * engine.steadyTorqueAtRPM(rpm),
    'the live crank output and steady dyno must use the same modified charge and shaft-work calculation');
}

test('all stock engines enter idle catch without a torque step across the former 100 RPM boundary', () => {
  for (const id of Object.keys(ENGINE_CONFIGS).filter(id => !['turbojet', 'turboshaft'].includes(ENGINE_CONFIGS[id].propulsionKind))) {
    const engine = new EngineModel(id, 'oem', () => 0.5);
    engine.setRunning(true);
    engine.rpm = engine.idleRPM + 100.1;
    engine.prepareStep(dt, 0);
    const above = engine.netTorque;
    engine.rpm = engine.idleRPM + 99.9;
    engine.prepareStep(dt, 0);
    assert.ok(Math.abs(engine.netTorque - above) < Math.max(1, engine.currentEngineDrag) * 0.05,
      `${id}: a 0.2 RPM change cannot switch on a large compensating idle torque`);
    assert.ok(engine.netTorque < 0, `${id}: catching idle must still dissipate excess crank energy`);
  }
});

test('stock neutral coast-down remains physical and settles to idle after the continuous catch', () => {
  for (const id of Object.keys(ENGINE_CONFIGS).filter(id => !['turbojet', 'turboshaft'].includes(ENGINE_CONFIGS[id].propulsionKind))) {
    const engine = new EngineModel(id, 'oem', () => 0.5);
    const drive = new Drivetrain(engine);
    engine.setRunning(true);
    for (let step = 0; step < 3 / dt && engine.rpm < engine.redlineRPM * 0.8; step++) drive.update(dt, 1, 0);
    assert.ok(engine.rpm >= engine.redlineRPM * 0.8, `${id}: throttle must actually raise RPM`);
    for (let step = 0; step < 6 / dt; step++) {
      const before = engine.rpm;
      drive.update(dt, 0, 0);
      assert.ok(engine.isIgnitionOn && !engine.isStalled, `${id}: normal coast-down must not stall`);
      assert.ok(Number.isFinite(engine.rpm));
      assert.ok(Math.abs(engine.rpm - before) < engine.redlineRPM * 0.025,
        `${id}: idle catch cannot directly reset crank RPM`);
    }
    assert.ok(Math.abs(engine.rpm - engine.idleRPM) < 10, `${id}: coast-down settles near the idle target`);
  }
});

test('complete ignition cuts cannot produce idle combustion or carry an external load in any engine', () => {
  for (const id of Object.keys(ENGINE_CONFIGS).filter(id => !['turbojet', 'turboshaft'].includes(ENGINE_CONFIGS[id].propulsionKind))) for (const type of (ENGINE_CONFIGS[id].builtInInduction ? ['na'] : ['na', 'supercharger'])) {
    const engine = make(id, type);
    if (type === 'supercharger') engine.setMaxBoost(3);
    engine.setRunning(true);
    engine.rpm = engine.idleRPM;
    engine.prepareStep(dt, 0, { torqueScale: 0, idleLoad: 1000 });
    const before = engine.rpm;
    assert.equal(engine.combustionTorque, 0, `${id}/${type}: idle air still requires ignition`);
    assert.equal(engine.idleTorque, 0);
    assert.ok(engine.netTorque < 0, 'friction and the driven compressor must keep consuming crank energy');
    assert.equal(engine.netTorque, -engine.currentEngineDrag);
    assert.equal(engine.snapshot().combustionTorque, 0);
    if (type === 'supercharger') assert.ok(engine.induction.shaftTorque > 0,
      'an ignition cut must not disconnect the blower to conceal its load');
    engine.advanceStep(dt);
    assert.ok(engine.rpm < before, 'the crank must physically decelerate rather than remain at an imposed idle');
  }
});

test('partial ignition cuts retain bounded idle air authority rather than bypassing the cut', () => {
  for (const id of Object.keys(ENGINE_CONFIGS).filter(id => !['turbojet', 'turboshaft'].includes(ENGINE_CONFIGS[id].propulsionKind))) {
    const full = make(id), half = make(id);
    for (const engine of [full, half]) {
      engine.setRunning(true);
      engine.rpm = engine.idleRPM;
    }
    // A deliberately excessive load exposes the available combustion ceiling.
    // Compare physical outputs at identical crank speed and admission state.
    full.prepareStep(dt, 0, { idleLoad: 10000 });
    half.prepareStep(dt, 0, { torqueScale: 0.5, idleLoad: 10000 });
    assert.ok(full.combustionTorque > 0);
    assert.ok(half.combustionTorque > 0 && half.idleTorque > 0,
      `${id}: partial cuts must retain real remaining combustion capacity`);
    assert.ok(half.combustionTorque <= full.combustionTorque * 0.500001,
      `${id}: opening idle air cannot restore more than the remaining firing fraction`);
    assert.equal(half.netTorque, half.combustionTorque - half.currentEngineDrag,
      'idle combustion must be counted once and mechanical losses deducted once');
    assert.equal(half.snapshot().idleTorque, half.idleTorque);
  }
  const engine = make('honda_k20a');
  engine.setRunning(true);
  for (let n = 0; n < 1 / dt; n++) {
    engine.prepareStep(dt, 0, { torqueScale: 0.5 });
    engine.advanceStep(dt);
  }
  assert.ok(engine.isIgnitionOn && !engine.isStalled);
  assert.ok(Math.abs(engine.rpm - engine.idleRPM) < 1,
    'a partially firing engine with enough reserve can still support normal idle');
});

test('sustained complete ignition cut exposes loss of combustion instead of being rescued by idle load feedforward', () => {
  const engine = make('honda_k20a');
  engine.setRunning(true);
  for (let n = 0; n < 3 / dt && engine.isIgnitionOn; n++) {
    engine.prepareStep(dt, 0, { torqueScale: 0, idleLoad: 1000 });
    assert.equal(engine.combustionTorque, 0);
    engine.advanceStep(dt);
  }
  assert.equal(engine.isIgnitionOn, false);
  assert.equal(engine.isStalled, true);
  assert.equal(engine.idleTorque, 0, 'stall reset cannot retain an idle torque from a previous substep');
});

test('modification API rejects invalid parts, respects architecture and induction, and resets incompatible selections', () => {
  for (const [id, config] of Object.entries(ENGINE_CONFIGS)) {
    const engine = make(id);
    const before = engine.steadyTorqueAtRPM(config.ratedPowerRPM);
    assert.equal(engine.setModification('fake-power', 'sport'), false);
    assert.equal(engine.setModification('intake', 'unknown'), false);
    assert.equal(engine.steadyTorqueAtRPM(config.ratedPowerRPM), before);
    for (const part of MODIFICATION_CATALOG) {
      const value = part.options[1].value;
      assert.equal(engine.setModification(part.id, value), isModificationSupported(config, engine.forcedInduction, part.id));
    }
    const snapshot = engine.snapshot();
    snapshot.modifications.intake = 'stock';
    if (['turbine', 'turbojet'].includes(config.layout)) {
      assert.ok(Object.values(engine.modifications).every(value => value === 'stock'));
      assert.equal(engine.setForcedInduction('supercharger'), false);
      assert.equal(engine.setForcedInduction('turbo'), false);
      assert.equal(engine.setModification('pulley', 'overdrive'), false);
      continue;
    }
    assert.equal(engine.modifications.intake, 'sport', 'telemetry must not expose mutable tuning state');
    engine.setConfig(id);
    assert.ok(Object.values(engine.modifications).every(value => value === 'stock'));
    if (config.builtInInduction) {
      assert.equal(engine.setForcedInduction('supercharger'), false);
      assert.equal(engine.setMaxBoost(3), false);
      assert.equal(engine.setModification('pulley', 'overdrive'), false);
      assert.equal(engine.setModification('intercooler', 'upgraded'), false);
      continue;
    }
    engine.setForcedInduction('supercharger');
    assert.equal(engine.setModification('pulley', 'overdrive'), true);
    assert.equal(engine.setModification('intercooler', 'upgraded'), true);
    engine.setModification('intake', 'sport');
    engine.setForcedInduction('turbo');
    assert.equal(engine.modifications.pulley, 'stock');
    assert.equal(engine.modifications.intercooler, 'upgraded');
    engine.setForcedInduction('na');
    assert.equal(engine.modifications.intercooler, 'stock');
    assert.equal(engine.modifications.intake, 'sport');
  }
});

test('a lighter flywheel speeds both neutral rise and fall without increasing steady power or lightening the entire engine', () => {
  const stock = make('honda_k20a'), light = make('honda_k20a');
  assert.equal(light.setModification('flywheel', 'light'), true);
  assert.ok(light.inertia < stock.inertia && light.inertia > stock.inertia * 0.8,
    'fixed crank, pistons and accessories retain their inertia');
  assert.deepEqual(light.dynoData, stock.dynoData, 'stored rotational energy is not a horsepower upgrade');
  const measure = engine => {
    engine.setRunning(true);
    let rise = 0, fall = 0;
    while (engine.rpm < 5000 && rise < 3) { engine.prepareStep(dt, 1); engine.advanceStep(dt); rise += dt; }
    assert.ok(engine.rpm >= 5000);
    while (engine.rpm > 1500 && fall < 6) { engine.prepareStep(dt, 0); engine.advanceStep(dt); fall += dt; }
    assert.ok(engine.rpm <= 1500 && engine.isIgnitionOn);
    return { rise, fall };
  };
  const a = measure(stock), b = measure(light);
  assert.ok(b.rise < a.rise * 0.95 && b.fall < a.fall * 0.95, 'less flywheel inertia improves both transient directions');
});

test('sport intake changes actual filling response and high-flow crank output', () => {
  const stock = make(), sport = make();
  sport.setModification('intake', 'sport');
  hold(stock, 5000, 1, 0.05); hold(sport, 5000, 1, 0.05);
  assert.ok(sport.manifoldThrottle > stock.manifoldThrottle);
  assert.ok(sport.netTorque > stock.netTorque);
  assert.ok(sport.steadyTorqueAtRPM(12000) > stock.steadyTorqueAtRPM(12000));
  assertLiveMatchesDyno(sport, 12000);
  assert.ok(sport.snapshot().intakeGain > stock.snapshot().intakeGain, 'audio receives the same selected intake');
});

for (const [kind, value] of [['headers', 'tuned'], ['camshaft', 'sport']]) {
  test(`${kind}: output moves toward high RPM with a genuine low-RPM tradeoff`, () => {
    const stock = make(), tuned = make();
    tuned.setModification(kind, value);
    assert.ok(tuned.steadyTorqueAtRPM(2500) < stock.steadyTorqueAtRPM(2500));
    assert.ok(tuned.steadyTorqueAtRPM(12000) > stock.steadyTorqueAtRPM(12000));
    assertLiveMatchesDyno(tuned, 12000);
  });
}

test('a street cam changes actual valve motion as well as torque while rotary and radial reject the part', () => {
  const stock = make(), sport = make();
  sport.setModification('camshaft', 'sport');
  const motion = engine => {
    let peak = 0, open = 0;
    for (let angle = 0; angle < 720; angle += 5) {
      engine.crankAngle = angle;
      engine.advanceStep(0, { coupledRPM: 6000 });
      const lift = engine.cylinderStates[0].intakeValve;
      peak = Math.max(peak, lift); open += lift > 0.001 ? 1 : 0;
    }
    return { peak, open };
  };
  const a = motion(stock), b = motion(sport);
  assert.ok(b.peak > a.peak * 1.04 && b.open > a.open, 'cam lift and open duration must actually change');
  for (const id of ['radial_7', 'rotary_2']) assert.equal(make(id).setModification('camshaft', 'sport'), false);
});

for (const type of ['turbo', 'supercharger']) {
  test(`${type}: upgraded intercooling improves density at the same boost and adds a filling-volume cost`, () => {
    const stock = make('i4_cross', type), cool = make('i4_cross', type);
    cool.setModification('intercooler', 'upgraded');
    hold(stock, 9000); hold(cool, 9000);
    assert.ok(Math.abs(stock.induction.chargeBoost - cool.induction.chargeBoost) < 0.001,
      'cooling cannot manufacture a higher pressure target');
    assert.ok(cool.induction.intakeTemperature < stock.induction.intakeTemperature - 5);
    assert.ok(cool.netTorque > stock.netTorque);
    assertLiveMatchesDyno(cool, 9000);
    const a = make('i4_cross', type), b = make('i4_cross', type);
    b.setModification('intercooler', 'upgraded');
    hold(a, 9000, 1, 0.12); hold(b, 9000, 1, 0.12);
    assert.ok(b.induction.chargeBoost < a.induction.chargeBoost,
      'the larger charge volume must take longer to fill under the same shaft drive');
  });
}

test('Roots overdrive raises actual rotor speed, pressure, temperature and shaft work instead of applying a free torque multiplier', () => {
  const stock = make('i4_cross', 'supercharger'), fast = make('i4_cross', 'supercharger');
  fast.setModification('pulley', 'overdrive');
  hold(stock, 9000); hold(fast, 9000);
  assert.ok(fast.induction.superchargerRPM > stock.induction.superchargerRPM * 1.05);
  assert.ok(fast.induction.chargeBoost > stock.induction.chargeBoost);
  assert.ok(fast.induction.intakeTemperature > stock.induction.intakeTemperature);
  assert.ok(fast.induction.shaftTorque > stock.induction.shaftTorque);
  assert.ok(fast.netTorque > stock.netTorque);
  assertLiveMatchesDyno(fast, 9000);
  hold(fast, 9000, 1);
  const shaft = fast.induction.shaftTorque;
  for (let step = 0; step < 0.1 / dt; step++) {
    fast.prepareStep(dt, 1, { torqueScale: 0 });
    fast.advanceStep(dt, { coupledRPM: 9000 });
  }
  assert.ok(fast.induction.shaftTorque > shaft * 0.95, 'an ignition cut cannot disconnect the driven rotors');
  assert.equal(make('i4_cross', 'turbo').setModification('pulley', 'overdrive'), false);
});

test('modification powerbands and shaft drive remain tied to physical RPM when the ECU limit changes', () => {
  for (const type of ['na', 'turbo', 'supercharger']) {
    const engine = make('i4_cross', type);
    for (const part of MODIFICATION_CATALOG) engine.setModification(part.id, part.options[1].value);
    engine.setRedlineRPM(engine.config.minRedlineRPM);
    hold(engine, 9000);
    const before = { torque: engine.netTorque, J: engine.inertia, shaft: engine.induction.shaftTorque,
      rotor: engine.induction.superchargerRPM, boost: engine.induction.chargeBoost };
    engine.setRedlineRPM(engine.config.maxRedlineRPM);
    hold(engine, 9000);
    for (const [key, value] of Object.entries(before)) {
      const after = ({ torque: engine.netTorque, J: engine.inertia, shaft: engine.induction.shaftTorque,
        rotor: engine.induction.superchargerRPM, boost: engine.induction.chargeBoost })[key];
      assert.ok(Math.abs(after - value) < Math.max(1, Math.abs(value)) * 0.0001,
        `${type}/${key}: changing a cut limit cannot resize a physical modification`);
    }
  }
});

for (const mode of ['at', 'amt']) for (const mass of [180, 3000]) for (const displacement of ['stock', 'max']) {
  test(`CP4 SC 3 bar / light flywheel / all compatible parts / ${mode} / ${mass} kg / ${displacement} CC: stop and relaunch without hiding stalls`, () => {
    const engine = make('i4_cross', 'supercharger');
    engine.setMaxBoost(3);
    if (displacement === 'max') engine.setDisplacement(engine.config.maxDisplacement);
    for (const part of MODIFICATION_CATALOG) assert.equal(engine.setModification(part.id, part.options[1].value), true);
    const drive = new Drivetrain(engine);
    drive.setVehicleMass(mass);
    drive.setMode(mode);
    engine.setRunning(true);
    mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
    const step = (throttle, brake) => {
      drive.update(dt, throttle, brake);
      assert.ok(engine.isIgnitionOn && !engine.isStalled, 'every physical step must expose any actual stall');
      assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh));
    };
    for (let n = 0; n < 5 / dt; n++) step(1, 0);
    assert.ok(drive.speedKmh > 1);
    for (let n = 0; n < 20 / dt && Math.abs(drive.speedKmh) > 0.01; n++) step(0, 1);
    assert.ok(Math.abs(drive.speedKmh) <= 0.01, 'the actual brake must stop the vehicle');
    for (let n = 0; n < 2 / dt; n++) step(0, 1);
    assert.ok(engine.rpm > engine.idleRPM * 0.8, 'the compressor still permits useful idle after braking');
    engine.setRedlineRPM(engine.config.minRedlineRPM);
    engine.setECUMode('hard'); engine.setLimiterHz(32); engine.setLimiterDepth(1);
    // No reset, fresh starter or RPM assignment between the two launches.
    for (let n = 0; n < 5 / dt; n++) step(1, 0);
    assert.ok(drive.speedKmh > 1, 'the retained setup must physically relaunch');
  });
}
