import test from 'node:test';
import assert from 'node:assert/strict';
import { CombustionDSP, combustionWorkletSource, inductionEventShape } from '../src/audio/CombustionDSP.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
const render = (dsp, parameters, seconds = 0.25) => dsp.process(new Float32Array(Math.round(seconds * dsp.sampleRate)), parameters);

test('sample-rate synthesis is phase continuous across arbitrary render block sizes', () => {
  const whole = new CombustionDSP();
  const blocks = new CombustionDSP();
  const expected = render(whole, { rpm: 6200, load: 0.75 });
  const actual = new Float32Array(expected.length);
  for (let offset = 0; offset < actual.length; offset += 128) {
    blocks.process(actual.subarray(offset, Math.min(actual.length, offset + 128)), { rpm: 6200, load: 0.75 });
  }
  assert.deepEqual(actual, expected, 'render cadence cannot reset crank or firing phase');
});

test('load makes exhaust pressure stronger and an ignition cut remains audible with a clear breakpoint', () => {
  const dsp = new CombustionDSP();
  const idleLoad = render(dsp, { rpm: 7000, load: 0.10 });
  const loaded = render(dsp, { rpm: 7000, load: 1 });
  const cut = render(dsp, { rpm: 7000, load: 1, ignitionCut: 1 });
  assert.ok(rms(loaded) > rms(idleLoad) * 1.8);
  const residual = rms(cut.subarray(Math.round(0.03 * dsp.sampleRate)));
  assert.ok(residual > 0.004, 'motored gas pumping and mechanics continue');
  assert.ok(residual < rms(loaded) * 0.22, 'cut distinctly removes combustion pressure');
  assert.ok(rms(cut.subarray(720, 1920)) < rms(loaded) * 0.5, 'combustion drops after the short exhaust propagation tail');
});

test('individual firing phases and exhaust bank routing change the actual sample stream', () => {
  const flat = new CombustionDSP();
  const cross = new CombustionDSP();
  flat.configure(ENGINE_CONFIGS.i4_flat);
  cross.configure(ENGINE_CONFIGS.i4_cross);
  const a = render(flat, { rpm: 5500, load: 0.8 });
  const b = render(cross, { rpm: 5500, load: 0.8 });
  assert.ok(rms(a.map((value, i) => value - b[i])) > 0.05);
  const v8 = new CombustionDSP();
  const alternate = new CombustionDSP();
  v8.configure({ ...ENGINE_CONFIGS.v8_cross, exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0] });
  alternate.configure({ ...ENGINE_CONFIGS.v8_cross, exhaustBanks: [0, 1, 0, 1, 0, 1, 0, 1] });
  const c = render(v8, { rpm: 3500, load: 0.8 });
  const d = render(alternate, { rpm: 3500, load: 0.8 });
  assert.ok(rms(c.map((value, i) => value - d[i])) > 0.005);
});

test('all configurations remain finite and bounded at low/high sample rates and redline', () => {
  for (const sampleRate of [24000, 48000, 96000]) {
    for (const config of Object.values(ENGINE_CONFIGS)) {
      const dsp = new CombustionDSP(sampleRate);
      dsp.configure({ ...config, displacement: config.maxDisplacement });
      const data = render(dsp, { rpm: config.defaultRedlineRPM, load: 1.6, limiter: 1 });
      assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) < 0.79), `${config.id} at ${sampleRate}`);
      assert.ok(rms(data) > 0.005, 'redline limiter retains gas pumping and mechanical sound');
    }
  }
});

test('worklet source contains the same tested DSP and safe parameter descriptors', () => {
  const source = combustionWorkletSource();
  assert.ok(source.includes(CombustionDSP.toString()));
  assert.ok(source.includes("registerProcessor('combustion-pressure'"));
  assert.doesNotThrow(() => new Function('AudioWorkletProcessor', 'registerProcessor', source)(class {}, () => {}));
});

test('induction events use pressure, reservoir duration and rotor speed instead of a fixed one shot', () => {
  const low = inductionEventShape({ intensity: 0.4, pressure: 0.2, rotorRPM: 65000 }, 'flutter');
  const high = inductionEventShape({ intensity: 1.1, pressure: 1.4, rotorRPM: 170000 }, 'flutter');
  assert.ok(high.duration > low.duration);
  assert.ok(high.pulseRate > low.pulseRate);
  const explicit = inductionEventShape({ intensity: 1, pressure: 1, duration: 0.31, pulseRate: 13, rotorRPM: 90000, when: 2 });
  assert.equal(explicit.duration, 0.31);
  assert.equal(explicit.pulseRate, 13);
  assert.equal(explicit.when, 2);
});
