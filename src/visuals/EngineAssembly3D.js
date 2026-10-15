import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rotaryHousingPoint } from '../physics/RotaryMechanics.js';
import { cylinderBankIndex, cylinderBankAngle } from './MechanicalKinematics.js';

const TAU = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const MOD_KEYS = ['intake', 'headers', 'camshaft', 'flywheel', 'intercooler', 'pulley', 'radiator'];
const BASE_MODS = { intake: 'stock', headers: 'stock', camshaft: 'stock', flywheel: 'stock', intercooler: 'stock', pulley: 'stock', radiator: 'stock' };
const v3 = value => value instanceof THREE.Vector3 ? value.clone() : new THREE.Vector3(...value);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The assembly depicts each mechanical family and installed simulation parts.
// Dimensions and castings are procedural illustrations, not licensed OEM CAD.
export function engineAssemblySignature(engine) {
  return JSON.stringify([engine.config.id, engine.displacement, engine.forcedInduction || 'na', engine.turboSize || 'small',
    engine.forcedInduction === 'supercharger' ? engine.maxBoost : null, engine.exhaust?.id || 'oem', engine.bovType || 'recirculating',
    ...MOD_KEYS.map(key => engine.modifications?.[key] || 'stock')]);
}

export function engineBanks3D(config) {
  const n = config.cylinders;
  if (config.layout === 'radial' || config.layout === 'rotary' || config.layout === 'turbine' || config.layout === 'turbojet') return [];
  const count = config.layout === 'w' ? 4 : ['v', 'vr', 'boxer'].includes(config.layout) ? 2 : 1;
  const banks = Array.from({ length: count }, (_, index) => ({ index, angle: 0, cylinders: [] }));
  banks.forEach((bank, index) => {
    bank.angle = cylinderBankAngle(index, config);
  });
  for (let index = 0; index < n; index++) {
    const bank = cylinderBankIndex({ index }, config);
    banks[bank].cylinders.push(index);
  }
  return banks;
}

export class EngineAssembly3D {
  constructor(engine) {
    this.config = engine.config;
    this.aviation = ['turbine', 'turbojet'].includes(this.config.layout);
    this.nozzlePetals = [];
    this.mods = { ...BASE_MODS, ...engine.modifications };
    this.induction = engine.forcedInduction || 'na';
    this.group = new THREE.Group();
    this.group.name = `assembly:${this.config.id}`;
    this.group.userData = { family: this.config.layout, representation: 'procedural family assembly', cylinders: this.config.cylinders };
    this.parts = new Map();
    this.focusTargets = this.parts;
    this.animated = [];
    this.covers = [];
    this.intakeCovers = [];
    this.geometryCache = new Map();
    this.geometries = new Set();
    this.materials = new Set();
    this.instances = new Set();
    this.disposed = false;
    this.phase = { core: (engine.coreAngle ?? engine.crankAngle ?? 0) * Math.PI / 180,
      power: (engine.powerTurbineAngle || 0) * Math.PI / 180, fan: 0,
      crank: (engine.crankAngle || 0) * Math.PI / 180, turbo: 0, supercharger: 0 };
    this.palette = this.createMaterials();
    this.banks = engineBanks3D(this.config);
    this.length = this.config.layout === 'rotary' ? (this.config.rotors || 2) * .41 + .26 : this.config.layout === 'radial' ? (this.config.radialRows || 1) * .56 + .16
      : (this.config.layout === 'turbine' || this.config.layout === 'turbojet') ? 1.40
      : Math.max(0.66, Math.max(...this.banks.map(bank => bank.cylinders.length)) * 0.27 + 0.20);
    this.front = this.length / 2 + 0.08;
    this.bankAnchors = [];
    this.intakeAnchors = [];
    this.headerAnchors = [];
    this.caseWidth = ['v', 'w'].includes(this.config.layout) ? 0.78 : this.config.layout === 'boxer' ? 0.66 : this.config.layout === 'vr' ? .62 : 0.5;
    if (this.config.layout === 'radial') this.buildRadial();
    else if (this.config.layout === 'rotary') this.buildRotary();
    else if (this.config.layout === 'turbine') this.buildTurbine(engine);
    else if (this.config.layout === 'turbojet') this.buildTurbojet(engine);
    else if (this.config.cycleKind === 'two-stroke') this.buildTwoStroke();
    else if (['vr', 'w'].includes(this.config.layout)) this.buildNarrowBanks();
    else this.buildPistonBanks();
    if (!this.aviation) {
      if (this.config.cycleKind === 'two-stroke') this.buildTwoStrokeIntake();
      else if (this.config.rotaryPortKind === 'peripheral') this.buildRacingRotaryIntake();
      else this.buildIntake(engine);
      if (this.config.cycleKind === 'two-stroke') this.buildTwoStrokeExhaust(engine);
      else this.buildExhaust(engine);
      if (this.config.cycleKind === 'two-stroke') this.buildTwoStrokeDrive();
      else this.buildFrontDrive();
      this.buildFlywheel();
      this.buildMounts();
      this.buildInduction(engine);
      this.buildRadiator(engine);
    }
    if (this.config.layout === 'radial') this.batchStaticRadialMeshes();
    this.batchRepeatedMeshes();
    const baseCC = this.config.defaultDisplacement || this.config.displacement || engine.displacement || 1000;
    // Changing displacement changes the assembly scale without implying OEM dimensions.
    this.group.scale.setScalar(clamp(Math.cbrt((engine.displacement || baseCC) / baseCC), 0.76, 1.25));
    this.group.updateMatrixWorld(true);
    this.update(engine, 0);
  }

  createMaterials() {
    const make = (name, color, metalness, roughness, extra = {}) => {
      const material = new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
      material.name = name;
      this.materials.add(material);
      return material;
    };
    return {
      cast: make('cast aluminium', 0x879396, 0.72, 0.43), machined: make('machined aluminium', 0xc3cbcc, 0.88, 0.25),
      dark: make('black wrinkle finish', 0x202831, 0.48, 0.44), cover: make('graphite valve covers', 0x394954, 0.60, 0.34),
      steel: make('brushed steel', 0x8a959e, 0.92, 0.28), tuned: make('titanium tuned headers', 0xa09687, 0.93, 0.28),
      rubber: make('rubber hoses and belt', 0x151a1d, 0.03, 0.87), blue: make('silicone charge couplers', 0x256090, 0.06, 0.56),
      filter: make('sport filter pleats', 0x9e3730, 0.05, 0.82), sport: make('modified component finish', 0xc77739, 0.80, 0.32),
      hot: make('turbine casting', 0x71635a, 0.77, 0.58), brass: make('brass fittings', 0xa99c55, 0.8, 0.3),
      gasket: make('gaskets', 0x10191b, 0.05, 0.75), ceramic: make('plug ceramic', 0xd1cebe, 0.02, 0.55),
    };
  }

  geometry(key, create) {
    if (!this.geometryCache.has(key)) {
      const geo = create();
      this.geometryCache.set(key, geo);
      this.geometries.add(geo);
    }
    return this.geometryCache.get(key);
  }

  part(id, applicable = true) {
    if (!applicable) return null;
    if (!this.parts.has(id)) {
      const group = new THREE.Group();
      group.name = `part:${id}`;
      group.userData = { partId: id, modVariant: this.mods[id] || 'stock' };
      this.group.add(group);
      this.parts.set(id, group);
    }
    return this.parts.get(id);
  }

  mesh(parent, geometry, material, pos = [0, 0, 0], name = '') {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(v3(pos));
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(parent, size, pos, material, rounded = true, name = '') {
    const key = `box:${size.join(',')}:${rounded}`;
    const radius = Math.min(...size) * 0.13;
    return this.mesh(parent, this.geometry(key, () => rounded ? new RoundedBoxGeometry(...size, 2, radius) : new THREE.BoxGeometry(...size)), material, pos, name);
  }

  cylinder(parent, radius, length, pos, material, axis = 'z', topRadius = radius, name = '') {
    const geo = this.geometry(`cyl:${radius},${topRadius},${length}`, () => new THREE.CylinderGeometry(topRadius, radius, length, 24));
    const mesh = this.mesh(parent, geo, material, pos, name);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  }

  ring(parent, radius, tube, pos, material, axis = 'z', arc = TAU) {
    const mesh = this.mesh(parent, this.geometry(`torus:${radius},${tube},${arc}`, () => new THREE.TorusGeometry(radius, tube, 8, 36, arc)), material, pos);
    if (axis === 'x') mesh.rotation.y = Math.PI / 2;
    else if (axis === 'y') mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  tube(parent, points, radius, material, name = '') {
    const vectors = points.map(v3);
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 8, false);
    this.geometries.add(geo);
    const mesh = this.mesh(parent, geo, material, [0, 0, 0], name);
    mesh.userData.path = vectors.map(point => point.toArray());
    mesh.userData.radius = radius;
    return mesh;
  }

  bolt(parent, pos, axis = 'y') {
    const mesh = this.cylinder(parent, 0.023, 0.023, pos, this.palette.steel, axis, 0.023, 'fastener');
    // A hex head distinguishes visible bolts from the round shafts.
    mesh.geometry = this.geometry('hex-head', () => new THREE.CylinderGeometry(0.021, 0.021, 0.024, 6));
    return mesh;
  }

  spin(object, source, ratio = 1) {
    object.userData.rotationSource = source;
    this.animated.push({ object, source, ratio, initialZ: object.rotation.z });
    return object;
  }

  inspectionCover(object, offset, rotation) {
    return { object, closedPosition: object.position.clone(), closedRotation: object.rotation.clone(),
      openedPosition: object.position.clone().add(v3(offset)),
      openedRotation: new THREE.Euler(object.rotation.x + rotation[0], object.rotation.y + rotation[1], object.rotation.z + rotation[2]) };
  }

  bankPoint(bank, x, y, z) {
    return new THREE.Vector3(x, y, z).applyAxisAngle(Z_AXIS, -bank.angle * Math.PI / 180);
  }

  buildPistonBanks() {
    const { cast, machined, dark, cover, gasket, steel } = this.palette;
    const block = this.part('block');
    block.userData.sharedCrankcase = true;
    this.box(block, [this.caseWidth, 0.43, this.length], [0, 0.04, 0], cast, true, 'shared crankcase');
    this.box(block, [this.caseWidth * 0.9, 0.23, this.length * 0.88], [0, -0.28, 0], dark, true, 'oil sump');
    this.box(block, [this.caseWidth + 0.035, 0.035, this.length * 0.96], [0, -0.17, 0], machined);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) this.box(block, [0.021, 0.18, this.length * 0.86], [side * (this.caseWidth / 2 + 0.01), -0.24 + i * 0.043, 0], cast, false);
    }
    const cams = this.part('camshaft');
    const width = this.config.layout === 'w' ? 0.24 : 0.38;
    for (const bank of this.banks) {
      const bankGroup = new THREE.Group();
      bankGroup.name = `cylinder bank ${bank.index + 1}`;
      bankGroup.rotation.z = -bank.angle * Math.PI / 180;
      bankGroup.userData = { bankIndex: bank.index, bankAngle: bank.angle, cylinderIndices: [...bank.cylinders] };
      block.add(bankGroup);
      this.box(bankGroup, [width, 0.52, this.length - 0.07], [0, 0.39, 0], cast, true, 'cylinder block casting');
      this.box(bankGroup, [width + 0.04, 0.02, this.length - 0.055], [0, 0.658, 0], gasket, false);
      this.box(bankGroup, [width + 0.065, 0.17, this.length], [0, 0.756, 0], machined, true, 'shared cylinder head');
      // Casting ribs join every bore into a continuous bank.
      for (let i = 0; i < bank.cylinders.length + 1; i++) {
        const z = (i - bank.cylinders.length / 2) * 0.27;
        this.box(bankGroup, [width + 0.032, 0.35, 0.018], [0, 0.40, z], cast, false);
      }
      const camBank = new THREE.Group();
      camBank.rotation.z = bankGroup.rotation.z;
      cams.add(camBank);
      const lid = new THREE.Group();
      lid.name = `valve cover bank ${bank.index + 1}`;
      lid.position.y = 1.018;
      camBank.add(lid);
      this.box(lid, [width + 0.08, 0.19, this.length - 0.02], [0, 0, 0], cover, true, 'valve cover');
      for (let i = 0; i < 3; i++) this.box(lid, [0.018, 0.013, this.length * 0.78], [(i - 1) * width * 0.23, 0.097, 0], steel, false);
      for (const x of [-width * 0.40, width * 0.40]) for (const z of [-this.length * 0.36, this.length * 0.36]) this.bolt(lid, [x, 0.108, z]);
      const openingSide = this.banks.length > 1 ? (bank.angle < 0 ? -1 : 1) : -1;
      this.covers.push(this.inspectionCover(lid, [openingSide * 0.77, 0.08, 0], [0, 0, -openingSide * Math.PI / 3]));
      for (const x of [-width * 0.20, width * 0.20]) {
        const shaft = new THREE.Group();
        shaft.position.set(x, 0.89, 0);
        camBank.add(shaft);
        this.cylinder(shaft, 0.024, this.length - 0.06, [0, 0, 0], steel);
        for (let col = 0; col < bank.cylinders.length; col++) {
          const z = (col - (bank.cylinders.length - 1) / 2) * 0.27;
          for (const delta of [-0.055, 0.055]) {
            const lobe = this.cylinder(shaft, this.mods.camshaft === 'sport' ? 0.049 : 0.039, 0.030, [0, 0.012, z + delta], this.mods.camshaft === 'sport' ? this.palette.sport : steel);
            lobe.scale.z = this.mods.camshaft === 'sport' ? 1.35 : 1.22;
          }
        }
        this.spin(shaft, 'cam');
      }
      for (let col = 0; col < bank.cylinders.length; col++) {
        const index = bank.cylinders[col], z = (col - (bank.cylinders.length - 1) / 2) * 0.27;
        const cylinderMarker = new THREE.Object3D();
        cylinderMarker.position.set(0, 0.45, z);
        cylinderMarker.name = `cylinder ${index + 1}`;
        cylinderMarker.userData = { cylinderIndex: index, bankIndex: bank.index };
        bankGroup.add(cylinderMarker);
        this.box(lid, [0.09, 0.085, 0.11], [0, 0.13, z], dark, true, 'ignition coil');
        const outward = this.banks.length > 1 && bank.angle < 0 ? -1 : 1;
        const inlet = this.bankPoint(bank, -outward * (width / 2 + 0.012), 0.75, z);
        const outlet = this.bankPoint(bank, outward * (width / 2 + 0.012), 0.75, z);
        this.intakeAnchors.push(inlet);
        this.headerAnchors.push(outlet);
      }
      this.bankAnchors.push(this.bankPoint(bank, 0, 0.82, 0));
      this.cylinder(lid, 0.052, 0.035, [width * 0.23, 0.117, this.length * 0.25], dark, 'y', 0.052, 'oil fill cap');
    }
  }

  buildNarrowBanks() {
    const block = this.part('block'), cams = this.part('camshaft');
    const w = this.config.layout === 'w';
    const groups = w ? 2 : 1;
    const { cast, dark, machined, steel, cover } = this.palette;
    block.userData.sharedCrankcase = true;
    this.box(block, [this.caseWidth, .43, this.length], [0, .04, 0], cast, true, 'shared crankcase');
    this.box(block, [this.caseWidth * .88, .20, this.length * .9], [0, -.29, 0], dark, true, 'oil sump');
    for (let groupIndex = 0; groupIndex < groups; groupIndex++) {
      const groupAngle = w ? (groupIndex ? 1 : -1) * (this.config.bankAngle || 72) / 2 : 0;
      const headFrame = new THREE.Group();
      headFrame.name = 'common narrow-angle head ' + (groupIndex + 1);
      headFrame.rotation.z = -groupAngle * Math.PI / 180;
      headFrame.userData.sharedHead = true;
      block.add(headFrame);
      this.box(headFrame, [.58, .18, this.length + .06], [0, .765, .035], machined, true, 'single shared VR cylinder head');
      const camFrame = new THREE.Group(); camFrame.rotation.z = headFrame.rotation.z; cams.add(camFrame);
      const lid = new THREE.Group(); lid.position.set(0, 1.014, .035); camFrame.add(lid);
      this.box(lid, [.61, .18, this.length + .07], [0, 0, 0], cover, true, 'common narrow-angle valve cover');
      for (const x of [-.22, .22]) for (const z of [-this.length * .36, this.length * .36]) this.bolt(lid, [x, .10, z]);
      const openingSide = w && groupIndex ? 1 : -1;
      this.covers.push(this.inspectionCover(lid, [openingSide * .82, .10, 0], [0, 0, -openingSide * Math.PI / 3]));
      const groupBanks = this.banks.filter(bank => w ? Math.floor(bank.index / 2) === groupIndex : true);
      for (const bank of groupBanks) {
        const row = new THREE.Group(); row.rotation.z = -bank.angle * Math.PI / 180;
        row.name = 'cylinder bank ' + (bank.index + 1);
        row.userData = { bankIndex: bank.index, bankAngle: bank.angle, cylinderIndices: [...bank.cylinders], sharedHeadIndex: groupIndex };
        block.add(row);
        this.box(row, [.27, .48, this.length - .03], [0, .39, .035], cast, true, 'narrow-angle cylinder row');
        for (let column = 0; column < bank.cylinders.length; column++) {
          const index = bank.cylinders[column];
          const z = (column - (bank.cylinders.length - 1) / 2) * .27 + (bank.index % 2 ? .0675 : -.0675);
          const marker = new THREE.Object3D(); marker.position.set(0, .44, z);
          marker.userData = { cylinderIndex: index, bankIndex: bank.index }; marker.name = 'cylinder ' + (index + 1); row.add(marker);
          this.box(lid, [.074, .06, .083], [bank.index % 2 ? .095 : -.095, .115, z - .035], dark, true, 'ignition coil');
          const side = w && groupIndex === 0 ? -1 : 1;
          const headBank = { angle: groupAngle };
          this.intakeAnchors.push(this.bankPoint(headBank, -side * .30, .76, z));
          this.headerAnchors.push(this.bankPoint(headBank, side * .30, .76, z));
        }
      }
      for (const x of [-.155, .155]) {
        const shaft = new THREE.Group(); shaft.position.set(x, .91, .035); camFrame.add(shaft);
        this.cylinder(shaft, .024, this.length, [0, 0, 0], steel);
        for (const bank of groupBanks) for (let column = 0; column < bank.cylinders.length; column++) {
          const z = (column - (bank.cylinders.length - 1) / 2) * .27 + (bank.index % 2 ? .0675 : -.0675) - .035;
          for (const offset of [-.029, .029]) {
            const lobe = this.cylinder(shaft, this.mods.camshaft === 'sport' ? .049 : .039, .021, [0, .011, z + offset], steel);
            lobe.scale.z = 1.22;
          }
        }
        this.spin(shaft, 'cam');
      }
      this.bankAnchors.push(this.bankPoint({ angle: groupAngle }, 0, .82, 0));
    }
  }

  buildTwoStroke() {
    const block = this.part('block'); block.userData.sharedCrankcase = true;
    this.box(block, [.53, .43, this.length], [0, .02, 0], this.palette.cast, true, 'sealed two-stroke pumping crankcase');
    for (let index = 0; index < this.config.cylinders; index++) {
      const z = (index - (this.config.cylinders - 1) / 2) * .27;
      const group = new THREE.Group(); block.add(group);
      group.userData.cylinderIndex = index; group.name = 'two-stroke cylinder ' + (index + 1);
      this.box(group, [.39, .41, .265], [0, .41, z], this.palette.cast, true, 'ported water-jacket cylinder');
      this.box(group, [.43, .12, .29], [0, .68, z], this.palette.machined, true, 'two-stroke cylinder head without camshaft');
      for (const x of [-.14, .14]) for (const delta of [-.09, .09]) this.bolt(group, [x, .75, z + delta]);
      this.cylinder(group, .027, .10, [0, .78, z], this.palette.ceramic, 'y', .022, 'two-stroke spark plug');
      this.tube(group, [[0, .83, z], [-.15, .86, z], [-.26, .68, z]], .012, this.palette.rubber, 'spark plug HT lead');
      this.intakeAnchors.push(new THREE.Vector3(-.27, .13, z));
      this.headerAnchors.push(new THREE.Vector3(.20, .38, z));
      this.bankAnchors.push(new THREE.Vector3(0, .68, z));
    }
  }

  buildTwoStrokeIntake() {
    const intake = this.part('intake');
    const sport = this.mods.intake === 'sport';
    const center = new THREE.Vector3(-.65, .18, 0);
    this.plenumPosition = center.clone(); this.plenumInlet = center.clone().add(new THREE.Vector3(0, 0, this.length * .46));
    this.filterOutlet = this.plenumInlet.clone().add(new THREE.Vector3(-.15, .05, .10));
    this.box(intake, [sport ? .34 : .28, sport ? .31 : .26, this.length * .88], center, this.palette.dark, true, 'two-stroke common filtered airbox');
    for (const [index, anchor] of this.intakeAnchors.entries()) {
      const body = anchor.clone().add(new THREE.Vector3(-.12, 0, 0));
      this.cylinder(intake, .066, .15, body, this.palette.machined, 'x', .066, 'reed-valve carburetor ' + (index + 1));
      this.cylinder(intake, .04, .10, body.clone().add(new THREE.Vector3(0, .08, 0)), this.palette.dark, 'y', .04, 'carburetor slide cap');
      this.box(intake, [.10, .07, .10], body.clone().add(new THREE.Vector3(0, -.08, 0)), this.palette.cast, true, 'carburetor float bowl');
      this.tube(intake, [anchor, body, new THREE.Vector3(-.54, .18, anchor.z)], .046, this.palette.rubber, 'reed-valve intake runner');
    }
    if (sport) for (let n = 0; n < 6; n++) this.box(intake, [.012, .23, .025], [-.83, .18, -.20 + n * .08], this.palette.filter, false, 'high-flow airbox inspection rib');
  }

  buildTwoStrokeDrive() {
    const accessories = this.part('accessories');
    this.crankCenter = new THREE.Vector3(0, 0, this.front + .03);
    this.cylinder(accessories, .24, .075, [0, 0, this.front], this.palette.dark, 'z', .23, 'two-stroke generator side cover');
    for (let n = 0; n < 6; n++) {
      const angle = n * TAU / 6;
      this.bolt(accessories, [.20 * Math.cos(angle), .20 * Math.sin(angle), this.front + .055], 'z');
    }
  }

  buildTwoStrokeExhaust(engine) {
    const headers = this.part('headers'), exhaust = this.part('exhaust');
    const tuned = this.mods.headers === 'tuned';
    headers.userData.manifoldKind = 'two-stroke expansion chambers';
    this.headerAnchors.forEach((anchor, index) => {
      const side = index % 2 ? 1 : -1;
      const points = [anchor, new THREE.Vector3(.36, .17, anchor.z), new THREE.Vector3(side * .30, -.28, -.05),
        new THREE.Vector3(side * .32, -.35, -.30), new THREE.Vector3(side * .32, -.36, -.58),
        new THREE.Vector3(side * .32, -.35, -.80), new THREE.Vector3(side * .32, -.32, -1.02)];
      this.tube(headers, points.slice(0, 3), .029, this.palette.hot, 'two-stroke exhaust header ' + (index + 1));
      const radii = [.030, tuned ? .12 : .105, tuned ? .12 : .105, .055, .023];
      for (let segment = 2; segment < points.length - 1; segment++) {
        const a = points[segment], b = points[segment + 1], direction = b.clone().sub(a);
        const geometry = this.geometry('expansion:' + [radii[segment - 2], radii[segment - 1], direction.length()].join(','),
          () => new THREE.CylinderGeometry(radii[segment - 1], radii[segment - 2], direction.length(), 24, 1, true));
        const cone = this.mesh(headers, geometry, tuned ? this.palette.tuned : this.palette.hot, a.clone().add(b).multiplyScalar(.5), 'expansion chamber cone');
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        cone.userData.cylinderIndex = index;
      }
      this.cylinder(exhaust, .052, .27, [side * .32, -.32, -1.12], this.palette.dark, 'z', .052, 'two-stroke stinger silencer');
    });
    exhaust.userData.exhaustModel = engine.exhaust?.id || 'oem';
  }

  buildRadial() {
    const block = this.part('block');
    const { cast, machined, dark, steel } = this.palette;
    this.cylinder(block, 0.47, (this.config.radialRows || 1) * .48, [0, 0, 0], cast, 'z', 0.41, 'central radial crankcase');
    this.cylinder(block, 0.33, 0.13, [0, 0, this.front - 0.055], machined, 'z', 0.24, 'reduction nose');
    for (let index = 0; index < this.config.cylinders; index++) {
      const rows = this.config.radialRows || 1;
      const perRow = this.config.cylindersPerRow || this.config.cylinders / rows;
      const row = Math.floor(index / perRow), localIndex = index % perRow;
      const angle = -(localIndex * TAU / perRow + row * (this.config.rowClockingDegrees ?? this.config.rowClocking ?? 0) * Math.PI / 180);
      const rowZ = ((rows - 1) / 2 - row) * .52;
      const bank = new THREE.Group();
      bank.position.z = rowZ;
      bank.rotation.z = angle;
      bank.name = `radial cylinder ${index + 1}`;
      bank.userData = { cylinderIndex: index, radialRow: row };
      block.add(bank);
      this.cylinder(bank, 0.135, 0.39, [0, 0.66, 0], dark, 'y', 0.135, 'air cooled barrel');
      for (let fin = 0; fin < 10; fin++) this.cylinder(bank, 0.185, 0.016, [0, 0.48 + fin * 0.036, 0], cast, 'y');
      this.box(bank, [0.34, 0.25, 0.33], [0, 0.94, 0], cast, true, 'cylinder head');
      for (let fin = 0; fin < 4; fin++) this.box(bank, [0.37, 0.015, 0.35], [0, 0.86 + fin * 0.059, 0], machined, false);
      this.box(bank, [0.32, 0.09, 0.34], [0, 1.10, 0], dark, true, 'rocker cover');
      for (const side of [-1, 1]) {
        this.tube(bank, [[side * 0.10, 0.34, 0.21], [side * 0.10, 0.71, 0.24], [side * 0.10, 1.02, 0.17]], 0.021, steel, 'pushrod tube');
        this.cylinder(bank, 0.022, 0.07, [side * 0.12, 1.02, 0.21], this.palette.ceramic, 'z');
      }
      for (const x of [-0.11, 0.11]) this.bolt(bank, [x, 1.15, 0.11]);
      this.intakeAnchors.push(new THREE.Vector3(-0.12, 0.9, -0.17 + rowZ).applyAxisAngle(Z_AXIS, angle));
      this.headerAnchors.push(new THREE.Vector3(0.12, 0.9, -0.17 + rowZ).applyAxisAngle(Z_AXIS, angle));
    }
    for (let index = 0; index < 10; index++) {
      const angle = index * TAU / 10;
      this.bolt(block, [Math.cos(angle) * 0.37, Math.sin(angle) * 0.37, 0.26], 'z');
    }
    if (this.config.builtInInduction === 'centrifugal-supercharger') {
      const blower = this.part('factory-supercharger');
      blower.userData.inductionKind = 'factory gear-driven centrifugal';
      const rear = -this.length / 2 - .12;
      this.cylinder(blower, .35, .20, [0, 0, rear], cast, 'z', .31, 'factory centrifugal supercharger casing');
      this.ring(blower, .355, .025, [0, 0, rear - .08], machined);
      this.cylinder(blower, .14, .15, [0, 0, rear - .15], dark, 'z', .13, 'centrifugal compressor inlet');
      this.tube(blower, [[.26, .10, rear], [.39, .21, rear], [.28, .31, rear + .09]], .06, cast, 'factory compressor delivery scroll');
    }
    this.box(block, [0.28, 0.15, 0.3], [0, -0.42, 0], dark, true, 'oil collection sump');
  }

  buildRotary() {
    const block = this.part('block');
    block.userData.rotorHousingCount = this.config.rotors || this.config.cylinders;
    const shape = new THREE.Shape();
    for (let sample = 0; sample <= 120; sample++) {
      const p = rotaryHousingPoint(sample * TAU / 120, 70, 11);
      if (!sample) shape.moveTo(p.x * 0.007, p.y * 0.007);
      else shape.lineTo(p.x * 0.007, p.y * 0.007);
    }
    shape.closePath();
    const createHousing = (depth, expansion) => {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.017, bevelThickness: 0.017, curveSegments: 8 });
      geometry.scale(expansion, expansion, 1);
      this.geometries.add(geometry);
      return geometry;
    };
    const rotors = this.config.rotors || 2;
    for (let rotor = 0; rotor < rotors; rotor++) {
      const z = (rotor - (rotors - 1) / 2) * 0.41;
      const housing = this.mesh(block, createHousing(0.29, 1.08), this.palette.cast, [0, 0.17, z - 0.145], `rotor housing ${rotor + 1}`);
      housing.userData.rotorIndex = rotor;
      for (const face of [-1, 1]) this.mesh(block, createHousing(0.028, 1.16), this.palette.machined, [0, 0.17, z + face * 0.164 - 0.014], 'rotary side plate');
      for (let rib = 0; rib < 4; rib++) this.mesh(block, createHousing(0.018, 1.125), this.palette.cast, [0, 0.17, z - 0.113 + rib * 0.074], 'rotary cooling rib');
      for (let sample = 0; sample < 12; sample++) {
        const p = rotaryHousingPoint(sample * TAU / 12, 70, 11);
        this.bolt(block, [p.x * 0.008, 0.17 + p.y * 0.008, z + 0.197], 'z');
      }
      const plugCount = this.config.plugsPerRotor || this.config.sparkPlugsPerRotor || (rotors === 4 ? 3 : 2);
      for (const plug of Array.from({ length: plugCount }, (_, index) => (index - (plugCount - 1) / 2) * .10)) {
        const p = this.cylinder(block, 0.025, 0.075, [0.52, 0.27 + plug, z], this.palette.ceramic, 'x', 0.022, 'rotary leading / trailing plug');
        p.rotation.z -= 0.1;
      }
      this.intakeAnchors.push(new THREE.Vector3(-0.34, 0.5, z));
      this.headerAnchors.push(new THREE.Vector3(0.35, 0.06, z));
    }
    this.box(block, [0.60, 0.14, this.length * 0.82], [0, -0.32, 0], this.palette.dark, true, 'rotary oil sump');
    this.cylinder(block, 0.27, 0.07, [0, 0.17, this.front - 0.045], this.palette.cast, 'z', 0.27, 'eccentric shaft front cover');
  }

  // Hollow castings have actual inner walls and annular end lips. A closed
  // CylinderGeometry would seal the inlet and hide the rotating compressor.
  aviationSleeve(parent, outer, inner, length, z, material, name) {
    const profile = [new THREE.Vector2(inner, -length / 2), new THREE.Vector2(outer, -length / 2),
      new THREE.Vector2(outer, length / 2), new THREE.Vector2(inner, length / 2), new THREE.Vector2(inner, -length / 2)];
    const geometry = this.geometry('sleeve:' + [outer, inner, length].join(','), () => new THREE.LatheGeometry(profile, 48));
    const sleeve = this.mesh(parent, geometry, material, [0, 0, z], name);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.userData.hollow = true;
    sleeve.userData.innerRadius = inner;
    return sleeve;
  }

  aviationBladeStages(parent, count, startZ, gap, hotSection, source = 'core') {
    const { hot, machined, steel, dark } = this.palette;
      for (let stage = 0; stage < count; stage++) {
        const rotor = new THREE.Group();
        rotor.name = (hotSection ? 'turbine' : 'compressor') + ' rotor ' + (stage + 1);
        rotor.position.z = startZ - stage * gap;
        rotor.userData.stageIndex = stage;
        if (this.config.layout === 'turbine') rotor.scale.setScalar(hotSection ? .80 : .88);
        parent.add(rotor);
        this.spin(rotor, source);
        const radius = hotSection ? .285 + stage * .008 : .302 - stage * .009;
        this.cylinder(rotor, .105, .024, [0, 0, 0], hotSection ? hot : machined, 'z', .105, 'rotor hub');
        for (let blade = 0; blade < 18; blade++) {
          const angle = TAU * blade / 18;
          const leaf = this.box(rotor, [.026, radius - .102, .018], [Math.sin(angle) * (radius + .102) / 2, Math.cos(angle) * (radius + .102) / 2, 0], hotSection ? hot : steel, false, 'rotor blade');
          leaf.rotation.set(0, .32, -angle);
        }
        const stator = new THREE.Group();
        stator.name = (hotSection ? 'turbine' : 'compressor') + ' stator ' + (stage + 1);
        stator.position.z = rotor.position.z - gap * .48;
        if (this.config.layout === 'turbine') stator.scale.setScalar(hotSection ? .80 : .88);
        parent.add(stator);
        for (let vane = 0; vane < 12; vane++) {
          const angle = TAU * vane / 12;
          const leaf = this.box(stator, [.017, radius - .105, .018], [Math.sin(angle) * (radius + .105) / 2, Math.cos(angle) * (radius + .105) / 2, 0], dark, false, 'stationary guide vane');
          leaf.rotation.set(0, -.28, -angle);
        }
      }
      }

  buildFreeTurboshaft(engine) {
    const block = this.part('block'), intake = this.part('intake'), compressor = this.part('compressor');
    const combustor = this.part('combustor'), turbine = this.part('turbine'), power = this.part('power-turbine');
    const nozzle = this.part('nozzle'), gearbox = this.part('gearbox');
    const { cast, hot, steel, machined, dark, brass } = this.palette;
    block.userData.flowDirection = 'axial compressor to external ducts, rear combustor to forward turbines';
    this.aviationSleeve(intake, .31, .278, .17, .66, machined, 'open turboshaft inlet');
    this.aviationSleeve(compressor, .30, .276, .55, .30, cast, 'six-stage axial compressor casing');
    this.aviationBladeStages(compressor, this.config.compressorStages || 6, .56, .078, false, 'core');
    const impeller = new THREE.Group(); impeller.position.z = -.015; compressor.add(impeller);
    impeller.name = 'centrifugal compressor impeller'; this.spin(impeller, 'core');
    this.cylinder(impeller, .30, .035, [0, 0, 0], machined);
    for (let blade = 0; blade < 16; blade++) {
      const a = blade * TAU / 16;
      const leaf = this.box(impeller, [.018, .19, .045], [Math.sin(a) * .18, Math.cos(a) * .18, .025], steel, false, 'centrifugal impeller vane');
      leaf.rotation.z = -a + .22;
    }
    this.ring(compressor, .335, .04, [0, 0, -.015], cast);
    // The external twin ducts route compressor discharge around the turbine
    // module into the rear can; hot gas then reverses direction through it.
    for (const side of [-1, 1]) {
      this.tube(block, [[side * .31, 0, -.015], [side * .43, .04, -.15], [side * .43, .04, -.54], [side * .23, .04, -.68]], .065, cast, 'reverse-flow compressor delivery duct');
      this.tube(nozzle, [[side * .18, .06, -.15], [side * .38, .16, -.18], [side * .42, .39, -.18]], .095, hot, 'turboshaft side exhaust');
      this.aviationSleeve(nozzle, .098, .083, .10, 0, hot, 'open exhaust lip').position.set(side * .42, .43, -.18);
      const lip = nozzle.children.at(-1); lip.rotation.x = 0;
    }
    this.aviationSleeve(combustor, .31, .274, .34, -.65, hot, 'reverse-flow rear combustor can');
    this.cylinder(combustor, .31, .035, [0, 0, -.83], hot, 'z', .31, 'combustor rear dome');
    this.ring(combustor, .315, .013, [0, 0, -.79], machined);
    for (const side of [-1, 1]) this.cylinder(combustor, .022, .07, [side * .10, .10, -.86], brass, 'z', .018, 'combustor fuel/igniter fitting');
    this.aviationSleeve(turbine, .28, .25, .21, -.43, hot, 'gas-generator turbine casing');
    this.aviationSleeve(power, .28, .25, .19, -.21, hot, 'free power turbine casing');
    this.aviationBladeStages(turbine, this.config.gasGeneratorTurbineStages || 2, -.48, -.065, true, 'core');
    this.aviationBladeStages(power, this.config.powerTurbineStages || 2, -.27, -.065, true, 'power');
    const core = new THREE.Group(); block.add(core); core.name = 'gas-generator core shaft'; this.spin(core, 'core');
    this.cylinder(core, .035, 1.10, [0, 0, .04], steel);
    this.cylinder(core, .095, .14, [0, 0, .65], machined, 'z', .01, 'gas-generator inlet spinner');
    this.box(gearbox, [.48, .26, .46], [0, -.35, .14], dark, true, 'turboshaft reduction gearbox');
    const output = new THREE.Group(); output.position.set(0, -.35, .43); gearbox.add(output);
    output.name = 'reduced output shaft'; this.spin(output, 'crank');
    this.cylinder(output, .075, .16, [0, 0, 0], steel);
    for (let tooth = 0; tooth < 8; tooth++) {
      const a = tooth * TAU / 8;
      this.box(output, [.012, .028, .11], [Math.sin(a) * .078, Math.cos(a) * .078, .02], steel, false, 'output shaft spline');
    }
    this.buildMounts();
  }

  buildTurbine(engine) { this.buildFreeTurboshaft(engine); }
  buildTurbojet(engine) { this.buildAviation(engine, true); }

  buildAviation(engine, jet) {
    const { cast, machined, dark, hot, steel, brass } = this.palette;
    const block = this.part('block');
    block.userData.flowDirection = 'positive-z inlet to negative-z exhaust';
    const intake = this.part('intake');
    const compressor = this.part('compressor');
    const combustor = this.part('combustor');
    const turbine = this.part('turbine');
    const nozzle = this.part('nozzle');
    // The model is a family illustration, not dimensional OEM CAD.
    this.aviationSleeve(intake, .355, .321, .17, .69, machined, 'open inlet bellmouth');
    this.aviationSleeve(block, .35, .322, .65, .28, cast, jet ? 'turbojet open compressor casing' : 'turboshaft open compressor casing');
    this.aviationSleeve(combustor, .375, .33, .27, -.18, hot, 'annular combustor casing');
    this.aviationSleeve(turbine, .35, .322, .25, -.43, hot, 'open turbine casing');
    this.aviationSleeve(nozzle, .345, .315, jet ? .45 : .19, jet ? -.77 : -.64, hot, 'open exhaust duct');
    for (const z of [.605, -.045, -.315, -.555]) {
      this.ring(block, .358, .012, [0, 0, z], machined);
      for (let n = 0; n < 8; n++) {
        const angle = TAU * n / 8;
        this.cylinder(block, .012, .035, [Math.cos(angle) * .367, Math.sin(angle) * .367, z], steel, 'z', .012, 'casing flange bolt');
      }
    }
    // A narrow hub and separate airfoil illustrations leave visible air
    // passages. Stators belong to stationary groups, not the spinning shaft.
    const stages = (...args) => this.aviationBladeStages(...args);
    const compressorCount = jet ? (this.config.compressorStages || 9) : 4;
    stages(compressor, compressorCount, .58, .56 / compressorCount, false);
    stages(turbine, jet ? (this.config.turbineStages || 2) : 2, -.35, .10, true);
    const shaft = new THREE.Group(); shaft.name = 'core shaft'; block.add(shaft);
    this.cylinder(shaft, .045, 1.12, [0, 0, .08], steel, 'z', .045, 'core shaft spindle');
    this.cylinder(shaft, .105, .16, [0, 0, .68], machined, 'z', .012, 'inlet spinner');
    this.spin(shaft, 'core');
    for (let n = 0; n < 10; n++) {
      const angle = n * TAU / 10;
      this.cylinder(combustor, .014, .065, [Math.cos(angle) * .365, Math.sin(angle) * .365, -.16], brass, 'z', .014, 'fuel nozzle fitting');
    }
    this.ring(combustor, .38, .009, [0, 0, -.16], brass);
    if (jet) {
      const afterburner = this.part('afterburner');
      for (const radius of [.16, .25]) this.ring(afterburner, radius, .009, [0, 0, -.68], hot);
      for (let n = 0; n < 8; n++) {
        const angle = n * TAU / 8;
        const vane = this.box(afterburner, [.012, .15, .02], [Math.sin(angle) * .215, Math.cos(angle) * .215, -.68], hot, false, 'stationary flameholder');
        vane.rotation.z = -angle;
      }
      for (let n = 0; n < 16; n++) {
        const angle = n * TAU / 16;
        const hinge = new THREE.Group();
        hinge.position.set(Math.cos(angle) * .325, Math.sin(angle) * .325, -.94);
        hinge.rotation.z = angle + Math.PI / 2;
        nozzle.add(hinge);
        const petal = new THREE.Group();
        hinge.add(petal);
        this.box(petal, [.13, .015, .19], [0, 0, -.095], dark, false, 'variable nozzle petal');
        this.nozzlePetals.push({ object: petal, hinge, angle });
      }
      const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x75aeff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      this.materials.add(flameMaterial);
      this.jetPlume = this.mesh(nozzle, this.geometry('jet plume', () => new THREE.ConeGeometry(.24, .6, 32, 1, true)), flameMaterial, [0, 0, -1.4], 'afterburner luminous plume');
      this.jetPlume.rotation.x = -Math.PI / 2;
      this.jetPlume.castShadow = this.jetPlume.receiveShadow = false;
      this.jetPlume.userData.excludeBounds = true;
    } else {
      const gearbox = this.part('gearbox');
      this.box(gearbox, [.43, .23, .40], [0, -.37, -.05], dark, true, 'turboshaft reduction gearbox');
    }
    const mounts = this.part('mounts');
    for (const z of [.37, -.40]) {
      for (const side of [-1, 1]) {
        this.box(mounts, [.065, .32, .075], [side * .39, -.37, z], dark, false, 'test stand upright');
        this.tube(mounts, [[side * .39, -.22, z], [side * .31, -.16, z]], .022, steel, 'case mounting strut');
      }
      this.box(mounts, [.94, .055, .13], [0, -.55, z], dark, true, 'static bench crossmember');
    }
    this.box(mounts, [.10, .06, 1.15], [-.41, -.58, -.01], dark, false, 'bench rail');
    this.box(mounts, [.10, .06, 1.15], [.41, -.58, -.01], dark, false, 'bench rail');
  }

  buildRacingRotaryIntake() {
    const intake = this.part('intake');
    intake.userData.portKind = 'peripheral';
    this.plenumPosition = new THREE.Vector3(-.55, .61, 0);
    this.plenumInlet = new THREE.Vector3(-.72, .61, this.front);
    this.filterOutlet = this.plenumInlet.clone().add(new THREE.Vector3(-.18, 0, .06));
    const profile = [[.061, 0], [.065, .17], [.105, .24], [.112, .25], [.108, .235], [.059, .17], [.056, 0]].map(p => new THREE.Vector2(...p));
    const trumpet = this.geometry('R26B annular intake trumpet', () => new THREE.LatheGeometry(profile, 32));
    for (const [index, anchor] of this.intakeAnchors.entries()) {
      const center = new THREE.Vector3(-.49, .67, anchor.z);
      this.tube(intake, [anchor, [-.47, .53, anchor.z], center], .061, this.palette.machined, 'peripheral intake runner');
      const horn = this.mesh(intake, trumpet, this.palette.machined, center, 'R26B variable-length intake trumpet');
      horn.userData.intakeRotorIndex = index;
      for (const height of [.03, .11]) this.ring(intake, .069, .008, center.clone().add(new THREE.Vector3(0, height, 0)), this.palette.steel, 'y');
      this.box(intake, [.045, .055, .07], [-.61, .70, anchor.z], this.palette.dark, true, 'intake trumpet slider linkage');
    }
    this.tube(intake, [[-.62, .72, -this.length * .39], [-.62, .72, this.length * .39]], .014, this.palette.steel, 'variable-intake common actuator rail');
    this.box(intake, [.12, .10, .14], [-.66, .71, 0], this.palette.dark, true, 'variable-intake actuator');
  }

  buildIntake() {
    const intake = this.part('intake');
    const radial = this.config.layout === 'radial';
    this.plenumPosition = new THREE.Vector3(radial ? 0 : -0.28, radial ? 0 : this.config.layout === 'boxer' ? 0.68 : this.config.layout === 'rotary' ? 0.76 : 1.05, radial ? -0.36 : 0);
    if (radial) this.ring(intake, 0.37, 0.073, this.plenumPosition, this.palette.dark);
    else this.box(intake, [0.34, 0.23, this.length * 0.9], this.plenumPosition, this.palette.cast, true, 'intake plenum');
    for (const [index, anchor] of this.intakeAnchors.entries()) {
      const join = radial ? new THREE.Vector3(anchor.x * 0.42, anchor.y * 0.42, -0.36)
        : new THREE.Vector3(this.plenumPosition.x, this.plenumPosition.y - 0.05, anchor.z);
      this.tube(intake, [anchor, [anchor.x - 0.12, anchor.y + 0.13, anchor.z], join], 0.045, this.palette.cast, `intake runner ${index + 1}`);
    }
    this.plenumInlet = this.plenumPosition.clone().add(new THREE.Vector3(0, 0, this.length * (radial ? 0 : 0.46)));
    this.cylinder(intake, 0.075, 0.10, this.plenumInlet, this.palette.machined, 'z', 0.075, 'throttle body');
    this.box(intake, [0.09, 0.10, 0.10], this.plenumInlet.clone().add(new THREE.Vector3(0.10, 0, 0)), this.palette.dark, true, 'throttle actuator');
    this.filterOutlet = new THREE.Vector3(radial ? -0.6 : -0.88, radial ? -0.78 : 0.34, this.front + 0.1);
    if (this.mods.intake === 'sport') {
      const filter = this.cylinder(intake, 0.16, 0.23, this.filterOutlet.clone().add(new THREE.Vector3(0, 0, 0.14)), this.palette.filter, 'z', 0.115, 'sport cone air filter');
      filter.userData.modVariant = 'sport';
      for (let fin = 0; fin < 24; fin++) {
        const t = fin * TAU / 24;
        this.tube(intake, [[this.filterOutlet.x + 0.155 * Math.cos(t), this.filterOutlet.y + 0.155 * Math.sin(t), this.filterOutlet.z + 0.025],
          [this.filterOutlet.x + 0.117 * Math.cos(t), this.filterOutlet.y + 0.117 * Math.sin(t), this.filterOutlet.z + 0.25]], 0.005, this.palette.dark, 'filter pleat');
      }
      for (const z of [0.025, 0.25]) this.ring(intake, z < 0.1 ? 0.157 : 0.118, 0.008, this.filterOutlet.clone().add(new THREE.Vector3(0, 0, z)), this.palette.steel);
      // The catalog models cold, enclosed intake air rather than a hot exposed
      // cone. A removable inspection cover reveals the pleated filter.
      const enclosure = new THREE.Group();
      enclosure.position.copy(this.filterOutlet);
      enclosure.name = 'sealed sport cold-air housing';
      intake.add(enclosure);
      for (const side of [-1, 1]) {
        const wall = this.box(enclosure, [0.018, 0.38, 0.36], [side * 0.205, 0, 0.135], this.palette.dark, true, 'cold-air side panel');
        if (side === -1) this.intakeCovers.push(this.inspectionCover(wall, [0.68, 0, 0.11], [0, Math.PI / 2, 0]));
      }
      this.box(enclosure, [0.41, 0.018, 0.36], [0, -0.19, 0.135], this.palette.dark, true);
      this.box(enclosure, [0.40, 0.35, 0.018], [0, 0, -0.045], this.palette.dark, true);
      const lid = new THREE.Group();
      lid.position.y = 0.19;
      enclosure.add(lid);
      this.box(lid, [0.43, 0.027, 0.37], [0, 0, 0.135], this.palette.dark, true, 'cold-air inspection lid');
      this.box(lid, [0.27, 0.006, 0.028], [0, 0.017, 0.10], this.palette.sport, false);
      for (const x of [-0.15, 0.15]) for (const z of [0.01, 0.26]) this.bolt(lid, [x, 0.024, z]);
      this.intakeCovers.push(this.inspectionCover(lid, [0.52, 0.06, 0], [0, 0, -Math.PI / 3]));
      const face = this.box(enclosure, [0.41, 0.38, 0.018], [0, 0, 0.315], this.palette.dark, true, 'cold-air inspection end cover');
      this.intakeCovers.push(this.inspectionCover(face, [0.53, 0, 0.11], [0, Math.PI / 2, 0]));
      this.tube(intake, [this.filterOutlet.clone().add(new THREE.Vector3(-0.12, -0.035, 0.315)),
        this.filterOutlet.clone().add(new THREE.Vector3(-0.30, -0.035, 0.38)), this.filterOutlet.clone().add(new THREE.Vector3(-0.32, -0.035, 0.47))], 0.064, this.palette.dark, 'sport cold-air snorkel');
      this.cylinder(intake, 0.074, 0.07, this.filterOutlet.clone().add(new THREE.Vector3(0, 0, -0.06)), this.palette.filter, 'z', 0.074, 'sport intake coupler');
    } else {
      this.box(intake, [0.35, 0.27, 0.30], this.filterOutlet.clone().add(new THREE.Vector3(-0.05, 0, 0.14)), this.palette.dark, true, 'sealed airbox');
      for (let rib = 0; rib < 5; rib++) this.box(intake, [0.30, 0.014, 0.015], [this.filterOutlet.x - 0.05, this.filterOutlet.y + 0.14, this.filterOutlet.z + 0.03 + rib * 0.055], this.palette.rubber, false);
      this.tube(intake, [[this.filterOutlet.x - 0.20, this.filterOutlet.y - 0.02, this.filterOutlet.z + 0.16], [this.filterOutlet.x - 0.30, this.filterOutlet.y - 0.03, this.filterOutlet.z + 0.28]], 0.06, this.palette.dark, 'airbox snorkel');
    }
    // An actual bracket anchors the intake to the engine assembly.
    this.tube(intake, [this.filterOutlet.clone().add(new THREE.Vector3(0, -0.12, 0)), [-0.35, -0.15, this.front - 0.12]], 0.014, this.palette.steel, 'airbox mounting bracket');
    if (this.induction === 'na') this.tube(intake, [this.filterOutlet, [-0.64, 0.55, this.front], this.plenumInlet], 0.07, this.palette.rubber, 'intake duct');
  }

  buildExhaust(engine) {
    const headers = this.part('headers');
    const tuned = this.mods.headers === 'tuned';
    const radial = this.config.layout === 'radial';
    const material = tuned ? this.palette.tuned : this.palette.hot;
    const turboManifold = this.induction === 'turbo';
    headers.userData.manifoldKind = turboManifold ? 'short turbo manifold' : tuned ? 'tuned long runners' : 'stock compact runners';
    this.collector = new THREE.Vector3(radial ? 0.9 : 0.83, radial ? -0.74 : -0.08, -this.length * 0.15);
    if (radial) this.ring(headers, 0.83, tuned ? 0.047 : 0.063, [0, 0, -0.45], material);
    for (const [index, anchor] of this.headerAnchors.entries()) {
      const side = !radial && this.banks.length > 1 && anchor.x < 0 ? -1 : 1;
      const destination = radial ? new THREE.Vector3(anchor.x * 0.9, anchor.y * 0.9, -0.45)
        : new THREE.Vector3(this.collector.x * side, this.collector.y, this.collector.z);
      const bend = new THREE.Vector3(anchor.x + side * (tuned && !turboManifold ? 0.32 : 0.13), anchor.y - (tuned && !turboManifold ? 0.13 : 0.20), anchor.z);
      const points = radial ? [anchor, [anchor.x * 1.12, anchor.y * 1.12, -0.35], destination]
        : turboManifold ? [anchor, bend, destination] : [anchor, bend, [side * Math.max(0.55, Math.abs(bend.x)), -0.02, anchor.z * 0.65], destination];
      const runner = this.tube(headers, points, tuned ? 0.039 : 0.043, material, `exhaust runner ${index + 1}`);
      runner.userData.cylinderIndex = index;
      const flange = this.cylinder(headers, 0.061, 0.023, anchor, this.palette.steel, 'x');
      flange.lookAt(anchor.clone().add(new THREE.Vector3(1, 0, 0)));
    }
    if (radial) this.tube(headers, [[0.5, -0.66, -0.45], this.collector], 0.074, material, 'radial collector outlet');
    else if (this.banks.length > 1) {
      const left = new THREE.Vector3(-this.collector.x, this.collector.y, this.collector.z);
      this.cylinder(headers, 0.087, 0.16, left, material, 'z', 0.075, 'left bank collector');
      this.tube(headers, [left, [-0.74, -0.46, -this.length / 2 - 0.03], [0.55, -0.46, -this.length / 2 - 0.03], this.collector], 0.061, material, 'bank crossover beneath crankcase');
    }
    this.cylinder(headers, 0.094, 0.16, this.collector, material, 'z', 0.080, 'exhaust collector');
    const exhaust = this.part('exhaust');
    exhaust.userData.exhaustModel = engine.exhaust?.id || 'oem';
    this.exhaustInlet = this.induction === 'turbo' ? this.collector.clone().add(new THREE.Vector3(0.21, 0.12, -0.25)) : this.collector.clone();
    const muffler = this.exhaustInlet.clone().add(new THREE.Vector3(0.13, -0.22, -0.40));
    this.tube(exhaust, [this.exhaustInlet, [muffler.x, muffler.y, muffler.z + 0.17], muffler], 0.066, this.palette.steel, 'downpipe');
    const straight = engine.exhaust?.id === 'straight';
    const radius = straight ? 0.073 : engine.exhaust?.id === 'oem' ? 0.145 : 0.113;
    this.cylinder(exhaust, radius, 0.40, muffler.clone().add(new THREE.Vector3(0, 0, -0.20)), straight ? this.palette.steel : this.palette.dark, 'z', radius, 'exhaust silencer');
    for (const delta of [-0.025, -0.375]) this.ring(exhaust, radius + 0.004, 0.012, muffler.clone().add(new THREE.Vector3(0, 0, delta)), this.palette.steel);
    this.cylinder(exhaust, 0.068, 0.12, muffler.clone().add(new THREE.Vector3(0, 0, -0.455)), this.palette.machined);
    this.cylinder(exhaust, 0.055, 0.004, muffler.clone().add(new THREE.Vector3(0, 0, -0.518)), this.palette.gasket, 'z', 0.055, 'open exhaust outlet');
    this.tube(exhaust, [muffler.clone().add(new THREE.Vector3(0, 0.13, -0.15)), [0.2, -0.14, -this.length * 0.30]], 0.014, this.palette.steel, 'exhaust hanger');
  }

  pulley(parent, center, radius, source = 'crank', ratio = 1, material = this.palette.dark) {
    const wheel = new THREE.Group();
    wheel.position.copy(v3(center));
    parent.add(wheel);
    this.cylinder(wheel, radius, 0.055, [0, 0, 0], material);
    for (const z of [-0.031, 0.031]) this.ring(wheel, radius, 0.006, [0, 0, z], this.palette.steel);
    this.cylinder(wheel, radius * 0.34, 0.069, [0, 0, 0], this.palette.steel);
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke * TAU / 6;
      this.bolt(wheel, [Math.sin(angle) * radius * 0.66, Math.cos(angle) * radius * 0.66, 0.041], 'z');
    }
    wheel.userData.radius = radius;
    this.spin(wheel, source, ratio);
    return wheel;
  }

  driveBelt(parent, a, ra, b, rb) {
    // External tangents and pulley wraps keep both spans on the pulley faces.
    const av = v3(a), bv = v3(b), delta = bv.clone().sub(av);
    const d = Math.hypot(delta.x, delta.y), phi = Math.atan2(delta.y, delta.x);
    const tangentAngle = Math.acos(clamp((ra - rb) / d, -1, 1));
    const top = phi + tangentAngle, bottom = phi - tangentAngle;
    const points = [];
    const append = (center, radius, start, end) => {
      for (let i = 0; i <= 24; i++) {
        const angle = start + (end - start) * i / 24;
        points.push([center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z]);
      }
    };
    append(av, ra, top, bottom + TAU);
    append(bv, rb, bottom, top);
    points.push(points[0]);
    const belt = this.tube(parent, points, 0.010, this.palette.rubber, 'continuous drive belt');
    belt.userData.pulleyCenters = [av.toArray(), bv.toArray()];
    return belt;
  }

  buildFrontDrive() {
    const accessories = this.part('accessories');
    const radial = this.config.layout === 'radial';
    const y = this.config.layout === 'rotary' ? 0.17 : 0;
    this.crankCenter = new THREE.Vector3(0, y, this.front + 0.11);
    this.cylinder(accessories, 0.20, 0.07, [0, y, this.front - 0.01], this.palette.cast, 'z', 0.20, 'front crank seal cover');
    this.crankPulley = this.pulley(accessories, this.crankCenter, 0.145);
    const alternator = new THREE.Vector3(radial ? -0.39 : -0.37, radial ? -0.23 : 0.30, this.crankCenter.z);
    this.cylinder(accessories, 0.10, 0.18, alternator.clone().add(new THREE.Vector3(0, 0, -0.12)), this.palette.machined, 'z', 0.10, 'alternator');
    for (let fin = 0; fin < 7; fin++) this.ring(accessories, 0.104, 0.008, alternator.clone().add(new THREE.Vector3(0, 0, -0.18 + fin * 0.025)), this.palette.cast);
    this.pulley(accessories, alternator, 0.075, 'crank', 0.145 / 0.075);
    this.driveBelt(accessories, this.crankCenter, 0.146, alternator, 0.076);
    this.tube(accessories, [alternator.clone().add(new THREE.Vector3(0, -0.10, -0.06)), [-0.23, 0.01, this.front - 0.12]], 0.027, this.palette.cast, 'alternator bracket');
    this.cylinder(accessories, 0.066, 0.17, [0.30, -0.14, this.front - 0.10], this.palette.dark, 'y', 0.066, 'oil filter');
  }

  buildFlywheel() {
    const flywheel = this.part('flywheel');
    const rearZ = -this.length / 2 - 0.09;
    const y = this.config.layout === 'rotary' ? 0.17 : 0;
    const disk = new THREE.Group();
    disk.position.set(0, y, rearZ);
    flywheel.add(disk);
    const radius = this.config.layout === 'radial' ? 0.24 : 0.28;
    const light = this.mods.flywheel === 'light';
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, TAU, false);
    const center = new THREE.Path();
    center.absarc(0, 0, 0.042, 0, TAU, true);
    shape.holes.push(center);
    if (light) for (let hole = 0; hole < 6; hole++) {
      const angle = hole * TAU / 6;
      const path = new THREE.Path();
      path.absarc(Math.cos(angle) * radius * 0.63, Math.sin(angle) * radius * 0.63, radius * 0.18, 0, TAU, true);
      shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: light ? 0.034 : 0.072, bevelEnabled: false, curveSegments: 20 });
    this.geometries.add(geo);
    const face = this.mesh(disk, geo, light ? this.palette.sport : this.palette.steel, [0, 0, -0.045], 'flywheel with open machined holes');
    face.userData.holeCount = shape.holes.length;
    this.cylinder(disk, 0.075, 0.028, [0, 0, -0.065], this.palette.steel);
    for (let tooth = 0; tooth < 48; tooth++) {
      const angle = tooth * TAU / 48;
      const mesh = this.box(disk, [0.015, 0.025, 0.042], [Math.sin(angle) * radius, Math.cos(angle) * radius, -0.025], this.palette.steel, false, 'starter ring tooth');
      mesh.rotation.z = -angle;
    }
    this.ring(flywheel, radius + 0.053, 0.032, [0, y, rearZ + 0.005], this.palette.cast);
    flywheel.userData.rearInspectionOpening = true;
    this.spin(disk, 'crank');
  }

  buildRadiator(engine) {
    if (this.aviation || this.config.layout === 'radial' || this.config.coolingKind === 'air') return;
    const radiator = this.part('radiator');
    const upgraded = this.mods.radiator === 'upgraded';
    const width = upgraded ? .94 : .78, height = upgraded ? .68 : .58, depth = upgraded ? .12 : .085;
    const center = new THREE.Vector3(.08, .18, this.front + .44);
    radiator.userData.coolingKind = 'liquid'; radiator.userData.upgraded = upgraded;
    this.box(radiator, [width, height, depth], center, this.palette.dark, true, 'radiator frame');
    for (let row = 0; row < (upgraded ? 22 : 16); row++) {
      this.box(radiator, [width * .84, .012, depth + .015], [center.x, center.y - height * .43 + row * height * .86 / ((upgraded ? 22 : 16) - 1), center.z],
        this.palette.machined, false, 'radiator cooling fin');
    }
    for (const side of [-1, 1]) this.box(radiator, [.07, height + .025, depth + .035], [center.x + side * width * .47, center.y, center.z], this.palette.cast, true, 'radiator end tank');
    const head = this.bankAnchors[0] || new THREE.Vector3(0, .65, 0);
    this.tube(radiator, [center.clone().add(new THREE.Vector3(-width * .42, height * .34, -.03)),
      [-.42, .58, this.front + .24], head.clone().add(new THREE.Vector3(-.12, -.08, .12))], .029, this.palette.rubber, 'upper hot coolant hose');
    this.tube(radiator, [center.clone().add(new THREE.Vector3(width * .42, -height * .34, -.03)),
      [.46, -.17, this.front + .18], [.23, -.09, this.front - .05]], .029, this.palette.rubber, 'lower coolant return hose');
    const fan = new THREE.Group(); fan.position.copy(center).add(new THREE.Vector3(0, 0, -depth * .8)); radiator.add(fan);
    fan.name = 'radiator electric fan'; this.ring(radiator, .205, .012, fan.position, this.palette.dark);
    this.cylinder(fan, .045, .05, [0, 0, 0], this.palette.dark);
    for (let n = 0; n < 5; n++) {
      const angle = n * TAU / 5;
      const blade = this.box(fan, [.07, .16, .012], [Math.sin(angle) * .105, Math.cos(angle) * .105, 0], this.palette.dark, false, 'radiator fan blade');
      blade.rotation.z = -angle; blade.rotation.y = .20;
    }
    this.spin(fan, 'fan');
    this.cylinder(radiator, .035, .026, [center.x - width * .4, center.y + height * .54, center.z], this.palette.machined, 'y', .035, 'radiator pressure cap');
    this.tube(radiator, [center.clone().add(new THREE.Vector3(-width * .42, -height * .5, 0)),
      [-.32, -.35, this.front - .02]], .015, this.palette.steel, 'radiator mounting stay');
  }

  buildMounts() {
    const mounts = this.part('mounts');
    const width = this.config.layout === 'radial' ? 0.9 : 0.74;
    const y = this.config.layout === 'radial' ? -1.26 : this.config.layout === 'boxer' ? -0.48 : -0.52;
    for (const x of [-width, width]) {
      this.box(mounts, [0.12, 0.11, 0.21], [x * 0.5, y + 0.10, 0], this.palette.rubber, true, 'engine mounting isolator');
      this.tube(mounts, [[x * 0.5, y + 0.16, 0], [x * 0.36, -0.14, 0.03]], 0.032, this.palette.cast, 'mounting arm');
      this.box(mounts, [0.075, 0.23, 0.55], [x * 0.5, y - 0.04, 0], this.palette.dark, true, 'test cradle');
      for (const z of [-0.2, 0.2]) this.bolt(mounts, [x * 0.5, y + 0.085, z]);
    }
    this.box(mounts, [width + 0.14, 0.07, 0.65], [0, y - 0.18, 0], this.palette.dark, true, 'engine test stand');
  }

  buildInduction(engine) {
    if (this.induction === 'na') return;
    const cooler = this.part('intercooler');
    const upgraded = this.mods.intercooler === 'upgraded';
    const radial = this.config.layout === 'radial';
    const p = new THREE.Vector3(radial ? -0.80 : -0.73, radial ? -0.71 : -0.03, this.front + 0.22);
    const width = upgraded ? 0.62 : 0.43, height = upgraded ? 0.33 : 0.23;
    this.box(cooler, [width, height, 0.095], p, this.palette.dark, true, 'charge cooler core');
    for (let row = 0; row < (upgraded ? 13 : 9); row++) this.box(cooler, [width * 0.84, 0.012, 0.11], [p.x, p.y - height * 0.40 + row * height * 0.8 / (upgraded ? 12 : 8), p.z], this.palette.machined, false, 'cooler cooling fin');
    for (const side of [-1, 1]) this.box(cooler, [0.064, height + 0.02, 0.13], [p.x + side * width * 0.49, p.y, p.z], upgraded ? this.palette.machined : this.palette.cast, true, 'cooler end tank');
    this.tube(cooler, [p.clone().add(new THREE.Vector3(0, -height / 2, 0)), [-0.28, -0.25, this.front - 0.10]], 0.019, this.palette.steel, 'cooler mounting bracket');
    if (this.induction === 'supercharger') {
      cooler.userData.coolingType = 'water-to-air';
      const core = this.superchargerMount().add(new THREE.Vector3(0, -0.235, 0));
      const coreWidth = upgraded ? 0.46 : 0.39;
      this.box(cooler, [coreWidth, upgraded ? 0.15 : 0.13, this.length * 0.8], core, this.palette.machined, true, 'water-to-air core beneath blower');
      this.coolerInlet = core.clone().add(new THREE.Vector3(coreWidth / 2, 0, 0));
      this.coolerOutlet = core.clone().add(new THREE.Vector3(-coreWidth / 2, 0, 0));
      this.tube(cooler, [this.coolerOutlet, this.plenumInlet.clone().add(new THREE.Vector3(-0.12, 0.12, 0)), this.plenumInlet], 0.064, this.palette.cast, 'cooled charge pipe to throttle');
      for (const side of [-1, 1]) {
        this.tube(cooler, [core.clone().add(new THREE.Vector3(side * coreWidth * 0.3, -0.05, 0.25 * this.length)),
          [-0.49 + side * 0.035, 0.38, this.front + 0.12], p.clone().add(new THREE.Vector3(side * width * 0.42, 0, 0.07))], 0.018, this.palette.rubber, 'charge cooler coolant hose');
      }
      this.cylinder(cooler, 0.063, 0.16, p.clone().add(new THREE.Vector3(-width * 0.6, 0.08, -0.05)), this.palette.dark, 'y', 0.063, 'cooler coolant reservoir');
    } else {
      cooler.userData.coolingType = 'air-to-air';
      this.coolerInlet = p.clone().add(new THREE.Vector3(width * 0.55, 0, 0));
      this.coolerOutlet = p.clone().add(new THREE.Vector3(-width * 0.55, 0, 0));
      this.tube(cooler, [this.coolerOutlet, [p.x - width * 0.7, p.y + 0.32, p.z], [this.plenumInlet.x - 0.12, this.plenumInlet.y, this.plenumInlet.z + 0.15], this.plenumInlet], 0.064, this.palette.cast, 'cooled charge pipe to throttle');
    }
    for (const port of [this.coolerInlet, this.coolerOutlet]) {
      this.cylinder(cooler, 0.073, 0.10, port, this.palette.blue, 'x');
      for (const delta of [-0.035, 0.035]) this.ring(cooler, 0.074, 0.005, port.clone().add(new THREE.Vector3(delta, 0, 0)), this.palette.steel, 'x');
    }
    if (this.induction === 'turbo') this.buildTurbo(engine);
    else this.buildSupercharger(engine);
  }

  buildTurbo(engine) {
    const turbo = this.part('turbo');
    const radius = engine.turboSize === 'large' ? 0.225 : 0.170;
    const center = this.collector.clone().add(new THREE.Vector3(0.14, 0.18, 0.07));
    turbo.userData.turboSize = engine.turboSize || 'small';
    turbo.userData.housingRadius = radius;
    this.tube(turbo, [this.collector, [center.x, center.y - radius, center.z - 0.08]], 0.076, this.palette.hot, 'manifold to turbine inlet');
    for (const [offset, material, label] of [[-0.09, this.palette.hot, 'exhaust turbine volute'], [0.13, this.palette.machined, 'compressor volute']]) {
      const p = center.clone().add(new THREE.Vector3(0, 0, offset));
      this.ring(turbo, radius * 0.74, radius * 0.26, p, material);
      this.cylinder(turbo, radius * 0.66, 0.10, p, material);
      this.cylinder(turbo, radius * 0.45, 0.06, p.clone().add(new THREE.Vector3(0, 0, 0.075)), this.palette.gasket);
      this.ring(turbo, radius * 0.96, 0.012, p, this.palette.steel);
      const entry = p.clone().add(new THREE.Vector3(radius * 0.75, -radius * 0.30, 0));
      this.tube(turbo, [p.clone().add(new THREE.Vector3(radius * 0.65, 0, 0)), entry, entry.clone().add(new THREE.Vector3(0, -radius * 0.65, 0))], radius * 0.25, material, `${label} scroll neck`);
    }
    this.cylinder(turbo, 0.052, 0.18, center.clone().add(new THREE.Vector3(0, 0, 0.015)), this.palette.hot, 'z', 0.052, 'turbo bearing housing');
    const rotor = new THREE.Group();
    rotor.position.copy(center.clone().add(new THREE.Vector3(0, 0, 0.215)));
    turbo.add(rotor);
    this.cylinder(rotor, 0.022, 0.038, [0, 0, 0], this.palette.steel);
    for (let blade = 0; blade < 10; blade++) {
      const angle = blade * TAU / 10;
      const mesh = this.box(rotor, [radius * 0.25, 0.017, 0.025], [Math.cos(angle) * radius * 0.27, Math.sin(angle) * radius * 0.27, 0], this.palette.machined, false, 'compressor blade');
      mesh.rotation.z = angle + 0.3;
    }
    this.spin(rotor, 'turbo');
    const suction = center.clone().add(new THREE.Vector3(0, 0, 0.245));
    // The elbow attaches around the inlet rim, leaving compressor blades inspectable.
    this.tube(turbo, [this.filterOutlet, [-0.5, 0.30, this.front + 0.35], [center.x + 0.04, center.y, this.front + 0.35], suction], 0.070, this.palette.rubber, 'filter to compressor inlet');
    const discharge = center.clone().add(new THREE.Vector3(radius * 0.75, -radius * 0.95, 0.13));
    this.tube(turbo, [discharge, [center.x + 0.15, -0.20, this.front + 0.21], this.coolerInlet], 0.063, this.palette.cast, 'compressor to cooler charge pipe');
    this.tube(turbo, [center.clone().add(new THREE.Vector3(0, 0, -0.18)), this.exhaustInlet], 0.071, this.palette.hot, 'turbine outlet');
    this.cylinder(turbo, 0.061, 0.05, center.clone().add(new THREE.Vector3(radius, 0.05, -0.03)), this.palette.steel, 'x', 0.061, 'wastegate actuator');
    this.tube(turbo, [center.clone().add(new THREE.Vector3(radius + 0.02, 0.05, -0.03)), center.clone().add(new THREE.Vector3(radius * 0.75, -radius * 0.3, -0.10))], 0.009, this.palette.steel, 'wastegate linkage');
    if (!['flutter', 'none'].includes(engine.bovType)) {
      this.cylinder(turbo, 0.053, 0.10, [0.15, -0.20, this.front + 0.21], this.palette.sport, 'y', 0.067, 'blow off / recirculation valve');
      this.tube(turbo, [[0.15, -0.12, this.front + 0.21], [0.05, 0.30, this.front + 0.12], this.plenumInlet], 0.007, this.palette.rubber, 'BOV reference hose');
    }
  }

  superchargerMount() {
    const radial = this.config.layout === 'radial';
    return new THREE.Vector3(0, radial ? -1.43 : this.config.layout === 'boxer' || this.config.layout === 'rotary' ? 1.10 : 1.36, radial ? -0.53 : 0);
  }

  buildSupercharger(engine) {
    const blower = this.part('supercharger');
    const base = this.superchargerMount();
    const { y, z } = base;
    this.box(blower, [0.43, 0.29, this.length * 0.8], base, this.palette.cast, true, 'Roots / TVS supercharger case');
    blower.userData.superchargerType = 'roots-tvs';
    for (let rib = 0; rib < 9; rib++) this.box(blower, [0.45, 0.014, this.length * 0.72], [base.x, base.y - 0.12 + rib * 0.031, base.z], this.palette.machined, false, 'blower casing rib');
    for (const x of [-0.15, 0.15]) for (const zz of [-0.3, 0.3]) this.bolt(blower, [base.x + x, y + 0.16, z + zz * this.length]);
    const inlet = base.clone().add(new THREE.Vector3(-0.25, 0, this.length * 0.15));
    this.tube(blower, [this.filterOutlet, [-0.66, y * 0.6, this.front + 0.10], inlet], 0.073, this.palette.rubber, 'filter to supercharger inlet');
    this.tube(blower, [base.clone().add(new THREE.Vector3(0.25, -0.07, 0)), [0.29, y - 0.21, z], this.coolerInlet], 0.068, this.palette.cast, 'blower to charge cooler');
    const pulleyPart = this.part('pulley');
    const pulleyCenter = new THREE.Vector3(0, y, this.crankCenter.z);
    const ratio = this.mods.pulley === 'overdrive' ? 1.10 : 1;
    const baseRatio = 1.7 * Math.sqrt((1 + Math.max(0, engine.maxBoost || 0)) / 1.7);
    const radius = 0.15 / (baseRatio * ratio);
    pulleyPart.userData.driveRatioMultiplier = ratio;
    pulleyPart.userData.baseDriveRatio = baseRatio;
    this.cylinder(pulleyPart, 0.048, Math.max(0.05, this.crankCenter.z - z - this.length * 0.40), [0, y, (this.crankCenter.z + z + this.length * 0.40) / 2], this.palette.cast, 'z', 0.048, 'blower drive nose');
    this.pulley(pulleyPart, pulleyCenter, radius, 'supercharger', 1, ratio > 1 ? this.palette.sport : this.palette.dark);
    this.driveBelt(pulleyPart, this.crankCenter.clone().add(new THREE.Vector3(0, 0, 0.044)), 0.15, pulleyCenter.clone().add(new THREE.Vector3(0, 0, 0.044)), radius + 0.002);
    this.ring(pulleyPart, 0.15, 0.012, this.crankCenter.clone().add(new THREE.Vector3(0, 0, 0.044)), this.palette.steel);
  }

  setFocus(partId) {
    this.focusedPart = this.parts.has(partId) ? partId : null;
    for (const [covers, id] of [[this.covers, 'camshaft'], [this.intakeCovers, 'intake']]) for (const cover of covers) {
      const opened = this.focusedPart === id;
      cover.object.position.copy(opened ? cover.openedPosition : cover.closedPosition);
      cover.object.rotation.copy(opened ? cover.openedRotation : cover.closedRotation);
    }
    this.group.updateMatrixWorld(true);
    return this.focusedPart ? this.parts.get(this.focusedPart) : this.group;
  }

  batchRepeatedMeshes() {
    // Repeated fins, teeth, lobes and fasteners share one GPU draw per parent.
    // Groups remain intact so rotating shafts and selectable parts still work.
    const groups = [];
    this.group.traverse(node => { if (node.isGroup) groups.push(node); });
    for (const group of groups) {
      const batches = new Map();
      for (const child of group.children) {
        if (!child.isMesh || child.isInstancedMesh || child.userData.path || child.userData.holeCount !== undefined) continue;
        const key = `${child.geometry.uuid}:${child.material.uuid}:${child.name}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(child);
      }
      for (const meshes of batches.values()) {
        if (meshes.length < 4) continue;
        const first = meshes[0];
        const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
        this.instances.add(batch);
        batch.name = first.name;
        batch.userData.logicalInstanceCount = meshes.length;
        batch.castShadow = batch.receiveShadow = true;
        meshes.forEach((mesh, index) => {
          mesh.updateMatrix();
          batch.setMatrixAt(index, mesh.matrix);
          group.remove(mesh);
        });
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        group.add(batch);
      }
    }
  }

  batchStaticRadialMeshes() {
    // Two radial rows repeat the same stationary castings many times. Batch
    // across barrel groups while retaining all cylinder markers and row IDs.
    const block = this.parts.get('block');
    this.group.updateMatrixWorld(true);
    const inverse = block.matrixWorld.clone().invert();
    const groups = new Map();
    block.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.path) return;
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${mesh.name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    });
    for (const meshes of groups.values()) {
      if (meshes.length < 4) continue;
      const first = meshes[0], batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
      batch.name = first.name; batch.userData.logicalInstanceCount = meshes.length;
      batch.castShadow = batch.receiveShadow = true;
      meshes.forEach((mesh, index) => {
        batch.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        mesh.removeFromParent();
      });
      batch.computeBoundingBox(); batch.computeBoundingSphere();
      this.instances.add(batch); block.add(batch);
    }
  }

  update(engine, dt, animationSpeed = 1) {
    if (this.disposed) return;
    const step = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.25)) * clamp(animationSpeed, 0.05, 1);
    // A turbo can coast after ignition is switched off. Its actual model RPM,
    // rather than the ignition flag, determines that physical motion.
    this.phase.turbo = (this.phase.turbo + Math.max(0, engine.turboRPM || 0) * TAU / 60 * step) % TAU;
    this.phase.supercharger = (this.phase.supercharger + Math.max(0, engine.superchargerRPM || 0) * TAU / 60 * step) % TAU;
    this.phase.fan = (this.phase.fan + (engine.radiatorFanOn ? 900 : 0) * TAU / 60 * step) % TAU;
    this.phase.power = (this.phase.power + Math.max(0, engine.powerTurbineRPM || 0) * TAU / 60 * step) % TAU;
    this.phase.core = (this.phase.core + Math.max(0, engine.coreRPM ?? engine.rpm ?? 0) * TAU / 60 * step) % TAU;
    this.phase.crank += Math.max(0, engine.rpm || 0) * TAU / 60 * step;
    if (this.aviation && animationSpeed === 1) {
      if (Number.isFinite(engine.coreAngle)) this.phase.core = engine.coreAngle * Math.PI / 180;
      if (Number.isFinite(engine.powerTurbineAngle)) this.phase.power = engine.powerTurbineAngle * Math.PI / 180;
      if (Number.isFinite(engine.crankAngle)) this.phase.crank = engine.crankAngle * Math.PI / 180;
    }
    const crank = this.phase.crank;
    for (const item of this.animated) {
      const phase = item.source === 'crank' ? crank : item.source === 'cam' ? crank / 2 : this.phase[item.source];
      item.object.rotation.z = item.initialZ + phase * item.ratio;
    }
    if (this.aviation) {
      const area = clamp(Number(engine.nozzleAreaRatio) || 1, .65, 2);
      for (const { object } of this.nozzlePetals) {
        const exitRadius = .302 * Math.sqrt(area);
        object.rotation.x = -Math.asin(clamp((exitRadius - .325) / .19, -.95, .95));
      }
      if (this.jetPlume) {
        const burning = typeof engine.isCombusting === 'boolean' ? engine.isCombusting : engine.isIgnitionOn && engine.rpm > 0;
        const faultFire = clamp(Number(engine.faultFireAmount) || 0, 0, 1);
        const amount = Math.max(burning ? clamp(Number(engine.afterburnerAmount) || 0, 0, 1) : 0, faultFire * .85);
        this.jetPlume.material.color.setHex(faultFire > .01 ? 0xf49b57 : 0x75aeff);
        this.jetPlume.material.opacity = amount * .52;
        this.jetPlume.visible = amount > .001;
        this.jetPlume.scale.set(Math.sqrt(area), Math.max(.1, amount), Math.sqrt(area));
      }
    }
    this.palette.hot.emissive.setRGB(Math.min(0.08, Math.max(0, engine.exhaustHeat || 0) * 0.02), 0.005, 0);
  }

  getBounds(partId) {
    this.group.updateMatrixWorld(true);
    if (!this.aviation) return new THREE.Box3().setFromObject(this.parts.get(partId) || this.group);
    const bounds = new THREE.Box3();
    (this.parts.get(partId) || this.group).traverse(object => {
      if (!object.isMesh || object.userData.excludeBounds) return;
      if (object.isInstancedMesh) {
        object.computeBoundingBox();
        bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      } else {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return bounds;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const instance of this.instances) instance.dispose();
    this.group.removeFromParent();
    this.parts.clear();
    this.animated.length = 0;
    this.covers.length = 0;
    this.intakeCovers.length = 0;
    this.geometryCache.clear();
    this.instances.clear();
  }
}
