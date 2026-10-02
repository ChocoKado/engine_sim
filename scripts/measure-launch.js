import { writeFileSync, mkdirSync } from 'node:fs';
import { EngineModel, PHYSICS_STEP as dt } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const results = [];
for (const id of Object.keys(ENGINE_CONFIGS)) for (const mode of ['at', 'amt']) {
  for (const induction of ['stock', 'na', 'supercharger-3bar']) {
    const engine = new EngineModel(id, 'oem', () => 0.5), drive = new Drivetrain(engine);
    if (induction !== 'stock') engine.setForcedInduction(induction === 'na' ? 'na' : 'supercharger');
    if (induction === 'supercharger-3bar') engine.setMaxBoost(3);
    engine.setRunning(true); drive.setMode(mode);
    mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
    let longest = 0, start = null, plateau = null, peakRise = 0, minRise = Infinity;
    const trace = [];
    for (let frame = 0; frame < 20 / dt; frame++) {
      const rpm = engine.rpm, speed = drive.speedKmh;
      drive.update(dt, 1, 0);
      const rise = (engine.rpm - rpm) / dt, acceleration = (drive.speedKmh - speed) / 3.6 / dt;
      const fraction = engine.rpm / engine.redlineRPM;
      const wheelRPM = drive.calcRPMFromSpeed(1, drive.speedKmh);
      if (id === 'i4_cross' && frame % 24 === 0 && frame * dt <= 8) trace.push({
        time: Number(engine.time.toFixed(3)), rpm: Number(engine.rpm.toFixed(1)), wheelRPM: Number(wheelRPM.toFixed(1)),
        speed: Number(drive.speedKmh.toFixed(2)), rise: Number(rise.toFixed(1)), acceleration: Number(acceleration.toFixed(3)),
        capacity: Number(drive.clutchCapacity.toFixed(2)), lockup: Number(drive.lockup.toFixed(3)),
        transmitted: Number(drive.transmittedTorque.toFixed(2)), pump: Number(drive.pumpTorque.toFixed(2)),
        netTorque: Number(engine.netTorque.toFixed(2)), traction: Number(drive.tractionReduction.toFixed(3)),
        state: drive.shiftState, cut: engine.torqueScale, gear: drive.currentGear });
      const inBand = fraction > 0.38 && fraction < 0.85 && drive.currentGear === 1 && drive.shiftState === 'launching';
      if (inBand) { peakRise = Math.max(peakRise, rise); minRise = Math.min(minRise, rise); }
      if (inBand && rise < engine.redlineRPM * 0.03 && acceleration > 0.5) {
        start ??= { time: engine.time - dt, rpm, wheelRPM, speed };
        const duration = engine.time - start.time;
        if (duration > longest) { longest = duration; plateau = { duration, ...start, endRPM: engine.rpm, endWheelRPM: wheelRPM }; }
      } else start = null;
      if (drive.currentGear !== 1 || fraction > 0.97) break;
    }
    results.push({ id, mode, induction, redline: engine.redlineRPM, mass: drive.vehicleMass,
      longestPlateau: longest, plateau, peakRise, minRise: Number.isFinite(minRise) ? minRise : null, trace });
  }
}
mkdirSync('reports', { recursive: true });
// The before report was captured from 8119340 prior to the fix. Regeneration
// always writes the current report, so the historical trace is not replaced.
writeFileSync('reports/launch-current.json', JSON.stringify({ generatedAt: new Date().toISOString(),
  method: 'OEM exhaust, preset mass/redline/ratios, 100% throttle from idle. 240 Hz, first gear only, up to 20 s. Plateau diagnostic: launching at 38–85% redline, RPM rise below 3% redline/s, vehicle acceleration above 0.5 m/s². Diagnostic is not a universal pass/fail requirement; converter slip can legitimately hold RPM.',
  results }, null, 2));
console.table(results.filter(r => ['i4_cross', 'honda_k20a', 'v8_cross', 'rotary_2'].includes(r.id)).map(r=>({
  id:r.id, mode:r.mode, induction:r.induction, duration:r.longestPlateau.toFixed(3),
  rpm:r.plateau?.rpm.toFixed(0) ?? '-', fraction:r.plateau ? (r.plateau.rpm/r.redline).toFixed(3) : '-',
  wheelRPM:r.plateau?.wheelRPM.toFixed(0) ?? '-', endWheelRPM:r.plateau?.endWheelRPM.toFixed(0) ?? '-'
})));
console.log(`Recorded ${results.length} first-gear launch diagnostics.`);
