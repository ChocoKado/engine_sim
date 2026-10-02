import test from 'node:test';
import assert from 'node:assert/strict';
import { CombustionDSP } from '../src/audio/CombustionDSP.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const sampleRate = 48000;
const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
function render(mode, { config = ENGINE_CONFIGS.rotary_2, rpm = 900, load = 0, duration = 3, ignitionCut = 0, limiter = 0 } = {}) {
  const dsp = new CombustionDSP(sampleRate);
  dsp.configure(config);
  dsp.rpm = rpm;
  const params = { rpm, load, rotaryBrap: mode, ignitionCut, limiter, limiterMode: 1, limiterDepth: 1 };
  dsp.process(new Float32Array(sampleRate / 2), params);
  const before = dsp.events.map(event => event.count);
  const data = dsp.process(new Float32Array(Math.round(sampleRate * duration)), params);
  return { data, dsp, firings: dsp.events.map((event, i) => event.count - before[i]) };
}

function envelope(data, samples = 240) {
  const levels = [];
  for (let i = 0; i < data.length; i += samples) levels.push(rms(data.subarray(i, i + samples)));
  return levels;
}

function envelopeOrder(levels, hz, envelopeSampleRate = 200) {
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  let real = 0, imag = 0;
  for (let i = 0; i < levels.length; i++) {
    real += (levels[i] - mean) * Math.cos(2 * Math.PI * hz * i / envelopeSampleRate);
    imag += (levels[i] - mean) * Math.sin(2 * Math.PI * hz * i / envelopeSampleRate);
  }
  return 2 * Math.hypot(real, imag) / levels.length / mean;
}

test('stock and Brap both retain two evenly scheduled combustions per shaft revolution', () => {
  for (const mode of [0, 1]) {
    const { firings, data } = render(mode, { rpm: 900, duration: 2 });
    assert.ok(Math.abs(firings.reduce((sum, value) => sum + value, 0) - 60) <= 1,
      '900 shaft RPM for two seconds must produce 60 combustion events');
    assert.ok(firings.every(count => Math.abs(count - 30) <= 1), 'each rotor fires once per shaft turn');
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) < 1));
  }
});

test('stock idle exposes pressure pulses without a ported-engine low-frequency dropout pattern', () => {
  const { data } = render(0);
  const levels = envelope(data);
  const sorted = levels.toSorted((a, b) => a - b);
  const valleyRatio = sorted[Math.floor(sorted.length * 0.1)] / sorted[Math.floor(sorted.length * 0.9)];
  assert.ok(valleyRatio < 0.15, 'individual blowdown pulses have audible valleys');
  assert.ok(envelopeOrder(levels, 5) < 0.10, 'stock does not introduce pronounced three-turn combustion groups');
  assert.ok(rms(data) > 0.005, 'natural idle pulse shaping does not make the engine inaudible');
});

test('Brap adds strong/weak low-speed combustion groups while every short window stays audible', () => {
  const stock = render(0).data;
  const brap = render(1).data;
  const stockGroup = envelopeOrder(envelope(stock), 5);
  const brapGroup = envelopeOrder(envelope(brap), 5);
  assert.ok(brapGroup > 0.3 && brapGroup > stockGroup * 4,
    'ported-style sound has a measurable longer cadence, not only a volume increase');
  for (let offset = 0; offset < brap.length - 960; offset += 480) {
    assert.ok(rms(brap.subarray(offset, offset + 960)) > 0.001, 'weak groups preserve acoustic background');
  }
});

test('Brap cadence tracks rotor/shaft speed while the firing rate remains twice shaft order', () => {
  for (const rpm of [900, 1200]) {
    const { data, firings } = render(1, { rpm, duration: 3 });
    assert.ok(envelopeOrder(envelope(data), rpm / 180) > 0.25,
      'group envelope follows three-shaft-turn chamber progression');
    assert.ok(Math.abs(firings.reduce((sum, value) => sum + value, 0) - rpm / 60 * 2 * 3) <= 1);
  }
});

test('Brap sound fades out with speed/load and cannot affect other engine architectures', () => {
  for (const conditions of [{ rpm: 6000, load: 0 }, { rpm: 850, load: 1 }, { rpm: 3000, load: 0.2 }]) {
    assert.deepEqual(render(0, conditions).data, render(1, conditions).data,
      'higher-speed or loaded rotary returns to the same continuous sound model');
  }
  for (const config of [ENGINE_CONFIGS.i4_flat, ENGINE_CONFIGS.v8_cross, ENGINE_CONFIGS.boxer4]) {
    assert.deepEqual(render(0, { config }).data, render(1, { config }).data,
      'a rotary-only sound switch cannot modify piston-engine pressure samples');
  }
});

test('changing the idle sound mode keeps crank phase continuous and preserves shift/limiter backgrounds', () => {
  const dsp = new CombustionDSP(sampleRate);
  dsp.configure(ENGINE_CONFIGS.rotary_2);
  dsp.rpm = 900;
  dsp.process(new Float32Array(24000), { rpm: 900, load: 0, rotaryBrap: 0 });
  const phase = dsp.phase;
  dsp.process(new Float32Array(128), { rpm: 900, load: 0, rotaryBrap: 1 });
  const expected = (phase + 900 / 60 * 128 / sampleRate) % 1;
  assert.ok(Math.abs(dsp.phase - expected) < 1e-9, 'mode does not reset or halve eccentric-shaft phase');
  for (const mode of [0, 1]) {
    const { data: cut } = render(mode, { ignitionCut: 1 });
    const { data: limited } = render(mode, { limiter: 0.7 });
    assert.ok(rms(cut) > 0.002, 'ignition cuts still leave motored pressure and mechanics');
    assert.ok(rms(limited) > 0.004 && limited.every(value => Number.isFinite(value) && Math.abs(value) < 1));
  }
});
