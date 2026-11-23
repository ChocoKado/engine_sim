"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vehicle } from "../data/vehicles";
import { getEnginePose, VALVE_EVENTS } from "../lib/kinematics";
import { rpmFromRadiansPerSecond } from "../lib/simulation";
import type { SimulationState } from "../lib/simulation";

interface EngineSceneProps {
  vehicle: Vehicle;
  readState: () => SimulationState;
  cutaway: boolean;
  paused: boolean;
}

const metresToScene = 10;
const verticalAxis = new THREE.Vector3(0, 1, 0);

function impellerVanes(radius: number) {
  const vertices: number[] = [];
  const triangles: number[] = [];
  const segments = 6;
  const vaneCount = 12;

  for (let vane = 0; vane < vaneCount; vane += 1) {
    const innerRadius = vane % 2 === 0 ? 0.22 : 0.52;
    const start = vertices.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const travel = segment / segments;
      const distance = radius * (innerRadius + (0.96 - innerRadius) * travel);
      const sweep = vane * 2 * Math.PI / vaneCount + 0.45 * (distance / radius) ** 2;
      const height = radius * (0.28 - 0.13 * travel);
      for (const offset of [-0.038, 0.038]) {
        vertices.push(distance * Math.cos(sweep + offset), distance * Math.sin(sweep + offset), height);
      }
      if (segment > 0) {
        const index = start + segment * 2;
        triangles.push(index - 2, index, index + 1, index - 2, index + 1, index - 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function buildEngine(vehicle: Vehicle) {
  const group = new THREE.Group();
  const cover = new THREE.Group();
  group.add(cover);

  const bore = vehicle.geometry.boreM * metresToScene;
  const throwRadius = vehicle.geometry.strokeM * metresToScene / 2;
  const rodLength = vehicle.geometry.rodLengthM * metresToScene;
  const spacing = vehicle.geometry.cylinderSpacingM * metresToScene;
  const firingAngles = vehicle.geometry.cylinderFiringAnglesRad ?? vehicle.audio.firingAnglesRad;
  const count = firingAngles.length;
  const width = (count - 1) * spacing + bore * 1.28;
  const radius = bore * 0.61;
  const barrelBottom = rodLength - throwRadius - bore * 0.21;
  const barrelTop = rodLength + throwRadius + bore * 0.17;
  const barrelHeight = barrelTop - barrelBottom;
  const barrelY = (barrelTop + barrelBottom) / 2;
  const seatY = barrelTop + bore * 0.12;
  const camY = seatY + bore * 0.4;

  const frame = metal(0x40566d, 0.38, 0.51);
  const ribs = metal(0x617b90, 0.3, 0.55);
  const pistonMetal = metal(0xd9e3e7, 0.44, 0.32);
  const rodMetal = metal(0x98b5c5, 0.45, 0.34);
  const crankMetal = metal(0xc3945e, 0.48, 0.43);
  const intakeMetal = metal(0x61d5ab, 0.25, 0.38);
  const exhaustMetal = metal(0xff9e75, 0.27, 0.38);

  function metal(color: number, metalness: number, roughness: number) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
  }

  function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent: THREE.Object3D, r: number, h: number, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function halfBarrel(parent: THREE.Object3D, r: number, h: number, material: THREE.Material, x: number, y: number, rear: boolean) {
    const start = rear ? Math.PI / 2 : -Math.PI / 2;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true, start, Math.PI), material);
    mesh.position.set(x, y, 0);
    parent.add(mesh);
  }

  box(group, width * 1.05, bore * 0.2, bore * 1.2, frame, 0, -throwRadius - bore * 0.14, 0);
  box(group, width * 1.04, bore * 0.88, bore * 0.23, frame, 0, 0, -radius * 0.86);
  box(cover, width * 1.04, bore * 0.85, bore * 0.18, frame, 0, 0, radius * 0.93);
  box(group, width * 1.02, bore * 0.17, bore * 0.43, frame, 0, seatY + bore * 0.06, -radius * 0.65);
  box(cover, width * 1.04, bore * 0.24, bore * 1.12, frame, 0, seatY + bore * 0.22, 0);

  const axle = cylinder(group, bore * 0.082, width * 1.1, crankMetal, 0, 0, 0);
  axle.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const bearing = cylinder(group, bore * 0.22, bore * 0.11, ribs, side * width * 0.49, 0, 0);
    bearing.rotation.z = Math.PI / 2;
  }

  const camTracks = count === 1 ? [0] : [-bore * 0.23, bore * 0.23];
  const cams = camTracks.map((z) => {
    const cam = new THREE.Group();
    cam.position.set(0, camY, z);
    group.add(cam);
    const material = z > 0 ? intakeMetal : z < 0 ? exhaustMetal : crankMetal;
    const shaft = cylinder(cam, bore * 0.055, width, material, 0, 0, 0);
    shaft.rotation.z = Math.PI / 2;

    for (let index = 0; index < count; index += 1) {
      const x = (index - (count - 1) / 2) * spacing;
      const valveTypes: (keyof typeof VALVE_EVENTS)[] = count === 1 ? ["intake", "exhaust"] : [z > 0 ? "intake" : "exhaust"];
      for (const valveType of valveTypes) {
        const intake = valveType === "intake";
        const { opensDegrees, closesDegrees } = VALVE_EVENTS[valveType];
        const liftPeakRad = (opensDegrees + closesDegrees) * Math.PI / 360;
        const eccentricAngle = Math.PI - (liftPeakRad + firingAngles[index]) / 2;
        const eccentricity = bore * 0.055;
        const lobe = cylinder(cam, bore * 0.11, bore * 0.115, intake ? intakeMetal : exhaustMetal,
          x + bore * (intake ? -0.2 : 0.2), Math.cos(eccentricAngle) * eccentricity, Math.sin(eccentricAngle) * eccentricity);
        lobe.rotation.z = Math.PI / 2;
      }
    }

    const gear = cylinder(cam, bore * 0.16, bore * 0.085, material, -width * 0.5, 0, 0);
    gear.rotation.z = Math.PI / 2;
    return cam;
  });

  function makeValve(x: number, z: number, material: THREE.Material) {
    const valve = new THREE.Group();
    valve.position.set(x, seatY, z);
    group.add(valve);
    cylinder(valve, bore * 0.03, bore * 0.32, material, 0, bore * 0.14, 0);
    cylinder(valve, bore * 0.127, bore * 0.048, material, 0, 0, 0);
    cylinder(valve, bore * 0.073, bore * 0.043, material, 0, bore * 0.3, 0);
    return valve;
  }

  const cylinders = Array.from({ length: count }, (_, index) => {
    const x = (index - (count - 1) / 2) * spacing;
    halfBarrel(group, radius, barrelHeight, frame, x, barrelY, true);
    halfBarrel(cover, radius, barrelHeight, frame, x, barrelY, false);
    for (const y of [barrelBottom, barrelY, barrelTop]) {
      halfBarrel(group, radius * 1.08, bore * 0.065, ribs, x, y, true);
      halfBarrel(cover, radius * 1.08, bore * 0.065, ribs, x, y, false);
    }

    const crank = new THREE.Group();
    crank.position.x = x;
    group.add(crank);
    const crankPin = cylinder(crank, bore * 0.09, bore * 0.49, crankMetal, 0, throwRadius, 0);
    crankPin.rotation.z = Math.PI / 2;

    for (const side of [-1, 1]) {
      const cheek = box(crank, bore * 0.13, throwRadius * 1.65, bore * 0.24, crankMetal, side * bore * 0.2, throwRadius * 0.24, 0);
      cheek.rotation.x = side * 0.08;
      const counterweight = cylinder(crank, bore * 0.21, bore * 0.13, crankMetal, side * bore * 0.2, -throwRadius * 0.62, 0);
      counterweight.rotation.z = Math.PI / 2;
    }

    const piston = new THREE.Group();
    piston.position.x = x;
    group.add(piston);
    cylinder(piston, bore * 0.465, bore * 0.26, pistonMetal, 0, bore * 0.025, 0);
    for (const y of [0.075, 0.12]) cylinder(piston, bore * 0.474, bore * 0.018, ribs, 0, bore * y, 0);
    const wrist = cylinder(piston, bore * 0.067, bore * 0.88, rodMetal, 0, 0, 0);
    wrist.rotation.z = Math.PI / 2;

    const rod = new THREE.Group();
    group.add(rod);
    box(rod, bore * 0.127, rodLength * 0.81, bore * 0.15, rodMetal, 0, 0, 0);
    const bigEnd = cylinder(rod, bore * 0.145, bore * 0.18, rodMetal, 0, -rodLength / 2, 0);
    bigEnd.rotation.z = Math.PI / 2;
    const smallEnd = cylinder(rod, bore * 0.112, bore * 0.15, rodMetal, 0, rodLength / 2, 0);
    smallEnd.rotation.z = Math.PI / 2;

    return {
      x, crank, piston, rod,
      intake: makeValve(x - bore * 0.2, bore * 0.18, intakeMetal),
      exhaust: makeValve(x + bore * 0.2, -bore * 0.18, exhaustMetal),
    };
  });

  function addSupercharger() {
    // Scale reference: Kawasaki 2015 Ninja H2 press kit, p. 4. Housing and vane shape are schematic.
    const impellerRadius = 0.069 * metresToScene / 2;
    const caseRadius = impellerRadius * 1.2;
    const centerY = barrelBottom - bore * 0.18;
    const centerZ = radius + impellerRadius * 0.28;
    const housing = new THREE.Group();
    housing.position.set(0, centerY, centerZ);
    group.add(housing);

    const backplate = cylinder(housing, caseRadius, impellerRadius * 0.43, frame, 0, 0, -impellerRadius * 0.24);
    backplate.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(impellerRadius * 1.08, impellerRadius * 0.12, 6, 30), ribs);
    rim.position.z = impellerRadius * 0.14;
    housing.add(rim);

    const impeller = new THREE.Group();
    housing.add(impeller);
    impeller.add(new THREE.Mesh(impellerVanes(impellerRadius), intakeMetal));
    const disk = cylinder(impeller, impellerRadius, impellerRadius * 0.08, rodMetal, 0, 0, 0);
    disk.rotation.x = Math.PI / 2;
    const hub = cylinder(impeller, impellerRadius * 0.24, impellerRadius * 0.34, pistonMetal, 0, 0, impellerRadius * 0.17);
    hub.rotation.x = Math.PI / 2;

    const lid = cylinder(cover, caseRadius, impellerRadius * 0.14, frame,
      0, centerY, centerZ + impellerRadius * 0.40);
    lid.rotation.x = Math.PI / 2;
    return impeller;
  }

  const impeller = vehicle.supercharger ? addSupercharger() : null;
  const rodDirection = new THREE.Vector3();
  function applyPose(state: SimulationState) {
    const pose = getEnginePose(vehicle, state.crankAngleRad, rpmFromRadiansPerSecond(state.engineAngularVelocity));
    if (impeller) impeller.rotation.z = state.superchargerAngleRad;
    for (const cam of cams) cam.rotation.x = pose.camAngleRad;
    for (const [index, parts] of cylinders.entries()) {
      const cylinder = pose.cylinders[index];
      const crankY = cylinder.crankPinYM * metresToScene;
      const crankZ = cylinder.crankPinZM * metresToScene;
      const pistonY = cylinder.pistonYM * metresToScene;
      parts.crank.rotation.x = cylinder.crankAngleRad;
      parts.piston.position.y = pistonY;
      parts.rod.position.set(parts.x, (crankY + pistonY) / 2, crankZ / 2);
      rodDirection.set(0, pistonY - crankY, -crankZ).normalize();
      parts.rod.quaternion.setFromUnitVectors(verticalAxis, rodDirection);
      parts.intake.position.y = seatY - cylinder.intakeLiftM * metresToScene;
      parts.exhaust.position.y = seatY - cylinder.exhaustLiftM * metresToScene;
    }
  }

  return { group, cover, applyPose, height: camY + bore * 0.2 + throwRadius, width };
}

export default function EngineScene({ vehicle, readState, cutaway, paused }: EngineSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const options = useRef({ readState, cutaway, paused });
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    options.current = { readState, cutaway, paused };
  }, [readState, cutaway, paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      setUnavailable(true);
      return;
    }

    const canvas = renderer.domElement;
    canvas.className = "engine-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    const subject = vehicle.supercharger ? "引擎與機械增壓器內構" : "引擎內構";
    canvas.setAttribute("aria-label", `${vehicle.name} ${subject}示意，可旋轉及縮放`);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x405165, 2));
    const key = new THREE.DirectionalLight(0xe8f5ff, 2.5);
    key.position.set(2.7, 3.5, 3);
    scene.add(key);
    const edge = new THREE.DirectionalLight(0x78f7d6, 1.1);
    edge.position.set(-2.5, 1.6, -2);
    scene.add(edge);

    const engine = buildEngine(vehicle);
    scene.add(engine.group);
    const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 50);
    const controls = new OrbitControls(camera, canvas);
    const size = Math.max(engine.height, engine.width);
    const centerY = engine.height * 0.34;
    camera.position.set(size * 0.57, centerY + size * 0.24, size * 1.73);
    controls.target.set(0, centerY, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = size * 0.65;
    controls.maxDistance = size * 3.7;
    controls.update();

    let frame = 0;
    let lost = false;
    let dirty = true;
    let previousState = options.current.readState();
    engine.applyPose(previousState);
    engine.cover.visible = !options.current.cutaway;

    function onOrbit() { dirty = true; }

    function draw() {
      frame = 0;
      if (lost || document.hidden) return;
      const current = options.current;
      if (!current.paused) {
        const state = current.readState();
        if (state.crankAngleRad !== previousState.crankAngleRad
          || state.engineAngularVelocity !== previousState.engineAngularVelocity
          || state.superchargerAngleRad !== previousState.superchargerAngleRad) {
          engine.applyPose(state);
          previousState = state;
          dirty = true;
        }
      }
      if (engine.cover.visible === current.cutaway) {
        engine.cover.visible = !current.cutaway;
        dirty = true;
      }
      controls.update();
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
      frame = requestAnimationFrame(draw);
    }

    function syncVisibility() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!lost && !document.hidden) frame = requestAnimationFrame(draw);
    }

    function onContextLost(event: Event) {
      event.preventDefault();
      lost = true;
      canvas.style.display = "none";
      setUnavailable(true);
      syncVisibility();
    }

    function onContextRestored() {
      lost = false;
      dirty = true;
      canvas.style.removeProperty("display");
      setUnavailable(false);
      syncVisibility();
    }

    const keyboardOffset = new THREE.Vector3();
    const keyboardOrbit = new THREE.Spherical();
    function onKey(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)) return;
      event.preventDefault();
      keyboardOrbit.setFromVector3(keyboardOffset.copy(camera.position).sub(controls.target));
      if (event.key === "ArrowLeft") keyboardOrbit.theta -= 0.15;
      if (event.key === "ArrowRight") keyboardOrbit.theta += 0.15;
      if (event.key === "ArrowUp") keyboardOrbit.phi -= 0.15;
      if (event.key === "ArrowDown") keyboardOrbit.phi += 0.15;
      if (event.key === "+" || event.key === "=") keyboardOrbit.radius *= 0.9;
      if (event.key === "-") keyboardOrbit.radius /= 0.9;
      keyboardOrbit.radius = THREE.MathUtils.clamp(keyboardOrbit.radius, controls.minDistance, controls.maxDistance);
      camera.position.setFromSpherical(keyboardOrbit.makeSafe()).add(controls.target);
      controls.update();
    }

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 1 || height < 1) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      dirty = true;
    });
    resize.observe(host);
    controls.addEventListener("change", onOrbit);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      controls.removeEventListener("change", onOrbit);
      controls.dispose();
      const materials = new Set<THREE.Material>();
      engine.group.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          part.geometry.dispose();
          materials.add(part.material);
        }
      });
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [vehicle]);

  return (
    <div className="engine-scene" ref={hostRef}>
      {unavailable && <p className="engine-scene-fallback" role="status">此裝置目前無法顯示 WebGL 內構。</p>}
    </div>
  );
}
