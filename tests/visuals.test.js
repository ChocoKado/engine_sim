import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceGaugeNeedle, radialKinematics, radialFiringAngles, radialCyclePhase, radialPistonTravel,
  wrapDegrees, cylinderViewLayout, engineAssemblyLayout, pistonKinematics, pistonCyclePhase, cylinderBankAngle, rotaryCycleKinematics,
  rotaryHousingPoint, rotaryChamberState } from '../src/visuals/MechanicalKinematics.js';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { EngineRenderer } from '../src/visuals/EngineRenderer.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { camValveLift } from '../src/physics/CamControl.js';
import { rotaryRotorFacePoint, rotarySparkPlugMounts } from '../src/physics/RotaryMechanics.js';

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
    sparkParticles: [],
    ctx: { createLinearGradient: () => ({ addColorStop: noop }), fillRect: noop, save: noop,
      restore: noop, translate: noop, rotate: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop,
      roundRect: noop, fill: noop },
    drawTechnicalGrid: noop, renderParticles: noop });
  const states = ENGINE_CONFIGS.w16.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
  const drawn = [];
  renderer.drawSingleCylinder = (_ctx, cylinder) => drawn.push(cylinder);
  renderer.render({ rpm: 1200, crankAngle: 100, config: ENGINE_CONFIGS.w16, cylinderStates: states }, {});
  assert.equal(drawn.length, 16);
  assert.equal(new Set(drawn).size, 16);
  assert.ok(states.every(state => drawn.includes(state)));
});

test('pistons, rigid rods and high-cam valves retain clearance through the complete cycle at every scale', () => {
  for (const scale of [1.3, 0.3, 0.04]) for (let phase = 0; phase < 720; phase += 0.5) {
    const g = pistonKinematics(phase, 3.5, scale);
    assert.ok(Math.abs(Math.hypot(g.wristPinX - g.crankPinX, g.wristPinY - g.crankPinY) - g.rodLength) < 1e-9);
    assert.ok(g.pistonPos >= -1e-9 && g.pistonPos <= 1 + 1e-9);
    for (const blend of [0, 0.5, 1]) {
      const valves = camValveLift(phase, blend);
      const lowestValve = g.cylinderTopY + Math.max(valves.intake, valves.exhaust) * 10 * scale;
      assert.ok(g.crownY - lowestValve > 3 * scale, `no overlap-TDC collision at ${phase}°, blend ${blend}`);
    }
  }
  assert.equal(pistonKinematics(360).pistonPos, 0);
  assert.equal(pistonKinematics(540).pistonPos, 1);
});

test('W16 four rows have correct 15° narrow angles and 90° separation of the two groups', () => {
  const angles = [0, 1, 2, 3].map(bank => cylinderBankAngle(bank, ENGINE_CONFIGS.w16));
  assert.deepEqual(angles, [-52.5, -37.5, 37.5, 52.5]);
  assert.equal(angles[1] - angles[0], 15);
  assert.equal(angles[3] - angles[2], 15);
  assert.equal((angles[2] + angles[3]) / 2 - (angles[0] + angles[1]) / 2, 90);
});

test('assembled cutaways retain every cylinder around one continuous shaft inside the viewport', () => {
  for (const config of Object.values(ENGINE_CONFIGS).filter(c => ['inline', 'v', 'w'].includes(c.layout))) {
    const cylinders = config.firingAngles.map((firingOffset, index) => ({ index, firingOffset }));
    for (const [width, height] of [[780, 380], [320, 110], [180, 110], [390, 600]]) {
      const cells = engineAssemblyLayout(cylinders, config, width, height);
      assert.equal(cells.length, config.cylinders);
      assert.equal(new Set(cells.map(c => c.cylinder.index)).size, config.cylinders);
      assert.equal(new Set(cells.map(c => c.bankIndex)).size, config.layout === 'w' ? 4 : config.layout === 'v' ? 2 : 1);
      for (const cell of cells) {
        assert.ok(cell.bounds.left >= 0 && cell.bounds.top >= 0);
        assert.ok(cell.bounds.left + cell.bounds.width <= width + 1e-9);
        assert.ok(cell.bounds.top + cell.bounds.height <= height + 1e-9);
        // All station journals lie on one receding shaft, even narrow-angle
        // staggered W rows. The old bank cards had independent shaft centres.
        const slope = -(height < 180 ? 8 : 18) / 105;
        const first = cells[0].journal;
        assert.ok(Math.abs(cell.journal.y - first.y - slope * (cell.journal.x - first.x)) < 1e-9);
      }
    }
  }
});

test('radial phase and normalized piston travel share the exact articulated geometry', () => {
  const timing = radialFiringAngles(7), travel = radialPistonTravel(7);
  timing.forEach((tdc, index) => {
    assert.equal(radialCyclePhase(tdc, index, 7), 360);
    const g = radialKinematics(tdc)[index];
    assert.ok(travel[index].max - g.dist < 1e-7);
    assert.ok(travel[index].max > travel[index].min);
  });
});

test('rotary chamber colour follows real volume expansion/compression and combustion minimum', () => {
  const area = (shaft, face) => {
    const geometry = rotaryCycleKinematics(shaft), { apexes } = geometry;
    const start = apexes[face];
    let previous = start, sum = 0;
    for (let i = 1; i <= 120; i++) {
      const next = rotaryHousingPoint(start.t + i / 120 * Math.PI * 2 / 3);
      sum += previous.x * next.y - previous.y * next.x; previous = next;
    }
    for (let i = 119; i >= 0; i--) {
      const next = rotaryRotorFacePoint(geometry, face, i / 120);
      sum += previous.x * next.y - previous.y * next.x; previous = next;
    }
    return sum * 0.5;
  };
  for (let face = 0; face < 3; face++) for (let stage = 0; stage < 4; stage++) {
    const start = stage * 270 - face * 360;
    const values = [0, 67.5, 135, 202.5, 270].map(offset => area(start + offset, face));
    for (let i = 1; i < values.length; i++) {
      assert.ok(stage % 2 === 0 ? values[i] > values[i - 1] : values[i] < values[i - 1]);
    }
    const state = rotaryChamberState(start + 135, face);
    assert.equal(state.stage, stage);
    assert.ok(Math.abs(state.volume - 0.55) < 1e-9);
  }
  assert.equal(rotaryChamberState(540).isIgnitionPhase, true);
  assert.equal(rotaryChamberState(540).volume, 0.1);
});

test('convex rotary faces preserve apex contacts and stay inside the housing for the full shaft cycle', () => {
  // The R70/e11 epitrochoid is star shaped. Invert its polar angle to find the
  // exact housing radius on the ray through each sampled rotor-face point.
  const clearance = point => {
    const polar = Math.atan2(point.y, point.x);
    let t = polar;
    for (let i = 0; i < 8; i++) {
      const sin = Math.sin(2*t), cos = Math.cos(2*t);
      const error = t + Math.atan2(11*sin,70+11*cos) - polar;
      const derivative = 1 + (1540*cos+242)/(5021+1540*cos);
      t -= error/derivative;
    }
    const shell = rotaryHousingPoint(t);
    return Math.hypot(shell.x,shell.y) - Math.hypot(point.x,point.y);
  };
  for (let shaft = 0; shaft <= 1080; shaft += 1) {
    const geometry = rotaryCycleKinematics(shaft);
    for (let face = 0; face < 3; face++) {
      assert.deepEqual(rotaryRotorFacePoint(geometry,face,0), {
        x: geometry.apexes[face].x, y: geometry.apexes[face].y });
      for (let i = 1; i <= 40; i++) {
        const p = rotaryRotorFacePoint(geometry,face,i/40);
        assert.ok(clearance(p) >= -1e-8, `${shaft}°, face ${face}, ${i}/40 penetrates housing`);
      }
      const a = geometry.apexes[face], b = geometry.apexes[(face+1)%3];
      const mid = rotaryRotorFacePoint(geometry,face,0.5);
      assert.ok(Math.abs(Math.hypot(mid.x-(a.x+b.x)/2,mid.y-(a.y+b.y)/2)-10)<1e-9);
    }
  }
});

test('fixed rotary plug electrodes retain clearance from curved rotor faces and apex seals for 1080 degrees', () => {
  const plugs = rotarySparkPlugMounts();
  plugs.forEach((plug,index) => {
    assert.ok(Math.abs(plug.wall.x - [-13,13][index]) < 1e-9);
    assert.ok(plug.wall.y < -59);
    assert.ok(Math.abs(Math.hypot(plug.tip.x-plug.wall.x,plug.tip.y-plug.wall.y)-0.8)<1e-9);
    assert.ok(plug.normal.y < 0, 'plugs extend outward from the fixed upper housing');
  });
  let minimum = Infinity;
  for (let shaft = 0; shaft <= 1080; shaft++) {
    const geometry = rotaryCycleKinematics(shaft);
    for (let face = 0; face < 3; face++) for (let i = 0; i <= 40; i++) {
      const point = rotaryRotorFacePoint(geometry,face,i/40);
      for (const { tip,rotation } of plugs) {
        const dx=point.x-tip.x, dy=point.y-tip.y;
        // Independent distance to the rendered electrode rectangle in its
        // local frame (x -1.5..1.5, y -1..0), not only to its centre point.
        const x=dx*Math.cos(rotation)+dy*Math.sin(rotation);
        const y=-dx*Math.sin(rotation)+dy*Math.cos(rotation);
        const clearance=Math.hypot(Math.max(Math.abs(x)-1.5,0),Math.max(y,-1-y,0));
        minimum=Math.min(minimum,clearance);
        assert.ok(clearance > 0.7, `${shaft}°, face ${face}: rotor meets fixed plug tip`);
      }
    }
  }
  assert.ok(minimum < 1.5, 'test actually samples apexes passing close to the fixed electrodes');
});

function recordingContext() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const points = [];
  const ctx = {
    points, save() { stack.push([...matrix]); }, restore() { assert.ok(stack.length); matrix = stack.pop(); },
    translate(x, y) { matrix[4] += matrix[0] * x + matrix[2] * y; matrix[5] += matrix[1] * x + matrix[3] * y; },
    rotate(angle) { const [a,b,c,d,e,f] = matrix, cos = Math.cos(angle), sin = Math.sin(angle);
      matrix = [a*cos+c*sin,b*cos+d*sin,c*cos-a*sin,d*cos-b*sin,e,f]; },
    scale(x, y) { matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y; },
    point(x, y) { assert.ok(Number.isFinite(x) && Number.isFinite(y));
      const [a,b,c,d,e,f] = matrix; points.push({ x: a*x+c*y+e, y: b*x+d*y+f }); },
    beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo(x, y) { this.point(x, y); }, lineTo(x, y) { this.point(x, y); },
    arc(x, y, r) { assert.ok(Number.isFinite(r) && r >= 0, `invalid circle radius ${r}`);
      this.point(x-r,y-r); this.point(x+r,y+r); },
    rect(x,y,w,h) { assert.ok(w >= 0 && h >= 0, `negative rectangle ${w}×${h}`);
      this.point(x,y);this.point(x+w,y+h); },
    roundRect(x,y,w,h) { this.rect(x,y,w,h); },
    fillRect(x,y,w,h) { this.rect(x,y,w,h); }, strokeRect(x,y,w,h) { this.rect(x,y,w,h); },
    fillText() {},
    createLinearGradient(...args) { assert.ok(args.every(Number.isFinite)); return { addColorStop() {} }; },
    createRadialGradient(...args) { assert.ok(args.every(Number.isFinite));
      assert.ok(args[2] >= 0 && args[5] >= 0); return { addColorStop() {} }; },
  };
  return ctx;
}

test('every architecture draws finite, positive mechanical shapes in full and focused mobile/desktop views', () => {
  for (const id of Object.keys(ENGINE_CONFIGS)) for (const [width, height] of [[780, 380], [320, 110], [180, 110]]) {
    const engine = new EngineModel(id, 'oem'); engine.setRunning(true);
    engine.cam.blend = engine.cam.spec ? 1 : 0;
    const renderer = Object.create(EngineRenderer.prototype);
    Object.assign(renderer, { width, height, animationSpeed: 1, cleanMode: true, focusedCylIndex: 0,
      ctx: recordingContext(), sparkParticles: [], viewMode: 'multi' });
    for (const viewMode of ['multi', 'focused']) for (const angle of [0, 95, 360, 545, 710]) {
      renderer.viewMode = viewMode; renderer.focusedCylIndex = engine.cylinderStates.length - 1;
      renderer.ctx.points.length = 0;
      engine.crankAngle = angle; renderer.render(engine, {}, 1 / 30);
      assert.ok(renderer.ctx.points.length > 0, id);
      if (viewMode === 'multi') for (const point of renderer.ctx.points) {
        assert.ok(point.x >= -1 && point.x <= width + 1 && point.y >= -1 && point.y <= height + 1,
          `${id} ${width}×${height}: mechanical outline clipped at ${point.x},${point.y}`);
      }
    }
  }
});

test('focused radial retains the articulated layout and rotary focused view chooses exactly one rotor', () => {
  const noop = () => {};
  for (const id of ['radial_7', 'rotary_2']) {
    const engine = new EngineModel(id);
    const renderer = Object.create(EngineRenderer.prototype);
    Object.assign(renderer, { width: 320, height: 110, animationSpeed: 1, cleanMode: true,
      viewMode: 'focused', focusedCylIndex: 6, sparkParticles: [], ctx: recordingContext(),
      drawTechnicalGrid: noop, renderParticles: noop });
    let calls = 0;
    const method = id === 'radial_7' ? 'drawRadialEngine' : 'drawRotaryEngine';
    const actual = renderer[method];
    renderer[method] = function(...args) { calls++; return actual.apply(this, args); };
    renderer.drawSingleCylinder = () => assert.fail('special architectures cannot fall back to fictitious inline mechanism');
    renderer.render(engine, {}, 1 / 60);
    assert.equal(calls, 1);
  }
});

test('changing engine in slow motion resets visual phase and stopped engines cannot flash combustion', () => {
  const renderer = Object.create(EngineRenderer.prototype);
  Object.assign(renderer, { width: 320, height: 110, animationSpeed: 0.05, cleanMode: true,
    viewMode: 'multi', focusedCylIndex: 0, sparkParticles: [], ctx: recordingContext() });
  const first = new EngineModel('i4_cross'); first.setRunning(true); first.crankAngle = 110;
  renderer.render(first, {}, 0);
  assert.equal(renderer.visualCrankAngle, 110);
  renderer.visualCrankAngle = 670;
  const second = new EngineModel('boxer4'); second.crankAngle = 40;
  renderer.render(second, {}, 0);
  assert.equal(renderer.visualCrankAngle, 40);
  second.isIgnitionOn = true; second.rpm = 0;
  assert.equal(renderer.hasCombustion(second), false, 'zero-speed schematic must not show a frozen fireball');
  renderer.setAnimationSpeed(NaN);
  assert.equal(renderer.animationSpeed, 0.05);
});

test('CP4 drawing follows physical 1-3-2-4 absolute ignition events in both views', () => {
  const engine = new EngineModel('i4_cross', 'oem'); engine.setRunning(true);
  assert.equal(engine.config.firingAngleKind, 'absolute');
  assert.deepEqual(engine.config.firingAngles, [0, 450, 270, 540]);
  const directions = engine.cylinderStates.map(cyl => pistonCyclePhase(0, cyl, engine.config) % 360).sort((a,b)=>a-b);
  assert.deepEqual(directions, [0, 90, 180, 270], 'four crossplane crank directions');
  const renderer = Object.create(EngineRenderer.prototype);
  Object.assign(renderer, { width: 320, height: 110, animationSpeed: 1, cleanMode: true,
    sparkParticles: [], ctx: recordingContext() });
  const actualChamber = renderer.drawCombustionChamber;
  const rendered = [];
  renderer.drawCombustionChamber = function(ctx, top, crown, bore, cyl, ...args) {
    rendered.push(cyl); return actualChamber.call(this,ctx,top,crown,bore,cyl,...args);
  };
  for (const index of [0, 2, 1, 3]) {
    engine.crankAngle = engine.config.firingAngles[index];
    engine.advanceStep(0, { coupledRPM: engine.idleRPM });
    for (const viewMode of ['multi', 'focused']) {
      renderer.viewMode = viewMode; renderer.focusedCylIndex = index; rendered.length = 0;
      renderer.render(engine, {}, 0);
      const displayed = rendered.find(cyl=>cyl.index===index);
      assert.equal(displayed.phaseAngle, 360);
      assert.equal(displayed.stroke, 'power');
      assert.ok(displayed.pistonPos < 1e-9);
      assert.equal(displayed.isFiring, true);
      rendered.forEach(cyl => assert.equal(cyl.phaseAngle, engine.cylinderStates[cyl.index].phaseAngle));
    }
  }
  const oldConfig = ENGINE_CONFIGS.i4_flat;
  assert.equal(pistonCyclePhase(100, { firingOffset: 180 }, oldConfig), 280,
    'unmodified additive configurations retain their existing phase convention');
});
