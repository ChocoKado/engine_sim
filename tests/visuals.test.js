import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGaugeNeedle, radialKinematics, radialFiringAngles, wrapDegrees, cylinderViewLayout } from '../src/visuals/MechanicalKinematics.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { EngineRenderer } from '../src/visuals/EngineRenderer.js';

test('tachometer response settles without oscillation or runaway at low frame rates', () => {
  for (const fps of [15, 24, 30, 60, 144]) {
    let position = 10000;
    let velocity = 0;
    let maxError = 0;
    for (let frame = 0; frame < fps; frame++) {
      const next = advanceGaugeNeedle(position, velocity, 6140, 1 / fps);
      position = next.position;
      velocity = next.velocity;
      maxError = Math.max(maxError, Math.abs(position - 6140));
      assert.ok(Number.isFinite(position) && Number.isFinite(velocity));
      assert.ok(position > 6000 && position <= 10000, `${fps} FPS needle: ${position}`);
    }
    assert.ok(Math.abs(position - 6140) < 0.01);
    assert.ok(maxError < 3860);
  }
});

test('tachometer evolution is independent of how the same elapsed time is split', () => {
  const direct = advanceGaugeNeedle(1100, 0, 14000, 0.2);
  let split = { position: 1100, velocity: 0 };
  for (let step = 0; step < 12; step++) {
    split = advanceGaugeNeedle(split.position, split.velocity, 14000, 1 / 60);
  }
  assert.ok(Math.abs(split.position - direct.position) < 1e-8);
  assert.ok(Math.abs(split.velocity - direct.velocity) < 1e-8);
});

test('radial master and articulated rods remain rigid throughout two revolutions', () => {
  for (let angle = 0; angle <= 720; angle += 2) {
    for (const cylinder of radialKinematics(angle)) {
      const length = Math.hypot(cylinder.wristX - cylinder.jointX, cylinder.wristY - cylinder.jointY);
      assert.ok(Math.abs(length - cylinder.rodLength) < 1e-9, `${angle}°, cylinder ${cylinder.index}`);
      assert.ok(Math.abs(cylinder.wristX * cylinder.uy - cylinder.wristY * cylinder.ux) < 1e-9);
      assert.ok(cylinder.dist > 0);
    }
  }
});

test('radial combustion occurs near actual piston TDC in 1-3-5-7-2-4-6 order', () => {
  const timing = radialFiringAngles();
  const ordered = timing.map((angle, index) => ({ angle: wrapDegrees(angle - 360), index: index + 1 }))
    .sort((a, b) => a.angle - b.angle).map(item => item.index);
  assert.deepEqual(ordered, [1, 3, 5, 7, 2, 4, 6]);
  timing.forEach((angle, index) => {
    const atTdc = radialKinematics(angle)[index].dist;
    assert.ok(atTdc >= radialKinematics(angle - 3)[index].dist);
    assert.ok(atTdc >= radialKinematics(angle + 3)[index].dist);
  });
});

test('V8, V10, V12 and W16 overview shows every cylinder in non-overlapping bank cells', () => {
  for (const id of ['v8_cross', 'v8_flat', 'v10', 'v12', 'w16']) {
    const config = ENGINE_CONFIGS[id];
    const cylinders = config.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
    for (const [width, height] of [[780, 380], [320, 130], [180, 110], [390, 600]]) {
      const layout = cylinderViewLayout(cylinders, config, width, height);
      assert.equal(layout.length, config.cylinders, id);
      assert.equal(new Set(layout.map(cell => cell.cylinder)).size, config.cylinders);
      assert.equal(new Set(layout.map(cell => cell.bankIndex)).size, config.layout === 'w' ? 4 : 2);
      for (const cell of layout) {
        const { bounds } = cell;
        assert.ok(bounds.left >= 0 && bounds.top >= 0, `${id} ${width}×${height}`);
        assert.ok(bounds.left + bounds.width <= width && bounds.top + bounds.height <= height);
        assert.ok(cell.scale > 0);
        if (config.exhaustBanks) assert.equal(cell.bankIndex, config.exhaustBanks[cell.cylinder.index]);
      }
      for (let a = 0; a < layout.length; a++) for (let b = a + 1; b < layout.length; b++) {
        const first = layout[a].bounds, second = layout[b].bounds;
        const intersects = first.left < second.left + second.width && first.left + first.width > second.left
          && first.top < second.top + second.height && first.top + first.height > second.top;
        assert.equal(intersects, false, `${id} cylinders ${a}/${b} collide`);
      }
    }
  }
});

test('W16 uses four rows on tall views and a two-by-two bank layout on wide views', () => {
  const config = ENGINE_CONFIGS.w16;
  const cylinders = config.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
  const tall = cylinderViewLayout(cylinders, config, 390, 600);
  const wide = cylinderViewLayout(cylinders, config, 780, 380);
  assert.equal(new Set(tall.map(cell => cell.group.top)).size, 4);
  assert.equal(new Set(wide.map(cell => cell.group.top)).size, 2);
  assert.equal(new Set(wide.map(cell => cell.group.left)).size, 2);
});

test('focused view preserves the chosen cylinder and magnifies it above overview scale', () => {
  const config = ENGINE_CONFIGS.w16;
  const cylinders = config.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
  const overview = cylinderViewLayout(cylinders, config, 390, 210);
  const focused = cylinderViewLayout(cylinders, config, 390, 210, { focusedIndex: 15 });
  assert.equal(focused.length, 1);
  assert.equal(focused[0].cylinder, cylinders[15]);
  assert.ok(focused[0].scale > overview.find(cell => cell.cylinder.index === 15).scale);
});

test('renderer passes all sixteen actual states to the overview drawing pass', () => {
  const renderer = Object.create(EngineRenderer.prototype);
  const noop = () => {};
  Object.assign(renderer, { width: 780, height: 380, animationSpeed: 1, cleanMode: true, viewMode: 'multi',
    ctx: { createLinearGradient: () => ({ addColorStop: noop }), fillRect: noop, save: noop,
      restore: noop, translate: noop, rotate: noop }, drawTechnicalGrid: noop, renderParticles: noop });
  const states = ENGINE_CONFIGS.w16.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
  const drawn = [];
  renderer.drawSingleCylinder = (_ctx, cylinder) => drawn.push(cylinder);
  renderer.render({ rpm: 1200, crankAngle: 100, config: ENGINE_CONFIGS.w16, cylinderStates: states }, {});
  assert.equal(drawn.length, 16);
  assert.equal(new Set(drawn).size, 16);
  assert.ok(states.every(state => drawn.includes(state)));
});
