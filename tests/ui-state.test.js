import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/app.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';

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

function fixture() {
  const ids = new Map(['displacement-slider', 'displacement-val', 'redline-slider', 'redline-val',
    'turbo-controls-panel', 'boost-slider', 'boost-val', 'boost-slider-title', 'boost-status-badge', 'supercharger-note',
    'tuning-state-badge', 'vehicle-mass-slider', 'vehicle-mass-val']
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
