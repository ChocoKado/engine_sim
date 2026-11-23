import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { vehicles } from "../data/vehicles.ts";

const rate = 48000;
const blockSize = 128;
const script = readFileSync(new URL("../public/engine-sound-processor.js", import.meta.url), "utf8");

function captureAudio(vehicle) {
  let Processor;
  const context = vm.createContext({
    sampleRate: rate,
    currentTime: 0,
    AudioWorkletProcessor: class { port = {}; },
    registerProcessor(name, processor) {
      assert.equal(name, "engine-sound");
      Processor = processor;
    },
  });
  vm.runInContext(script, context);
  const processor = new Processor({ processorOptions: vehicle.audio });
  const pulses = [];
  let sample = 0;
  const advance = processor.advanceCrank.bind(processor);
  processor.advanceCrank = (increment) => {
    const fired = advance(increment);
    if (fired) pulses.push(sample);
    sample += 1;
    return fired;
  };
  let rendered = 0;

  function blocks(count, telemetry) {
    const signal = [];
    for (let block = 0; block < count; block += 1) {
      context.currentTime = rendered / rate;
      if (telemetry) {
        processor.port.onmessage({ data: {
          type: "state",
          engineOn: true,
          angleRad: (context.currentTime * 100 * Math.PI) % (4 * Math.PI),
          angularVelocity: 100 * Math.PI,
          throttle: 0.7,
          combustion: 0.8,
          load: 0.9,
          ...telemetry,
          contextTime: context.currentTime,
        } });
      }
      const output = new Float32Array(blockSize);
      processor.process([], [[output]]);
      signal.push(...output);
      rendered += blockSize;
    }
    return signal;
  }

  return { blocks, pulses };
}

for (const [index, vehicle] of vehicles.entries()) {
  test(`${vehicle.name}: correct 720-degree firing intervals and bounded output`, () => {
    const audio = captureAudio(vehicle);
    const signal = audio.blocks(120, {});
    const gaps = audio.pulses.slice(1).map((pulse, position) => pulse - audio.pulses[position]);
    const required = index === 0 ? [1920] : [480, 1440];
    assert.ok(gaps.length > 5);
    assert.ok(gaps.every((gap, position) => Math.abs(gap - required[position % required.length]) <= 1), gaps.join(","));
    assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.12));
    assert.ok(signal.some((sample) => Math.abs(sample) > 0.005));
  });
}

test("combustion cut softens exhaust; loss of telemetry fades sound to silence", () => {
  const audio = captureAudio(vehicles[1]);
  const normal = audio.blocks(110, {}).slice(-2048);
  const cut = audio.blocks(110, { combustion: 0 }).slice(-2048);
  function rms(signal) {
    return Math.sqrt(signal.reduce((sum, sample) => sum + sample ** 2, 0) / signal.length);
  }
  assert.ok(rms(cut) < rms(normal) * 0.5);
  assert.ok(audio.blocks(320).slice(-2048).every((sample) => Math.abs(sample) < 0.0001));
});
