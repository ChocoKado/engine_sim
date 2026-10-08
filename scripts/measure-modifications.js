import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { MODIFICATION_CATALOG, isModificationSupported } from '../src/physics/Modifications.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';
import { capturePerformanceSetup } from '../src/controls/PerformancePanel.js';

const results = [];
for (const id of ['honda_k20a', 'i4_cross', 'v8_cross', 'rotary_2']) {
  for (const induction of ['na', 'turbo', 'supercharger']) {
    const make = () => {
      const engine = new EngineModel(id, 'oem', () => 0.5);
      engine.setForcedInduction(induction);
      engine.setMaxBoost(1);
      return engine;
    };
    const parts = MODIFICATION_CATALOG.filter(part => isModificationSupported(make().config, induction, part.id));
    for (const variant of ['stock', ...parts.map(part => part.id), 'full-kit']) {
      const engine = make();
      for (const part of parts) if (variant === part.id || variant === 'full-kit') {
        assert.equal(engine.setModification(part.id, part.options[1].value), true);
      }
      const drive = new Drivetrain(engine);
      const setup = capturePerformanceSetup(engine, drive);
      engine.setRunning(true);
      let rise = 0, fall = 0;
      while (engine.rpm < 5000 && rise < 5) { drive.update(dt, 1, 0); rise += dt; }
      assert.ok(engine.rpm >= 5000);
      while (engine.rpm > 1500 && fall < 10) { drive.update(dt, 0, 0); fall += dt; }
      assert.ok(engine.rpm <= 1500 && engine.isIgnitionOn);
      for (let n = 0; n < 4 / dt; n++) drive.update(dt, 0, 0);
      drive.setAtSelector('D');
      const meter = new PerformanceMeter();
      meter.arm({ time: engine.time, speed: 0, distance: 0, running: true, gear: 1 }, setup);
      drive.onStep = sample => meter.sample(sample);
      for (let n = 0; n < 20 / dt; n++) drive.update(dt, 1, 0);
      assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh) && engine.isIgnitionOn);
      results.push({ id, induction, variant, setup, inertiaKgM2: engine.inertia,
        neutralIdleTo5000Seconds: rise, neutral5000To1500Seconds: fall,
        zeroTo100Seconds: meter.metrics.zeroTo100, speedAt20Seconds: drive.speedKmh,
        note: 'Model estimate. Same OEM CC, mass, gearing and exhaust. AT / 1 bar stock pulley baseline. Neutral fall starts at the first 5000-RPM crossing.' });
    }
  }
}
mkdirSync('reports', { recursive: true });
writeFileSync('reports/modifications-current.json', JSON.stringify({ generatedAt: new Date().toISOString(),
  cases: results.length, results }, null, 2));
console.log(`${results.length} modification comparisons recorded; finite dynamics and ignition verified.`);
