import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel } from '../src/physics/EngineModel.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { VEHICLE_PROFILES } from '../src/physics/VehicleProfiles.js';

const kw = (rpm, torque) => rpm * torque * 2 * Math.PI / 60000;
const gearSpeed = (config, profile, gear, rpm = config.defaultRedlineRPM) =>
  rpm * 2 * Math.PI * profile.tireRadius / 60 /
  (profile.primaryRatio * profile.finalDrive * profile.gearRatios[gear]) * 3.6;

for (const config of Object.values(ENGINE_CONFIGS)) {
  test(`${config.id}: stock curve keeps both published torque and power anchors`, () => {
    const powerPoint = config.torquePoints.find(([rpm]) => rpm === config.ratedPowerRPM);
    const torquePoint = config.torquePoints.find(([rpm]) => rpm === config.ratedTorqueRPM);
    assert.ok(powerPoint, 'rated-power RPM must be represented');
    assert.ok(torquePoint, 'rated-torque RPM must be represented');
    assert.ok(Math.abs(kw(...powerPoint) - config.ratedPowerKW) < 0.001);
    assert.ok(Math.abs(torquePoint[1] - config.ratedTorqueNm) < 0.001);
    for (let i = 0; i < config.torquePoints.length; i++) {
      const [rpm, torque] = config.torquePoints[i];
      assert.ok(Number.isFinite(rpm) && rpm > 0);
      assert.ok(Number.isFinite(torque) && torque > 0);
      assert.ok(torque <= config.ratedTorqueNm * 1.001, 'no invented peak above rated torque');
      assert.ok(kw(rpm, torque) <= config.ratedPowerKW * 1.005, 'anchors cannot exceed stock power');
      if (i) assert.ok(rpm > config.torquePoints[i - 1][0], 'ordered RPM anchors');
    }
    assert.ok(config.minRedlineRPM <= config.defaultRedlineRPM);
    assert.ok(config.maxRedlineRPM >= config.defaultRedlineRPM);
    assert.ok(config.defaultRedlineRPM >= config.ratedPowerRPM);
    assert.ok(config.soundCharacter && !config.description.includes('undefined'));
    assert.ok(config.referenceSource.startsWith('https://'));
  });
}

test('Ninja 400 retains 45 PS calibration instead of generic 60 hp output', () => {
  const config = ENGINE_CONFIGS.i2_180;
  assert.equal(config.defaultDisplacement, 399);
  assert.equal(config.ratedPowerKW, 33.4);
  assert.equal(config.ratedTorqueNm, 38);
});

test('factory turbo engines identify already-boosted calibration data', () => {
  for (const id of ['i6', 'v6', 'w16']) {
    const config = ENGINE_CONFIGS[id];
    assert.equal(config.defaultInduction, 'turbo');
    assert.ok(config.calibrationBoost > 0);
    assert.equal(config.defaultBoost, config.calibrationBoost);
  }
  assert.equal(ENGINE_CONFIGS.i4_cross.calibrationBoost, 0);
});

test('R1 primary reduction, final chain ratio and six speeds retain sensible road gearing', () => {
  const config = ENGINE_CONFIGS.i4_cross, profile = VEHICLE_PROFILES.i4_cross;
  assert.ok(Math.abs(profile.primaryRatio * profile.finalDrive - 67 / 16) < 1e-12);
  const fourth = gearSpeed(config, profile, 4), sixth = gearSpeed(config, profile, 6);
  assert.ok(fourth > 245 && fourth < 260, `fourth ${fourth}`);
  assert.ok(sixth > 310 && sixth < 325, `sixth ${sixth}`);
});

test('LFA counter reduction and Aventador drop gear cannot be silently omitted', () => {
  assert.equal(VEHICLE_PROFILES.v10.primaryRatio, 1.259);
  assert.equal(VEHICLE_PROFILES.v10.finalDrive, 3.417);
  assert.equal(VEHICLE_PROFILES.v12.primaryRatio, 47 / 38);
  assert.equal(VEHICLE_PROFILES.v12.finalDrive, 43 / 15);
});

test('S2000 AP1 retains Honda primary reduction as well as the rear axle', () => {
  const config = ENGINE_CONFIGS.honda_f20c, profile = VEHICLE_PROFILES.honda_f20c;
  assert.equal(profile.primaryRatio, 1.160);
  assert.equal(profile.finalDrive, 4.100);
  // Honda 1999 AP1: 225/50R16 rear tyre and 3.133 first, including 1.160 primary.
  // With the documented 0.98 rolling-radius estimate this is 70.4 km/h at 9000.
  assert.ok(Math.abs(gearSpeed(config, profile, 1, 9000) - 70.4) < 0.1);
});

test('2019 Mustang GT Performance Package pairs 6MT with the 3.73 axle', () => {
  const config = ENGINE_CONFIGS.v8_cross, profile = VEHICLE_PROFILES.v8_cross;
  assert.equal(profile.transmissionKind, 'manual');
  assert.equal(profile.gearboxModel, 'MT82-D4');
  assert.equal(profile.finalDrive, 3.73);
  assert.equal(profile.gearRatios[4], 1);
  assert.equal(profile.gearRatios[6], 0.622);
  assert.ok(Math.abs(profile.curbMass - 1697.8) < 0.01);
  assert.ok(Math.abs(gearSpeed(config, profile, 1, 7500) - 80.6) < 0.1);
  // Sixth is a tall overdrive. This is kinematic speed, not attainable top speed.
  assert.ok(Math.abs(gearSpeed(config, profile, 6, 7500) - 419.6) < 0.1);
});

test('OEM first-to-second drops vary by car instead of sharing a 61 percent target', () => {
  // Targets independently calculated from the cited OEM first/second ratios
  // in docs/gearing-audit.md, assuming the same road speed after engagement.
  const expected = { i4_cross: 8371, i6: 6167, v6: 5673, rotary_2: 6037 };
  for (const [id, rpmAfter] of Object.entries(expected)) {
    const gears = VEHICLE_PROFILES[id].gearRatios;
    assert.ok(Math.abs(10000 * gears[2] / gears[1] - rpmAfter) < 1, id);
  }
  assert.equal(VEHICLE_PROFILES.boxer4.gearRatios[2], 2.235, 'US 2016 STI, not a JDM ratio');
});

test('derived or unverified reverse ratios are not labelled as published tooth data', () => {
  assert.equal(VEHICLE_PROFILES.w16.reverseGearingKind, 'assumed-first-gear');
  assert.equal(VEHICLE_PROFILES.v8_cross.reverseGearingKind, 'carry-over-unverified');
  assert.equal(VEHICLE_PROFILES.rotary_2.reverseGearingKind, 'same-generation-reference');
});

test('458, Aventador and Chiron have all seven published forward gears', () => {
  for (const id of ['v8_flat', 'v12', 'w16']) {
    assert.equal(VEHICLE_PROFILES[id].gearCount, 7);
    assert.ok(VEHICLE_PROFILES[id].gearRatios[7] > 0);
  }
  assert.equal(VEHICLE_PROFILES.v8_flat.finalDrive, 5.143);
});

test('Chiron equivalent reductions reproduce the manufacturer per-gear speeds', () => {
  const profile = VEHICLE_PROFILES.w16, config = ENGINE_CONFIGS.w16;
  assert.equal(profile.gearingKind, 'derived-from-published-speeds');
  for (const [i, speed] of [90, 150, 200, 260, 320, 390, 420].entries()) {
    assert.ok(Math.abs(gearSpeed(config, profile, i + 1, 6700) - speed) < 0.001);
  }
});

test('the seven-cylinder radial is R2800, with crank RPM and an explicitly experimental road load', () => {
  const config = ENGINE_CONFIGS.radial_7;
  assert.equal(config.cylinders, 7);
  assert.equal(config.defaultDisplacement, 2800);
  assert.equal(config.ratedPowerRPM, 3700);
  assert.ok(config.representativeModel.includes('R2800'));
  assert.equal(config.curveKind, 'estimate');
  assert.equal(VEHICLE_PROFILES.radial_7.referenceKind, 'experimental');
});

test('vehicle loads include driver mass and forward ratios decrease in every preset', () => {
  for (const profile of Object.values(VEHICLE_PROFILES)) {
    assert.equal(profile.mass, profile.curbMass + 75);
    assert.ok(profile.primaryRatio > 0 && profile.finalDrive > 0);
    assert.ok(profile.tireRadius > 0.28 && profile.tireRadius < 0.40);
    for (let gear = 2; gear <= profile.gearCount; gear++) {
      assert.ok(profile.gearRatios[gear] < profile.gearRatios[gear - 1]);
    }
  }
});

test('crossplane and flatplane V8 bank pulses retain different spacing', () => {
  const intervals = id => {
    const config = ENGINE_CONFIGS[id];
    const angles = config.firingAngles.filter((_, index) => config.exhaustBanks[index] === 0).sort((a, b) => a - b);
    return angles.map((angle, index) => ((angles[(index + 1) % angles.length] - angle) + 720) % 720);
  };
  assert.deepEqual(intervals('v8_flat'), [180, 180, 180, 180]);
  assert.ok(new Set(intervals('v8_cross')).size > 1);
});

test('OEM interpolation retains published power and torque peaks between anchors', () => {
  for (const [id, config] of Object.entries(ENGINE_CONFIGS)) {
    const engine = new EngineModel(id, 'oem');
    for (let rpm = 500; rpm <= engine.redlineRPM; rpm += 7) {
      const torque = engine.steadyTorqueAtRPM(rpm);
      assert.ok(torque <= config.ratedTorqueNm * 1.001, `${id}: invented torque peak at ${rpm}`);
      assert.ok(kw(rpm, torque) <= config.ratedPowerKW * 1.001, `${id}: invented power peak at ${rpm}`);
    }
    assert.ok(Math.abs(engine.steadyTorqueAtRPM(config.ratedTorqueRPM) - config.ratedTorqueNm) < 0.001, id);
    assert.ok(Math.abs(kw(config.ratedPowerRPM, engine.steadyTorqueAtRPM(config.ratedPowerRPM)) - config.ratedPowerKW) < 0.001, id);
  }
});
