import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const variants = [
  { name: 'stock' }, { name: 'na', type: 'na' },
  { name: 'turbo-small', type: 'turbo', size: 'small' },
  { name: 'turbo-large', type: 'turbo', size: 'large' },
  { name: 'roots-tvs', type: 'supercharger' }
];
const results = [];
for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
   for (const variant of variants) {
    const engine = new EngineModel(id, 'oem', () => 0.5);
    if (variant.type) {
      engine.setForcedInduction(variant.type);
      engine.setMaxBoost(1);
      if (variant.size) engine.setTurboSize(variant.size);
    }
    const drive = new Drivetrain(engine);
    engine.setRunning(true);
    drive.setMode(mode);
    mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
    const samples = [];
    let to30 = null, to100 = null, speedAt1s = 0, peakAcceleration = 0, maxRPM = 0;
    const shifts = [];
    for (let frame = 1; frame <= 20 * 60; frame++) {
      // AMT is driven by this explicit test driver; the simulator still never
      // automatically shifts in AMT. Test every available forward gear.
      if (mode === 'amt' && drive.shiftState === 'locked' && engine.rpm >= engine.redlineRPM * 0.94
        && drive.currentGear < drive.maxGear) drive.shiftUp();
      const previousSpeed = drive.speedKmh, previousGear = drive.currentGear;
      drive.update(1 / 60, 1, 0);
      assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh), `${id}/${mode}/${variant.name}: finite state`);
      assert.ok(engine.rpm < engine.redlineRPM * 1.025, `${id}/${mode}/${variant.name}: no sustained overrev`);
      if (drive.shiftState === 'locked') assert.ok(Math.abs(engine.rpm - drive.calcRPMFromSpeed(drive.currentGear, drive.speedKmh)) < 1e-7);
      peakAcceleration = Math.max(peakAcceleration, (drive.speedKmh - previousSpeed) / 3.6 * 60);
      maxRPM = Math.max(maxRPM, engine.rpm);
      if (frame === 60) speedAt1s = drive.speedKmh;
      if (previousGear !== drive.currentGear) shifts.push({ t: frame / 60, gear: drive.currentGear, rpm: Math.round(engine.rpm) });
      if (to30 === null && drive.speedKmh >= 30) to30 = frame / 60;
      if (to100 === null && drive.speedKmh >= 100) to100 = frame / 60;
      if (variant.name === 'stock' && frame % 30 === 0) samples.push({ t: frame / 60, rpm: Math.round(engine.rpm),
        speed: +drive.speedKmh.toFixed(3), gear: drive.currentGear, state: drive.shiftState,
        boost: +engine.boostPressure.toFixed(3) });
    }
    assert.ok(peakAcceleration < 9.1 && speedAt1s > 1, `${id}/${mode}/${variant.name}: usable, grip-limited launch`);
    const endSpeed = drive.speedKmh, endGear = drive.currentGear;
    // Shut the pedal and brake from whatever speed this variant reached.
    for (let frame = 0; frame < 20 * 60; frame++) drive.update(1 / 60, 0, 1);
    assert.equal(drive.speedKmh, 0, `${id}/${mode}/${variant.name}: brakes stop vehicle`);
    assert.ok(Math.abs(engine.rpm - engine.idleRPM) < 5, `${id}/${mode}/${variant.name}: anti-stall returns to idle`);
    results.push({ id, model: engine.config.representativeModel, mode, variant: variant.name,
      mass: drive.vehicleMass, induction: engine.forcedInduction, gears: drive.maxGear,
      hp: engine.dynoData.maxHp, torque: engine.dynoData.maxTorque, speedAt1s: +speedAt1s.toFixed(3),
      to30, to100, endSpeed: +endSpeed.toFixed(3), endGear, maxRPM: Math.round(maxRPM),
      peakAcceleration: +peakAcceleration.toFixed(3), shifts, ...(samples.length ? { samples } : {}) });
   }
  }
}
mkdirSync('reports', { recursive: true });
writeFileSync(`reports/${process.argv[2] || 'dynamics-current'}.json`, JSON.stringify({
  generatedAt: new Date().toISOString(), cases: results.length,
  method: 'OEM exhaust; stock induction or 1.0 bar tuning; AT automatic / AMT test-driver shift at 94% redline; 20 s throttle then 20 s braking. Estimates, not measured vehicle acceleration.',
  results
}, null, 2));
console.table(results.filter(r => r.variant === 'stock').map(({ id, mode, mass, speedAt1s, to30, to100, endGear }) => ({ id, mode,
  mass: +mass.toFixed(1), '1s km/h': speedAt1s, '0–30 s': to30?.toFixed(2), '0–100 s': to100?.toFixed(2), gear: endGear })));
console.log(`Validated ${results.length} engine / transmission / induction combinations.`);
