import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { CombustionDSP, combustionWorkletSource } from '../src/audio/CombustionDSP.js';
import { twoStrokePortState } from '../src/physics/TwoStrokeMechanics.js';

const rate = 48000;
const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
function config(id) {
  assert.ok(ENGINE_CONFIGS[id], `the shipped ${id} preset must exist`);
  return ENGINE_CONFIGS[id];
}
function measure(engineConfig, rpm = 6000, params = {}, noiseless = false) {
  const dsp = new CombustionDSP(rate);
  dsp.configure(engineConfig);
  if (noiseless) dsp.random = () => 0;
  dsp.process(new Float32Array(rate / 2), { rpm, load: 0.7, ...params });
  const counts = dsp.events.map(event => event.count);
  const data = dsp.process(new Float32Array(rate * 2), { rpm, load: 0.7, ...params });
  return { data, dsp, firings: dsp.events.reduce((sum, event, i) => sum + event.count - counts[i], 0) };
}

test('two-stroke twin fires twice per revolution while the corresponding four-stroke twin fires once', () => {
  const engine = config('two_stroke_2');
  const two = measure(engine);
  const four = measure({ ...engine, cycleKind: 'four-stroke', cycleDegrees: 720, firingAngles: [0, 360] });
  assert.ok(Math.abs(two.firings - 400) <= 1, '6000 RPM for two seconds gives 400 two-stroke twin combustions');
  assert.ok(Math.abs(four.firings - 200) <= 1);
  assert.ok(two.data.every(value => Number.isFinite(value) && Math.abs(value) < 0.79));
});

test('two-stroke scavenging noise follows the same transfer-port timing as the mechanical model', () => {
  const engine = config('two_stroke_2');
  const normal = measure(engine);
  const ports = new CombustionDSP(); ports.configure(engine);
  for (const phase of [0, 100, 140, 180, 220, 260, 350]) {
    assert.ok(Math.abs(ports.scavengePorts[phase * 2] - twoStrokePortState(phase, engine).transferPort) < 1e-6);
  }
  const closed = measure({ ...engine, twoStrokePorts: { ...engine.twoStrokePorts, transferOpen: 179, transferClose: 181 } });
  assert.equal(normal.firings, closed.firings, 'port noise cannot invent additional firing events');
  const difference = normal.data.map((value, i) => value - closed.data[i]);
  assert.ok(rms(difference) > 0.0005, 'changing the real port-open window must change the sample stream');
});

test('all expanded architectures retain their own firing count and remain audible in the real generated Worklet', () => {
  let Processor;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', combustionWorkletSource())(
    class { constructor() { this.port = { postMessage() {} }; } },
    (name, implementation) => { Processor = implementation; }, rate, 0);
  for (const id of ['two_stroke_2', 'v4', 'vr6', 'w12', 'rotary_4', 'v16', 'radial_18']) {
    const engine = config(id);
    const { data, firings } = measure(engine);
    const expected = 6000 / 60 * 360 / (engine.cycleDegrees || 720) * engine.firingAngles.length * 2;
    assert.ok(Math.abs(firings - expected) <= engine.firingAngles.length, `${id}: its own shaft-cycle event count must survive synthesis`);
    const processor = new Processor({ processorOptions: { config: engine } });
    const samples = new Float32Array(rate);
    processor.process([], [[samples]], { rpm: 6000, load: 0.7 });
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 0.79), id);
    assert.ok(rms(data) > 0.005 && rms(samples) > 0.005, `${id}: actual backend must produce audio, not just a different badge`);
  }
});

test('Twin Pulse V4 has a different coherent firing sound from an even I4 at the same RPM and displacement', () => {
  const a = measure({ ...config('v4'), displacement: 1000 }, 6000, {}, true).data;
  const b = measure({ ...config('i4_flat'), displacement: 1000 }, 6000, {}, true).data;
  assert.ok(rms(a.map((value, i) => value - b[i])) > 0.02,
    'actual firing / bank structure must remain distinct without random noise masking the comparison');
});

test('equal-firing VR6/W12 do not invent irregular firing; runner delays change acoustics without changing combustion cadence', () => {
  for (const [a, b] of [['vr6', 'i6'], ['w12', 'v12']]) {
    const engine = { ...config(a), displacement: 1000, exhaustPathDelays: [] };
    const reference = { ...config(b), displacement: 1000, exhaustPathDelays: [] };
    const left = measure(engine, 6000, {}, true), right = measure(reference, 6000, {}, true);
    assert.equal(left.firings, right.firings);
    assert.ok(rms(left.data.map((value, i) => value - right.data[i])) < 0.00001,
      `${a}: equal firing and equivalent paths should keep the same acoustic cadence`);
    const delayed = measure({ ...engine,
      exhaustPathDelays: engine.firingAngles.map((_, i) => (i % 3) * 0.0006) }, 6000, {}, true);
    assert.equal(delayed.firings, left.firings, 'gas propagation cannot alter the number of combustions');
    assert.ok(rms(left.data.map((value, i) => value - delayed.data[i])) > 0.002,
      'an estimated unequal runner path must affect the coherent signal, not only its label');
  }
});

test('four-rotor optional Brap retains four firings per shaft turn and fades out under real load', () => {
  const engine = config('rotary_4');
  const stock = measure(engine, 1800, { load: 0, rotaryBrap: 0 });
  const brap = measure(engine, 1800, { load: 0, rotaryBrap: 1 });
  assert.ok(Math.abs(stock.firings - 240) <= 4 && stock.firings === brap.firings);
  assert.ok(brap.data.every(value => Number.isFinite(value) && Math.abs(value) < 0.79));
  const loaded = measure(engine, 8000, { rotaryBrap: 0 }).data;
  const loadedBrap = measure(engine, 8000, { rotaryBrap: 1 }).data;
  assert.deepEqual(loaded, loadedBrap, 'the optional low-load sound mode cannot contaminate race-speed combustion');
});
