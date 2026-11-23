import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { vehicles } from "../data/vehicles.ts";
import { VALVE_EVENTS } from "../lib/kinematics.ts";

const rate = 48000;
const blockSize = 128;
const cycleRadians = 4 * Math.PI;
const playbackDelaySeconds = 0.04;
const playbackDelaySamples = rate * playbackDelaySeconds;
const exhaustOpeningRad = VALVE_EVENTS.exhaust.opensDegrees * Math.PI / 180;
const script = readFileSync(new URL("../public/engine-sound-processor.js", import.meta.url), "utf8");

function captureAudio(vehicle, audioOptions = {}, trackPitch = false) {
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
  const processor = new Processor({
    processorOptions: { ...vehicle.audio, exhaustOpeningRad, supercharger: vehicle.supercharger, ...audioOptions },
  });
  const pulses = [];
  const pitch = [];
  let sample = 0;
  const advance = processor.advanceCrank.bind(processor);
  processor.advanceCrank = (increment) => {
    const fired = advance(increment);
    if (fired) pulses.push(sample);
    if (trackPitch) pitch.push([sample, increment * rate * 60 / (2 * Math.PI)]);
    sample += 1;
    return fired;
  };
  let rendered = 0;
  let crankAngle = 0;

  function blocks(count, telemetry) {
    const signal = [];
    for (let block = 0; block < count; block += 1) {
      context.currentTime = rendered / rate;
      const packet = typeof telemetry === "function" ? telemetry(context.currentTime) : telemetry;
      const { rpm = 3000, ...controls } = packet ?? {};
      const angularVelocity = rpm * 2 * Math.PI / 60;
      if (packet) {
        processor.port.onmessage({ data: {
          type: "state",
          engineOn: true,
          angleRad: crankAngle,
          angularVelocity,
          throttle: 0.7,
          combustion: 0.8,
          load: 0.9,
          contextTime: context.currentTime,
          ...controls,
        } });
      }
      sample = rendered;
      const output = new Float32Array(blockSize);
      processor.process([], [[output]]);
      signal.push(...output);
      rendered += blockSize;
      crankAngle = (crankAngle + blockSize * angularVelocity / rate) % cycleRadians;
    }
    return signal;
  }

  return { blocks, pulses, pitch };
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
  assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.38));
}

const firingIntervals = {
  "yamaha-r15": [1920],
  "yamaha-r3": [480, 1440],
  "yamaha-r6": [480, 480, 480, 480],
  "yamaha-r7": [720, 1200],
  "yamaha-r9": [640, 640, 640],
  "yamaha-r1": [720, 480, 240, 480],
};
const flatplaneFourIntervals = [480, 480, 480, 480];

for (const vehicle of vehicles) {
  test(`${vehicle.name}: pressure starts at exhaust opening and keeps the firing intervals`, () => {
    const audio = captureAudio(vehicle);
    const signal = audio.blocks(120, {});
    const gaps = audio.pulses.slice(1).map((pulse, position) => pulse - audio.pulses[position]);
    const required = vehicle.brand === "Kawasaki" ? flatplaneFourIntervals : firingIntervals[vehicle.id];
    const expectedFirstPulse = playbackDelaySamples + Math.ceil(exhaustOpeningRad / (100 * Math.PI) * rate) - 1;
    assert.ok(Math.abs(audio.pulses[0] - expectedFirstPulse) <= 1);
    assert.ok(gaps.length > 5);
    assert.ok(gaps.every((gap, position) => Math.abs(gap - required[position % required.length]) <= 1), gaps.join(","));
    assertBounded(signal);
    assert.ok(signal.some((sample) => Math.abs(sample) > 0.005));
  });
}

for (const id of ["yamaha-r3", "yamaha-r9"]) {
  test(`${id}: irregular frame delivery retains steady pitch and a continuous release glide`, () => {
    const vehicle = vehicles.find((candidate) => candidate.id === id);
    const audio = captureAudio(vehicle, {}, true);
    const baseRpm = 9300;
    const releaseTime = 0.5;
    const rpmDropPerSecond = 2200;
    const rpmAt = (time) => baseRpm - Math.max(0, time - releaseTime) * rpmDropPerSecond;
    const angleAt = (time) => (baseRpm * time - 0.5 * rpmDropPerSecond * Math.max(0, time - releaseTime) ** 2) * 2 * Math.PI / 60;
    const tickPattern = [2, 3, 1, 2, 2];
    const deliveryDelay = [0.004, 0.010, 0.005, 0.011, 0.003];
    const clockJitter = [0, 0.00023, -0.00019, 0.00015, -0.00024];
    let tick = 0;
    let index = 0;
    audio.blocks(650, (wallTime) => {
      const patternIndex = index % tickPattern.length;
      const sampleTime = tick / 120;
      if (wallTime < sampleTime + deliveryDelay[patternIndex]) return null;
      tick += tickPattern[patternIndex];
      index += 1;
      return {
        rpm: rpmAt(sampleTime),
        angleRad: angleAt(sampleTime) % cycleRadians,
        contextTime: sampleTime + clockJitter[patternIndex],
        throttle: sampleTime < releaseTime ? 0.8 : 0,
        combustion: sampleTime < releaseTime ? 0.84 : 0,
      };
    });

    const steady = audio.pitch.filter(([sample]) => sample / rate > 0.18 && sample / rate < 0.48).map(([, rpm]) => rpm);
    assert.ok(steady.every((rpm) => Math.abs(rpm - baseRpm) < 7));
    const pitchAt = (seconds) => audio.pitch[Math.round(seconds * rate) - audio.pitch[0][0]][1];
    const releaseSamples = [];
    for (let time = 0.64; time < 1.5; time += 0.006) {
      const shown = pitchAt(time);
      assert.ok(Math.abs(shown - rpmAt(time - playbackDelaySeconds)) < 22);
      releaseSamples.push(shown);
    }
    const expectedDrop = 0.006 * rpmDropPerSecond;
    assert.ok(releaseSamples.slice(1).every((rpm, i) => Math.abs(releaseSamples[i] - rpm - expectedDrop) < 2.6));

    const pulses = audio.pulses.filter((sample) => sample / rate > 0.22 && sample / rate < 1.52);
    const gaps = pulses.slice(1).map((pulse, i) => (angleAt(pulse / rate - playbackDelaySeconds)
      - angleAt(pulses[i] / rate - playbackDelaySeconds)) * 180 / Math.PI);
    assert.ok(gaps.length > 100);
    const shortFirst = gaps[0] < 360;
    assert.ok(gaps.every((gap, i) => {
      const expected = id === "yamaha-r9" ? 240 : ((i % 2 === 0) === shortFirst ? 180 : 540);
      return Math.abs(gap - expected) < 8;
    }));
  });
}

for (const vehicle of vehicles.slice(0, 2)) {
  test(`${vehicle.name}: idle is audible and throttle lift keeps the exhaust present`, () => {
    const idle = captureAudio(vehicle).blocks(250, { rpm: 1500, throttle: 0, combustion: 0.15, load: 0 }).slice(-8192);
    assert.ok(rms(idle) > 0.009);
    assertBounded(idle);

    const audio = captureAudio(vehicle);
    const loaded = audio.blocks(190, { rpm: 6000, throttle: 0.85, combustion: 0.85, load: 0.75 }).slice(-8192);
    const released = audio.blocks(55 + 180, { rpm: 6000, throttle: 0, combustion: 0, load: 0.35 });
    const release = released.slice(playbackDelaySamples, playbackDelaySamples + 55 * blockSize);
    const coast = released.slice(-8192);
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

  test(`${vehicle.name}: 85 ms shift cut changes the sound without losing the exhaust beat`, () => {
    const rpm = 8500;
    const drive = { rpm, throttle: 0.90, combustion: 0.88, load: 0.78 };
    const unloading = { ...drive, combustion: 0.08, load: 0.18 };
    const cycleSamples = Math.round(rate * 120 / rpm);
    const audio = captureAudio(vehicle);
    const steadyRms = rms(audio.blocks(190, drive).slice(-cycleSamples * 8));
    const cutFrames = audio.blocks(32, { ...unloading, shiftCut: 0.90 });
    const after = audio.blocks(36 + playbackDelaySamples / blockSize, drive);
    const audibleShift = cutFrames.concat(after).slice(playbackDelaySamples);
    const shift = audibleShift.slice(0, cutFrames.length);
    const recovered = audibleShift.slice(cutFrames.length);

    const slowResponse = captureAudio(vehicle);
    slowResponse.blocks(190, drive);
    const raw = slowResponse.blocks(32, unloading);
    const rawAfter = slowResponse.blocks(36 + playbackDelaySamples / blockSize, drive);
    const rawCombustionChange = raw.concat(rawAfter).slice(playbackDelaySamples, playbackDelaySamples + raw.length);
    assert.deepEqual(audio.pulses, slowResponse.pulses);

    const quickRatio = rms(shift.slice(0, cycleSamples * 2)) / rms(rawCombustionChange.slice(0, cycleSamples * 2));
    assert.ok(quickRatio < 0.94, `shift cue did not respond quickly: ${quickRatio}`);
    const cutRatio = rms(shift.slice(-cycleSamples * 2)) / steadyRms;
    assert.ok(cutRatio > 0.55 && cutRatio < 0.86, `shift/drive RMS ratio: ${cutRatio}`);
    for (let offset = 0; offset + cycleSamples <= shift.length; offset += cycleSamples) {
      assert.ok(rms(shift.slice(offset, offset + cycleSamples)) > steadyRms * 0.50);
    }
    const recoveryRatio = rms(recovered.slice(cycleSamples * 2, cycleSamples * 4)) / steadyRms;
    assert.ok(recoveryRatio > 0.87 && recoveryRatio < 1.10, `recovered/drive RMS ratio: ${recoveryRatio}`);
    assertBounded(shift);
    assertBounded(recovered);
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

function frequencyAmplitude(signal, frequency) {
  const radiansPerSample = frequency * 2 * Math.PI / rate;
  let cosine = 0;
  let sine = 0;
  for (let index = 0; index < signal.length; index += 1) {
    const phase = radiansPerSample * index;
    cosine += signal[index] * Math.cos(phase);
    sine += signal[index] * Math.sin(phase);
  }
  return 2 * Math.hypot(cosine, sine) / signal.length;
}

test("mechanical supercharger follows the supplied shaft speed and still spins under fuel cut", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r6");
  const supercharger = { driveRatio: 9.2, audioGain: 0.23 };
  const rpm = 6000;
  const shaftFrequency = 1130;
  const shaftTelemetry = { rpm, superchargerAngularVelocity: shaftFrequency * 2 * Math.PI };
  const loaded = { ...shaftTelemetry, throttle: 0.9, combustion: 0.85, load: 0.8 };
  const coast = { ...shaftTelemetry, throttle: 0, combustion: 0, load: 0.35 };
  const render = (controls, options) => captureAudio(vehicle, options).blocks(260, controls).slice(-9600);
  const loadedSignal = render(loaded, { supercharger });
  const loadedBase = render(loaded, { supercharger: { ...supercharger, audioGain: 0 } });
  const coastSignal = render(coast, { supercharger });
  const coastBase = render(coast, { supercharger: { ...supercharger, audioGain: 0 } });
  const loadedWhine = loadedSignal.map((sample, index) => sample - loadedBase[index]);
  const coastWhine = coastSignal.map((sample, index) => sample - coastBase[index]);
  const measured = frequencyAmplitude(loadedWhine, shaftFrequency);
  const coasting = frequencyAmplitude(coastWhine, shaftFrequency);
  assert.ok(measured > 0.012);
  assert.ok(measured > frequencyAmplitude(loadedWhine, rpm * supercharger.driveRatio / 60) * 10);
  assert.ok(coasting > measured * 0.22 && coasting < measured * 0.8);
  assertBounded(loadedSignal);
  assertBounded(coastSignal);
  assert.deepEqual(loadedBase, render(loaded, {}));
  assert.deepEqual(loadedBase, render({ ...loaded, superchargerAngularVelocity: 0 }, { supercharger }));

  const { superchargerAngularVelocity, ...legacyState } = loaded;
  const fallbackFrequency = rpm * supercharger.driveRatio / 60;
  const fallback = render(legacyState, { supercharger });
  const fallbackWhine = fallback.map((sample, index) => sample - loadedBase[index]);
  assert.ok(frequencyAmplitude(fallbackWhine, fallbackFrequency) > 0.012);
});
