import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aerospaceEngines } from "../data/aerospace.ts";
import { advanceAerospace, INITIAL_AEROSPACE_INPUT, INITIAL_AEROSPACE_STATE, stepAerospace } from "../lib/aerospace.ts";

const [piston, turbofan, turbojet, rocket] = aerospaceEngines;
const full = { ...INITIAL_AEROSPACE_INPUT, enabled: true, command: 1 };

function run(engine, input, frames, initial = INITIAL_AEROSPACE_STATE) {
  let state = initial;
  for (let frame = 0; frame < frames; frame += 1) state = stepAerospace(state, input, engine);
  return state;
}

test("piston bench reaches its reference at full power and slows under higher propeller load", () => {
  const nominal = run(piston, full, 1200);
  const loaded = run(piston, { ...full, heavyPropLoad: true }, 1200);
  const stopped = run(piston, INITIAL_AEROSPACE_INPUT, 1200, nominal);
  assert.ok(Math.abs(nominal.shaftRpm - 2700) < 0.01);
  assert.ok(Math.abs(nominal.powerKw - piston.ratedPowerKw) < 0.01);
  assert.ok(loaded.shaftRpm < nominal.shaftRpm && loaded.powerKw > 0);
  assert.equal(stopped.shaftRpm, 0);
  assert.equal(stopped.powerKw, 0);
});

test("turbofan and turbojet spool progressively and settle to their individual rating", () => {
  for (const engine of [turbofan, turbojet]) {
    const early = run(engine, full, 48);
    const nominal = run(engine, full, 2400);
    const decay = run(engine, INITIAL_AEROSPACE_INPUT, 60, nominal);
    assert.ok(early.primary < early.secondary && early.thrustKn < engine.ratedThrustKn * 0.3);
    assert.ok(Math.abs(nominal.thrustKn - engine.ratedThrustKn) < 0.01);
    assert.ok(decay.thrustKn > 0 && decay.thrustKn < nominal.thrustKn);
    assert.ok(nominal.shaftAngle >= 0 && nominal.shaftAngle < 2 * Math.PI);
    assert.ok(nominal.coreAngle >= 0 && nominal.coreAngle < 2 * Math.PI);
  }
  assert.ok(run(turbofan, full, 120).primary < run(turbojet, full, 120).primary);
});

test("rocket bench uses the selected static thrust anchor and caps a tab suspension", () => {
  const ground = run(rocket, full, 1200);
  const vacuum = run(rocket, { ...full, vacuum: true }, 1200);
  assert.ok(Math.abs(ground.thrustKn - rocket.seaLevelThrustKn) < 0.01);
  assert.ok(Math.abs(vacuum.thrustKn - rocket.vacuumThrustKn) < 0.01);
  assert.ok(vacuum.thrustKn > ground.thrustKn);
  assert.equal(run(rocket, INITIAL_AEROSPACE_INPUT, 1200, ground).thrustKn, 0);
  assert.deepEqual(advanceAerospace(INITIAL_AEROSPACE_STATE, full, rocket, 45), advanceAerospace(INITIAL_AEROSPACE_STATE, full, rocket, 0.10));
});

test("aerospace audio stays under its ceiling and fades without fresh telemetry or in vacuum", () => {
  const rate = 48000;
  const source = readFileSync(new URL("../public/aerospace-sound-processor.js", import.meta.url), "utf8");
  for (const engine of aerospaceEngines) {
    let Processor;
    const context = vm.createContext({
      AudioWorkletProcessor: class { port = {}; }, currentTime: 0, sampleRate: rate,
      registerProcessor(name, processor) { assert.equal(name, "aerospace-sound"); Processor = processor; },
    });
    vm.runInContext(source, context);
    const processor = new Processor({ processorOptions: { kind: engine.kind } });
    const state = run(engine, full, 2000);
    const signal = new Float32Array(128);
    function render(blocks, freshFrame) {
      for (let block = 0; block < blocks; block += 1) {
        if (freshFrame) processor.port.onmessage({ data: freshFrame });
        processor.process([], [[signal]]);
        assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.21));
        context.currentTime += signal.length / rate;
      }
      return Math.max(...signal.map(Math.abs));
    }
    assert.ok(render(60, state) > 0.02, engine.name);
    if (engine.kind === "rocket") assert.ok(render(180, { ...state, vacuum: true }) < 1e-4);
    assert.ok(render(250) < 1e-4);
  }
});
