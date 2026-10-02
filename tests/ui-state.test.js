import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/app.js';
import { EngineModel, PHYSICS_STEP } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.classList = { toggle: (name, selected) => { this.attributes[`class:${name}`] = selected; } };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...children) { this.children = children; }
}

test('performance reset clears road momentum and held throttle, then selects a valid launch gear', () => {
  const original = globalThis.document;
  const slider = new Element(), value = new Element();
  globalThis.document = { getElementById: id => id === 'throttle-slider' ? slider : id === 'throttle-val' ? value : null };
  try {
    for (const mode of ['at', 'amt']) {
      const app = Object.create(App.prototype);
      app.engine = new EngineModel('honda_k20a'); app.drivetrain = new Drivetrain(app.engine);
      app.engine.setRunning(true); app.isEngineRunning = true;
      app.drivetrain.setMode(mode); app.drivetrain.currentGear = 6; app.drivetrain.speedKmh = 200;
      app.engine.rpm = 8000; app.engine.boostPressure = 1.5;
      app.input = { manualThrottleSlider: 1, isThrottlePressed: true,
        releaseHeldControls() { this.isThrottlePressed = false; } };
      app.resetPerformanceVehicle();
      assert.equal(app.drivetrain.speedKmh, 0); assert.equal(app.drivetrain.currentGear, 1);
      assert.equal(app.engine.rpm, app.engine.idleRPM); assert.equal(app.engine.boostPressure, 0);
      assert.equal(app.input.isThrottlePressed, false); assert.equal(app.input.manualThrottleSlider, 0);
      assert.equal(slider.value, 0); assert.equal(value.textContent, '0%'); assert.equal(app.engine.isIgnitionOn, true);
    }
  } finally { globalThis.document = original; }
});

for (const mode of ['at', 'amt']) {
  test(`${mode}: a real load stall stops App/audio, cancels timing and restarts with one power action`, async () => {
    const original = globalThis.document;
    const button = new Element(), status = new Element(), caption = new Element();
    button.classList.add = name => { button.attributes[`class:${name}`] = true; };
    button.classList.remove = name => { button.attributes[`class:${name}`] = false; };
    button.querySelector = selector => selector === 'span' ? caption : null;
    globalThis.document = { getElementById: id => id === 'btn-start-engine' ? button
      : id === 'engine-status-badge' ? status : null };
    try {
      const app = Object.create(App.prototype);
      app.engine = new EngineModel('i4_cross', 'oem');
      app.drivetrain = new Drivetrain(app.engine);
      app.engine.setRunning(true);
      app.drivetrain.setMode(mode);
      mode === 'at' ? app.drivetrain.setAtSelector('D') : app.drivetrain.setAmtGear(1);
      app.isEngineRunning = true;
      const audioStates = [], starts = [], snapshots = [];
      app.sound = {
        running: true,
        async init() { starts.push('init'); },
        setEngineConfig(config) { assert.equal(config, app.engine.config); },
        setExhaustModel(exhaust) { assert.equal(exhaust, app.engine.exhaust); },
        setRunning(running) { this.running = running; audioStates.push(running); },
        update(snapshot) { snapshots.push(snapshot); },
      };
      const meter = new PerformanceMeter();
      meter.arm({ time: 0, speed: 0, distance: 0, gear: 1, running: true }, { model: 'R1' });
      app.performancePanel = { meter };
      app.updatePowerButtonUI(true);
      assert.equal(status.textContent, 'ENGINE ACTIVE');
      // Stall the real crank inertia with external resisting torque; no direct
      // RPM assignment or fabricated stopped/running flags in this fixture.
      for (let step = 0; step < 240 && app.engine.rpm > 0; step++) {
        app.engine.prepareStep(PHYSICS_STEP, 0);
        app.engine.advanceStep(PHYSICS_STEP, { loadTorque: 100 });
      }
      assert.equal(app.engine.rpm, 0);
      assert.equal(app.engine.isStalled, true);
      app.syncEnginePowerState();
      assert.equal(app.isEngineRunning, false);
      assert.equal(app.sound.running, false);
      assert.deepEqual(audioStates, [false]);
      assert.equal(meter.state, 'cancelled');
      assert.match(meter.message, /失速.*重新發動/);
      assert.match(app.drivetrain.lastShiftMessage, /失速.*重新發動/);
      assert.equal(status.textContent, 'ENGINE STALLED');
      assert.equal(button.attributes['class:running'], false);
      assert.match(caption.textContent, /失速.*重新發動.*START/);
      app.syncEnginePowerState();
      assert.deepEqual(audioStates, [false], 'steady stalled frames do not repeatedly reset audio');

      await app.toggleEnginePower();
      assert.equal(app.engine.isIgnitionOn, true);
      assert.equal(app.engine.isStalled, false);
      assert.equal(app.engine.rpm, app.engine.idleRPM);
      assert.equal(app.isEngineRunning, true);
      assert.equal(app.sound.running, true);
      assert.equal(starts.length, 1, 'one deliberate action starts the engine');
      assert.deepEqual(audioStates, [false, true]);
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].isStalled, false);
      assert.equal(status.textContent, 'ENGINE ACTIVE');
      assert.match(button.innerHTML, /引擎運轉中 \(STOP\)/);
      assert.equal(button.disabled, false);
      assert.equal(app.powerChanging, false);
      assert.equal(app.drivetrain.lastShiftMessage, '');
      for (let step = 0; step < 240; step++) app.drivetrain.update(PHYSICS_STEP, 1, 0);
      assert.ok(app.drivetrain.speedKmh > 8, 'the restarted engine drives the vehicle');

      await app.toggleEnginePower();
      assert.equal(app.engine.isIgnitionOn, false);
      assert.equal(app.engine.isStalled, false, 'deliberate shutdown is distinct from a stall');
      assert.equal(app.isEngineRunning, false);
      assert.equal(app.sound.running, false);
      assert.deepEqual(audioStates, [false, true, false]);
      assert.equal(status.textContent, 'STANDBY');
      assert.match(button.innerHTML, /啟動引擎 \(START\)/);
      assert.equal(starts.length, 1, 'stopping does not initialize the audio engine again');
    } finally { globalThis.document = original; }
  });
}

function fixture() {
  const ids = new Map(['displacement-slider', 'displacement-val', 'redline-slider', 'redline-val',
    'turbo-controls-panel', 'boost-slider', 'boost-val', 'boost-slider-title', 'boost-status-badge', 'supercharger-note',
    'tuning-state-badge', 'vehicle-mass-slider', 'vehicle-mass-val', 'rotary-idle-controls', 'rotary-idle-mode']
    .map(id => [id, new Element()]));
  const induction = ['na', 'turbo', 'supercharger'].map(value => new Element({ induction: value }));
  const sizes = ['small', 'large'].map(value => new Element({ turboSize: value }));
  const bov = ['flutter', 'bov'].map(value => new Element({ bov: value }));
  const turboOnly = [new Element(), new Element()];
  const gears = new Element();
  const reverse = new Element({ pos: 'R' });
  const selectors = new Map([['.induction-btn', induction], ['.turbo-size-btn', sizes], ['.bov-btn', bov],
    ['.bov-selection-row, .turbo-size-row', turboOnly], ['.at-btn[data-pos="R"]', [reverse]]]);
  const original = globalThis.document;
  globalThis.document = {
    getElementById: id => ids.get(id), querySelectorAll: query => selectors.get(query) || [],
    querySelector: query => query === '.amt-shifter' ? gears : null, createElement: () => new Element(),
  };
  const app = Object.create(App.prototype);
  app.engine = { config: { minDisplacement: 2000, maxDisplacement: 4000, defaultRedlineRPM: 3700,
    defaultIdleRPM: 650, minRedlineRPM: 2400, maxRedlineRPM: 4200 }, displacement: 2800, redlineRPM: 3700,
    forcedInduction: 'na', turboSize: 'small', maxBoost: 0.8, bovType: 'bov' };
  app.drivetrain = { maxGear: 7, currentGear: 0, gearRatios: { '-1': -3.2 } };
  app.updateDynoOverview = () => {};
  app.updateReferenceStatus = () => {};
  return { app, ids, induction, sizes, bov, turboOnly, gears, reverse, restore: () => { globalThis.document = original; } };
}

test('preset reset replaces every visible induction setting with current model state', () => {
  const state = fixture();
  try {
    Object.assign(state.app.engine, { forcedInduction: 'turbo', turboSize: 'large', maxBoost: 2.1, bovType: 'flutter' });
    state.app.syncTuningUI();
    assert.equal(state.induction[1].attributes['aria-pressed'], 'true');
    assert.equal(state.sizes[1].attributes['aria-pressed'], 'true');
    assert.equal(state.ids.get('boost-slider').value, 210);
    Object.assign(state.app.engine, { forcedInduction: 'na', turboSize: 'small', maxBoost: 0.8, bovType: 'bov' });
    state.app.syncTuningUI();
    assert.equal(state.induction[0].attributes['aria-pressed'], 'true');
    assert.equal(state.induction[1].attributes['aria-pressed'], 'false');
    assert.equal(state.ids.get('boost-slider').value, 80);
    assert.equal(state.ids.get('turbo-controls-panel').style.display, 'none');
    assert.equal(state.bov[1].attributes['aria-pressed'], 'true');
    assert.equal(state.ids.get('boost-status-badge').textContent, '自然進氣 (NA)');
  } finally { state.restore(); }
});

test('rotary idle mode is visible only on a rotary and preserves the chosen acoustic mode', () => {
  const state = fixture();
  try {
    state.app.sound = { rotaryIdleMode: 'brap' };
    state.app.engine.config.layout = 'rotary'; state.app.syncTuningUI();
    assert.equal(state.ids.get('rotary-idle-controls').hidden, false);
    assert.equal(state.ids.get('rotary-idle-mode').value, 'brap');
    state.app.engine.config.layout = 'inline'; state.app.syncTuningUI();
    assert.equal(state.ids.get('rotary-idle-controls').hidden, true);
    assert.equal(state.app.sound.rotaryIdleMode, 'brap');
  } finally { state.restore(); }
});

test('radial redline controls contain preset RPM and AMT supports seven gears', () => {
  const state = fixture();
  try {
    state.app.syncTuningUI();
    const slider = state.ids.get('redline-slider');
    assert.ok(slider.min <= slider.value && slider.value <= slider.max);
    assert.equal(slider.value, 3700);
    assert.deepEqual(state.gears.children.map(button => button.dataset.gear), [-1, 0, 1, 2, 3, 4, 5, 6, 7]);
  } finally { state.restore(); }
});

test('Roots/TVS shows SC explanation while hiding turbo-only configuration', () => {
  const state = fixture();
  try {
    state.app.engine.forcedInduction = 'supercharger';
    state.app.syncTuningUI();
    assert.equal(state.ids.get('supercharger-note').hidden, false);
    assert.equal(state.ids.get('turbo-controls-panel').style.display, 'block');
    assert.ok(state.turboOnly.every(element => element.style.display === 'none'));
    assert.match(state.ids.get('boost-status-badge').textContent, /ROOTS \/ TVS/);
  } finally { state.restore(); }
});

test('motorcycle presets omit reverse from AMT and hide AT reverse', () => {
  const state = fixture();
  try {
    state.app.drivetrain.gearRatios[-1] = 0;
    state.app.syncGearControls();
    assert.equal(state.reverse.hidden, true);
    assert.equal(state.reverse.disabled, true);
    assert.ok(state.gears.children.every(button => button.dataset.gear >= 0));
    state.app.drivetrain.gearRatios[-1] = -3.2;
    state.app.syncGearControls();
    assert.equal(state.reverse.hidden, false);
    assert.equal(state.reverse.disabled, false);
    assert.equal(state.gears.children[0].dataset.gear, -1);
  } finally { state.restore(); }
});

test('stock GT-R load can be restored with a one-kilogram slider; Flutter is a modification', () => {
  const state = fixture();
  try {
    const app = state.app;
    app.engine = new EngineModel('v6', 'oem');
    app.drivetrain = new Drivetrain(app.engine);
    app.updateVehicleLoad();
    assert.match(state.ids.get('vehicle-mass-val').textContent, /^1857\.2 kg$/);
    app.drivetrain.setVehicleMass(Math.round(app.drivetrain.vehicleMass));
    App.prototype.updateReferenceStatus.call(app);
    assert.equal(state.ids.get('tuning-state-badge').textContent, '原廠基準');
    app.engine.setBovType('flutter');
    App.prototype.updateReferenceStatus.call(app);
    assert.equal(state.ids.get('tuning-state-badge').textContent, '自訂改裝');
  } finally { state.restore(); }
});
