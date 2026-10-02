import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { PerformanceMeter } from '../src/physics/PerformanceMeter.js';
import { capturePerformanceSetup } from '../src/controls/PerformancePanel.js';
import { performanceAssessment } from '../src/physics/PerformanceAnalysis.js';

const results = [];
for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    for (const variant of ['default-cc', 'max-cc', 'max-cc-longer-final']) {
      const engine = new EngineModel(id, 'oem', () => 0.5), drive = new Drivetrain(engine);
      if (variant !== 'default-cc') engine.setDisplacement(engine.config.maxDisplacement);
      if (variant === 'max-cc-longer-final') drive.setFinalDriveScale(0.85);
      engine.setRunning(true); drive.setMode(mode);
      mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
      const meter = new PerformanceMeter(), setup = capturePerformanceSetup(engine, drive);
      meter.arm({time:0,speed:0,distance:0,running:true,gear:1}, setup);
      drive.onStep = sample => meter.sample(sample);
      let speedAt85 = 0, sawTractionControl = false;
      for (let frame = 1; frame <= 90 * 30; frame++) {
        // The AMT test driver requests each shift; AMT itself stays manual.
        if (mode === 'amt' && drive.shiftState === 'locked' && engine.rpm >= engine.redlineRPM * 0.94
          && drive.currentGear < drive.maxGear) drive.shiftUp();
        drive.update(1 / 30, 1, 0);
        assert.ok(Number.isFinite(engine.rpm) && Number.isFinite(drive.speedKmh), `${id}/${mode}/${variant}`);
        assert.equal(engine.isIgnitionOn, true, `${id}/${mode}/${variant}: remains running`);
        sawTractionControl ||= drive.tractionReduction > 0.025;
        if (frame === 85 * 30) speedAt85 = drive.speedKmh;
      }
      const assessment = performanceAssessment(engine, drive);
      results.push({id, mode, variant, setup, metrics: meter.metrics, speedAt90Seconds: drive.speedKmh,
        speedGainInLast5Seconds: drive.speedKmh - speedAt85, gear: drive.currentGear, rpm: engine.rpm,
        highestGearRedlineWheelSpeed: assessment.theoreticalTop, finalRestriction: assessment.reason, sawTractionControl});
    }
    const cases = results.slice(-3);
    assert.ok(cases[1].setup.peakHP > cases[0].setup.peakHP, `${id}: CC increases modeled power`);
    assert.equal(cases[0].highestGearRedlineWheelSpeed, cases[1].highestGearRedlineWheelSpeed);
    assert.ok(Math.abs(cases[2].highestGearRedlineWheelSpeed * 0.85 - cases[0].highestGearRedlineWheelSpeed) < 1e-7);
  }
}
mkdirSync('reports', {recursive:true});
writeFileSync('reports/tuning-current.json', JSON.stringify({generatedAt:new Date().toISOString(), cases:results.length,
  method:'OEM exhaust and preset induction; default CC, maximum CC, maximum CC with final-drive ratio ×0.85. Same mass/redline. 240 Hz physics for 90 s at full throttle. AT automatic, AMT test driver requests shifts at 94% redline. Interpolated PerformanceMeter timings, no rollout. Speed at 90 s is not a verified terminal speed; null metrics mean not reached.', results}, null, 2));
console.table(results.filter(row => ['i4_cross','honda_k20a','rotary_2'].includes(row.id)).map(row => ({
  id:row.id, mode:row.mode, variant:row.variant, cc:row.setup.displacement, hp:row.setup.peakHP,
  '0–100':row.metrics.zeroTo100?.toFixed(2), '100–200':row.metrics.hundredTo200?.toFixed(2),
  '90s km/h':row.speedAt90Seconds.toFixed(1), gear:row.gear, limit:row.finalRestriction,
})));
console.log(`Validated ${results.length} displacement/gearing comparisons.`);
