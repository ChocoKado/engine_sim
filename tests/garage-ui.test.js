import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GaragePanel } from '../src/controls/GaragePanel.js';
import { JetBenchPanel } from '../src/controls/JetBenchPanel.js';
import { createStockModifications } from '../src/physics/Modifications.js';

// A small DOM fixture loads the real index, so the preservation regression checks
// every existing control ID rather than a hand-picked copy of the garage markup.
class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toLowerCase(); this.ownerDocument = document;
    this.attributes = {}; this.dataset = {}; this.children = []; this.parentNode = null;
    this.events = new Map(); this.style = {}; this.hidden = false; this.disabled = false;
    this.value = ''; this._text = ''; this.className = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => {
        const next = force === undefined ? !this.classList.contains(name) : force;
        next ? this.classList.add(name) : this.classList.remove(name);
        return next;
      },
    };
  }
  get id() { return this.attributes.id || ''; }
  get childNodes() { return this.children; }
  get nextSibling() { const peers = this.parentNode?.children || []; return peers[peers.indexOf(this) + 1] || null; }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'value') this.value = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return name === 'class' ? this.className : this.attributes[name] ?? null; }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  insertBefore(node, next) {
    node.remove(); const index = next ? this.children.indexOf(next) : -1;
    index >= 0 ? this.children.splice(index, 0, node) : this.children.push(node);
    node.parentNode = this; return node;
  }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[id]') return Boolean(this.id);
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  addEventListener(type, fn) { const list = this.events.get(type) || []; list.push(fn); this.events.set(type, list); }
  removeEventListener(type, fn) { this.events.set(type, (this.events.get(type) || []).filter(item => item !== fn)); }
  dispatch(type, extra = {}) {
    const event = { key: '', target: this, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const listener of this.events.get(type) || []) listener(event);
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
}

function documentFixture() {
  const document = {
    createElement(tag) { return new Element(tag, this); },
    querySelector(selector) { return this.root.querySelector(selector); },
    querySelectorAll(selector) { return this.root.querySelectorAll(selector); },
    getElementById(id) { return this.querySelector(`#${id}`); },
  };
  document.root = document.createElement('document');
  const stack = [document.root];
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tokens = html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)([^>]*)>/g);
  const voidTags = new Set(['meta', 'link', 'input', 'br', 'hr', 'img']);
  for (const match of tokens) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      while (stack.length > 1 && stack.at(-1).tagName !== tag) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = document.createElement(tag);
    for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    stack.at(-1).appendChild(node);
    if (!voidTags.has(tag) && !match[0].endsWith('/>')) stack.push(node);
  }
  document.body = document.querySelector('body');
  return document;
}

function fixture(overrides = {}) {
  const document = documentFixture();
  const engine = { config: { id: 'i4_flat', layout: 'inline', representativeModel: 'CBR1000RR' },
    forcedInduction: 'na', modifications: createStockModifications(), isIgnitionOn: false,
    displacement: 999, dynoData: { maxHp: 190, maxTorque: 113 }, inertia: .03 };
  const drive = { speedKmh: 0 };
  const requests = [], installations = [];
  const garage = new GaragePanel({ document, engine, drive,
    onViewChange: request => requests.push(request),
    onModificationChange: (kind, value) => { installations.push([kind, value]); engine.modifications[kind] = value; },
    ...overrides });
  garage.init();
  return { document, engine, drive, garage, requests, installations };
}

test('jet bench reuses the driving controls, shares actual telemetry and restores the car shell', () => {
  const { engine, garage, document } = fixture();
  const originalGas = document.getElementById('pedal-gas');
  const originalStart = document.getElementById('btn-start-engine');
  const bench = new JetBenchPanel({ engine, garage, document });
  assert.equal(bench.active, false);
  engine.config = { ...engine.config, id: 'turbojet', propulsionKind: 'turbojet', ratedAfterburnerThrustN: 22241 };
  bench.sync();
  assert.equal(document.body.classList.contains('jet-bench-active'), true);
  assert.equal(document.getElementById('pedal-gas'), originalGas);
  assert.equal(document.getElementById('btn-start-engine'), originalStart);
  assert.equal(document.getElementById('speedometer-canvas').getAttribute('aria-label'), '靜態噴射推力 kN 儀表');
  bench.update({ corePercent: 92.4, thrustN: 12300, exhaustTemperatureC: 650,
    pressureRatio: 7.8, fuelFlowKgS: .47, massFlowKgS: 17, nozzleTemperatureC: 800,
    jetVelocity: 700, afterburnerAmount: 0, afterburnerEnabled: true, isIgnitionOn: true });
  assert.equal(document.getElementById('hud-digital-rpm').textContent, '92.4');
  assert.equal(document.getElementById('hud-digital-speed').textContent, '12.30');
  assert.equal(bench.readings.get('egt').textContent, '650 °C');
  assert.equal(bench.status.textContent, 'RUNNING');
  assert.equal(bench.abStatus.textContent, 'ARMED · 等待高 N1');
  engine.config = { ...engine.config, id: 'i4_flat', propulsionKind: undefined };
  bench.sync();
  assert.equal(bench.active, false);
  assert.equal(document.body.classList.contains('jet-bench-active'), false);
  assert.equal(document.getElementById('speedometer-canvas').getAttribute('aria-label'), '車速指針儀表');
  bench.destroy();
  assert.equal(document.getElementById('jet-afterburner-enabled'), null);
  assert.equal(garage.partList.classList.contains('jet-incompatible'), false);
});

test('jet afterburner control requests the model; displayed light-off and coast follow its state', () => {
  const { engine, garage, document } = fixture();
  engine.config.propulsionKind = 'turbojet';
  let requested;
  engine.setAfterburnerEnabled = value => { requested = value; };
  const bench = new JetBenchPanel({ engine, garage, document });
  bench.afterburner.checked = true;
  bench.afterburner.dispatch('change');
  assert.equal(requested, true);
  const state = { corePercent: 100, thrustN: 22000, isIgnitionOn: true,
    afterburnerEnabled: true, afterburnerAmount: .8 };
  bench.update(state);
  assert.equal(bench.status.textContent, 'AFTERBURNER');
  assert.equal(bench.abStatus.textContent, '80%');
  bench.update({ ...state, isIgnitionOn: false, corePercent: 43, thrustN: 0,
    afterburnerEnabled: false, afterburnerAmount: 0 });
  assert.equal(bench.status.textContent, 'SPOOLING DOWN');
  assert.equal(bench.abStatus.textContent, 'OFF');
  assert.equal(document.getElementById('hud-digital-speed').textContent, '0.00');
  bench.destroy();
});

test('garage reuses every original control and preserves its bound events across mount and destroy', () => {
  const document = documentFixture();
  const originals = new Map(document.querySelectorAll('[id]').map(node => [node.id, node]));
  const originalParents = new Map([...originals].map(([id, node]) => [id, node.parentNode]));
  const main = document.querySelector('.sim-grid');
  const originalChildren = [...main.children];
  let pressed = 0;
  originals.get('pedal-gas').addEventListener('pointerdown', () => pressed++);
  const { engine, drive } = fixture();
  const garage = new GaragePanel({ document, engine, drive });
  garage.init();
  for (const [id, node] of originals) assert.equal(document.getElementById(id), node, `${id} is the original node`);
  assert.equal(document.querySelectorAll('[id]').filter(node => node.id === 'engine-3d-canvas').length, 1);
  assert.equal(document.getElementById('pedal-gas').closest('.garage-cockpit'), garage.cockpit);
  assert.equal(document.getElementById('btn-start-engine').parentNode, garage.startRow);
  assert.equal(document.getElementById('engine-status-badge').parentNode, garage.startRow);
  assert.equal(document.getElementById('hud-gear-display').parentNode, garage.gearReadout);
  assert.equal(garage.gearReadout.parentNode, document.querySelector('.trans-section'));
  assert.equal(document.getElementById('tachometer-canvas').closest('.driving-gauges'), garage.gauges);
  assert.equal(document.querySelector('.cockpit-hud-screen').parentNode, garage.instruments);
  document.getElementById('pedal-gas').dispatch('pointerdown');
  assert.equal(pressed, 1);
  garage.init();
  assert.equal(document.querySelectorAll('[id]').filter(node => node.id === 'garage-part-option').length, 1);
  garage.destroy();
  assert.deepEqual(main.children, originalChildren);
  for (const [id, node] of originals) {
    assert.equal(document.getElementById(id), node);
    assert.equal(node.parentNode, originalParents.get(id), `${id} returns to its original parent`);
  }
  assert.equal(document.getElementById('engine-3d-canvas'), null);
  assert.equal(document.getElementById('cockpit-gear-position'), null);
  assert.equal(document.querySelector('.driving-gear-readout'), null);
  originals.get('pedal-gas').dispatch('pointerdown');
  assert.equal(pressed, 2, 'the original pedal listener survives teardown');
});

test('tabs work with keyboard navigation without moving the pinned engine or cockpit', () => {
  const { garage, document, engine } = fixture();
  const engineParent = document.getElementById('engine-canvas').parentNode;
  const gasParent = document.getElementById('pedal-gas').parentNode;
  assert.equal(garage.activeTab, 'drive');
  assert.equal(garage.panels.get('drive'), garage.instruments);
  assert.equal(garage.instruments.hidden, false);
  assert.deepEqual([...garage.tabButtons.keys()], ['drive', 'garage', 'sound', 'performance', 'settings']);
  assert.deepEqual(garage.layout.children, [garage.engineBar, garage.instruments, garage.library,
    garage.workspace, garage.inspector, garage.cockpit, garage.startRow]);
  assert.equal(document.getElementById('engine-select').closest('.driving-engine-bar'), garage.picker);
  assert.equal(document.getElementById('driving-displacement').textContent, '999 cc');
  assert.equal(document.getElementById('driving-peak-hp').textContent, '190 HP');
  engine.displacement = 1200; engine.dynoData.maxHp = 211; garage.update();
  assert.equal(document.getElementById('driving-displacement').textContent, '1200 cc');
  assert.equal(document.getElementById('driving-peak-hp').textContent, '211 HP');
  garage.inspector.scrollTop = 220;
  garage.library.scrollTop = 180;
  const event = garage.tabButtons.get('garage').dispatch('keydown', { key: 'End' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(garage.activeTab, 'settings');
  assert.equal(garage.inspector.scrollTop, 0, 'switching panels starts at the new panel heading');
  assert.equal(garage.library.scrollTop, 0);
  assert.equal(document.activeElement, garage.tabButtons.get('settings'));
  assert.equal(garage.panels.get('settings').hidden, false);
  assert.equal(garage.panels.get('drive').hidden, true);
  assert.equal(garage.tabButtons.get('settings').getAttribute('aria-selected'), 'true');
  garage.tabButtons.get('settings').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(garage.activeTab, 'drive');
  assert.equal(garage.instruments.hidden, false);
  assert.equal(document.getElementById('engine-canvas').parentNode, engineParent);
  assert.equal(document.getElementById('pedal-gas').parentNode, gasParent);
  assert.equal(document.getElementById('ecu-mode').closest('.garage-pane'), garage.panels.get('settings'));
  assert.equal(document.getElementById('warmth-slider').closest('.garage-pane'), garage.panels.get('sound'));
  garage.selectTab('sound'); garage.modelTitle.dispatch('click');
  assert.equal(garage.activeTab, 'drive');
  assert.equal(document.activeElement, document.getElementById('engine-select'));
});

test('hardware installation requires a stopped, shut-down engine and reflects the actual accepted state', async () => {
  const { garage, engine, drive, installations } = fixture();
  engine.isIgnitionOn = true; garage.update();
  assert.equal(garage.installSelect.disabled, true);
  await garage.changePart('intake', 'sport');
  assert.deepEqual(installations, []);
  assert.equal(engine.modifications.intake, 'stock');
  engine.isIgnitionOn = false; drive.speedKmh = 12; garage.update();
  assert.equal(garage.installSelect.disabled, true);
  await garage.changePart('intake', 'sport');
  assert.deepEqual(installations, []);
  drive.speedKmh = 0; garage.update();
  assert.equal(garage.installSelect.disabled, false);
  await garage.changePart('intake', 'sport');
  assert.deepEqual(installations, [['intake', 'sport']]);
  assert.equal(garage.installSelect.value, 'sport');
  assert.match(garage.installedCount.textContent, /1 項/);
  assert.match(garage.installStatus.textContent, /已套用/);
});

test('pending and rejected installations do not claim a part was installed', async () => {
  let finish;
  const request = new Promise(resolve => { finish = resolve; });
  const { garage, engine } = fixture({ onModificationChange: () => request });
  const installing = garage.changePart('intake', 'sport');
  assert.equal(garage.pending, true);
  assert.equal(garage.installSelect.disabled, true);
  finish(false); await installing;
  assert.equal(garage.pending, false);
  assert.equal(engine.modifications.intake, 'stock');
  assert.equal(garage.installSelect.value, 'stock');
  assert.match(garage.installStatus.textContent, /未完成/);
  assert.match(garage.installedCount.textContent, /0 項/);
});

test('rotary/radial cams, NA intercoolers and turbo pulleys show compatibility reasons', () => {
  const { garage, engine } = fixture();
  engine.config = { id: 'rotary_2', layout: 'rotary' };
  garage.selectPart('camshaft');
  assert.equal(garage.installSelect.disabled, true);
  assert.match(garage.installStatus.textContent, /轉子.*沒有.*凸輪/);
  engine.config = { id: 'radial_7', layout: 'radial' }; garage.update();
  assert.match(garage.installStatus.textContent, /星型.*不適用/);
  garage.selectPart('intercooler');
  assert.equal(garage.installSelect.disabled, true);
  assert.match(garage.installStatus.textContent, /只適用 Turbo/);
  engine.forcedInduction = 'turbo'; garage.selectPart('pulley');
  assert.equal(garage.installSelect.disabled, true);
  assert.match(garage.installStatus.textContent, /Turbo.*不由皮帶/);
  engine.forcedInduction = 'supercharger'; garage.update();
  assert.equal(garage.installSelect.disabled, false);
});

test('turbo header descriptions and part focus match the physical installation, with 2D fallback', () => {
  const { garage, engine, requests, document } = fixture();
  engine.forcedInduction = 'turbo'; garage.selectPart('headers');
  assert.equal(garage.installSelect.children[1].textContent, '低阻渦輪集管');
  assert.match(garage.partPurpose.textContent, /渦輪前.*壓損/);
  assert.deepEqual(requests.at(-1), { mode: '3d', focus: 'headers' });
  garage.selectPart('flywheel');
  assert.deepEqual(requests.at(-1), { mode: '3d', focus: 'flywheel' });
  assert.equal(garage.canvas.hidden, false);
  assert.equal(document.getElementById('engine-canvas').hidden, true);
  garage.set3DAvailable(false, '3D 無法初始化，保留機械剖面');
  assert.equal(garage.viewMode, 'cutaway');
  assert.equal(garage.canvas.hidden, true);
  assert.equal(document.getElementById('engine-canvas').hidden, false);
  assert.equal(garage.focusButton.disabled, true);
  assert.match(garage.stageStatus.textContent, /保留機械剖面/);
});
