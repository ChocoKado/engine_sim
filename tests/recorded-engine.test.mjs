import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECORDING_BYTES, RecordedEngineMixer } from "../lib/recorded-engine.ts";

const decodedDuration = 0.6;
const validFile = new File([new Uint8Array([1])], "recording.wav");

function buffer(channels, length, sampleRate) {
  const samples = Array.from({ length: channels }, () => new Float32Array(length).fill(0.21));
  return {
    length, sampleRate,
    duration: length / sampleRate,
    numberOfChannels: channels,
    getChannelData: (channel) => samples[channel],
  };
}

function param() {
  return {
    value: 1,
    cancelScheduledValues() {},
    setTargetAtTime(value) { this.value = value; },
  };
}

function makeHarness() {
  const sources = [];
  const context = {
    currentTime: 0,
    createBuffer: buffer,
    decodeAudioData: async () => buffer(1, 48000 * decodedDuration, 48000),
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = {
        playbackRate: param(),
        connect(gain) { this.gain = gain; },
        disconnect() {},
        start(time) { this.startAt = time; },
        stop(time) { this.stopAt = time; },
      };
      sources.push(source);
      return source;
    },
  };
  const synth = context.createGain();
  const mixer = new RecordedEngineMixer(context, synth, context.createGain());
  return { context, synth, mixer, sources };
}

function frame(rpm, values = {}) {
  return {
    engineOn: true,
    enginePhase: "running",
    powerOn: true,
    throttle: 0,
    engineAngularVelocity: rpm * Math.PI / 30,
    idleTargetRpm: 800,
    shift: null,
    gear: 0,
    shiftCut: 0,
    drivetrainTorqueNm: 0,
    ...values,
  };
}

test("a recorded idle tracks RPM, fades against synthetic sound, and falls back outside its recorded range", async () => {
  const { mixer, synth, sources } = makeHarness();
  await mixer.load("idle", validFile, 800);
  assert.equal(mixer.update(frame(800), false), null);
  assert.equal(sources.length, 0);
  assert.equal(mixer.update(frame(800), true), "idle");
  assert.equal(sources[0].loop, true);
  assert.ok(sources[0].buffer.duration < decodedDuration);
  assert.equal(synth.gain.value, 0);
  assert.ok(Math.abs(sources[0].gain.gain.value * 0.21 - 0.085) < 1e-6);

  assert.equal(mixer.update(frame(960), true), "idle");
  assert.equal(sources.length, 1);
  assert.ok(Math.abs(sources[0].playbackRate.value - 1.2) < 1e-6);
  assert.equal(mixer.update(frame(1300), true), null);
  assert.equal(synth.gain.value, 1);
  assert.ok(sources[0].stopAt > sources[0].startAt);
});

test("startup and gradual lift each trigger only one recording and restore synthetic sound", async () => {
  const { mixer, synth, sources, context } = makeHarness();
  await mixer.load("start", validFile);
  await mixer.load("lift", validFile);
  await mixer.load("load", validFile, 3600);
  const starting = frame(200, { enginePhase: "cranking", engineOn: false });
  assert.equal(mixer.update(starting, true), "start");
  assert.equal(mixer.update(starting, true), "start");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, false);

  const load = { gear: 2, drivetrainTorqueNm: 35 };
  assert.equal(mixer.update(frame(3600, { ...load, throttle: 0.6 }), true), "load");
  assert.equal(mixer.update(frame(3600, { ...load, throttle: 0.23 }), true), "load");
  assert.equal(mixer.update(frame(3600, { ...load, throttle: 0.1 }), true), null);
  assert.equal(mixer.update(frame(3600, { ...load, throttle: 0.06 }), true), "lift");
  assert.equal(mixer.update(frame(3500, { ...load, throttle: 0 }), true), "lift");
  assert.equal(sources.length, 3);
  context.currentTime = 0.56;
  assert.equal(mixer.update(frame(3000, { ...load, throttle: 0 }), true), null);
  assert.equal(synth.gain.value, 1);
});

test("limit checks and removal apply to pending loads", async () => {
  const { mixer } = makeHarness();
  await assert.rejects(mixer.load("start", { size: MAX_RECORDING_BYTES + 1 }), /12 MB/);
  await assert.rejects(mixer.load("idle", validFile, 0), /參考轉速/);
  let resolve;
  const pending = mixer.load("idle", {
    size: 1,
    arrayBuffer: () => new Promise((complete) => { resolve = complete; }),
  }, 800);
  mixer.remove("idle");
  resolve(new ArrayBuffer(1));
  await pending;
  assert.equal(mixer.update(frame(800), true), null);
});
