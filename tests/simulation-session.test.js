import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { SoundEngine } from '../src/audio/SoundEngine.js';
import { SimulationSession, captureSetup, applySetupToModels, runCSV, SESSION_KEY, CHANNELS } from '../src/controls/SimulationSession.js';

const models = id => {
  const engine = new EngineModel(id, 'oem'); const drive = new Drivetrain(engine); const sound = new SoundEngine();
  return { engine, drive, sound, select: id => { engine.setConfig(id); drive.configureVehicle(); } };
};
const memory = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };

test('saved setups reapply actual independent tuning values, induction and installed parts', () => {
  const m = models('i4_cross'), { engine: e, drive: d, sound: s } = m;
  e.setDisplacement(1200); e.setRedlineRPM(14500); e.setForcedInduction('supercharger'); e.setMaxBoost(1.2);
  assert.equal(e.setModification('intake', 'sport'), true);
  assert.equal(e.setModification('radiator', 'upgraded'), true);
  e.setECUMode('hard'); e.setLimiterHz(24); e.setLimiterDepth(.7);
  d.setFinalDriveScale(.88); d.setVehicleMass(310); s.setListeningPosition('mechanical');
  e.setThermalMode('cold'); e.setCoolingFan(false);
  const setup = captureSetup(e, d, s); m.select('vr6');
  assert.equal(applySetupToModels(setup, e, d, s, m.select).ok, true);
  const restored = captureSetup(e, d, s);
  assert.deepEqual(restored, setup);
});

test('applying setups refuses moving, running or coasting engines without partial mutation', () => {
  const m = models('turbojet'); const setup = captureSetup(m.engine, m.drive, m.sound); m.select('i4_cross');
  for (const [running, speed, core] of [[true, 0, 0], [false, 20, 0], [false, 0, 15]]) {
    m.engine.isIgnitionOn = running; m.drive.speedKmh = speed; m.engine.corePercent = core;
    assert.equal(applySetupToModels(setup, m.engine, m.drive, m.sound, m.select).ok, false);
    assert.equal(m.engine.config.id, 'i4_cross');
  }
});

test('road and jet recordings preserve actual channels, no fictional jet wheel power or coolant', () => {
  let now = 0; const storage = memory(); const session = new SimulationSession(storage, () => now);
  const m = models('turbojet'), setup = captureSetup(m.engine, m.drive, m.sound);
  assert.equal(session.start('J85', setup), true); m.engine.setRunning(true);
  for (let i = 0; i < 2400; i++) {
    m.drive.update(PHYSICS_STEP, 1, 0); now += PHYSICS_STEP;
    session.update(m.engine.snapshot(), m.drive.speedKmh, setup);
  }
  const run = session.stop(); assert.equal(run.samples.length, 100);
  assert.equal(run.samples.at(-1).coolant, null); assert.ok(run.samples.at(-1).thrust > 1);
  assert.ok(run.samples.at(-1).core > 50);
  for (const key of ['speed', 'rpm', 'power']) assert.equal(run.samples.at(-1)[key], null);
  setup.modifications.intake = 'corrupt'; assert.notEqual(run.setup.modifications.intake, 'corrupt');
  assert.deepEqual(new SimulationSession(storage).runs[0], run);
  const csv = runCSV(run).split('\r\n'); assert.equal(csv.length, 101);
  assert.equal(csv[1].split(',').length, Object.keys(CHANNELS).length + 1); assert.equal(csv[1].split(',')[6], '');
});

test('afterburner, cooling fan and listening controls can change during a run and are recorded without rewriting initial setup', () => {
  let now = 0; const session = new SimulationSession(memory(), () => now); const m = models('turbojet');
  const setup = captureSetup(m.engine, m.drive, m.sound); session.start('AB transition', setup);
  m.engine.setAfterburnerEnabled(true); m.sound.setListeningPosition('exhaust'); now = 1;
  session.update({ ...m.engine.snapshot(), afterburnerAmount: .8, throttle: 1 }, 0, captureSetup(m.engine, m.drive, m.sound));
  assert.ok(session.active); assert.equal(session.active.samples[0].afterburner, 80);
  assert.equal(session.active.samples[0].throttle, 100); assert.equal(session.active.setup.afterburner, false);
  m.select('i4_cross'); session.stop(); session.start('fan transition', captureSetup(m.engine, m.drive, m.sound));
  m.engine.setCoolingFan(false); now = 2;
  session.update(m.engine.snapshot(), 0, captureSetup(m.engine, m.drive, m.sound));
  assert.ok(session.active); assert.equal(session.active.samples[0].fan, 0);
});

test('a blocked localStorage getter and null storage items cannot prevent app initialization or in-memory recording', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('SecurityError'); } });
    const session = new SimulationSession(); const m = models('vr6');
    assert.ok(session.error);
    assert.equal(session.start('private browser', captureSetup(m.engine, m.drive, m.sound)), true);
    session.update(m.engine.snapshot(), 0); assert.ok(session.stop());
    assert.equal(session.runs.length, 1); assert.ok(session.error);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
  }
  const storage = memory(), m = models('vr6');
  storage.setItem(SESSION_KEY, JSON.stringify({ setups: [null, { id: 'ok', name: 'ok', setup: captureSetup(m.engine, m.drive, m.sound) }], runs: [null] }));
  assert.equal(new SimulationSession(storage).setups.length, 1);
  const invalid = { ...captureSetup(m.engine, m.drive, m.sound), configId: 'toString' };
  assert.equal(applySetupToModels(invalid, m.engine, m.drive, m.sound, m.select).ok, false);
});

test('simulation-clock recordings align with physics even when the browser pauses wall-clock frames', () => {
  let wall = 0; const session = new SimulationSession(memory(), () => wall), m = models('vr6');
  const setup = captureSetup(m.engine, m.drive, m.sound); session.start('clock', setup, 8);
  wall = 60; session.update({ ...m.engine.snapshot(), simTime: 8.1 }, 0, setup);
  assert.equal(session.active.samples[0].t, .1);
  wall = 300; session.update({ ...m.engine.snapshot(), simTime: 8.2 }, 10, setup);
  assert.ok(session.active); assert.equal(session.active.samples[1].t, .2);
});

test('120-second and configuration-change boundaries stop recording with bounded immutable history', () => {
  let now = 0; const session = new SimulationSession(memory(), () => now); const m = models('vr6');
  const setup = captureSetup(m.engine, m.drive, m.sound);
  session.start('first', setup); session.update(m.engine.snapshot(), 0, setup);
  session.update(m.engine.snapshot(), 0, { ...setup, boost: 2 }); assert.equal(session.active, null);
  assert.equal(session.runs[0].stopReason, '設定已變更');
  for (let i = 0; i < 10; i++) {
    session.start(`run${i}`, setup);
    for (let j = 0; j <= 1200; j++) { now += .1; session.update(m.engine.snapshot(), j, setup); }
    if (session.active) session.stop();
    session.saveSetup(`setup${i}`, setup);
  }
  assert.equal(session.runs.length, 8); assert.ok(session.runs.every(run => run.samples.length <= 1202));
  assert.ok(session.runs.every(run => run.samples.at(-1).t <= 120));
});

test('corrupt and blocked browser storage cannot crash testing or accept malformed curves', () => {
  const malformed = { setups: [], runs: [{ id: 'bad', name: 'bad', setup: captureSetup(...Object.values(models('vr6')).slice(0, 3)), samples: [{ t: 0, rpm: 'wrong' }] }] };
  const storage = memory(); storage.setItem(SESSION_KEY, JSON.stringify(malformed));
  assert.equal(new SimulationSession(storage).runs.length, 0);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const session = new SimulationSession(blocked); const m = models('vr6');
  session.saveSetup('test', captureSetup(m.engine, m.drive, m.sound));
  assert.equal(session.setups.length, 1); assert.match(session.error, /儲存/);
});
