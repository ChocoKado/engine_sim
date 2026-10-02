import test from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/app.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { PerformancePanel } from '../src/controls/PerformancePanel.js';

// Exercise the panel's real event handlers and App reset without a browser.
// The drawing nodes are absent; physics, timing, history and setup capture run.
function fixture(id, mode) {
  const elements = new Map(['perf-arm', 'perf-reset', 'perf-stop'].map(name => [name, {
    addEventListener(type, handler) { this[type] = handler; },
  }]));
  const savedDocument = globalThis.document;
  globalThis.document = { getElementById: name => elements.get(name) || null };
  const engine = new EngineModel(id, 'oem');
  const drive = new Drivetrain(engine);
  const app = Object.create(App.prototype);
  Object.assign(app, { engine, drivetrain: drive, isEngineRunning: true,
    input: { manualThrottleSlider: 0, releaseHeldControls() {} } });
  engine.setRunning(true);
  drive.setMode(mode);
  mode === 'at' ? drive.setAtSelector('D') : drive.setAmtGear(1);
  let stored = '[]';
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const panel = new PerformancePanel(engine, drive, () => app.resetPerformanceVehicle(), storage);
  const click = name => elements.get(name).click();
  const tick = (throttle, brake = 0) => {
    panel.beforeStep();
    // AMT deliberately needs the driver to shift; never silently turn it into AT.
    if (mode === 'amt' && throttle > 0.02 && engine.rpm > engine.redlineRPM * 0.96
      && drive.shiftState === 'locked' && drive.currentGear < drive.maxGear) drive.shiftUp();
    drive.update(1 / 30, throttle, panel.brakeForLaunch(throttle, brake));
    assert.ok(Number.isFinite(engine.rpm) && engine.rpm > 0, `${id}/${mode}: combustion cannot become stuck at zero RPM`);
    assert.ok(Number.isFinite(drive.speedKmh), `${id}/${mode}: finite road speed`);
  };
  const wait = (seconds, throttle, brake = 0) => {
    for (let frame = 0; frame < seconds * 30; frame++) tick(throttle, brake);
  };
  const firstRun = complete => {
    click('perf-arm');
    for (let frame = 0; frame < 121 * 30; frame++) {
      tick(1);
      if (!complete && panel.meter.metrics.zeroTo100 !== null) { click('perf-stop'); break; }
      if (panel.meter.state === 'complete') break;
    }
    panel.update();
    assert.equal(panel.meter.state, 'complete');
    assert.ok(panel.meter.result.metrics.zeroTo100 > 0);
    assert.equal(panel.history.length, 1);
    assert.equal(panel.history[0].reason, complete ? 'complete' : 'stopped');
  };
  return { engine, drive, panel, click, tick, wait, firstRun,
    restore() { globalThis.document = savedDocument; } };
}

const settingChanges = [
  ['redline', e => e.setRedlineRPM(e.config.minRedlineRPM)],
  ['ECU mode', e => e.setECUMode('hard')],
  ['limiter Hz', e => e.setLimiterHz(32)],
  ['limiter depth', e => e.setLimiterDepth(1)],
];

for (const id of Object.keys(ENGINE_CONFIGS)) {
  for (const mode of ['at', 'amt']) {
    test(`${id}/${mode}: saved acceleration test can restart after each limiter setting changes`, () => {
      const f = fixture(id, mode);
      try {
        f.firstRun(false);
        const firstSetup = structuredClone(f.panel.history[0].setup);
        for (const [name, change] of settingChanges) {
          change(f.engine);
          f.click('perf-reset');
          assert.equal(f.panel.meter.state, 'armed', name);
          assert.equal(f.drive.currentGear, 1, name);
          f.wait(1, 0);
          assert.equal(f.drive.speedKmh, 0, `${name}: ready brake holds vehicle`);
          assert.ok(f.engine.rpm > f.engine.idleRPM * 0.8, `${name}: idle survives ready brake`);
          assert.equal(f.engine.isRevLimiting, false, `${name}: old limiter cannot remain active at idle`);
          f.wait(3, 1);
          assert.equal(f.panel.meter.state, 'running', name);
          assert.ok(f.drive.speedKmh > 10, `${name}: throttle drives the vehicle again`);
        }
        assert.deepEqual(f.panel.history[0].setup, firstSetup, 'original saved settings remain immutable');
        assert.equal(f.panel.meter.setup.redlineRPM, f.engine.redlineRPM);
        assert.equal(f.panel.meter.setup.ecu, 'hard');
        assert.equal(f.panel.meter.setup.limiterHz, 32);
        assert.equal(f.panel.meter.setup.limiterDepth, 1);
      } finally { f.restore(); }
    });
  }
}

for (const id of ['rotary_2', 'i4_cross', 'honda_k20a', 'w16']) {
  for (const mode of ['at', 'amt']) {
    test(`${id}/${mode}: fully completed run, redline/ECU change and direct braking leave a usable engine`, () => {
      const f = fixture(id, mode);
      try {
        f.firstRun(true);
        for (const [, change] of settingChanges) change(f.engine);
        f.wait(20, 0, 1);
        assert.equal(f.drive.speedKmh, 0);
        assert.ok(f.engine.rpm > f.engine.idleRPM * 0.8);
        // AT selects its launch ratio itself. AMT keeps the driver's choice;
        // verify it can move in that ratio, then explicitly choose first.
        f.wait(3, 1);
        assert.ok(f.drive.speedKmh > 0, 'no stalled crank or permanent torque cut after braking');
        f.wait(10, 0, 1);
        assert.equal(f.drive.speedKmh, 0);
        if (mode === 'amt') assert.equal(f.drive.setAmtGear(1), true);
        f.click('perf-arm');
        assert.equal(f.panel.meter.state, 'armed');
        f.wait(1, 0);
        f.wait(3, 1);
        assert.equal(f.panel.meter.state, 'running');
        assert.ok(f.drive.speedKmh > 10);
        f.click('perf-reset');
        f.wait(1, 0);
        f.wait(3, 1);
        assert.equal(f.panel.meter.state, 'running', 'reset remains usable after direct stop and an active second run');
      } finally { f.restore(); }
    });
  }
}

// CP4's minimum-redline/hard-cut pair is already covered above. Add the other
// three pairs for each transmission after a genuinely completed standing run.
for (const mode of ['at', 'amt']) {
  for (const [ecu, redlineEnd] of [['sequential', 'min'], ['hard', 'max'], ['sequential', 'max']]) {
    test(`CP4/${mode}/${ecu}/${redlineEnd} redline: completed test, settings change and second launch stay operable`, () => {
      const f = fixture('i4_cross', mode);
      try {
        f.firstRun(true);
        assert.ok(f.panel.meter.metrics.hundredTo200 > 0);
        assert.ok(f.panel.meter.metrics.quarterMile > 0);
        assert.ok(f.drive.speedKmh > 200, 'change tuning while the completed run still has road load');
        const firstSetup = structuredClone(f.panel.history[0].setup);
        f.engine.setRedlineRPM(f.engine.config[`${redlineEnd}RedlineRPM`]);
        f.engine.setECUMode(ecu);
        f.engine.setLimiterHz(ecu === 'hard' ? 32 : 8);
        f.engine.setLimiterDepth(ecu === 'hard' ? 1 : 0.3);
        f.wait(2, 1);
        f.wait(20, 0, 1);
        assert.equal(f.drive.speedKmh, 0);
        assert.equal(f.engine.isStalled, false);
        assert.equal(f.engine.isIgnitionOn, true);
        assert.ok(f.engine.rpm > f.engine.idleRPM * 0.8);
        assert.equal(f.engine.revLimiterCutAmount, 0, 'no old cut survives below the new control band');
        const retainedGear = f.drive.currentGear;
        f.wait(3, 1);
        assert.ok(f.drive.speedKmh > 0, 'even a retained high AMT ratio cannot permanently stop combustion');
        if (mode === 'amt') assert.equal(f.drive.currentGear, retainedGear, 'AMT keeps driver gear selection');
        f.wait(10, 0, 1);
        assert.equal(f.drive.speedKmh, 0);
        if (mode === 'amt') assert.equal(f.drive.setAmtGear(1), true);
        f.click('perf-arm');
        f.wait(1, 0);
        f.wait(3, 1);
        assert.equal(f.panel.meter.state, 'running');
        assert.ok(f.drive.speedKmh > 10);
        assert.equal(f.panel.meter.setup.redlineRPM, f.engine.config[`${redlineEnd}RedlineRPM`]);
        assert.equal(f.panel.meter.setup.ecu, ecu);
        f.click('perf-reset');
        assert.equal(f.drive.currentGear, 1);
        f.wait(1, 0);
        f.wait(3, 1);
        assert.equal(f.panel.meter.state, 'running');
        assert.ok(f.drive.speedKmh > 10);
        assert.deepEqual(f.panel.history[0].setup, firstSetup);
      } finally { f.restore(); }
    });
  }
}

for (const mode of ['at', 'amt']) {
  test(`${mode}: reset during a cut/synchronizing shift clears old clutch and limiter state`, () => {
    const f = fixture('i4_cross', mode);
    try {
      f.engine.rpm = f.engine.redlineRPM * 0.9;
      f.engine.manifoldThrottle = 1;
      f.drive.speedKmh = f.drive.calcSpeedFromRPM(1, f.engine.rpm);
      f.drive.shiftState = 'locked';
      assert.equal(f.drive.shiftUp(), true);
      f.tick(1);
      assert.equal(f.drive.shiftState, 'shifting');
      f.engine.setRedlineRPM(f.engine.config.minRedlineRPM);
      f.engine.setECUMode('sequential');
      f.engine.setLimiterHz(8);
      f.engine.setLimiterDepth(0.3);
      f.click('perf-reset');
      f.wait(1, 0);
      assert.equal(f.engine.torqueScale, 1);
      assert.equal(f.engine.ignitionCut, false);
      assert.equal(f.engine.revLimiterCutAmount, 0);
      f.wait(3, 1);
      assert.equal(f.panel.meter.state, 'running');
      assert.ok(f.drive.speedKmh > 10);
    } finally { f.restore(); }
  });
}
