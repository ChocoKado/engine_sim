"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AerospaceEngine } from "../data/aerospace";
import type { AerospaceState } from "../lib/aerospace";
import styles from "./AerospaceConsole.module.css";

const turn = 2 * Math.PI;
const material = (color: number, metalness = 0.38) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.38, side: THREE.DoubleSide });

interface Part {
  label: string;
  color: string;
  anchor: THREE.Vector3;
  assembly: THREE.Object3D;
}

interface Model {
  root: THREE.Group;
  covers: THREE.Group;
  parts: Part[];
  update: (state: AerospaceState, elapsed: number) => void;
}

function buildModel(engine: AerospaceEngine): Model {
  const root = new THREE.Group();
  const covers = new THREE.Group();
  root.add(covers);
  const parts: Part[] = [];
  const steel = material(0x526360);
  const silver = material(0xb8c6cb, 0.58);
  const dark = material(0x34434b);
  const blue = material(0x67b6ce);
  const warm = material(0xcc813d);
  const hot = new THREE.MeshStandardMaterial({ color: 0xa65a29, side: THREE.DoubleSide, emissive: 0xf48028, emissiveIntensity: 0 });
  const palette = { blue: "#8ad9ef", warm: "#ffb765", metal: "#c9d8de", exhaust: "#ffa28d" };

  function part(label: string, color: string, x: number, y: number, z = 0, assembly: THREE.Object3D = root) {
    parts.push({ label, color, anchor: new THREE.Vector3(x, y, z), assembly });
  }

  function cylinder(parent: THREE.Object3D, finish: THREE.Material, front: number, rear: number, length: number, x: number,
    open = false, thetaLength = turn) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(front, rear, length, 24, 1, open, 0, thetaLength), finish);
    mesh.rotation.z = -Math.PI / 2;
    mesh.position.x = x;
    parent.add(mesh);
    return mesh;
  }

  function ring(parent: THREE.Object3D, finish: THREE.Material, radius: number, thickness: number, x: number) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 7, 28), finish);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = x;
    parent.add(mesh);
  }

  function box(parent: THREE.Object3D, finish: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), finish);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function blades(parent: THREE.Object3D, finish: THREE.Material, x: number, hub: number, outer: number, count: number, chord: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-chord * .30, hub);
    shape.quadraticCurveTo(-chord * .80, outer * .67, -chord * .34, outer);
    shape.quadraticCurveTo(chord * .24, outer * 1.01, chord * .65, outer * .98);
    shape.quadraticCurveTo(chord * .62, outer * .71, chord * .32, hub);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: chord * .24, curveSegments: 5, bevelEnabled: false });
    geometry.rotateY(Math.PI / 2);
    const rotor = new THREE.InstancedMesh(geometry, finish, count);
    const place = new THREE.Matrix4();
    for (let index = 0; index < count; index++) rotor.setMatrixAt(index, place.makeRotationX(index * turn / count));
    rotor.position.x = x;
    parent.add(rotor);
  }

  if (engine.kind === "piston") {
    const crank = new THREE.Group();
    root.add(crank);
    cylinder(covers, dark, .39, .44, 1.7, .23);
    cylinder(root, silver, .12, .14, 2, .1);
    cylinder(crank, warm, .22, .36, .38, 1.19);
    blades(crank, silver, 1.26, .18, 1.35, engine.propellerBlades, .24);
    const cylinders = [-1, 1].flatMap((side) => [-1, 1].map((row) => {
      const x = row * .45 + side * .05;
      for (let index = 0; index < 6; index++) {
        box(root, steel, x, 0, side * (.56 + index * .115), .59, .64, .035);
      }
      box(root, silver, x, .02, side * 1.20, .51, .54, .19);
      const guide = cylinder(root, steel, .23, .23, .53, 0, true, Math.PI);
      guide.rotation.set(Math.PI / 2, 0, 0);
      guide.position.set(x, 0, side * .91);
      const piston = box(root, silver, x, 0, side * .69, .29, .30, .29);
      const chamberFinish = hot.clone();
      const charge = box(root, chamberFinish, x, 0, side * 1.09, .26, .27, .19);
      const rod = cylinder(root, silver, .039, .041, .5, 0);
      rod.position.x = x;
      return { side, row, piston, charge, chamberFinish, rod };
    }));
    part("螺旋槳", palette.blue, 1.25, .95);
    part("曲軸", palette.metal, 0, -.1, .2);
    part("對臥汽缸", palette.warm, .42, .21, 1.20);
    part("燃燒室", palette.exhaust, -.42, 0, 1.13);
    return { root, covers, parts, update: (state) => {
      crank.rotation.x = state.shaftAngle;
      for (const { side, row, piston, charge, chamberFinish, rod } of cylinders) {
        const offset = (side > 0 ? 1 : 0) + (row > 0 ? 2 : 0);
        const phase = (state.cycleAngle + offset * Math.PI) % (4 * Math.PI);
        piston.position.z = side * (.75 + .18 * Math.cos(phase));
        rod.position.z = piston.position.z / 2;
        rod.rotation.set(Math.PI / 2, 0, 0);
        rod.scale.y = Math.abs(piston.position.z) / .5;
        const fire = phase > 2 * Math.PI && phase < 3 * Math.PI;
        charge.visible = state.outputLevel > .001;
        chamberFinish.color.setHex(fire ? 0xc86b2c : phase < Math.PI ? 0x4d95ba : phase > 3 * Math.PI ? 0xad6554 : 0xa0a9a4);
        chamberFinish.emissiveIntensity = fire ? .85 + .6 * state.outputLevel : .06;
      }
    } };
  }

  if (engine.kind === "rocket") {
    function bell(parent: THREE.Object3D, x: number, radius: number, length: number) {
      const root = new THREE.Group();
      root.position.x = x;
      parent.add(root);
      cylinder(root, hot, radius * .63, radius * .27, length * .30, length * .15, true);
      const profile = [.27, .32, .44, .64, .86, 1];
      for (let i = 0; i < profile.length - 1; i++) {
        cylinder(root, silver, radius * profile[i], radius * profile[i+1], length / 4.94, -length * (i + .5) / 5, true);
      }
      ring(root, steel, radius, radius * .047, -length);
      ring(root, warm, radius * .36, radius * .072, 0);
      return root;
    }

    function flame(parent: THREE.Object3D, x: number, radius: number, length: number) {
      const plume = new THREE.Group();
      plume.position.x = x;
      parent.add(plume);
      const soft = new THREE.MeshBasicMaterial({ color: 0xff9b43, transparent: true, opacity: .36, depthWrite: false, side: THREE.DoubleSide });
      const core = new THREE.MeshBasicMaterial({ color: 0xffdeb0, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide });
      cylinder(plume, soft, radius, .12 * radius, length, -.5 * length, true);
      cylinder(plume, core, .55 * radius, 0, .65 * length, -.325 * length, true);
      return (level: number, vacuum: boolean, flicker: number) => {
        plume.visible = level > .004;
        const spread = (.51 + .49 * level) * (vacuum ? 1.28 : 1);
        plume.scale.set(.37 + .63 * level + .035 * flicker, spread, spread);
        soft.opacity = .16 + .29 * level;
      };
    }

    const vacuumNozzle = engine.seaLevelThrustKn === null;
    const radius = vacuumNozzle ? 1.04 : .84;
    const length = vacuumNozzle ? 1.85 : 1.4;
    const nozzlePosition = .32;
    bell(root, nozzlePosition, radius, length);
    cylinder(root, silver, .33, .39, .67, .92);
    cylinder(covers, steel, .59, .52, .65, .87);
    ring(root, warm, .34, .062, 1.13);
    for (const side of [-1, 1]) {
      const pipe = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.26, .22, side * .23), new THREE.Vector3(1.05, .68, side * .2),
        new THREE.Vector3(.55, .56, side * .20), new THREE.Vector3(.40, .18, side * .15),
      ]);
      root.add(new THREE.Mesh(new THREE.TubeGeometry(pipe, 15, .052, 8, false), warm));
    }
    const plume = flame(root, nozzlePosition - length, radius * .83, 1.72);
    part("燃燒室", palette.warm, .75, .26, .23);
    part("喉部", palette.metal, .32, .13, .13);
    part("擴張噴嘴", palette.exhaust, -.72, .55, .35);
    let flicker = 0;
    return { root, covers, parts, update: (state, elapsed) => {
      flicker += elapsed * 31;
      hot.emissiveIntensity = state.outputLevel * 1.45;
      plume(state.outputLevel, state.vacuum, Math.sin(flicker));
    } };
  }

  const prop = engine.kind === "turboprop";
  const fan = engine.kind === "turbofan";
  const wide = engine.id === "ge90-115b";
  const low = new THREE.Group();
  const high = new THREE.Group();
  root.add(low, high);
  const outer = wide ? 1.46 : fan ? 1.09 : .64;
  cylinder(root, steel, .31, .23, 2.9, 0);
  cylinder(low, silver, prop ? .21 : .07, .23, .42, 1.41);
  if (prop) {
    blades(low, silver, 1.47, .18, 1.35, engine.propellerBlades, .26);
    cylinder(root, dark, .42, .40, .54, 1.02);
    ring(root, silver, .43, .06, 1.05);
  } else {
    blades(low, silver, 1.23, .21, outer * .93, wide ? 22 : 16, wide ? .16 : .135);
    ring(root, silver, outer, .061, 1.25);
  }

  const intakeX = prop ? -1.41 : 1.24;
  const chamberX = prop ? -.40 : -.44;
  cylinder(root, hot, .55, .48, .43, chamberX, true, Math.PI);
  ring(root, warm, .50, .041, chamberX + .21);
  ring(root, warm, .49, .037, chamberX - .21);
  for (const x of prop ? [-1.30, -1.10, -.91, -.72] : [1.04, .82, .61, .39, .18, -.01]) {
    const radius = .53 - .12 * (prop ? (x + 1.3) : (1.04 - x));
    cylinder(high, silver, radius * .52, radius * .55, .10, x);
    blades(high, blue, x, radius * .52, radius, 10, .055);
    ring(root, steel, radius + .023, .016, x - .08);
  }
  for (const x of prop ? [-.13, .11, .34] : [-.72, -.91, -1.10]) {
    cylinder(low, warm, .27, .27, .10, x);
    blades(low, warm, x, .27, .49, 11, .06);
  }
  if (prop) {
    const exhaust = cylinder(root, silver, .19, .22, .42, .49, true);
    exhaust.rotation.set(Math.PI * .36, 0, 0);
    exhaust.position.z = .38;
  } else {
    cylinder(root, silver, .54, .35, .58, -1.37, true);
    ring(root, warm, .35, .034, -1.66);
  }

  const caseRadius = fan ? outer : .65;
  cylinder(covers, steel, caseRadius, fan ? outer * .83 : .57, fan ? 1.82 : 2.70, fan ? .33 : -.04, true);
  if (fan) cylinder(root, steel, outer * .97, outer * .87, 1.64, .33, true, Math.PI);
  if (!fan) cylinder(root, steel, .57, .54, 2.25, -.18, true, Math.PI);
  if (prop) {
    ring(root, blue, .59, .042, -1.38);
    part("螺旋槳", palette.metal, 1.46, 1.08);
    part("減速齒輪箱", palette.warm, 1.02, .38, .17);
  } else if (fan) {
    part("風扇", palette.metal, 1.27, .82);
    part("旁通氣道", palette.blue, .56, outer * .75, .2);
  }
  part("進氣", palette.blue, intakeX, .38, .35);
  part("壓縮機", palette.blue, prop ? -.90 : .54, .46, .25);
  part("燃燒室", palette.warm, chamberX, .48, .29);
  part(prop ? "自由動力渦輪" : "渦輪", palette.warm, prop ? .19 : -.95, .41, .28);
  part("排氣", palette.exhaust, prop ? .51 : -1.65, prop ? .14 : .25, prop ? .57 : .25);

  function flow(radius: number, bypass: boolean, color: number) {
    const count = bypass ? 18 : 30;
    const finish = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    const points = new THREE.InstancedMesh(new THREE.SphereGeometry(bypass ? .028 : .024, 5, 4), finish, count);
    root.add(points);
    const offset = new THREE.Matrix4();
    let phase = 0;
    return (level: number, elapsed: number) => {
      finish.opacity = Math.min(.76, level * .93);
      points.visible = level > .015;
      if (!points.visible) return;
      phase = (phase + (0.33 + level * .74) * elapsed) % 1;
      for (let i = 0; i < count; i++) {
        const move = (i / count + phase) % 1;
        const angle = i * turn / 7;
        const x = prop ? -1.53 + move * 2.15 : 1.59 - move * 3.27;
        const spread = radius * (1 - .15 * move);
        offset.makeTranslation(x, spread * Math.cos(angle), spread * Math.sin(angle) + (prop ? .38 * move ** 5 : 0));
        points.setMatrixAt(i, offset);
      }
      points.instanceMatrix.needsUpdate = true;
    };
  }

  const coreFlow = flow(.35, false, 0xffae64);
  const outsideFlow = fan ? flow(outer * .80, true, 0x65c5ed) : null;
  return { root, covers, parts, update: (state, elapsed) => {
    low.rotation.x = state.shaftAngle;
    high.rotation.x = state.coreAngle;
    hot.emissiveIntensity = state.secondary * state.outputLevel * 1.9;
    coreFlow(state.secondary, elapsed);
    outsideFlow?.(state.primary, elapsed);
  } };
}

export function AerospaceScene({ engine, readState, cutaway, speed }: {
  engine: AerospaceEngine; readState: () => AerospaceState; cutaway: boolean; speed: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [selected, setSelected] = useState(0);
  const display = useRef({ cutaway, speed, selected });
  useEffect(() => { display.current = { cutaway, speed, selected }; }, [cutaway, speed, selected]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.setClearColor(0x141915);
    renderer.domElement.className = "engine-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.prepend(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 52);
    camera.position.set(3.7, 2.3, 6.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 3.3;
    controls.maxDistance = 14;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4fbff, 0x604c3a, 2.3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 5, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xa3cbf7, 1.16);
    rimLight.position.set(-3, -2, -3);
    scene.add(rimLight);
    const model = buildModel(engine);
    scene.add(model.root);
    setParts(model.parts);

    let dirty = true;
    let lost = false;
    const onOrbit = () => { dirty = true; };
    controls.addEventListener("change", onOrbit);
    const size = new ResizeObserver(() => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      dirty = true;
    });
    size.observe(element);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      setUnavailable(true);
    };
    const onContextRestored = () => {
      lost = false;
      dirty = true;
      setUnavailable(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
    const position = new THREE.Vector3();
    let past: number | undefined;
    let lastSelected = -1;
    let visual = readState();
    model.update(visual, 0);
    renderer.setAnimationLoop((now) => {
      const settings = display.current;
      const elapsed = Math.min(.05, past === undefined ? 0 : (now - past) / 1000) * settings.speed;
      past = now;
      if (lost || document.hidden) return;
      if (model.covers.visible === settings.cutaway) {
        model.covers.visible = !settings.cutaway;
        dirty = true;
      }
      if (settings.selected !== lastSelected) {
        lastSelected = settings.selected;
        dirty = true;
      }
      if (elapsed > 0) {
        const next = readState();
        const active = next.outputLevel > 0.001 || next.shaftRpm > 0.1 || next.coreRpm > 0.1
          || visual.outputLevel > 0.001 || visual.shaftRpm > 0.1 || visual.coreRpm > 0.1;
        if (active) {
          visual = settings.speed === 1 ? next : {
            ...next,
            shaftAngle: (visual.shaftAngle + elapsed * next.shaftRpm * turn / 60) % turn,
            coreAngle: (visual.coreAngle + elapsed * next.coreRpm * turn / 60) % turn,
            cycleAngle: (visual.cycleAngle + elapsed * next.shaftRpm * turn / 60) % (2 * turn),
          };
          model.update(visual, elapsed);
          dirty = true;
        }
      }
      if (!dirty) return;
      dirty = false;
      renderer.render(scene, camera);
      const part = model.parts[settings.selected];
      const dot = marker.current;
      if (part && dot) {
        part.assembly.localToWorld(position.copy(part.anchor)).project(camera);
        dot.style.left = THREE.MathUtils.clamp((position.x + 1) * 50, 3, 97) + "%";
        dot.style.top = THREE.MathUtils.clamp((1 - position.y) * 50, 5, 95) + "%";
      }
    });
    return () => {
      size.disconnect();
      controls.removeEventListener("change", onOrbit);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      renderer.setAnimationLoop(null);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      model.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        geometries.add(node.geometry);
        if (Array.isArray(node.material)) node.material.forEach((entry) => materials.add(entry));
        else materials.add(node.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((finish) => finish.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [engine, readState]);

  return <>
    <div ref={host} className={"engine-scene" + (unavailable ? " engine-scene-fallback" : "")}
      role={unavailable ? "status" : "img"} aria-label={unavailable ? undefined : engine.name + " 3D 內構示意"}>
      {unavailable ? "此裝置無法顯示 3D 內構"
        : <span className={styles.partMarker} ref={marker} aria-hidden="true" style={{ color: parts[selected]?.color }} />}
    </div>
    {parts.length > 0 && <div className={styles.partList} aria-label="標示引擎部位" role="group">
      {parts.map(({ label, color }, index) => <button type="button" key={label} aria-pressed={selected === index} onClick={() => setSelected(index)}>
        <span aria-hidden="true" style={{ backgroundColor: color }} />{label}
      </button>)}
    </div>}
    {engine.kind === "piston" && parts.length > 0 && <p className={styles.cycleLegend}>
      <span>進氣</span><span>壓縮</span><span>點火／作功</span><span>排氣</span>
    </p>}
  </>;
}
