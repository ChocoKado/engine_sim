import test from 'node:test';
import assert from 'node:assert/strict';
import { GaugeRenderer } from '../src/visuals/GaugeRenderer.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { Drivetrain } from '../src/physics/Drivetrain.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';

const previousWindow = globalThis.window;
test.before(() => { globalThis.window = { devicePixelRatio: 2, addEventListener() {} }; });
test.after(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

function canvas(width, height) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return (...args) => {
        for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg),
          `${String(key)} must never receive invalid canvas coordinates`);
        calls.push([key, ...args]);
      };
    }
  });
  const rect = { width, height };
  return { style: {}, width: 0, height: 0, rect, ctx, calls,
    parentElement: { getBoundingClientRect: () => rect }, getContext: () => ctx };
}

function cockpit() {
  const tacho = canvas(300, 240), exhaust = canvas(300, 100), speed = canvas(200, 260);
  return { tacho, exhaust, speed, gauge: new GaugeRenderer(tacho, exhaust, speed) };
}

test('dual dials resize independently for their own wrapper and display pixel ratio', () => {
  const { tacho, speed, gauge } = cockpit();
  assert.equal(gauge.tachoSize, 240);
  assert.equal(gauge.speedSize, 200);
  assert.equal(tacho.width, 480);
  assert.equal(speed.width, 400);
  assert.equal(speed.style.height, '200px');
  speed.rect.width = 170;
  speed.rect.height = 160;
  gauge.resize();
  assert.equal(tacho.width, 480, 'resizing the speed wrapper cannot squeeze the RPM dial');
  assert.equal(speed.width, 320);
  const transformCalls = speed.calls.filter(([method]) => method === 'resetTransform' || method === 'scale');
  assert.deepEqual(transformCalls, [['resetTransform'], ['scale', 2, 2], ['resetTransform'], ['scale', 2, 2]],
    'each resize resets the transform rather than accumulating high-DPI scaling');
});

test('the speed scale covers every preset forward-gear redline speed and follows final-drive changes', () => {
  const { gauge } = cockpit();
  for (const id of Object.keys(ENGINE_CONFIGS)) {
    if (ENGINE_CONFIGS[id].layout === 'turbojet') continue; // Static thrust bench has no road-speed dial.
    const engine = new EngineModel(id, 'oem', () => 0.5);
    const drive = new Drivetrain(engine);
    const topSpeed = () => Math.max(...Object.keys(drive.gearRatios).map(Number)
      .filter(gear => gear > 0).map(gear => drive.calcSpeedFromRPM(gear, engine.redlineRPM)));
    for (const scale of [1, 0.75, 1.25]) {
      drive.setFinalDriveScale(scale);
      gauge.renderSpeedometer(engine, drive);
      assert.ok(gauge.speedMaxKmh >= 240, `${id}: the speedometer must retain a usable road-speed range`);
      assert.ok(gauge.speedMaxKmh >= topSpeed(), `${id}: all forward gears must fit the dial`);
      const dial = gauge.speedScale(engine, drive);
      assert.equal(dial.maximum % dial.majorStep, 0, 'major labels must terminate exactly at the range endpoint');
    }
  }
});

test('speed needle reads real rolling and reverse road speed while the ignition is off', () => {
  const { gauge, speed } = cockpit();
  const engine = new EngineModel('i4_cross', 'oem', () => 0.5);
  const drive = new Drivetrain(engine);
  gauge.render(engine, drive, 1 / 60);
  drive.speedKmh = 120;
  for (let frame = 0; frame < 60; frame++) gauge.render(engine, drive, 1 / 60);
  assert.ok(Math.abs(gauge.needleSpeed - 120) < 0.01);
  assert.equal(gauge.needleRPM, 0, 'the stopped crank cannot be confused with the moving road speed');
  drive.speedKmh = -35;
  for (let frame = 0; frame < 60; frame++) gauge.render(engine, drive, 1 / 60);
  assert.ok(Math.abs(gauge.needleSpeed - 35) < 0.01, 'reverse remains a positive speed magnitude on an analog dial');
  assert.ok(!speed.calls.some(([method, text]) => method === 'fillText' && /^\d+\s*km\/h$/.test(text)),
    'live speed digits belong to the HUD and cannot be painted across the needle hub');
});

test('speed needle settling is stable across display frame rates and the old two-canvas constructor remains usable', () => {
  const engine = new EngineModel('i4_flat', 'oem', () => 0.5);
  const drive = new Drivetrain(engine);
  const positions = [];
  for (const fps of [20, 60, 144]) {
    const { gauge } = cockpit();
    drive.speedKmh = 0;
    gauge.renderSpeedometer(engine, drive, 0);
    drive.speedKmh = 160;
    for (let frame = 0; frame < fps; frame++) gauge.renderSpeedometer(engine, drive, 1 / fps);
    positions.push(gauge.needleSpeed);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < 0.001,
    'the same elapsed time must yield the same physical needle position');
  assert.ok(positions.every(position => Math.abs(position - 160) < 0.01));
  const legacy = new GaugeRenderer(canvas(240, 240), canvas(300, 100));
  assert.equal(legacy.speedCtx, null);
  assert.doesNotThrow(() => legacy.render(engine, drive));
});

test('static turbojet dials use N1 percent and thrust kN, including coasting and switching back to a road engine', () => {
  const { gauge, tacho, speed } = cockpit();
  const engine = { config: ENGINE_CONFIGS.turbojet, isIgnitionOn: false, rpm: 17000,
    corePercent: 63, thrustN: 12340 };
  const drive = { speedKmh: 999 };
  gauge.renderTachometer(engine, drive);
  gauge.renderSpeedometer(engine, drive);
  assert.equal(gauge.needleRPM, 63, 'ignition-off rotor coast still appears on N1');
  assert.equal(gauge.needleSpeed, 12.34, 'road speed cannot masquerade as thrust');
  assert.deepEqual(gauge.speedScale(engine, drive), { maximum: 24, majorStep: 4 });
  assert.ok(tacho.calls.some(call => call[0] === 'fillText' && call[1] === 'N1'));
  assert.ok(tacho.calls.some(call => call[0] === 'fillText' && call[1] === '%'));
  assert.ok(speed.calls.some(call => call[0] === 'fillText' && call[1] === 'THRUST'));
  assert.ok(speed.calls.some(call => call[0] === 'fillText' && call[1] === 'kN'));
  const road = new EngineModel('i4_cross'); road.setRunning(true); road.rpm = 4500;
  gauge.renderTachometer(road, { speedKmh: 80 }, 0);
  gauge.renderSpeedometer(road, { speedKmh: 80 }, 0);
  assert.equal(gauge.needleRPM, 4500, 'changing units cannot leave a percent value on an RPM dial');
  assert.equal(gauge.needleSpeed, 80);
});

test('turboshaft road tachometer reads reduced output RPM and retains coasting independently of its N1 core', () => {
  const { gauge, tacho } = cockpit();
  const engine = { config:ENGINE_CONFIGS.gas_turbine,redlineRPM:6016,isIgnitionOn:false,
    rpm:1600,outputShaftRPM:1600,coreRPM:50970,corePercent:100 };
  gauge.renderTachometer(engine,{},0);
  assert.equal(gauge.needleRPM,1600);
  assert.ok(tacho.calls.some(call=>call[0]==='fillText'&&call[1]==='OUTPUT'));
});
