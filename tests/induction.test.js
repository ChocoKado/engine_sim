import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { InductionModel, ATMOSPHERE, chargeThermodynamics, steadyBoost } from '../src/physics/InductionModel.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

// A coupled RPM is a dynamometer holding the engine at a chosen operating
// point. It isolates induction dynamics from launch/gearing and limiter changes.
function engine(type = 'turbo', size = 'small', boost = 1.2, bov = 'bov') {
  const model = new EngineModel('i6', 'oem', () => 0.5);
  model.setForcedInduction(type);
  model.setTurboSize(size);
  model.setMaxBoost(boost);
  model.setBovType(bov);
  model.setRunning(true);
  return model;
}

function hold(model, seconds, { rpm = 4000, throttle = 1, torqueScale = 1 } = {}, observe) {
  const events = [];
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    model.rpm = rpm;
    model.prepareStep(dt, throttle, { torqueScale });
    model.advanceStep(dt, { coupledRPM: rpm });
    events.push(...model.bovEvents);
    observe?.(model, step);
  }
  return events;
}

test('small turbo responds earlier; large turbo trades low-speed response for high-flow capacity', () => {
  const small = engine('turbo', 'small');
  const large = engine('turbo', 'large');
  hold(small, 0.5, { rpm: 3000 });
  hold(large, 0.5, { rpm: 3000 });
  assert.ok(small.boostPressure > 0.3, 'small compressor builds usable midrange boost');
  assert.ok(small.boostPressure > large.boostPressure * 1.3, 'large rotating group cannot spool identically');
  const lowSmall = steadyBoost(ENGINE_CONFIGS.i6, 'turbo', 'small', 1.2, 2200);
  const lowLarge = steadyBoost(ENGINE_CONFIGS.i6, 'turbo', 'large', 1.2, 2200);
  const highSmall = steadyBoost(ENGINE_CONFIGS.i6, 'turbo', 'small', 1.2, 6500);
  const highLarge = steadyBoost(ENGINE_CONFIGS.i6, 'turbo', 'large', 1.2, 6500);
  assert.ok(lowSmall > lowLarge, 'larger compressor reaches its useful flow range later');
  assert.ok(highLarge > highSmall, 'large compressor retains more high-speed flow capacity');
});

test('turbo shaft speed and boost build progressively rather than following RPM instantly', () => {
  const model = engine();
  hold(model, dt, { rpm: 4000 });
  const firstRotor = model.induction.turboRPM;
  const firstBoost = model.boostPressure;
  hold(model, 0.15, { rpm: 4000 });
  const earlyRotor = model.induction.turboRPM;
  hold(model, 2, { rpm: 4000 });
  assert.ok(firstRotor > 0 && firstRotor < earlyRotor, 'rotor accelerates through finite energy input');
  assert.ok(firstBoost < model.boostPressure * 0.05, 'no immediate full boost at a fixed high RPM');
  assert.ok(earlyRotor < model.induction.turboRPM * 0.85, 'shaft inertia remains visible after initial throttle opening');
});

test('Roots/TVS provides low-speed pressure quickly and requires positive crankshaft work', () => {
  const config = ENGINE_CONFIGS.i6;
  const blower = new InductionModel();
  const turbo = new InductionModel();
  const conditions = { config, size: 'small', maxBoost: 0.8, displacement: 2997,
    rpm: 1800, throttle: 1, pedalThrottle: 1, torqueScale: 1, running: true,
    baseTorque: 230, bovType: 'bov', time: 0 };
  for (let step = 0; step < Math.round(0.05 / dt); step++) {
    blower.update(dt, { ...conditions, type: 'supercharger', time: step * dt });
    turbo.update(dt, { ...conditions, type: 'turbo', time: step * dt });
  }
  assert.ok(blower.boostPressure > 0.45, 'positive-displacement pump gives low-speed pressure without turbine spool');
  assert.ok(blower.boostPressure > turbo.boostPressure * 3, 'blower response differs materially from exhaust-driven turbo');
  assert.ok(blower.shaftTorque > 5, 'compressing air consumes crankshaft torque');
  assert.equal(turbo.shaftTorque, 0, 'exhaust turbo is not represented as a belt-driven compressor');
  const model = engine('supercharger', 'small', 0.8);
  hold(model, 2, { rpm: 3000 });
  const thermo = chargeThermodynamics(model.induction.chargeBoost, 0.68);
  const gross = model.torqueAtRPM(3000) * thermo.densityRatio;
  assert.ok(model.netTorque < gross - 5, 'blower drive loss is deducted from engine output');
});

for (const type of ['turbo', 'supercharger']) {
  test(`${type}: editing the rev limiter cannot change boost, physical shaft speed or drag at fixed RPM`, () => {
    const model = engine(type, 'small', 0.8);
    hold(model, 7, { rpm: 3000 });
    const before = { boost: model.boostPressure, drag: model.currentEngineDrag,
      rotor: model.induction.turboRPM, blower: model.induction.superchargerRPM };
    model.setRedlineRPM(10000);
    hold(model, 2, { rpm: 3000 });
    assert.ok(Math.abs(model.boostPressure - before.boost) < 0.001);
    assert.ok(Math.abs(model.currentEngineDrag - before.drag) < 0.01);
    assert.ok(Math.abs(model.induction.turboRPM - before.rotor) < 20);
    assert.ok(Math.abs(model.induction.superchargerRPM - before.blower) < 0.01);
  });
}

test('TVS rotor speed follows crankshaft speed while the bypass unloads the blower on lift', () => {
  const model = engine('supercharger', 'small', 0.8);
  hold(model, 1, { rpm: 1800 });
  const lowRotor = model.snapshot().superchargerRPM;
  hold(model, 1, { rpm: 3600 });
  const highRotor = model.snapshot().superchargerRPM;
  assert.ok(Math.abs(highRotor / lowRotor - 2) < 0.01, 'fixed pulley gives a fixed shaft/crank ratio');
  const events = hold(model, 0.3, { rpm: 3600, throttle: 0 });
  const state = model.snapshot();
  assert.ok(state.bypassOpening > 0.95, 'closed throttle opens the unloading bypass');
  assert.ok(state.superchargerRPM > lowRotor, 'rotors continue mechanically with the crank');
  assert.ok(state.chargePressure - ATMOSPHERE < 3000, 'unloaded charge pipe approaches ambient');
  assert.equal(events.length, 0, 'Roots bypass is not misrepresented as turbo flutter/BOV');
});

for (const bovType of ['bov', 'flutter']) {
  test(`${bovType}: throttle lift emits a pressure/speed-aware event and releases stored pressure gradually`, () => {
    const model = engine('turbo', 'small', 1.2, bovType);
    hold(model, 5);
    const beforePressure = model.snapshot().chargePressure - ATMOSPHERE;
    const beforeRotor = model.induction.turboRPM;
    const events = hold(model, dt, { throttle: 0 });
    const after = model.snapshot();
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.type, bovType);
    assert.ok(event.pressure > 0.5 && event.rotorRPM > 50000);
    assert.ok(event.duration > 0.1 && event.duration < 1.5 && event.pulseRate > 5);
    assert.ok(event.timestamp <= after.simTime && event.intensity > 0);
    assert.ok(after.chargePressure - ATMOSPHERE > beforePressure * 0.60, 'reservoir cannot vanish in one substep');
    assert.ok(after.turboRPM > beforeRotor * 0.90, 'valve opening cannot instantly stop the common shaft');
    const more = hold(model, 0.30, { throttle: 0 });
    assert.equal(more.length, 0, 'one sustained lift does not replay the transient every frame');
    assert.ok(model.induction.chargePressure - ATMOSPHERE < beforePressure * 0.4, 'charge pressure genuinely decays');
  });
}

test('BOV keeps a closed throttle relieved after its audible transient has ended', () => {
  const model = engine('turbo', 'small', 1.2, 'bov');
  hold(model, 5);
  const pressures = [];
  hold(model, 1.2, { throttle: 0 }, current => pressures.push((current.induction.chargePressure - ATMOSPHERE) / 100000));
  const late = pressures.slice(Math.round(0.5 / dt));
  assert.ok(Math.max(...late) < 0.04,
    'manifold vacuum / pressure difference must keep the valve relieving, rather than rebuilding boost on a timer');
  hold(model, 1, { throttle: 1 });
  assert.ok(model.boostPressure > 0.4, 'reopening throttle closes relief and restores usable boost');
});

test('no-valve flutter produces pressure oscillation and more rotor damping than a relieving BOV', () => {
  const valve = engine('turbo', 'small', 1.2, 'bov');
  const flutter = engine('turbo', 'small', 1.2, 'flutter');
  hold(valve, 5);
  hold(flutter, 5);
  const pressure = [];
  hold(valve, 0.5, { throttle: 0 });
  hold(flutter, 0.5, { throttle: 0 }, model => pressure.push(model.induction.chargePressure));
  let rises = 0;
  for (let i = 1; i < pressure.length; i++) if (pressure[i] - pressure[i - 1] > 40) rises++;
  assert.ok(rises > 2, 'surge includes repeated pressure reversals, not a single exponential hiss');
  assert.ok(flutter.induction.turboRPM < valve.induction.turboRPM * 0.8,
    'flow reversal adds compressor loading instead of giving the no-valve setup a free performance gain');
});

test('physical release events get stronger and longer with higher stored charge pressure', () => {
  for (const bovType of ['bov', 'flutter']) {
    const low = engine('turbo', 'small', 0.3, bovType);
    const high = engine('turbo', 'small', 1.4, bovType);
    hold(low, 5);
    hold(high, 5);
    const [quiet] = hold(low, dt, { throttle: 0 });
    const [loud] = hold(high, dt, { throttle: 0 });
    assert.ok(loud.pressure > quiet.pressure * 2);
    assert.ok(loud.intensity > quiet.intensity * 1.4, 'sound event carries the extra reservoir energy');
    assert.ok(loud.duration > quiet.duration, 'higher pressure cannot always use an identical fixed burst');
  }
});

test('ignition torque cuts with an open throttle preserve rotor inertia and do not falsely fire a BOV', () => {
  const model = engine('turbo', 'small', 1.2, 'bov');
  hold(model, 5);
  const beforeRotor = model.induction.turboRPM;
  const events = hold(model, 0.08, { throttle: 1, torqueScale: 0.05 });
  const cut = model.snapshot();
  assert.equal(events.length, 0);
  assert.ok(cut.manifoldThrottle > 0.95 && cut.ignitionCut, 'TPS and ignition state are independent');
  assert.ok(cut.turboRPM > beforeRotor * 0.8, 'brief ignition cut cannot reset the shaft');
  assert.equal(cut.bypassOpening, 0);
  assert.ok(cut.torqueScale < 0.1 && cut.exhaustEnergy >= 0 && Number.isFinite(cut.exhaustEnergy));
});

test('higher boost changes output and thermal/compressor work rather than only the display', () => {
  for (const type of ['turbo', 'supercharger']) {
    const low = engine(type, 'small', 0.5);
    const high = engine(type, 'small', 1.4);
    hold(low, 5);
    hold(high, 5);
    assert.ok(high.netTorque > low.netTorque * 1.2, `${type}: more actual output at the operating point`);
    assert.ok(high.induction.intakeTemperature > low.induction.intakeTemperature, `${type}: compression heats the charge`);
    if (type === 'supercharger') {
      assert.ok(high.induction.shaftTorque > low.induction.shaftTorque);
      assert.ok(high.snapshot().superchargerRPM > low.snapshot().superchargerRPM, 'higher boost models a pulley change');
    }
    assert.ok(Math.abs(high.netTorque - high.steadyTorqueAtRPM(4000)) / high.netTorque < 0.02,
      `${type}: dyno and sustained live output use compatible density/loss calculations`);
  }
});

test('boost thermodynamics heat the charge, consume work and give density below the ideal cold pressure ratio', () => {
  const zero = chargeThermodynamics(0);
  const low = chargeThermodynamics(0.5);
  const high = chargeThermodynamics(1.5);
  assert.equal(zero.densityRatio, 1);
  assert.equal(zero.specificWork, 0);
  assert.ok(high.intakeTemperature > low.intakeTemperature && low.intakeTemperature > zero.intakeTemperature);
  assert.ok(high.specificWork > low.specificWork && low.specificWork > 0);
  assert.ok(high.densityRatio < 1 + 1.5 * 100000 / ATMOSPHERE);
  const poorerCompressor = chargeThermodynamics(1, 0.55);
  const efficient = chargeThermodynamics(1, 0.80);
  assert.ok(poorerCompressor.intakeTemperature > efficient.intakeTemperature);
  assert.ok(poorerCompressor.densityRatio < efficient.densityRatio);
});

test('shutdown clears events while the unpowered turbo coasts, then pressures return to ambient at rest', () => {
  const model = engine('turbo', 'small', 1.2, 'flutter');
  hold(model, 5);
  hold(model, dt, { throttle: 0 });
  const rotor = model.induction.turboRPM;
  model.setRunning(false);
  assert.equal(model.snapshot().bovEvents.length, 0);
  assert.ok(model.snapshot().turboRPM > rotor * 0.95, 'turning off ignition does not teleport rotor speed to zero');
  for (let step = 0; step < Math.round(20 / dt); step++) {
    model.prepareStep(dt, 0);
    model.advanceStep(dt);
    const state = model.snapshot();
    assert.equal(state.bovEvents.length, 0);
    assert.ok(Number.isFinite(state.airFlow) && state.airFlow >= 0);
    assert.ok(Number.isFinite(state.turboRPM) && state.turboRPM >= 0);
  }
  const stopped = model.snapshot();
  assert.equal(stopped.rpm, 0);
  assert.equal(stopped.airFlow, 0, 'a stationary crank does not pump engine airflow');
  assert.ok(stopped.turboRPM < rotor * 0.01);
  assert.ok(Math.abs(stopped.intakePressure - ATMOSPHERE) < 50, 'a stopped intake cannot retain manifold vacuum');
  assert.ok(Math.abs(stopped.chargePressure - ATMOSPHERE) < 50);
});

test('induction changes cannot leak a previous valve event or stale shaft state into the audio snapshot', () => {
  for (const change of [model => model.setForcedInduction('na'), model => model.setTurboSize('large')]) {
    const model = engine();
    hold(model, 5);
    hold(model, dt, { throttle: 0 });
    assert.equal(model.snapshot().bovEvents.length, 1, 'test starts with a real queued release event');
    change(model);
    const state = model.snapshot();
    assert.equal(state.bovEvents.length, 0, 'new configuration cannot replay the previous valve sound');
    assert.equal(state.turboRPM, 0);
    assert.equal(state.superchargerRPM, 0);
    assert.equal(state.airFlow, 0);
    assert.equal(state.intakePressure, ATMOSPHERE);
    assert.equal(state.chargePressure, ATMOSPHERE);
  }
});
