import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/audio/SoundEngine.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { EXHAUST_MODELS } from '../src/audio/ExhaustModels.js';

class Parameter {
  value = 0;
  changes = [];
  setValueAtTime(value, time) { this.value = value; this.changes.push({ value, time }); }
  setTargetAtTime(value, time, duration) { this.value = value; this.changes.push({ value, time, duration }); }
  exponentialRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
  linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
}
class AudioNode {
  constructor() {
    for (const name of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new Parameter();
    this.connections = [];
  }
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections = []; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  setPeriodicWave(wave) { this.wave = wave; }
}
class Context {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new AudioNode();
  createGain() { return new AudioNode(); }
  createDynamicsCompressor() { return new AudioNode(); }
  createBiquadFilter() { return new AudioNode(); }
  createWaveShaper() { return new AudioNode(); }
  createOscillator() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); }
  createPeriodicWave(real, imag) { return { real: [...real], imag: [...imag] }; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
}
const state = { rpm: 6000, redlineRPM: 12000, manifoldThrottle: 0.7, isRevLimiting: false };

test('volume, profile and warmth set before initialization are applied', async () => {
  const sound = new SoundEngine(() => new Context());
  sound.setVolume(0);
  sound.setSoundProfile('muscle');
  sound.setToneWarmth(1);
  sound.setExhaustModel(EXHAUST_MODELS.straight);
  await sound.init();
  assert.equal(sound.masterGain.gain.value, 0);
  assert.equal(sound.subBassGain.gain.value, 0.65);
  assert.equal(sound.camshaftGain.gain.value, 0.55);
  assert.equal(sound.mufflerLowpass2.frequency.value, 1800);
  assert.equal(sound.outputGain.gain.value, 0);
});

test('mute survives exhaust switches and start/stop; sound stays off until started', async () => {
  const sound = new SoundEngine(() => new Context());
  await sound.init();
  sound.setVolume(0);
  sound.setRunning(true);
  sound.setExhaustModel(EXHAUST_MODELS.straight);
  assert.equal(sound.masterGain.gain.value, 0);
  sound.setRunning(false);
  sound.setVolume(0.3);
  sound.setExhaustModel(EXHAUST_MODELS.oem);
  assert.equal(sound.outputGain.gain.value, 0);
  sound.setRunning(true);
  assert.equal(sound.volume, 0.3);
  assert.equal(sound.masterGain.gain.value, 0.3 * 0.85 * EXHAUST_MODELS.oem.volumeMultiplier);
  assert.equal(sound.outputGain.gain.value, 1);
});

test('firing phase changes the synthesized waveform and updates on engine selection', async () => {
  const sound = new SoundEngine(() => new Context());
  await sound.init();
  sound.setEngineConfig(ENGINE_CONFIGS.i4_flat);
  const flat = sound.combustionOsc.wave;
  sound.setEngineConfig(ENGINE_CONFIGS.i4_cross);
  const cross = sound.combustionOsc.wave;
  assert.notDeepEqual(flat, cross);
  assert.ok(Math.hypot(flat.real[1], flat.imag[1]) < 1e-6, 'even four-cylinder cancels first cycle order');
  assert.ok(Math.hypot(cross.real[1], cross.imag[1]) > 0.05, 'uneven firing retains half-order energy');
  sound.update(state, ENGINE_CONFIGS.i4_cross, {});
  assert.equal(sound.combustionOsc.frequency.value, 50, 'wave covers a full 720-degree cycle');
});

test('V10 and V12 harmonic branches use their actual configuration names', async () => {
  const sound = new SoundEngine(() => new Context());
  await sound.init();
  sound.update(state, ENGINE_CONFIGS.v10, {});
  assert.equal(sound.subBassOsc.frequency.value, 125);
  assert.equal(sound.camshaftOsc.frequency.value, 250);
  sound.update(state, ENGINE_CONFIGS.v12, {});
  assert.equal(sound.subBassOsc.frequency.value, 150);
  assert.equal(sound.camshaftOsc.frequency.value, 300);
});

test('shifts retain resonant sound with continuous gain automation; limiter uses audio clock', async () => {
  const sound = new SoundEngine(() => new Context());
  await sound.init();
  for (const mode of ['at', 'amt']) {
    for (let i = 0; i <= 20; i++) {
      sound.update(state, ENGINE_CONFIGS.i4_flat, { mode, shiftEnvelope: Math.sin(Math.PI * i / 20) });
      assert.ok(sound.limiterGate.gain.value >= (mode === 'at' ? 0.88 : 0.7));
      assert.ok(sound.limiterGate.gain.changes.at(-1).duration > 0);
      assert.equal(sound.combustionOsc.stopped, undefined);
    }
  }
  sound.update({ ...state, isRevLimiting: true }, ENGINE_CONFIGS.i4_flat, {});
  assert.equal(sound.limiterOsc.frequency.value, 18);
  assert.equal(sound.limiterModGain.gain.value, 0.28);
  sound.update(state, ENGINE_CONFIGS.i4_flat, {});
  assert.equal(sound.limiterModGain.gain.value, 0);
});
