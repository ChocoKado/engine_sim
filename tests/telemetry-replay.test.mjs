import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { aerospaceEngines } from "../data/aerospace.ts";
import { cars } from "../data/cars.ts";
import { enduranceCars } from "../data/endurance-cars.ts";
import { formulaOneCars } from "../data/formula-one.ts";
import { vehicles } from "../data/vehicles.ts";
import { createSimulationState, INITIAL_SIMULATION_INPUT, rpmFromRadiansPerSecond, stepSimulation } from "../lib/simulation.ts";
import { formatTelemetryCsv, formatTelemetryJson, simulateReplayRun, TelemetryRecorder } from "../lib/telemetry-recorder.ts";
import { enqueueShift } from "../lib/transmission.ts";

const running = { ...INITIAL_SIMULATION_INPUT, engineOn: true };

test("M24 telemetry recorder replays identical 120 Hz RPM, gear and speed trajectories and exports CSV/JSON", () => {
  const vehicle = vehicles.find(({ id }) => id === "yamaha-r3");
  let state = createSimulationState(vehicle);
  for (let tick = 0; tick < 120; tick += 1) state = stepSimulation(state, running, vehicle);

  const recorder = new TelemetryRecorder();
  recorder.start(vehicle, state);
  const liveStates = [];
  for (let tick = 0; tick < 240; tick += 1) {
    if (tick === 20 || tick === 95 || tick === 170) {
      state = enqueueShift(state, 1);
      recorder.recordShift(1);
    }
    const stepInput = tick < 185
      ? { ...running, throttle: tick < 15 ? 0.45 : 1 }
      : { ...running, throttle: 0, brake: 0.6 };
    state = stepSimulation(state, stepInput, vehicle);
    recorder.recordStep(stepInput, state);
    liveStates.push(state);
  }
  const run = recorder.stop(state);
  assert.ok(run);
  assert.equal(run.vehicleId, "yamaha-r3");
  assert.equal(run.ticks.length, 240);
  assert.ok(run.samples.length >= 80);

  const replayedStates = simulateReplayRun(run, vehicle);
  assert.equal(replayedStates.length, liveStates.length);
  assert.deepEqual(replayedStates.at(-1), liveStates.at(-1));
  for (let i = 0; i < liveStates.length; i += 25) {
    assert.equal(replayedStates[i].engineAngularVelocity, liveStates[i].engineAngularVelocity);
    assert.equal(replayedStates[i].vehicleSpeed, liveStates[i].vehicleSpeed);
    assert.equal(replayedStates[i].gear, liveStates[i].gear);
  }

  const csv = formatTelemetryCsv(run);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "vehicle_id,version,time_s,throttle,brake,gear,shift_mode,rpm,speed_kmh");
  assert.equal(lines.length, run.samples.length + 1);
  const parsedJson = JSON.parse(formatTelemetryJson(run));
  assert.equal(parsedJson.vehicleId, "yamaha-r3");
  assert.equal(parsedJson.samples.length, run.samples.length);
});

test("F1 cars under full AT braking reach first gear before stopping and never keep downshifting at 0 km/h", () => {
  for (const car of formulaOneCars) {
    let state = createSimulationState(car);
    const drive = { ...running, shiftMode: "AT", throttle: 1 };
    for (let tick = 0; tick < 120 * 22; tick += 1) state = stepSimulation(state, drive, car);
    assert.ok(state.gear >= car.gears - 1 && state.vehicleSpeed * 3.6 > 250, car.name);

    const fullBrake = { ...running, shiftMode: "AT", throttle: 0, brake: 1 };
    let gearAtZeroSpeed = null;
    for (let tick = 0; tick < 120 * 8; tick += 1) {
      const prevGear = state.gear;
      state = stepSimulation(state, fullBrake, car);
      if (state.vehicleSpeed === 0) {
        if (gearAtZeroSpeed === null) gearAtZeroSpeed = state.gear;
        else assert.equal(state.gear, gearAtZeroSpeed, `${car.name} shifted from ${prevGear} to ${state.gear} while stopped at 0 km/h`);
        assert.equal(state.shift, null, `${car.name} had an active shift while stopped at 0 km/h`);
      }
    }
    assert.equal(gearAtZeroSpeed, 1, `${car.name} stopped in gear ${gearAtZeroSpeed} instead of 1st`);
  }
});

test("ERS harvests energy both under braking (BBW) and on high-speed throttle lift-off overrun (engine braking)", () => {
  for (const id of ["red-bull-rb19", "ferrari-sf-26"]) {
    const car = formulaOneCars.find((entry) => entry.id === id);
    const { capacityKj } = car.physics.hybridAssist;
    const speedMps = 230 / 3.6;
    const wheelOmega = speedMps / car.physics.rollingRadiusM;
    const ratio = car.physics.gearRatios[5] * car.physics.finalDriveRatio;
    const baseState = {
      ...createSimulationState(car),
      ...running,
      powerOn: true,
      enginePhase: "running",
      engineWarmth: 1,
      runningSeconds: 3,
      gear: 6,
      vehicleSpeed: speedMps,
      wheelAngularVelocity: wheelOmega,
      engineAngularVelocity: wheelOmega * ratio,
      hybridEnergyKj: capacityKj * 0.4,
    };

    const liftCoast = stepSimulation(baseState, { ...running, throttle: 0, brake: 0 }, car);
    const liftFullBattery = stepSimulation({ ...baseState, hybridEnergyKj: capacityKj }, { ...running, throttle: 0, brake: 0 }, car);
    const brakedRegen = stepSimulation(baseState, { ...running, throttle: 0, brake: 0.8 }, car);

    assert.ok(liftCoast.hybridPowerKw < -10, `${car.name} should harvest on high-speed lift-off`);
    assert.ok(liftCoast.hybridEnergyKj > baseState.hybridEnergyKj);
    assert.ok(liftCoast.vehicleSpeed < liftFullBattery.vehicleSpeed, `${car.name} MGU-K overrun harvesting should add engine braking`);
    assert.ok(Math.abs(brakedRegen.hybridPowerKw) > Math.abs(liftCoast.hybridPowerKw), `${car.name} braking regen exceeds lift-off regen`);
  }
});

test("NSX NA2 achieves 100% of its published peak torque below VTEC switchover and Overdrive cars do not lose speed at WOT", () => {
  const nsx = cars.find(({ id }) => id === "honda-nsx-na2");
  const atPeakTorque = {
    ...createSimulationState(nsx),
    ...running,
    powerOn: true,
    enginePhase: "running",
    engineWarmth: 1,
    runningSeconds: 3,
    engineAngularVelocity: nsx.physics.peakTorqueRpm * Math.PI / 30,
  };
  const stepped = stepSimulation(atPeakTorque, { ...running, throttle: 1 }, nsx);
  assert.ok(Math.abs(stepped.engineTorqueNm - nsx.physics.peakTorqueNm) < 1e-6);

  for (const id of ["chevrolet-corvette-stingray-c8", "lamborghini-gallardo-lp560", "lexus-lfa"]) {
    const car = cars.find((entry) => entry.id === id);
    let state = createSimulationState(car);
    let peakSpeed = 0;
    for (let tick = 0; tick < 120 * 75; tick += 1) {
      state = stepSimulation(state, { ...running, shiftMode: "AT", throttle: 1 }, car);
      peakSpeed = Math.max(peakSpeed, state.vehicleSpeed * 3.6);
    }
    const endSpeed = state.vehicleSpeed * 3.6;
    assert.ok(peakSpeed - endSpeed < 0.3, `${car.name}: peak ${peakSpeed.toFixed(1)} vs end ${endSpeed.toFixed(1)} km/h`);
  }
});

test("M25 10-minute continuous simulation stays finite, bounded, and free of NaN drift", () => {
  const bike = vehicles.find(({ id }) => id === "yamaha-r1");
  let state = createSimulationState(bike);
  for (let tick = 0; tick < 120 * 600; tick += 1) {
    const phase = tick % (120 * 20);
    const input = phase < 120 * 12
      ? { ...running, shiftMode: "AT", throttle: 0.85 }
      : phase < 120 * 16
        ? { ...running, shiftMode: "AT", throttle: 0, brake: 0.55 }
        : { ...running, shiftMode: "AT", throttle: 0.35 };
    state = stepSimulation(state, input, bike);
  }
  assert.ok(Number.isFinite(state.engineAngularVelocity) && state.engineAngularVelocity > 0);
  assert.ok(Number.isFinite(state.vehicleSpeed) && state.vehicleSpeed >= 0);
  assert.ok(state.crankAngleRad >= 0 && state.crankAngleRad < 4 * Math.PI);
  assert.equal( rpmFromRadiansPerSecond(state.engineAngularVelocity) > 500, true);
});

test("M26 MODEL_CATALOG.csv and SPEED_AUDIT.csv stay in exact 1:1 sync with all terrestrial vehicles", () => {
  const allVehicles = [...vehicles, ...cars, ...formulaOneCars, ...enduranceCars];
  const ids = allVehicles.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, "duplicate vehicle IDs found");

  const catalogIds = readFileSync(new URL("../data/MODEL_CATALOG.csv", import.meta.url), "utf8")
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(",")[0]);
  const speedAuditIds = readFileSync(new URL("../data/SPEED_AUDIT.csv", import.meta.url), "utf8")
    .trim().split(/\r?\n/).slice(1).map((line) => line.split(",")[0]);

  assert.deepEqual(new Set(catalogIds), new Set(ids));
  assert.deepEqual(speedAuditIds, ids);
});

test("two-stage spacecraft is removed and afterfire, turbo free-rev, and H2R supercharger chirp are prominent", () => {
  assert.equal(aerospaceEngines.some(({ id, kind }) => id.includes("falcon") || kind === "staged-rocket"), false);
  assert.deepEqual(
    aerospaceEngines.filter(({ kind }) => kind === "rocket").map(({ id }) => id),
    ["sls-rs25", "centaur-rl10c-1"],
  );

  // Neutral free-rev on GR Supra builds compressor surge and triggers audible BOV/flutter release on lift-off.
  const supra = cars.find(({ id }) => id === "toyota-gr-supra");
  let supraState = { ...createSimulationState(supra), ...running };
  for (let tick = 0; tick < 75; tick += 1) {
    supraState = stepSimulation(supraState, { ...running, throttle: 1 }, supra);
  }
  assert.ok(supraState.turboBoostBar > 0.25, `neutral turbo boost too low: ${supraState.turboBoostBar}`);
  const supraLift = stepSimulation(supraState, { ...running, throttle: 0 }, supra);
  assert.ok(supraLift.turboRelease > 0.45, `neutral turbo release too weak: ${supraLift.turboRelease}`);

  // Verify AudioWorklet afterfire loudness (>0.22 peak) and H2R lift-off centrifugal bird-chirp.
  const rate = 48000;
  const script = readFileSync(new URL("../public/engine-sound-processor.js", import.meta.url), "utf8");
  function makeWorklet(vehicle, random = () => 0.08) {
    let Processor;
    const cues = [];
    const ctx = vm.createContext({
      sampleRate: rate,
      currentTime: 0,
      Math: Object.assign(Object.create(Math), { random }),
      AudioWorkletProcessor: class { port = { postMessage: (msg) => cues.push(msg) }; },
      registerProcessor(_name, cls) { Processor = cls; },
    });
    vm.runInContext(script, ctx);
    const proc = new Processor({
      processorOptions: {
        ...vehicle.audio,
        exhaustOpeningRad: (130 * Math.PI) / 180,
        supercharger: vehicle.supercharger,
        turbocharger: vehicle.turbocharger,
      },
    });
    let sampleIndex = 0;
    let angle = 0;
    const origFire = proc.afterfire.fire.bind(proc.afterfire);
    const pops = [];
    proc.afterfire.fire = () => {
      pops.push(sampleIndex);
      return origFire();
    };
    return {
      pops,
      cues,
      render(blocksCount, frameFn) {
        const out = [];
        for (let b = 0; b < blocksCount; b += 1) {
          ctx.currentTime = sampleIndex / rate;
          const p = frameFn(ctx.currentTime);
          const omega = (p.rpm * 2 * Math.PI) / 60;
          proc.port.onmessage({
            data: {
              type: "state",
              engineOn: true,
              angleRad: angle,
              angularVelocity: omega,
              superchargerAngularVelocity: vehicle.supercharger ? omega * vehicle.supercharger.driveRatio : undefined,
              throttle: p.throttle,
              combustion: p.combustion ?? 0.8,
              load: p.load ?? 0.7,
              contextTime: ctx.currentTime,
            },
          });
          const buf = new Float32Array(128);
          proc.process([], [[buf]]);
          out.push(...buf);
          sampleIndex += 128;
          angle = (angle + (128 * omega) / rate) % (4 * Math.PI);
        }
        return out;
      },
    };
  }

  const r9 = vehicles.find(({ id }) => id === "yamaha-r9");
  const popRun = makeWorklet(r9, () => 0.08);
  const quietRun = makeWorklet(r9, () => 0.99);
  const fn = (t) => (t < 0.42 ? { rpm: 8200, throttle: 1, combustion: 0.85, load: 0.75 } : { rpm: 8000, throttle: 0, combustion: 0, load: 0.2 });
  const popSig = popRun.render(320, fn);
  const quietSig = quietRun.render(320, fn);
  assert.ok(popRun.pops.length >= 2);
  const onset = popRun.pops[0];
  const delta = popSig.slice(onset, onset + Math.round(0.014 * rate)).map((v, i) => v - quietSig[onset + i]);
  const peak = Math.max(...delta.map(Math.abs));
  assert.ok(peak > 0.28, `afterfire delta peak should be prominent: ${peak}`);
  assert.ok(popSig.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 0.38));

  const h2r = vehicles.find(({ id }) => id === "kawasaki-h2r");
  const h2Lift = makeWorklet(h2r, () => 0.99);
  const h2SteadyCoast = makeWorklet(h2r, () => 0.99);
  const liftSig = h2Lift.render(260, (t) => (t < 0.35
    ? { rpm: 11800, throttle: 1, combustion: 0.9, load: 0.8 }
    : { rpm: 11500, throttle: 0, combustion: 0, load: 0.25 }));
  const steadySig = h2SteadyCoast.render(260, () => ({ rpm: 11500, throttle: 0, combustion: 0, load: 0.25 }));
  const windowStart = Math.round(0.43 * rate);
  const windowEnd = Math.round(0.58 * rate);
  const rms = (arr) => Math.sqrt(arr.reduce((s, x) => s + x * x, 0) / arr.length);
  assert.ok(rms(liftSig.slice(windowStart, windowEnd)) > rms(steadySig.slice(windowStart, windowEnd)) * 1.18,
    "H2R high-RPM throttle snap-shut should add audible supercharger surge chirp");
});
