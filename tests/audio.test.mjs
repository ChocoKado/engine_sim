import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { cars } from "../data/cars.ts";
import { vehicles } from "../data/vehicles.ts";
import { tuningProfiles } from "../data/tuning.ts";
import { VALVE_EVENTS } from "../lib/kinematics.ts";
import { createSimulationState, FIXED_STEP_SECONDS, INITIAL_SIMULATION_INPUT, stepSimulation } from "../lib/simulation.ts";
import { enqueueShift, getOverallRatio } from "../lib/transmission.ts";

const rate = 48000;
const blockSize = 128;
const cycleRadians = 4 * Math.PI;
const playbackDelaySeconds = 0.04;
const playbackDelaySamples = rate * playbackDelaySeconds;
const exhaustOpeningRad = VALVE_EVENTS.exhaust.opensDegrees * Math.PI / 180;
const script = readFileSync(new URL("../public/engine-sound-processor.js", import.meta.url), "utf8");

function captureAudio(vehicle, audioOptions = {}, trackPitch = false, random = () => 1) {
  let Processor;
  const context = vm.createContext({
    sampleRate: rate,
    currentTime: 0,
    Math: Object.assign(Object.create(Math), { random }),
    AudioWorkletProcessor: class { port = {}; },
    registerProcessor(name, processor) {
      assert.equal(name, "engine-sound");
      Processor = processor;
    },
  });
  vm.runInContext(script, context);
  const processor = new Processor({
    processorOptions: {
      ...vehicle.audio,
      exhaustOpeningRad: vehicle.audio.exhaustOpeningRad ?? (vehicle.geometry.rotary ? 130 * Math.PI / 180 : exhaustOpeningRad),
      supercharger: vehicle.supercharger,
      ...audioOptions,
    },
  });
  const pulses = [];
  const afterfires = [];
  const pitch = [];
  let sample = 0;
  const advance = processor.advanceCrank.bind(processor);
  const fire = processor.afterfire.fire.bind(processor.afterfire);
  processor.afterfire.fire = () => {
    afterfires.push(sample);
    return fire();
  };
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

  return {
    blocks, pulses, pitch, afterfires,
    setTuning: (voicing) => processor.port.onmessage({ data: { type: "tuning", voicing } }),
  };
}

test("hot throttle lifts can produce different afterfire delays and counts without changing combustion timing", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r9");
  const liftSeconds = 0.45;
  const rpm = 7600;
  const render = (random) => {
    const audio = captureAudio(vehicle, {}, false, random);
    const signal = audio.blocks(390, (time) => time < liftSeconds
      ? { rpm, throttle: 1, combustion: 0.8, load: 0.7 }
      : { rpm, throttle: 0, combustion: 0, load: 0.2 });
    return { signal, pulses: audio.pulses, pops: audio.afterfires };
  };
  const silent = render(() => 0.98);
  let calls = 0;
  const singlePop = render(() => calls++ === 0 ? 0.1 : 0.78);
  const burst = render(() => 0.08);
  assert.deepEqual(silent.pops, []);
  assert.equal(singlePop.pops.length, 1);
  assert.equal(burst.pops.length, 3);
  assert.ok(singlePop.pops[0] - burst.pops[0] > 0.055 * rate);
  assert.ok(burst.pops[0] > (liftSeconds + playbackDelaySeconds + 0.03) * rate);
  assert.deepEqual(burst.pulses, silent.pulses);
  const start = burst.pops[0];
  const addedBurst = burst.signal.slice(start, start + 0.024 * rate).map((sample, index) => sample - silent.signal[start + index]);
  assertPressureCrack(addedBurst);
  assertBounded(burst.signal);
});

test("afterfire is cancelled by opening the throttle or stopping the engine before the pop", () => {
  for (const engineOn of [true, false]) {
    const audio = captureAudio(vehicles[1], {}, false, () => 0.35);
    const rpm = 7500;
    audio.blocks(320, (time) => {
      if (time < 0.35) return { rpm, throttle: 1 };
      if (time < 0.38) return { rpm, throttle: 0 };
      return { rpm, throttle: engineOn ? 1 : 0, engineOn };
    });
    assert.deepEqual(audio.afterfires, []);
  }
});

test("shift afterfire requires a powered upshift at mid to high RPM", () => {
  for (const [rpm, throttle, upshifting] of [[4300, 1, true], [8000, 0.45, true], [8000, 1, false]]) {
    const audio = captureAudio(vehicles[1], {}, false, () => 0.08);
    audio.blocks(180, { rpm, throttle });
    audio.blocks(100, { rpm, throttle, upshifting, shiftCut: 0.85 });
    assert.deepEqual(audio.afterfires, []);
  }
});

function rms(signal) {
  return Math.sqrt(signal.reduce((sum, sample) => sum + sample ** 2, 0) / signal.length);
}

function assertPressureCrack(signal) {
  const early = rms(signal.slice(0, 0.005 * rate));
  const late = rms(signal.slice(0.015 * rate));
  assert.ok(Math.max(...signal.map(Math.abs)) > 0.14);
  assert.ok(early > 0.040 && late < early * 0.18);
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

function bandRms(signal, lowerHz, upperHz) {
  const highPassCoefficient = 1 - Math.exp(-2 * Math.PI * lowerHz / rate);
  const lowPassCoefficient = 1 - Math.exp(-2 * Math.PI * upperHz / rate);
  const filterSettlingSamples = Math.round(rate * 0.02);
  let baseline = 0;
  let secondBaseline = 0;
  let lowPass = 0;
  let secondLowPass = 0;
  let energy = 0;
  for (let index = 0; index < signal.length; index += 1) {
    const sample = signal[index];
    baseline += highPassCoefficient * (sample - baseline);
    secondBaseline += highPassCoefficient * (sample - baseline - secondBaseline);
    lowPass += lowPassCoefficient * (sample - baseline - secondBaseline - lowPass);
    secondLowPass += lowPassCoefficient * (lowPass - secondLowPass);
    if (index >= filterSettlingSamples) energy += secondLowPass ** 2;
  }
  return Math.sqrt(energy / (signal.length - filterSettlingSamples));
}

function assertBounded(signal) {
  assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.38));
}

test("live tuning alters the exhaust spectrum without interrupting its firing clock", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r9");
  const control = { rpm: 9300, throttle: 0.85, combustion: 0.8, load: 0.7 };
  const signals = tuningProfiles.map((profile) => {
    const audio = captureAudio(vehicle);
    audio.blocks(150, control);
    audio.setTuning(profile.voicing);
    const samples = audio.blocks(175, control);
    assertBounded(samples);
    assert.ok(samples.some((sample) => Math.abs(sample) > 0.01));
    return { samples: samples.slice(-8192), pulses: audio.pulses };
  });
  const [baseline, baffled, open, intake] = signals;
  for (const signal of signals.slice(1)) assert.deepEqual(signal.pulses, baseline.pulses);
  assert.ok(upperBandShare(open.samples) > 1.08 * upperBandShare(baffled.samples));
  assert.notDeepEqual(intake.samples, baseline.samples);
});

test("RSV4, Ducati Twin Pulse and RC30 use distinct documented firing cadences", () => {
  const patterns = {
    "aprilia-rsv4": [0, 180, 425, 605],
    "ducati-panigale-v4": [0, 90, 290, 380],
    "ducati-panigale-v4-r": [0, 90, 290, 380],
    "honda-vfr750r-rc30": [0, 90, 360, 450],
  };
  for (const [id, angles] of Object.entries(patterns)) {
    const { audio } = vehicles.find((vehicle) => vehicle.id === id);
    assert.deepEqual(audio.firingAnglesRad.map((radians) => Math.round(radians * 180 / Math.PI)), angles);
  }
});

for (const vehicle of vehicles) {
  test(`${vehicle.name}: pressure starts at exhaust opening and keeps the firing intervals`, () => {
    const audio = captureAudio(vehicle);
    const signal = audio.blocks(120, {});
    const gaps = audio.pulses.slice(1).map((pulse, position) => pulse - audio.pulses[position]);
    const samplesPerRadian = rate / (100 * Math.PI);
    const openings = vehicle.audio.firingAnglesRad
      .map((angle) => (angle + exhaustOpeningRad) % cycleRadians)
      .sort((a, b) => a - b);
    const firstOpening = openings[0];
    const required = openings.map((angle, index) => ((openings[index + 1] ?? (firstOpening + cycleRadians)) - angle) * samplesPerRadian);
    const expectedFirstPulse = playbackDelaySamples + Math.ceil(firstOpening * samplesPerRadian) - 1;
    assert.ok(Math.abs(audio.pulses[0] - expectedFirstPulse) <= 1);
    assert.ok(gaps.length > 5);
    assert.ok(gaps.every((gap, position) => Math.abs(gap - required[position % required.length]) <= 1), gaps.join(","));
    assertBounded(signal);
    assert.ok(signal.some((sample) => Math.abs(sample) > 0.005));
  });

  test(`${vehicle.name}: collector adds low mids and retains upper-band output near peak RPM`, () => {
    function render(rpm, options) {
      const audio = captureAudio(vehicle, options);
      const signal = audio.blocks(150, { rpm, throttle: 0.82, combustion: 0.82, load: 0.76 }).slice(-8192);
      return { signal, pulses: audio.pulses };
    }

    const disabled = { exhaustBody: undefined };
    const mid = render(5500);
    const midBase = render(5500, disabled);
    const highRpm = Math.min(vehicle.physics.referenceRpm * 0.9, vehicle.physics.peakPowerRpm);
    const high = render(highRpm);
    const highBase = render(highRpm, disabled);
    const lowerBandGain = bandRms(mid.signal, 150, 720) / bandRms(midBase.signal, 150, 720);
    const middleUpperBandGain = bandRms(mid.signal, 1400, 4500) / bandRms(midBase.signal, 1400, 4500);
    const topUpperBandGain = bandRms(high.signal, 1400, 4500) / bandRms(highBase.signal, 1400, 4500);

    assert.ok(lowerBandGain > 1.08, `low-mid RMS ratio: ${lowerBandGain}`);
    assert.ok(lowerBandGain / middleUpperBandGain > 1.06, `relative low-mid RMS ratio: ${lowerBandGain / middleUpperBandGain}`);
    assert.ok(topUpperBandGain > 0.97, `high-RPM upper-band RMS ratio: ${topUpperBandGain}`);
    assert.deepEqual(mid.pulses, midBase.pulses);
    assert.deepEqual(high.pulses, highBase.pulses);
    assertBounded(mid.signal);
    assertBounded(high.signal);
  });
}

test("the car catalog renders continuous bounded sound and keeps rotary and V8 shaft cadence", () => {
  for (const vehicle of cars) {
    const audio = captureAudio(vehicle);
    const signal = audio.blocks(145, { rpm: 6000 });
    assertBounded(signal);
    assert.ok(rms(signal.slice(-4096)) > 0.004, vehicle.name);
    assert.ok(audio.pulses.length > 30, vehicle.name);
  }

  for (const [id, interval] of [["mazda-rx8", 240], ["ford-mustang-gt", 120]]) {
    const vehicle = cars.find((car) => car.id === id);
    const audio = captureAudio(vehicle);
    audio.blocks(100, { rpm: 6000 });
    assert.ok(audio.pulses.slice(1).every((sample, i) => Math.abs(sample - audio.pulses[i] - interval) <= 1), id);
  }

  const mustang = cars.find(({ id }) => id === "ford-mustang-gt");
  const banked = captureAudio(mustang).blocks(145, { rpm: 3900 });
  const merged = captureAudio(mustang, { exhaustBanks: undefined }).blocks(145, { rpm: 3900 });
  const change = banked.slice(-4096).map((sample, i) => sample - merged[merged.length - 4096 + i]);
  assert.ok(rms(change) > 0.008);
});

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

test("a simulated R9 upshift changes exhaust harmonics without interrupting crank pulses", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r9");
  const gear = 3;
  const input = { ...INITIAL_SIMULATION_INPUT, engineOn: true, throttle: 1 };
  const ratio = getOverallRatio(vehicle, gear);
  const engineAngularVelocity = 8300 * 2 * Math.PI / 60;
  const wheelAngularVelocity = engineAngularVelocity / ratio;
  let state = { ...createSimulationState(vehicle), engineOn: true, gear, engineAngularVelocity, wheelAngularVelocity,
    vehicleSpeed: wheelAngularVelocity * vehicle.physics.rollingRadiusM };
  const trace = [];
  for (let tick = 0; tick < 130; tick += 1) {
    if (tick === 46) state = enqueueShift(state, 1);
    state = stepSimulation(state, input, vehicle);
    trace.push(state);
  }
  assert.equal(state.gear, 4);
  const cutStart = trace.findIndex(({ shiftCut }) => shiftCut > 0.8);
  const recovery = trace.findIndex(({ shiftCut }, index) => index > cutStart && shiftCut === 0);
  assert.ok(cutStart > 0 && recovery > cutStart);

  function render(withShiftCue, random) {
    const audio = captureAudio(vehicle, {}, false, random);
    let index = 0;
    const signal = audio.blocks(400, (wallTime) => {
      const contextTime = index * FIXED_STEP_SECONDS;
      if (wallTime < contextTime + 0.004 || index >= trace.length) return null;
      const frame = trace[index];
      index += 2;
      return {
        angleRad: frame.crankAngleRad,
        angularVelocity: frame.engineAngularVelocity,
        contextTime,
        throttle: frame.throttle,
        combustion: Math.min(1, frame.combustionTorqueNm / vehicle.physics.peakTorqueNm),
        load: Math.min(1, Math.abs(frame.drivetrainTorqueNm) / (getOverallRatio(vehicle, frame.gear) * vehicle.physics.peakTorqueNm)),
        shiftCut: withShiftCue ? frame.shiftCut : 0,
        upshifting: withShiftCue && frame.shift?.fromGear > 0 && frame.shift.targetGear > frame.shift.fromGear,
      };
    });
    return { signal, pulses: audio.pulses, pops: audio.afterfires };
  }

  const audible = render(true);
  const control = render(false);
  const earlyPop = render(true, () => 0.08);
  let randomCalls = 0;
  const latePop = render(true, () => randomCalls++ === 0 ? 0.08 : 0.94);
  const sampleAt = (tick, relativeSeconds) => Math.round((tick * FIXED_STEP_SECONDS + playbackDelaySeconds + relativeSeconds) * rate);
  assert.deepEqual(audible.pops, []);
  assert.equal(earlyPop.pops.length, 1);
  assert.equal(latePop.pops.length, 1);
  assert.ok(earlyPop.pops[0] >= sampleAt(cutStart, 0.012));
  assert.ok(latePop.pops[0] < sampleAt(recovery, 0));
  assert.ok(latePop.pops[0] - earlyPop.pops[0] > rate * 0.025);
  assert.deepEqual(earlyPop.pulses, audible.pulses);
  const start = earlyPop.pops[0];
  const burst = earlyPop.signal.slice(start, start + 0.02 * rate).map((sample, index) => sample - audible.signal[start + index]);
  assertPressureCrack(burst);
  assertBounded(earlyPop.signal);
  const cut = audible.signal.slice(sampleAt(cutStart, 0.018), sampleAt(cutStart, 0.062));
  const rawCut = control.signal.slice(sampleAt(cutStart, 0.018), sampleAt(cutStart, 0.062));
  const restored = audible.signal.slice(sampleAt(recovery, 0.055), sampleAt(recovery, 0.105));
  const rawRestored = control.signal.slice(sampleAt(recovery, 0.055), sampleAt(recovery, 0.105));
  const tonalRatio = upperBandShare(cut) * rms(cut) / (upperBandShare(rawCut) * rms(rawCut));
  assert.deepEqual(audible.pulses, control.pulses);
  assert.ok(tonalRatio < 0.8, `upper-band shift ratio: ${tonalRatio}`);
  assert.ok(rms(cut) > rms(rawCut) * 0.50);
  assert.ok(Math.abs(rms(restored) / rms(rawRestored) - 1) < 0.06);
  assertBounded(cut);
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
