import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { vehicles } from "../data/vehicles.ts";

const rate = 48000;
const blockSize = 128;
const cycleRadians = 4 * Math.PI;
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
  let crankAngle = 0;

  function blocks(count, telemetry) {
    const signal = [];
    const { rpm = 3000, ...controls } = telemetry ?? {};
    const angularVelocity = rpm * 2 * Math.PI / 60;
    for (let block = 0; block < count; block += 1) {
      context.currentTime = rendered / rate;
      if (telemetry) {
        processor.port.onmessage({ data: {
          type: "state",
          engineOn: true,
          angleRad: crankAngle,
          angularVelocity,
          throttle: 0.7,
          combustion: 0.8,
          load: 0.9,
          ...controls,
          contextTime: context.currentTime,
        } });
      }
      const output = new Float32Array(blockSize);
      processor.process([], [[output]]);
      signal.push(...output);
      rendered += blockSize;
      crankAngle = (crankAngle + blockSize * angularVelocity / rate) % cycleRadians;
    }
    return signal;
  }

  return { blocks, pulses };
}

function rms(signal) {
  return Math.sqrt(signal.reduce((sum, sample) => sum + sample ** 2, 0) / signal.length);
}

function upperBandShare(signal) {
  const lowPassCoefficient = 1 - Math.exp(-2 * Math.PI * 4400 / rate);
  const baselineCoefficient = 1 - Math.exp(-2 * Math.PI * 1800 / rate);
  let lowPass = 0;
  let baseline = 0;
  let energy = 0;
  for (const sample of signal) {
    lowPass += lowPassCoefficient * (sample - lowPass);
    baseline += baselineCoefficient * (lowPass - baseline);
    energy += (lowPass - baseline) ** 2;
  }
  return Math.sqrt(energy / signal.length) / rms(signal);
}

function assertBounded(signal) {
  assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.30));
}

for (const [index, vehicle] of vehicles.entries()) {
  test(`${vehicle.name}: correct 720-degree firing intervals and bounded output`, () => {
    const audio = captureAudio(vehicle);
    const signal = audio.blocks(120, {});
    const gaps = audio.pulses.slice(1).map((pulse, position) => pulse - audio.pulses[position]);
    const required = index === 0 ? [1920] : [480, 1440];
    assert.ok(gaps.length > 5);
    assert.ok(gaps.every((gap, position) => Math.abs(gap - required[position % required.length]) <= 1), gaps.join(","));
    assertBounded(signal);
    assert.ok(signal.some((sample) => Math.abs(sample) > 0.005));
  });

  test(`${vehicle.name}: idle is audible and throttle lift keeps the exhaust present`, () => {
    const idle = captureAudio(vehicle).blocks(250, { rpm: 1500, throttle: 0, combustion: 0.15, load: 0 }).slice(-8192);
    assert.ok(rms(idle) > 0.009);
    assertBounded(idle);

    const audio = captureAudio(vehicle);
    const loaded = audio.blocks(190, { rpm: 6000, throttle: 0.85, combustion: 0.85, load: 0.75 }).slice(-8192);
    const release = audio.blocks(55, { rpm: 6000, throttle: 0, combustion: 0, load: 0.35 });
    const coast = audio.blocks(180, { rpm: 6000, throttle: 0, combustion: 0, load: 0.35 }).slice(-8192);
    const loudnessRatio = rms(coast) / rms(loaded);
    const bandRatio = upperBandShare(coast) / upperBandShare(loaded);
    assert.ok(loudnessRatio > 0.38 && loudnessRatio < 0.68, `coast RMS ratio: ${loudnessRatio}`);
    assert.ok(bandRatio > 0.72 && bandRatio < 1.35, `coast upper-band ratio: ${bandRatio}`);
    assert.ok(rms(release.slice(0, 2048)) > rms(coast) * 1.25);
    assert.ok(rms(release.slice(-4096)) < rms(loaded) * 0.92);
    assert.ok(Math.abs(release[0] - loaded.at(-1)) < 0.035);
  });

  test(`${vehicle.name}: upper band grows above 10,000 RPM`, () => {
    const render = (rpm) => captureAudio(vehicle).blocks(210, { rpm, throttle: 0.85, combustion: 0.85, load: 0.75 }).slice(-8192);
    const mid = render(8000);
    const high = render(10500);
    const top = render(12500);
    const share = upperBandShare(high) / upperBandShare(mid);
    assert.ok(share > 1.4, `normalized upper-band ratio: ${share}`);
    assert.ok(upperBandShare(top) > upperBandShare(high));
    assertBounded(mid);
    assertBounded(high);
    assertBounded(top);
  });
}

test("combustion cut softens exhaust; loss of telemetry fades sound to silence", () => {
  const audio = captureAudio(vehicles[1]);
  const normal = audio.blocks(180, { rpm: 6000 }).slice(-8192);
  const cut = audio.blocks(230, { rpm: 6000, combustion: 0 }).slice(-8192);
  assert.ok(rms(cut) < rms(normal) * 0.65);
  assert.ok(rms(cut) > rms(normal) * 0.3);
  assert.ok(audio.blocks(320).slice(-2048).every((sample) => Math.abs(sample) < 0.0001));
});
