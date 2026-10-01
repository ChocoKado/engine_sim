import { writeFileSync, mkdirSync } from 'node:fs';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const results = [];
for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    const engine = new EngineModel(id, 'akrapovic', () => 0.5);
    const drive = new Drivetrain(engine);
    engine.setRunning(true);
    drive.setMode(mode);
    mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
    const samples = [];
    let to30 = null, to100 = null;
    for (let frame = 1; frame <= 20 * 60; frame++) {
      drive.update(1 / 60, 1, 0);
      if (to30 === null && drive.speedKmh >= 30) to30 = frame / 60;
      if (to100 === null && drive.speedKmh >= 100) to100 = frame / 60;
      if (frame % 6 === 0) samples.push({ t: frame / 60, rpm: Math.round(engine.rpm),
        speed: +drive.speedKmh.toFixed(3), gear: drive.currentGear, state: drive.shiftState });
    }
    results.push({ id, mode, mass: drive.vehicleMass, to30, to100, samples });
  }
}
mkdirSync('reports', { recursive: true });
writeFileSync(`reports/${process.argv[2] || 'dynamics-current'}.json`, JSON.stringify(results, null, 2));
console.table(results.map(({ id, mode, mass, to30, to100, samples }) => ({ id, mode, mass,
  '1s km/h': samples[9].speed, '0–30 s': to30?.toFixed(2), '0–100 s': to100?.toFixed(2) })));
