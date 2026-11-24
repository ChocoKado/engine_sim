"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AerospaceKind } from "../data/aerospace";
import type { AerospaceState } from "../lib/aerospace";

function makeEngine(kind: AerospaceKind) {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x54625e, metalness: 0.35, roughness: 0.44 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xabb5aa, metalness: 0.44, roughness: 0.34 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xf6ab55, metalness: 0.28, roughness: 0.44 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x83bed9, metalness: 0.30, roughness: 0.38 });

  function box(parent: THREE.Object3D, material: THREE.Material, width: number, height: number, depth: number, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function ring(parent: THREE.Object3D, material: THREE.Material, radius: number, smallRadius: number, x: number) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, smallRadius, 10, 40), material);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = x;
    parent.add(mesh);
  }

  function cylinder(parent: THREE.Object3D, material: THREE.Material, front: number, rear: number, length: number, x: number, open = false) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(front, rear, length, 32, 1, open), material);
    mesh.rotation.z = -Math.PI / 2;
    mesh.position.x = x;
    parent.add(mesh);
  }

  if (kind === "piston") {
    box(root, steel, 1.15, 0.85, 0.75);
    const crank = new THREE.Group();
    crank.position.x = 1.08;
    root.add(crank);
    cylinder(root, silver, 0.17, 0.17, 0.6, 0.8);
    cylinder(crank, warm, 0.23, 0.23, 0.25, 0.12);
    for (const side of [-1, 1]) {
      const blade = box(crank, silver, 0.09, 1.33, 0.21, 0, side * 0.73);
      blade.rotation.y = side * 0.24;
    }
    const pistons = [-1, 1].flatMap((side) => [-1, 1].map((row) => {
      const x = row * 0.39;
      box(root, steel, 0.45, 0.52, 0.42, x, 0, side * 1.14);
      for (let fin = 0; fin < 4; fin += 1) box(root, steel, 0.52, 0.64, 0.035, x, 0, side * (0.62 + fin * 0.15));
      return { side, row, piston: box(root, warm, 0.25, 0.29, 0.25, x) };
    }));
    return { root, update: ({ shaftAngle }: AerospaceState) => {
      crank.rotation.x = shaftAngle;
      for (const { side, row, piston } of pistons) piston.position.z = side * (0.70 + 0.17 * row * Math.cos(shaftAngle));
    } };
  }

  if (kind === "rocket") {
    cylinder(root, silver, 0.47, 0.47, 0.60, 0.96);
    const shell = new THREE.MeshStandardMaterial({ color: 0x8f948d, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.38 });
    for (let section = 0; section < 5; section += 1) {
      const radius = (index: number) => 0.28 + 0.61 * (index / 5) ** 1.6;
      cylinder(root, shell, radius(section), radius(section + 1), 0.32, 0.54 - section * 0.32, true);
    }
    ring(root, warm, 0.89, 0.055, -0.90);
    const plume = new THREE.Group();
    plume.position.x = -0.90;
    root.add(plume);
    const light = new THREE.MeshBasicMaterial({ color: 0xffc26c, transparent: true, opacity: 0.52, depthWrite: false });
    cylinder(plume, light, 0.57, 0, 1.65, -0.825, true);
    return { root, update: ({ outputLevel, vacuum }: AerospaceState) => {
      plume.visible = outputLevel > 0.002;
      const spread = (0.44 + 0.56 * outputLevel) * (vacuum ? 1.28 : 1);
      plume.scale.set(0.25 + 0.75 * outputLevel, spread, spread);
      light.opacity = 0.1 + 0.42 * outputLevel;
    } };
  }

  const fan = kind === "turbofan";
  const low = new THREE.Group();
  const high = new THREE.Group();
  root.add(low, high);
  cylinder(root, steel, 0.44, 0.32, 2.65, 0.05);
  cylinder(low, silver, 0.31, 0.27, 0.23, 1.32);
  const outerRadius = fan ? 1.23 : 0.73;
  ring(root, steel, outerRadius, 0.065, 1.24);
  ring(root, steel, 0.65, 0.045, -1.31);
  for (let index = 0; index < 10; index += 1) {
    const blade = new THREE.Group();
    blade.rotation.x = index * Math.PI / 5;
    low.add(blade);
    box(blade, blue, 0.13, outerRadius - 0.31, 0.16, 1.26, (outerRadius + 0.25) / 2).rotation.y = -0.29;
  }
  for (let stage = 0; stage < 5; stage += 1) {
    const x = 0.82 - stage * 0.43;
    cylinder(high, stage < 3 ? silver : warm, 0.48, 0.49, 0.11, x);
    for (let index = 0; index < 7; index += 1) {
      const blade = new THREE.Group();
      blade.rotation.x = index * 2 * Math.PI / 7;
      high.add(blade);
      box(blade, stage < 3 ? silver : warm, 0.12, 0.19, 0.10, x, 0.52);
    }
  }
  return { root, update: ({ shaftAngle, coreAngle }: AerospaceState) => {
    low.rotation.x = shaftAngle;
    high.rotation.x = coreAngle;
  } };
}

export function AerospaceScene({ kind, readState }: { kind: AerospaceKind; readState: () => AerospaceState }) {
  const host = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

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
    element.append(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(4.75, 2.35, 5.10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 3.3;
    controls.maxDistance = 10.5;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4fbff, 0x604c3a, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(3, 5, 3);
    scene.add(keyLight);
    const model = makeEngine(kind);
    scene.add(model.root);

    const size = new ResizeObserver(() => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    size.observe(element);
    renderer.setAnimationLoop(() => {
      model.update(readState());
      renderer.render(scene, camera);
    });
    return () => {
      size.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      model.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        node.material.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [kind, readState]);

  const diagram = kind === "piston" ? "水平對臥活塞與螺旋槳"
    : kind === "rocket" ? "火箭噴嘴與羽流" : "低壓軸與高壓軸";
  return <div ref={host} className={`engine-scene${unavailable ? " engine-scene-fallback" : ""}`}
    role={unavailable ? "status" : "img"} aria-label={unavailable ? undefined : `${diagram} 3D 內構示意`}>
    {unavailable && "此裝置無法顯示 3D 內構"}
  </div>;
}
