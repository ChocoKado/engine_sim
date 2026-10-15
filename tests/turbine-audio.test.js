import test from 'node:test';
import assert from 'node:assert/strict';
import { TurbineDSP } from '../src/audio/TurbineDSP.js';
import { CombustionDSP, combustionWorkletSource } from '../src/audio/CombustionDSP.js';
import { SoundEngine } from '../src/audio/SoundEngine.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { EXHAUST_MODELS } from '../src/audio/ExhaustModels.js';

const sampleRate = 48000;
const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
const parameters = { rpm: 30000, turbineFlow: 0.8, turbineFuel: 1, jetVelocity: 650, pressureRatio: 6 };
const render = (dsp, params = parameters, seconds = 1) => dsp.process(new Float32Array(sampleRate * seconds), params);
function tone(data, hz) {
  let real = 0, imag = 0;
  for (let i = 0; i < data.length; i++) {
    real += data[i] * Math.cos(2 * Math.PI * hz * i / sampleRate);
    imag += data[i] * Math.sin(2 * Math.PI * hz * i / sampleRate);
  }
  return Math.hypot(real, imag) * 2 / data.length;
}
function worklet(config) {
  let Processor;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', combustionWorkletSource())(
    class { constructor() { this.port = { postMessage() {} }; } },
    (name, implementation) => { Processor = implementation; }, sampleRate, 0);
  return { processor: new Processor({ processorOptions: { config } }), descriptors: Processor.parameterDescriptors };
}

test('the actual generated Worklet and callback DSP resolve 30000 and 54000 RPM into different continuous rotor tones', () => {
  for (const rpm of [30000, 54000]) {
    const { processor, descriptors } = worklet(ENGINE_CONFIGS.gas_turbine);
    assert.ok(descriptors.find(item => item.name === 'rpm').maxValue >= 60000);
    const actual = new Float32Array(sampleRate);
    const params = { ...parameters, rpm };
    processor.process([], [[actual]], params);
    const fallback = new TurbineDSP();
    fallback.configure(ENGINE_CONFIGS.gas_turbine);
    assert.deepEqual(actual, render(fallback, params), 'both processing backends must run the same acoustic source');
    const steady = actual.subarray(sampleRate / 2);
    const correct = tone(steady, rpm / 60), wrong = tone(steady, rpm === 30000 ? 900 : 500);
    assert.ok(correct > 0.025 && correct > wrong * 5, `shaft-order tone follows ${rpm} RPM instead of plateauing at 24000`);
  }
});

test('continuous turbine phase and noise are invariant to callback block boundaries', () => {
  const whole = new TurbineDSP(), blocks = new TurbineDSP();
  const expected = render(whole);
  const actual = new Float32Array(expected.length);
  for (let i = 0; i < actual.length; i += 128) blocks.process(actual.subarray(i, i + 128), parameters);
  assert.deepEqual(actual, expected);
});

test('turbine combustion has a continuous broadband background without piston firing or shift / staccato gates', () => {
  const normal = new CombustionDSP(), cut = new CombustionDSP();
  normal.configure(ENGINE_CONFIGS.turbojet); cut.configure(ENGINE_CONFIGS.turbojet);
  const a = render(normal, { ...parameters, rpm: 12000 });
  const b = render(cut, { ...parameters, rpm: 12000, ignitionCut: 1, limiter: 1, limiterHz: 18, limiterDepth: 1 });
  assert.deepEqual(a, b, 'piston ECU cut telemetry cannot repeatedly extinguish a jet flame');
  assert.ok(normal.events.every(event => event.count === 0), 'the turbine source cannot schedule once-per-revolution combustions');
  for (let i = sampleRate / 2; i < a.length; i += 480) assert.ok(rms(a.subarray(i, i + 480)) > 0.015,
    'every 10 ms interval retains broadband / rotating acoustic energy');
});

test('afterburning raises continuous exhaust energy without changing core pitch', () => {
  const dry = new TurbineDSP(), wet = new TurbineDSP();
  dry.configure(ENGINE_CONFIGS.turbojet); wet.configure(ENGINE_CONFIGS.turbojet);
  const params = { ...parameters, rpm: 15000, turbineFlow: 1, jetVelocity: 1100 };
  const a = render(dry, params).subarray(sampleRate / 2);
  const b = render(wet, { ...params, afterburner: 1 }).subarray(sampleRate / 2);
  assert.ok(rms(b) > rms(a) * 1.2, 'additional downstream combustion adds broadband energy');
  assert.ok(Math.abs(tone(a, 250) - tone(b, 250)) < 0.01,
    'a downstream afterburner cannot reset or change the compressor shaft frequency');
});

test('fuel cut removes combustion while the coasting rotor stays audible and comes to rest without stale afterburner', () => {
  const dsp = new TurbineDSP();
  dsp.configure(ENGINE_CONFIGS.turbojet);
  render(dsp, { ...parameters, afterburner: 1 });
  const coast = render(dsp, { ...parameters, rpm: 12000, turbineFuel: 0, afterburner: 0 });
  assert.ok(rms(coast.subarray(sampleRate / 2)) > 0.01, 'compressor / rotor motion is not muted with fuel');
  assert.ok(dsp.fuel < 0.00001 && dsp.afterburner < 0.00001);
  const rest = render(dsp, { rpm: 0, turbineFlow: 0, turbineFuel: 0, afterburner: 0 });
  assert.equal(rms(rest.subarray(sampleRate / 2)), 0, 'stopped rotors cannot leave a loop of old roar behind');
});

test('turbine output remains finite and bounded at supported sample rates and excessive / malformed inputs', () => {
  for (const rate of [24000, 48000, 96000]) {
    const dsp = new TurbineDSP(rate);
    for (const rpm of [0, 15000, 54000, 120000, 1000000, NaN]) {
      const data = dsp.process(new Float32Array(rate / 4), { rpm, turbineFuel: 1, turbineFlow: 20,
        afterburner: 10, pressureRatio: 2000, jetVelocity: 9000 });
      assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) <= 0.921));
    }
  }
});

test('switching from a turbine cannot leave its phase, afterburner, or noise in a piston / rotary source', () => {
  for (const config of [ENGINE_CONFIGS.i4_cross, ENGINE_CONFIGS.rotary_2]) {
    const switched = new CombustionDSP(), clean = new CombustionDSP();
    switched.configure(ENGINE_CONFIGS.turbojet);
    render(switched, { ...parameters, afterburner: 1 });
    switched.configure(config); clean.configure(config);
    assert.equal(switched.turbine, null);
    assert.deepEqual(render(switched, { rpm: 6500, load: 0.7 }), render(clean, { rpm: 6500, load: 0.7 }));
  }
});

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}
class Node {
  constructor() {
    for (const name of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new Param();
    this.connections = [];
  }
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections = []; }
  start() {}
  stop() { this.stopped = true; }
  setPeriodicWave() {}
}
class Context {
  currentTime = 0;
  sampleRate = sampleRate;
  state = 'running';
  destination = new Node();
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createWaveShaper() { return new Node(); }
  createOscillator() { return new Node(); }
  createBufferSource() { return new Node(); }
  createPeriodicWave() { return {}; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
}
class CallbackContext extends Context { createScriptProcessor() { return new Node(); } }
const jetState = { rpm: 15000, coreRPM: 15000, corePercent: 88, throttle: 0.8, isCombusting: true,
  massFlowKgS: 18, jetVelocity: 1000, pressureRatio: 7.5, afterburnerAmount: 0.7 };

test('SoundEngine callback fallback uses the same continuous DSP and ignores piston cuts / valve bursts', async () => {
  const sound = new SoundEngine(() => new CallbackContext());
  sound.setEngineConfig(ENGINE_CONFIGS.turbojet);
  await sound.init();
  assert.equal(sound.outputGain.gain.value, 0, 'initializing a stopped bench cannot synthesize a phantom idle rotor');
  sound.setRunning(true);
  sound.update({ ...jetState, ignitionCut: true, torqueScale: 0, revLimiterCutAmount: 1 }, ENGINE_CONFIGS.turbojet,
    { isShifting: true, isUpshift: true, cutAmount: 1 });
  assert.equal(sound.acousticBackend, 'turbine-script');
  assert.equal(sound.combustionGain.gain.value, 0);
  assert.equal(sound.limiterModGain.gain.value, 0);
  const data = new Float32Array(48000);
  sound.turbineProcessor.onaudioprocess({ outputBuffer: { getChannelData: () => data } });
  const expected = new TurbineDSP(); expected.configure(ENGINE_CONFIGS.turbojet);
  assert.deepEqual(data, expected.process(new Float32Array(48000), sound.turbineParameters));
  sound.playBovSound(1); sound.playFlutterSound(1); sound.playBackfirePop(1, true);
  assert.equal(sound.activeBursts.size, 0, 'a jet must not acquire automobile BOV or misfire sounds');
  sound.setRunning(false);
  assert.equal(sound.turbineParameters.turbineFuel, 0);
  assert.equal(sound.turbineParameters.afterburner, 0);
  assert.equal(sound.outputGain.gain.value, 1, 'shutdown retains the current rotor coast');
  sound.update({ ...jetState, coreRPM: 0, rpm: 0, isCombusting: false, massFlowKgS: 0 }, ENGINE_CONFIGS.turbojet);
  assert.equal(sound.outputGain.gain.value, 0);
  sound.setEngineConfig(ENGINE_CONFIGS.gas_turbine);
  sound.setRunning(false);
  assert.equal(sound.outputGain.gain.value, 0, 'a new stopped engine cannot inherit the previous engine coast state');
  assert.equal(sound.turbineParameters.rpm, 0);
});

test('native emergency fallback follows absolute rotor RPM above 24000 and mode / exhaust changes cannot unmute', async () => {
  const sound = new SoundEngine(() => new Context());
  sound.setEngineConfig(ENGINE_CONFIGS.gas_turbine); await sound.init(); sound.setRunning(true);
  for (const rpm of [30000, 54000]) {
    sound.update({ rpm, throttle: 1, isCombusting: true }, ENGINE_CONFIGS.gas_turbine);
    assert.equal(sound.turbineNativeOsc.frequency.value, rpm / 60);
  }
  sound.setVolume(0); sound.setExhaustModel(EXHAUST_MODELS.straight); sound.setSoundProfile('muscle');
  assert.equal(sound.masterGain.gain.value, 0);
  assert.equal(sound.subBassGain.gain.value, 0, 'piston profile gains must remain muted for turbines');
  sound.setRunning(false); sound.setRunning(true);
  assert.equal(sound.masterGain.gain.value, 0);
  sound.setRunning(false);
  sound.update({ rpm: 6000, manifoldThrottle: 0.7 }, ENGINE_CONFIGS.i4_cross);
  assert.equal(sound.turbineGain.gain.value, 0);
  assert.equal(sound.turbineNativeGain.gain.value, 0);
  assert.equal(sound.outputGain.gain.value, 0, 'an old turbine coast cannot reopen a stopped piston output');
  sound.setRunning(true);
  assert.ok(sound.combustionGain.gain.value > 0);
});

test('free-power turbine acoustics resolve independently moving gas-generator and power-turbine spools', () => {
  const config = { ...ENGINE_CONFIGS.gas_turbine, defaultRedlineRPM: 6016,
    turboshaftDesign: { ratedCoreRPM: 50970, ratedPowerTurbineRPM: 33290 } };
  const outputs = [18000, 33290].map(powerTurbineRPM => {
    const { processor } = worklet(config);
    const data = new Float32Array(sampleRate * 2);
    processor.process([], [[data]], { rpm: 50970, powerTurbineRPM, turbineFlow: 0.8, turbineFuel: 1 });
    const steady = data.subarray(sampleRate);
    assert.ok(tone(steady, 50970 / 60) > 0.04, 'N1 remains audible at the gas-generator speed');
    assert.ok(tone(steady, powerTurbineRPM / 60) > 0.025, 'Np follows the independent free-power turbine');
    return steady;
  });
  assert.ok(tone(outputs[0], 300) > tone(outputs[1], 300) * 4);
  assert.ok(tone(outputs[1], 33290 / 60) > tone(outputs[0], 33290 / 60) * 4);
  assert.ok(Math.abs(tone(outputs[0], 50970 / 60) - tone(outputs[1], 50970 / 60)) < 0.002,
    'changing a loaded output spool cannot repitch the gas generator');
});

test('dual-spool SoundEngine follows N1 and Np rather than the road output shaft, in both fallback paths', async () => {
  for (const ContextType of [Context, CallbackContext]) {
    const sound = new SoundEngine(() => new ContextType());
    sound.setEngineConfig(ENGINE_CONFIGS.gas_turbine); await sound.init(); sound.setRunning(true);
    const state = { rpm: 6016, coreRPM: 50970, powerTurbineRPM: 33290, isCombusting: true, throttle: 1 };
    sound.update(state, ENGINE_CONFIGS.gas_turbine);
    assert.equal(sound.turbineParameters.rpm, 50970);
    assert.equal(sound.turbineParameters.powerTurbineRPM, 33290);
    if (sound.turbineNativeOsc) {
      assert.equal(sound.turbineNativeOsc.frequency.value, 50970 / 60);
      assert.equal(sound.turbineNativePowerOsc.frequency.value, 33290 / 60);
    }
    sound.update({ ...state, rpm: 3500 }, ENGINE_CONFIGS.gas_turbine, { isShifting: true, cutAmount: 1 });
    assert.equal(sound.turbineParameters.rpm, 50970, 'a gearbox speed drop is not a gas-generator speed drop');
    assert.equal(sound.turbineParameters.powerTurbineRPM, 33290);
  }
});

test('listening position changes individual piston source balance and filters without changing volume or engine state', async () => {
  const sound = new SoundEngine(() => new Context());
  assert.equal(sound.setListeningPosition('not-a-position'), false);
  assert.equal(sound.setListeningPosition('intake'), true);
  await sound.init(); sound.setRunning(true);
  const state = { rpm: 7000, manifoldThrottle: 0.8, displacement: 1000, forcedInduction: 'na' };
  sound.update(state, ENGINE_CONFIGS.i4_cross, { speedKmh: 90, currentGear: 3 });
  const intake = { intake: sound.intakeGain.gain.value, exhaust: sound.combustionGain.gain.value,
    mechanical: sound.subBassGain.gain.value, cutoff: sound.mufflerLowpass1.frequency.value };
  const volume = sound.masterGain.gain.value;
  sound.setListeningPosition('exhaust');
  assert.ok(sound.combustionGain.gain.value > intake.exhaust * 3);
  assert.ok(sound.intakeGain.gain.value < intake.intake * 0.3);
  assert.ok(sound.mufflerLowpass1.frequency.value > intake.cutoff);
  sound.setListeningPosition('mechanical');
  assert.ok(sound.subBassGain.gain.value > intake.mechanical * 3);
  assert.equal(sound.masterGain.gain.value, volume, 'position changes source balance, not the user volume');
  assert.deepEqual(state, { rpm: 7000, manifoldThrottle: 0.8, displacement: 1000, forcedInduction: 'na' });
  sound.setVolume(0); sound.setListeningPosition('exhaust'); sound.setRunning(false); sound.setListeningPosition('intake');
  assert.equal(sound.masterGain.gain.value, 0);
  assert.equal(sound.outputGain.gain.value, 0);
});

test('Worklet and callback turbine listening positions change rotor-to-exhaust balance rather than only total level', () => {
  const renderMix = (mechanicalMix, exhaustMix) => {
    const { processor } = worklet(ENGINE_CONFIGS.turbojet);
    const data = new Float32Array(sampleRate * 2);
    const params = { ...parameters, rpm: 15000, turbineFlow: 1, jetVelocity: 1000,
      mechanicalMix, exhaustMix, intakeMix: 0.4 };
    processor.process([], [[data]], params);
    const fallback = new TurbineDSP(); fallback.configure(ENGINE_CONFIGS.turbojet);
    assert.deepEqual(data, fallback.process(new Float32Array(data.length), params));
    return data.subarray(sampleRate);
  };
  const mechanics = renderMix(3, 0.24), exhaust = renderMix(0.4, 1.4);
  const ratio = data => tone(data, 250) / rms(data);
  assert.ok(ratio(mechanics) > ratio(exhaust) * 2, 'mechanical observation foregrounds rotor orders over the broad hot plume');
  assert.ok(tone(mechanics, 250) > tone(exhaust, 250) * 3);
});

test('callback listening changes preserve rotor phase and avoid an instantaneous gain step', () => {
  const dsp = new TurbineDSP();
  dsp.configure(ENGINE_CONFIGS.gas_turbine);
  dsp.random = () => 0;
  const params = { rpm: 30000, powerTurbineRPM: 18000, turbineFlow: 0.8, turbineFuel: 0 };
  render(dsp, params);
  const phase = dsp.phase;
  const single = dsp.process(new Float32Array(1), { ...params, mechanicalMix: 3 });
  assert.ok(Math.abs(dsp.phase - ((phase + 500 / sampleRate) % 1)) < 1e-9,
    'changing observation position cannot reset the phase of a turning shaft');
  assert.ok(dsp.mechanicalMix > 1 && dsp.mechanicalMix < 1.01,
    'the callback backend must slew the mix rather than tripling one sample');
  assert.ok(Number.isFinite(single[0]));
});
