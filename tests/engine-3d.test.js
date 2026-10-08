import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ENGINE_CONFIGS } from '../src/physics/EngineConfigurations.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { EngineAssembly3D, engineAssemblySignature, engineBanks3D } from '../src/visuals/EngineAssembly3D.js';
import { Engine3DRenderer, fitAssemblyCamera } from '../src/visuals/Engine3DRenderer.js';

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const find = (assembly, name) => assembly.group.getObjectByName(name);
const meshStats = assembly => {
  let draws = 0, triangles = 0;
  assembly.group.traverse(node => {
    if (!node.isMesh) return;
    draws++;
    triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1);
  });
  return { draws, triangles };
};
const pipeEndpoints = mesh => [new THREE.Vector3(...mesh.userData.path[0]), new THREE.Vector3(...mesh.userData.path.at(-1))];

for (const [id, config] of Object.entries(ENGINE_CONFIGS)) {
  test(`${id}: full engine has its entire physical family and finite, bounded render geometry`, () => {
    const engine = new EngineModel(id, 'oem');
    const assembly = new EngineAssembly3D(engine);
    try {
      for (const part of ['block', 'intake', 'headers', 'flywheel', 'exhaust', 'accessories', 'mounts']) assert.ok(assembly.parts.has(part), `${id} ${part}`);
      const cylinders = [], rotors = [];
      assembly.group.traverse(node => {
        if (!node.isMesh && node.userData.cylinderIndex !== undefined) cylinders.push(node.userData.cylinderIndex);
        if (node.userData.rotorIndex !== undefined) rotors.push(node.userData.rotorIndex);
      });
      if (config.layout === 'rotary') {
        assert.deepEqual(rotors.sort((a, b) => a - b), Array.from({ length: config.rotors }, (_, i) => i));
        assert.equal(assembly.parts.has('camshaft'), false);
        assert.equal(cylinders.length, 0);
      } else {
        assert.deepEqual(cylinders.sort((a, b) => a - b), Array.from({ length: config.cylinders }, (_, i) => i));
        assert.equal(assembly.parts.has('camshaft'), config.layout !== 'radial');
      }
      for (const geo of assembly.geometries) {
        for (const key of ['position', 'normal']) {
          const values = geo.attributes[key]?.array;
          assert.ok(values && values.length > 0);
          assert.ok(values.every(Number.isFinite), `${id} nonfinite ${key}`);
        }
        geo.computeBoundingBox();
        assert.ok(!geo.boundingBox.isEmpty());
      }
      const size = assembly.getBounds().getSize(new THREE.Vector3());
      assert.ok(size.toArray().every(value => value > 0.6 && value < 5), `${id} extent ${size.toArray()}`);
      const stats = meshStats(assembly);
      assert.ok(stats.draws < 200, `${id} draws ${stats.draws}`);
      assert.ok(stats.triangles < 80000, `${id} triangles ${stats.triangles}`);
    } finally { assembly.dispose(); }
  });
}

test('V and Boxer intake faces inward while exhaust leaves both outer banks without traversing the block', () => {
  for (const id of ['v2_90', 'v8_cross', 'v12', 'w16', 'boxer4', 'boxer6']) {
    const assembly = new EngineAssembly3D(new EngineModel(id));
    try {
      assert.ok(assembly.headerAnchors.some(p => p.x < 0));
      assert.ok(assembly.headerAnchors.some(p => p.x > 0));
      for (let index = 0; index < assembly.headerAnchors.length; index++) {
        const exhaust = assembly.headerAnchors[index], intake = assembly.intakeAnchors[index];
        if (assembly.config.layout === 'boxer') assert.ok(intake.y > exhaust.y, `${id} intake above / exhaust below opposing heads`);
        else assert.ok(Math.abs(exhaust.x) > Math.abs(intake.x), `${id} intake must face the valley`);
        const mesh = find(assembly, `exhaust runner ${index + 1}`);
        const [start, end] = pipeEndpoints(mesh);
        assert.equal(Math.sign(start.x), Math.sign(end.x), `${id} runner crosses through crankcase`);
      }
      const crossover = find(assembly, 'bank crossover beneath crankcase');
      assert.ok(crossover.userData.path.slice(1, -1).every(p => p[1] < -0.4));
    } finally { assembly.dispose(); }
  }
});

test('W16 has four narrow rows grouped about two 90-degree separated bank centerlines', () => {
  const banks = engineBanks3D(ENGINE_CONFIGS.w16);
  assert.equal(banks.length, 4);
  assert.deepEqual(banks.map(bank => bank.cylinders.length), [4, 4, 4, 4]);
  near(banks[1].angle - banks[0].angle, 15);
  near(banks[3].angle - banks[2].angle, 15);
  near((banks[2].angle + banks[3].angle - banks[0].angle - banks[1].angle) / 2, 90);
});

test('installed modifications alter physical geometry, not a badge, and unsupported hardware stays absent', () => {
  for (const induction of ['na', 'turbo', 'supercharger']) {
    const engine = new EngineModel('v8_cross', 'oem');
    engine.setForcedInduction(induction);
    const stock = new EngineAssembly3D(engine);
    for (const [id, value] of Object.entries({ intake: 'sport', headers: 'tuned', camshaft: 'sport', flywheel: 'light', intercooler: 'upgraded', pulley: 'overdrive' })) engine.setModification(id, value);
    const modified = new EngineAssembly3D(engine);
    try {
      assert.ok(find(stock, 'sealed airbox'));
      assert.ok(!find(modified, 'sealed airbox'));
      assert.ok(find(modified, 'sport cone air filter'));
      assert.ok(find(modified, 'sealed sport cold-air housing'));
      assert.ok(find(modified, 'sport cold-air snorkel'));
      assert.equal(find(stock, 'flywheel with open machined holes').userData.holeCount, 1);
      assert.equal(find(modified, 'flywheel with open machined holes').userData.holeCount, 7);
      assert.notEqual(find(stock, 'exhaust runner 1').material, find(modified, 'exhaust runner 1').material);
      const stockCam = stock.animated.find(item => item.source === 'cam').object.children.find(item => item.isMesh && item.geometry.parameters.radiusBottom === 0.039);
      assert.ok(stockCam, 'stock cam lobe exists beneath cover');
      assert.ok(modified.animated.some(item => item.source === 'cam' && item.object.children.some(mesh => mesh.geometry?.parameters.radiusBottom === 0.049)));
      assert.equal(modified.parts.has('intercooler'), induction !== 'na');
      assert.equal(modified.parts.has('pulley'), induction === 'supercharger');
      if (induction === 'supercharger') {
        const stockPulley = stock.animated.find(item => item.source === 'supercharger').object;
        const modifiedPulley = modified.animated.find(item => item.source === 'supercharger').object;
        near(stockPulley.userData.radius / modifiedPulley.userData.radius, 1.10);
        near(modified.parts.get('pulley').userData.driveRatioMultiplier, engine.modificationEffects.pulleyRatio);
      }
      assert.ok(meshStats(modified).draws < 235);
    } finally { stock.dispose(); modified.dispose(); }
  }
});

test('Turbo and Roots/TVS have different installed drives and correctly ordered charge paths', () => {
  for (const induction of ['turbo', 'supercharger']) {
    const engine = new EngineModel('i4_cross');
    engine.setForcedInduction(induction);
    engine.setMaxBoost(2.1);
    const assembly = new EngineAssembly3D(engine);
    try {
      assert.equal(assembly.parts.has('turbo'), induction === 'turbo');
      assert.equal(assembly.parts.has('supercharger'), induction === 'supercharger');
      const pipe = find(assembly, induction === 'turbo' ? 'compressor to cooler charge pipe' : 'blower to charge cooler');
      near(pipeEndpoints(pipe)[1].distanceTo(assembly.coolerInlet), 0);
      const outlet = find(assembly, 'cooled charge pipe to throttle');
      near(pipeEndpoints(outlet)[0].distanceTo(assembly.coolerOutlet), 0);
      near(pipeEndpoints(outlet)[1].distanceTo(assembly.plenumInlet), 0);
      assert.equal(assembly.parts.get('intercooler').userData.coolingType, induction === 'turbo' ? 'air-to-air' : 'water-to-air');
      if (induction === 'supercharger') {
        assert.ok(find(assembly, 'water-to-air core beneath blower'));
        const pulley = assembly.parts.get('pulley');
        near(pulley.userData.baseDriveRatio, 1.7 * Math.sqrt((1 + engine.maxBoost) / 1.7));
        assert.ok(find(assembly, 'continuous drive belt'));
      } else assert.match(assembly.parts.get('headers').userData.manifoldKind, /short turbo/);
    } finally { assembly.dispose(); }
  }
});

test('small/large Turbo, relief valve, cooler upgrade and SC boost pulley size are tangible geometry changes', () => {
  const engine = new EngineModel('i6');
  engine.setForcedInduction('turbo');
  engine.setTurboSize('small');
  const small = new EngineAssembly3D(engine);
  engine.setTurboSize('large');
  engine.setBovType('flutter');
  engine.setModification('intercooler', 'upgraded');
  const large = new EngineAssembly3D(engine);
  try {
    assert.ok(large.parts.get('turbo').userData.housingRadius > small.parts.get('turbo').userData.housingRadius);
    assert.ok(find(small, 'blow off / recirculation valve'));
    assert.equal(find(large, 'blow off / recirculation valve'), undefined);
    assert.ok(large.parts.get('intercooler').getObjectByName('charge cooler core').geometry.parameters.width
      > small.parts.get('intercooler').getObjectByName('charge cooler core').geometry.parameters.width);
  } finally { small.dispose(); large.dispose(); }
  engine.setForcedInduction('supercharger');
  engine.setMaxBoost(0.5);
  const low = new EngineAssembly3D(engine);
  engine.setMaxBoost(2.5);
  const high = new EngineAssembly3D(engine);
  try {
    assert.ok(high.animated.find(item => item.source === 'supercharger').object.userData.radius
      < low.animated.find(item => item.source === 'supercharger').object.userData.radius);
  } finally { low.dispose(); high.dispose(); }
});

test('cam focus reveals hidden shafts by lifting covers, and reset restores the assembled exterior', () => {
  for (const id of ['i1', 'i4_cross', 'v8_cross', 'w16', 'boxer6']) {
    const assembly = new EngineAssembly3D(new EngineModel(id));
    try {
      const closed = assembly.covers.map(cover => ({ position: cover.object.position.clone(), rotation: cover.object.rotation.clone() }));
      const shafts = assembly.animated.filter(item => item.source === 'cam');
      assert.equal(shafts.length, assembly.banks.length * 2);
      assembly.setFocus('camshaft');
      assembly.covers.forEach((cover, i) => assert.ok(cover.object.position.distanceTo(closed[i].position) > 0.7));
      assert.equal(assembly.setFocus('flywheel'), assembly.parts.get('flywheel'));
      assembly.covers.forEach((cover, i) => {
        near(cover.object.position.distanceTo(closed[i].position), 0);
        assert.deepEqual(cover.object.rotation.toArray(), closed[i].rotation.toArray());
      });
      assert.equal(assembly.parts.get('flywheel').userData.rearInspectionOpening, true);
      assembly.setFocus(null);
      assert.equal(assembly.focusedPart, null);
    } finally { assembly.dispose(); }
  }
});

test('sport cold-air filter stays enclosed in assembled view and becomes inspectable when intake is selected', () => {
  const engine = new EngineModel('i4_cross');
  engine.setModification('intake', 'sport');
  const assembly = new EngineAssembly3D(engine);
  try {
    assert.equal(assembly.intakeCovers.length, 3);
    for (const cover of assembly.intakeCovers) near(cover.object.position.distanceTo(cover.closedPosition), 0);
    assembly.setFocus('intake');
    for (const cover of assembly.intakeCovers) assert.ok(cover.object.position.distanceTo(cover.closedPosition) > 0.5);
    assembly.setFocus(null);
    for (const cover of assembly.intakeCovers) {
      near(cover.object.position.distanceTo(cover.closedPosition), 0);
      assert.deepEqual(cover.object.rotation.toArray(), cover.closedRotation.toArray());
    }
  } finally { assembly.dispose(); }
});

test('inspection-camera rays reach camshafts without the displaced valve covers obscuring them', () => {
  const descendantOf = (node, parent) => {
    while (node) { if (node === parent) return true; node = node.parent; }
    return false;
  };
  for (const id of ['i1', 'i4_cross', 'honda_k20a', 'v8_cross', 'w16', 'boxer6']) {
    const assembly = new EngineAssembly3D(new EngineModel(id));
    try {
      const shafts = assembly.animated.filter(item => item.source === 'cam').map(item => item.object);
      assembly.setFocus('camshaft');
      // Repeated selection must not keep translating or turning the lid.
      const positions = assembly.covers.map(cover => cover.object.position.clone());
      const rotations = assembly.covers.map(cover => cover.object.rotation.toArray());
      assembly.setFocus('camshaft');
      for (let index = 0; index < assembly.covers.length; index++) {
        near(assembly.covers[index].object.position.distanceTo(positions[index]), 0);
        assert.deepEqual(assembly.covers[index].object.rotation.toArray(), rotations[index]);
      }
      for (const aspect of [688 / 220, 306 / 200]) {
        const camera = fitAssemblyCamera(assembly.getBounds('camshaft'), new THREE.Vector3(0.45, 1.15, 0.7), 39, aspect, 1.14);
        let visibleShafts = 0;
        for (const shaft of shafts) {
          const target = shaft.localToWorld(new THREE.Vector3(0, 0.02, 0));
          const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(target));
          for (const cover of assembly.covers) assert.equal(ray.intersectObject(cover.object, true).length, 0, `${id} displaced cover obscures cam`);
          const first = ray.intersectObject(assembly.group, true)[0];
          if (descendantOf(first?.object, shaft)) visibleShafts++;
        }
        // An orbitable V/W engine can hide its far bank behind the manifold,
        // but the initial inspection view must visibly expose actual shafts.
        assert.ok(visibleShafts >= 1, `${id}/${aspect}: no visible camshaft`);
        if (assembly.config.layout === 'inline') assert.equal(visibleShafts, shafts.length, `${id}: both shafts must be visible`);
      }
    } finally { assembly.dispose(); }
  }
});

test('cold-air inspection view exposes the filter rather than aiming at an opaque lifted lid', () => {
  const engine = new EngineModel('honda_k20a');
  engine.setModification('intake', 'sport');
  const assembly = new EngineAssembly3D(engine);
  try {
    assembly.setFocus('intake');
    const filter = find(assembly, 'sport cone air filter');
    const center = filter.getWorldPosition(new THREE.Vector3());
    for (const aspect of [688 / 220, 306 / 200]) {
      const camera = fitAssemblyCamera(assembly.getBounds('intake'), new THREE.Vector3(-1, 0.52, 1.2), 39, aspect, 1.14);
      let filterVisible = false;
      for (const offset of [[0, 0, 0], [-0.04, 0.05, 0], [0, 0.07, 0.01]]) {
        const target = center.clone().add(new THREE.Vector3(...offset));
        const ray = new THREE.Raycaster(camera.position, target.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(target));
        for (const cover of assembly.intakeCovers) assert.equal(ray.intersectObject(cover.object, true).length, 0);
        const first = ray.intersectObject(assembly.group, true)[0];
        if (first?.object === filter || first?.object.name === 'filter pleat') filterVisible = true;
      }
      assert.ok(filterVisible, `${aspect}: cold-air inspection view still hides filter`);
    }
  } finally { assembly.dispose(); }
});

test('external shafts stop at physical zero and use actual RPM, including turbo coast and independent slow motion', () => {
  const engine = new EngineModel('i4_cross');
  engine.setForcedInduction('supercharger');
  const assembly = new EngineAssembly3D(engine);
  try {
    const atRest = assembly.animated.map(item => item.object.rotation.z);
    assembly.update(engine, 0.1);
    assert.deepEqual(assembly.animated.map(item => item.object.rotation.z), atRest);
    engine.rpm = 600;
    engine.superchargerRPM = 1200;
    assembly.update(engine, 0.1, 0.1);
    near(assembly.animated.find(item => item.source === 'crank').object.rotation.z, Math.PI * 0.2);
    near(assembly.animated.find(item => item.source === 'cam').object.rotation.z, Math.PI * 0.1);
    near(assembly.animated.find(item => item.source === 'supercharger').object.rotation.z, Math.PI * 0.4);
    assert.equal(engine.rpm, 600, 'slow motion cannot change the physical RPM');
    engine.rpm = engine.superchargerRPM = 0;
    const stopped = assembly.animated.map(item => item.object.rotation.z);
    assembly.update(engine, 0.1);
    assert.deepEqual(assembly.animated.map(item => item.object.rotation.z), stopped);
  } finally { assembly.dispose(); }
  engine.setForcedInduction('turbo');
  const turbo = new EngineAssembly3D(engine);
  try {
    engine.isIgnitionOn = false;
    engine.rpm = 0;
    engine.turboRPM = 300;
    turbo.update(engine, 0.05);
    near(turbo.animated.find(item => item.source === 'turbo').object.rotation.z, Math.PI / 2);
    engine.turboRPM = 0;
    turbo.update(engine, 0.05);
    near(turbo.animated.find(item => item.source === 'turbo').object.rotation.z, Math.PI / 2);
  } finally { turbo.dispose(); }
});

test('assembly signature responds to installed hardware without rebuilding for RPM, time or redline changes', () => {
  const engine = new EngineModel('v8_cross');
  const original = engineAssemblySignature(engine);
  engine.rpm = 4000;
  engine.crankAngle = 300;
  engine.setRedlineRPM(engine.redlineRPM + 100);
  assert.equal(engineAssemblySignature(engine), original);
  engine.setModification('flywheel', 'light');
  assert.notEqual(engineAssemblySignature(engine), original);
  engine.setForcedInduction('supercharger');
  const lowBoost = engineAssemblySignature(engine);
  engine.setMaxBoost(2.5);
  assert.notEqual(engineAssemblySignature(engine), lowBoost);
});

test('fully modified boosted families stay within mobile mesh/triangle budgets', () => {
  for (const id of ['i6', 'v12', 'w16', 'boxer6', 'radial_7', 'rotary_2']) {
    for (const induction of ['turbo', 'supercharger']) {
      const engine = new EngineModel(id);
      engine.setForcedInduction(induction);
      for (const [kind, value] of Object.entries({ intake: 'sport', headers: 'tuned', camshaft: 'sport', flywheel: 'light', intercooler: 'upgraded', pulley: 'overdrive' })) engine.setModification(kind, value);
      const assembly = new EngineAssembly3D(engine);
      try {
        const stats = meshStats(assembly);
        assert.ok(stats.draws < 245, `${id}/${induction}: ${stats.draws} draws`);
        assert.ok(stats.triangles < 85000, `${id}/${induction}: ${stats.triangles} triangles`);
        assert.ok(assembly.getBounds().getSize(new THREE.Vector3()).toArray().every(Number.isFinite));
      } finally { assembly.dispose(); }
    }
  }
});

test('shared geometries, materials and instanced buffers are released exactly once across rebuilds', () => {
  const assembly = new EngineAssembly3D(new EngineModel('w16'));
  const resources = [...assembly.geometries, ...assembly.materials, ...assembly.instances];
  const counts = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
  assembly.dispose();
  assembly.dispose();
  for (const resource of resources) assert.equal(counts.get(resource), 1);
});

test('renderer can be imported in Node and reports a missing WebGL canvas without crashing', () => {
  const renderer = new Engine3DRenderer(null);
  assert.equal(renderer.available, false);
  assert.equal(renderer.render(new EngineModel('i1'), null, 1 / 60), false);
  near(renderer.setAnimationSpeed(0), 0.05);
  near(renderer.setAnimationSpeed(3), 1);
  renderer.dispose();
  renderer.dispose();
});

test('camera fits actual projected box corners across wide desktop and narrow phone viewports', () => {
  for (const id of ['i1', 'i6', 'w16', 'boxer6', 'radial_7', 'rotary_2']) {
    const assembly = new EngineAssembly3D(new EngineModel(id));
    try {
      for (const aspect of [688 / 220, 306 / 200, 320 / 420, 844 / 190]) {
        const bounds = assembly.getBounds();
        const fit = fitAssemblyCamera(bounds, new THREE.Vector3(1, 0.68, 1.42), 39, aspect, 1.05);
        const camera = new THREE.PerspectiveCamera(39, aspect, 0.025, 50);
        camera.position.copy(fit.position);
        camera.lookAt(fit.target);
        camera.updateMatrixWorld();
        let maximumProjection = 0;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1, `${id} aspect ${aspect}: cropped corner`);
          assert.ok(projected.z < 1 && projected.z > -1, `${id}: clipped corner`);
          maximumProjection = Math.max(maximumProjection, Math.abs(projected.x), Math.abs(projected.y));
        }
        assert.ok(maximumProjection > 0.88, `${id} aspect ${aspect}: excessive unused space`);
      }
    } finally { assembly.dispose(); }
  }
});
