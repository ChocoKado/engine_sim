"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildExhaust, impellerVanes } from "./EngineExhaust";
import type { Vehicle } from "../data/vehicles";
import { getEnginePose, getRotaryPose, getTrochoidPoint, STROKE_COLORS, VALVE_EVENTS } from "../lib/kinematics";
import type { EngineStroke, RotaryGeometry } from "../lib/kinematics";
import { rpmFromRadiansPerSecond } from "../lib/simulation";
import type { SimulationState } from "../lib/simulation";

export type SceneQuality = "low" | "medium" | "high";

interface EngineSceneProps {
  vehicle: Vehicle;
  readState: () => SimulationState;
  readExhaustFlame: (advanceMs?: number) => number;
  cutaway: boolean;
  paused: boolean;
  visualSpeed: number;
  quality?: SceneQuality;
  onStrokesChange: (strokes: readonly EngineStroke[]) => void;
}

const metresToScene = 10;
const verticalAxis = new THREE.Vector3(0, 1, 0);
const fullTurn = 2 * Math.PI;
const cycleTurn = 2 * fullTurn;

function metal(color: number, metalness: number, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
}

function cylinderNumber(number: number, bore: number) {
  const label = document.createElement("canvas");
  label.width = label.height = 64;
  const ctx = label.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(32, 32, 29, 0, fullTurn);
  ctx.fillStyle = "#111e24";
  ctx.fill();
  ctx.strokeStyle = "#b5c9cc";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "700 34px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";
  ctx.fillText(String(number), 32, 34);
  const map = new THREE.CanvasTexture(label);
  map.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, toneMapped: false }));
  marker.scale.setScalar(bore * 0.22);
  marker.renderOrder = 2;
  return marker;
}

function buildRotaryEngine(vehicle: Vehicle, geometry: RotaryGeometry) {
  const group = new THREE.Group();
  const stack = new THREE.Group();
  const cover = new THREE.Group();
  // Rotary profiles are drawn in XY and extruded along their common shaft.
  stack.rotation.y = Math.PI / 2;
  group.add(stack);
  stack.add(cover);

  const radius = geometry.rotorRadiusM * metresToScene;
  const eccentricity = geometry.eccentricityM * metresToScene;
  const width = geometry.rotorWidthM * metresToScene;
  // Leave a schematic gap so both stages can be inspected in the default view.
  const spacing = width * 2.2;
  const stackLength = (geometry.rotors - 1) * spacing + width;
  const caseRadius = radius * 1.15;
  const frame = metal(0x40566d, 0.38, 0.51);
  const rib = metal(0x617b90, 0.30, 0.55);
  const rotorMetal = metal(0xd9e3e7, 0.44, 0.32);
  const shaftMetal = metal(0xc3945e, 0.48, 0.43);
  const ports = new THREE.Group();
  const portGeometry = new THREE.SphereGeometry(radius * 0.068, 10, 8);
  const intakeMark = new THREE.MeshBasicMaterial({ color: STROKE_COLORS.intake });
  const exhaustMark = new THREE.MeshBasicMaterial({ color: STROKE_COLORS.exhaust });
  const sparkMark = new THREE.MeshBasicMaterial({ color: STROKE_COLORS.power });
  const sparkFlash = new THREE.MeshBasicMaterial({ color: 0xfff5d5, toneMapped: false });
  const exhaustPort = getTrochoidPoint(-Math.PI / 6, caseRadius, eccentricity);
  const sideExhaust = vehicle.id === "mazda-rx8";
  stack.add(ports);

  function traceTrochoid(path: THREE.Path, curveRadius: number, clockwise = false) {
    const segments = 96;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = fullTurn * segment / segments * (clockwise ? -1 : 1);
      const { x, y } = getTrochoidPoint(angle, curveRadius, eccentricity);
      if (segment === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }

  function extrude(parent: THREE.Object3D, shape: THREE.Shape, depth: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false }), material);
    mesh.position.z = z - depth / 2;
    parent.add(mesh);
  }

  function axle(parent: THREE.Object3D, axleRadius: number, length: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(axleRadius, axleRadius, length, 24), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = z;
    parent.add(mesh);
  }

  function makeRotor(z: number) {
    const rotor = new THREE.Group();
    rotor.position.z = z;
    stack.add(rotor);

    const outline = new THREE.Shape();
    const apexRadius = radius * 0.984;
    outline.moveTo(apexRadius, 0);
    for (let side = 0; side < 3; side += 1) {
      const end = fullTurn * (side + 1) / 3;
      const mid = end - Math.PI / 3;
      outline.quadraticCurveTo(
        radius * 0.77 * Math.cos(mid), radius * 0.77 * Math.sin(mid),
        apexRadius * Math.cos(end), apexRadius * Math.sin(end),
      );
    }
    outline.closePath();
    outline.holes.push(new THREE.Path().absarc(0, 0, radius * 0.27, 0, fullTurn, true));
    extrude(rotor, outline, width * 0.92, 0, rotorMetal);
    for (let apex = 0; apex < 3; apex += 1) {
      const angle = fullTurn * apex / 3;
      const seal = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.027, radius * 0.025, width * 0.89), shaftMetal);
      seal.position.set(apexRadius * Math.cos(angle), apexRadius * Math.sin(angle), 0);
      seal.rotation.z = angle;
      rotor.add(seal);
    }
    return rotor;
  }

  const rotors = Array.from({ length: geometry.rotors }, (_, index) => {
    const z = (index - (geometry.rotors - 1) / 2) * spacing;
    const casing = new THREE.Shape();
    traceTrochoid(casing, caseRadius);
    casing.holes.push(traceTrochoid(new THREE.Path(), radius, true));
    extrude(stack, casing, width, z, rib);

    const backplate = new THREE.Shape();
    traceTrochoid(backplate, caseRadius);
    extrude(stack, backplate, width * 0.09, z - width * 0.52, frame);
    extrude(cover, backplate, width * 0.09, z + width * 0.52, frame);

    const eccentric = new THREE.Group();
    eccentric.position.z = z;
    stack.add(eccentric);
    axle(eccentric, radius * 0.24, width * 0.99, 0, shaftMetal);
    const intakePort = getTrochoidPoint(Math.PI / 6, caseRadius, eccentricity);
    function portMark(point: { x: number; y: number }, depth: number, material: THREE.Material) {
      const mesh = new THREE.Mesh(portGeometry, material);
      mesh.position.set(point.x, point.y, z + depth);
      ports.add(mesh);
      return mesh;
    }
    portMark(intakePort, width * 0.49, intakeMark);
    portMark(exhaustPort, sideExhaust ? width * 0.49 : 0, exhaustMark);
    const plugs = [-0.15, 0.15].map((angle) => {
      const point = getTrochoidPoint(Math.PI + angle, caseRadius, eccentricity);
      portMark(point, width * 0.49, sparkMark);
      const flash = portMark(point, width * 0.52, sparkFlash);
      flash.visible = false;
      return flash;
    });
    return { eccentric, rotor: makeRotor(z), plugs };
  });
  axle(stack, radius * 0.08, stackLength + width * 0.68, 0, shaftMetal);
  const exhaust = buildExhaust(vehicle, [rotors.map(({ eccentric }) => ({
    point: stack.localToWorld(new THREE.Vector3(exhaustPort.x, exhaustPort.y, eccentric.position.z + (sideExhaust ? width * 0.49 : 0))),
    outward: sideExhaust ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, -0.50, -0.866),
  }))], radius);
  group.add(exhaust.group);

  function applyPose(state: SimulationState, crankAngle: number) {
    const pose = getRotaryPose(geometry, crankAngle);
    for (const [index, { rotor, eccentric, plugs }] of rotors.entries()) {
      const { centerXM, centerYM, angleRad } = pose[index];
      rotor.position.x = eccentric.position.x = centerXM * metresToScene;
      rotor.position.y = eccentric.position.y = centerYM * metresToScene;
      rotor.rotation.z = angleRad;
      const phase = (crankAngle + fullTurn * index / geometry.rotors) % fullTurn;
      const flash = Math.max(0, 1 - phase / (Math.PI / 8));
      for (const plug of plugs) {
        plug.visible = state.engineOn && state.combustionTorqueNm > 0 && flash > 0.05;
        plug.scale.setScalar(0.7 + flash * 1.8);
      }
    }
    return null;
  }

  function applyCutaway(cutaway: boolean) {
    cover.visible = !cutaway;
    ports.visible = cutaway;
  }

  return {
    group, cover, applyCutaway, applyPose,
    applyFlame: exhaust.applyFlame, applyExhaustState: exhaust.applyExhaustState, hasTurbo: exhaust.hasTurbo,
    layout: "rotary" as const, extraMaterials: [],
  };
}

function buildEngine(vehicle: Vehicle) {
  if (vehicle.geometry.rotary) return buildRotaryEngine(vehicle, vehicle.geometry.rotary);

  const group = new THREE.Group();
  const cover = new THREE.Group();
  group.add(cover);

  const bore = vehicle.geometry.boreM * metresToScene;
  const throwRadius = vehicle.geometry.strokeM * metresToScene / 2;
  const rodLength = vehicle.geometry.rodLengthM * metresToScene;
  const spacing = vehicle.geometry.cylinderSpacingM * metresToScene;
  const firingAngles = vehicle.geometry.cylinderFiringAnglesRad ?? vehicle.audio.firingAnglesRad;
  const halfBankAngle = (vehicle.geometry.bankAngleRad ?? 0) / 2;
  const bankAngles = halfBankAngle > 0 ? [-halfBankAngle, halfBankAngle] : [0];
  const isVEngine = bankAngles.length === 2;
  const isBoxer = Math.abs(halfBankAngle - Math.PI / 2) < 1e-6;
  const bankSize = firingAngles.length / bankAngles.length;
  const bankWidth = (bankSize - 1) * spacing + bore * 1.28;
  // The axial stagger leaves room for both rods at a shared crank throw.
  const bankStagger = isVEngine ? bore * 0.11 : 0;
  const width = bankWidth + 2 * bankStagger;
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
  const intakeCasting = metal(0x6c8983, 0.44, 0.43);
  const oilPan = metal(0x2b393f, 0.48, 0.48);
  const porcelain = metal(0xf0e4cc, 0.12, 0.33);
  const strokes = Object.fromEntries(Object.entries(STROKE_COLORS).map(([stroke, color]) => [
    stroke, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.33, depthWrite: false, toneMapped: false }),
  ])) as Record<EngineStroke, THREE.MeshBasicMaterial>;
  const chargeGeometry = new THREE.CylinderGeometry(bore * 0.38, bore * 0.38, 1, 16);
  const flowGeometry = new THREE.SphereGeometry(bore * 0.082, 8, 6);
  const intakeFlow = new THREE.MeshBasicMaterial({ color: STROKE_COLORS.intake, toneMapped: false });
  const exhaustFlow = new THREE.MeshBasicMaterial({ color: STROKE_COLORS.exhaust, toneMapped: false });
  const ignition = new THREE.MeshBasicMaterial({ color: 0xfff3c9, toneMapped: false });

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
    const opening = isVEngine ? Math.PI / 2 : 0;
    const start = opening + (rear ? Math.PI / 2 : -Math.PI / 2);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true, start, Math.PI), material);
    mesh.position.set(x, y, 0);
    parent.add(mesh);
  }

  box(group, width * 1.05, bore * 0.2, bore * 1.2, frame, 0, -throwRadius - bore * 0.14, 0);
  box(group, width * 0.97, bore * 0.32, bore * 0.93, oilPan, 0, -throwRadius - bore * 0.38, 0);
  box(group, width * 0.9, bore * 0.078, bore * 1.03, ribs, 0, -throwRadius - bore * 0.27, 0);
  box(group, width * 0.63, bore * 0.11, bore * 0.22, oilPan, width * 0.09, -throwRadius - bore * 0.57, 0);
  box(group, width * 1.04, bore * 0.88, bore * 0.23, frame, 0, 0, -radius * 0.86);
  box(cover, width * 1.04, bore * 0.85, bore * 0.18, frame, 0, 0, radius * 0.93);

  const axle = cylinder(group, bore * 0.082, width * 1.1, crankMetal, 0, 0, 0);
  axle.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const bearing = cylinder(group, bore * 0.22, bore * 0.11, ribs, side * width * 0.49, 0, 0);
    bearing.rotation.z = Math.PI / 2;
  }

  const camTracks = !isVEngine && bankSize === 1 ? [0] : [-bore * 0.23, bore * 0.23];

  function makeCam(bank: THREE.Group, bankFiringAngles: readonly number[], z: number, intakeSide: number) {
    const cam = new THREE.Group();
    cam.position.set(0, camY, z);
    bank.add(cam);
    const intakeTrack = z * intakeSide > 0;
    const material = z === 0 ? crankMetal : intakeTrack ? intakeMetal : exhaustMetal;
    const shaft = cylinder(cam, bore * 0.055, bankWidth, material, 0, 0, 0);
    shaft.rotation.z = Math.PI / 2;

    for (const [index, firingAngle] of bankFiringAngles.entries()) {
      const x = (index - (bankSize - 1) / 2) * spacing;
      const valveTypes: (keyof typeof VALVE_EVENTS)[] = camTracks.length === 1 ? ["intake", "exhaust"] : [intakeTrack ? "intake" : "exhaust"];
      for (const valveType of valveTypes) {
        const intake = valveType === "intake";
        const { opensDegrees, closesDegrees } = VALVE_EVENTS[valveType];
        const liftPeakRad = (opensDegrees + closesDegrees) * Math.PI / 360;
        const eccentricAngle = Math.PI - (liftPeakRad + firingAngle) / 2;
        const eccentricity = bore * 0.055;
        const lobe = cylinder(cam, bore * 0.11, bore * 0.115, intake ? intakeMetal : exhaustMetal,
          x + bore * (intake ? -0.2 : 0.2), Math.cos(eccentricAngle) * eccentricity, Math.sin(eccentricAngle) * eccentricity);
        lobe.rotation.z = Math.PI / 2;
      }
    }

    const gear = cylinder(cam, bore * 0.16, bore * 0.085, material, -bankWidth * 0.5, 0, 0);
    gear.rotation.z = Math.PI / 2;
    return cam;
  }

  function makeValve(bank: THREE.Group, x: number, z: number, material: THREE.Material) {
    const valve = new THREE.Group();
    valve.position.set(x, seatY, z);
    bank.add(valve);
    cylinder(valve, bore * 0.03, bore * 0.32, material, 0, bore * 0.14, 0);
    cylinder(valve, bore * 0.127, bore * 0.048, material, 0, 0, 0);
    cylinder(valve, bore * 0.073, bore * 0.043, material, 0, bore * 0.3, 0);
    return valve;
  }

  function addIntakeManifold(bank: THREE.Group, intakeSide: number) {
    const chamberY = seatY + bore * 0.44;
    const chamberZ = intakeSide * bore * 1.03;
    const plenum = cylinder(bank, bore * 0.17, bankWidth + bore * 0.09, intakeCasting, 0, chamberY, chamberZ);
    plenum.rotation.z = Math.PI / 2;
    const neckX = -bankWidth / 2 - bore * 0.15;
    const throttleBody = cylinder(bank, bore * 0.13, bore * 0.22, rodMetal, neckX, chamberY, chamberZ);
    throttleBody.rotation.z = Math.PI / 2;
    const intakeRim = new THREE.Mesh(new THREE.TorusGeometry(bore * 0.13, bore * 0.027, 8, 16), frame);
    intakeRim.rotation.y = Math.PI / 2;
    intakeRim.position.set(neckX - bore * 0.1, chamberY, chamberZ);
    bank.add(intakeRim);

    for (let index = 0; index < bankSize; index += 1) {
      const x = (index - (bankSize - 1) / 2) * spacing;
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, seatY - bore * 0.09, intakeSide * bore * 0.48),
        new THREE.Vector3(x, seatY + bore * 0.10, intakeSide * bore * 0.82),
        new THREE.Vector3(x, chamberY - bore * 0.08, chamberZ),
      ]);
      bank.add(new THREE.Mesh(new THREE.TubeGeometry(path, 12, bore * 0.084, 9), intakeCasting));
    }
  }

  function makeCylinder(bank: THREE.Group, bankCover: THREE.Group, index: number, bankIndex: number,
    crankSides: readonly number[], exhaustSide: number) {
    const x = (index - (bankSize - 1) / 2) * spacing;
    halfBarrel(bank, radius, barrelHeight, frame, x, barrelY, true);
    halfBarrel(bankCover, radius, barrelHeight, frame, x, barrelY, false);
    for (const y of [barrelBottom, barrelY, barrelTop]) {
      halfBarrel(bank, radius * 1.08, bore * 0.065, ribs, x, y, true);
      halfBarrel(bankCover, radius * 1.08, bore * 0.065, ribs, x, y, false);
    }

    const crank = new THREE.Group();
    crank.position.x = x;
    bank.add(crank);
    const crankPin = cylinder(crank, bore * 0.09, bore * (isVEngine ? 0.22 : 0.49), crankMetal, 0, throwRadius, 0);
    crankPin.rotation.z = Math.PI / 2;

    for (const side of crankSides) {
      const cheek = box(crank, bore * 0.13, throwRadius * 1.65, bore * 0.24, crankMetal, side * bore * 0.2, throwRadius * 0.24, 0);
      cheek.rotation.x = side * 0.08;
      const counterweight = cylinder(crank, bore * 0.21, bore * 0.13, crankMetal, side * bore * 0.2, -throwRadius * 0.62, 0);
      counterweight.rotation.z = Math.PI / 2;
    }

    const piston = new THREE.Group();
    piston.position.x = x;
    bank.add(piston);
    cylinder(piston, bore * 0.465, bore * 0.26, pistonMetal, 0, bore * 0.025, 0);
    for (const y of [0.075, 0.12]) cylinder(piston, bore * 0.474, bore * 0.018, ribs, 0, bore * y, 0);
    const wrist = cylinder(piston, bore * 0.067, bore * 0.88, rodMetal, 0, 0, 0);
    wrist.rotation.z = Math.PI / 2;

    const rod = new THREE.Group();
    bank.add(rod);
    box(rod, bore * 0.127, rodLength * 0.81, bore * 0.15, rodMetal, 0, 0, 0);
    const bigEnd = cylinder(rod, bore * 0.145, bore * 0.18, rodMetal, 0, -rodLength / 2, 0);
    bigEnd.rotation.z = Math.PI / 2;
    const smallEnd = cylinder(rod, bore * 0.112, bore * 0.15, rodMetal, 0, rodLength / 2, 0);
    smallEnd.rotation.z = Math.PI / 2;

    cylinder(bank, bore * 0.046, bore * 0.18, porcelain, x, seatY + bore * 0.18, 0);
    cylinder(bank, bore * 0.064, bore * 0.07, crankMetal, x, seatY + bore * 0.057, 0);
    const annotations = new THREE.Group();
    bank.add(annotations);
    const charge = new THREE.Mesh(chargeGeometry, strokes.compression);
    charge.position.set(x, seatY, 0);
    charge.scale.y = 0.001;
    annotations.add(charge);
    const spark = new THREE.Mesh(flowGeometry, ignition);
    spark.position.set(x, seatY - bore * 0.045, 0);
    spark.visible = false;
    annotations.add(spark);
    const intakePacket = new THREE.Mesh(flowGeometry, intakeFlow);
    const exhaustPacket = new THREE.Mesh(flowGeometry, exhaustFlow);
    annotations.add(intakePacket, exhaustPacket);
    const number = cylinderNumber(bankIndex * bankSize + index + 1, bore);
    if (number) {
      number.position.set(x, seatY + bore * 0.74, 0);
      annotations.add(number);
    }
    const intakeSide = -exhaustSide;
    return {
      x, crank, piston, rod, charge, spark, annotations, intakePacket, exhaustPacket, intakeSide, exhaustSide,
      intake: makeValve(bank, x - bore * 0.2, intakeSide * bore * 0.18, intakeMetal),
      exhaust: makeValve(bank, x + bore * 0.2, exhaustSide * bore * 0.18, exhaustMetal),
    };
  }

  const banks = bankAngles.map((tilt, index) => {
    const bank = new THREE.Group();
    const bankCover = new THREE.Group();
    const side = index === 0 ? -1 : 1;
    bank.rotation.x = bankCover.rotation.x = tilt;
    bank.position.x = bankCover.position.x = side * bankStagger;
    group.add(bank);
    cover.add(bankCover);
    box(bank, bankWidth * 1.02, bore * 0.17, bore * 0.43, frame, 0, seatY + bore * 0.06, -radius * 0.65);
    box(bankCover, bankWidth * 1.04, bore * 0.34, bore * 1.12, frame, 0, seatY + bore * 0.38, 0);
    box(bankCover, bankWidth * 0.88, bore * 0.055, bore * 0.82, ribs, 0, seatY + bore * 0.57, 0);
    const bankFiringAngles = firingAngles.slice(index * bankSize, (index + 1) * bankSize);
    const crankSides = isVEngine ? [side] : [-1, 1];
    const exhaustSide = isVEngine ? side : 1;
    addIntakeManifold(bank, -exhaustSide);
    const exhaustPorts = bankFiringAngles.map((_, localIndex) => ({
      point: bank.localToWorld(new THREE.Vector3((localIndex - (bankSize - 1) / 2) * spacing,
        seatY - bore * 0.08, exhaustSide * bore * 0.48)),
      outward: new THREE.Vector3(0, 0, exhaustSide).applyQuaternion(bank.quaternion),
    }));
    return {
      exhaustPorts,
      cams: camTracks.map((z) => makeCam(bank, bankFiringAngles, z, -exhaustSide)),
      cylinders: bankFiringAngles.map((_, localIndex) => makeCylinder(bank, bankCover, localIndex, index, crankSides, exhaustSide)),
    };
  });
  const cams = banks.flatMap((bank) => bank.cams);
  const cylinders = banks.flatMap((bank) => bank.cylinders);
  const exhaust = buildExhaust(vehicle, banks.map(({ exhaustPorts }) => exhaustPorts), bore);
  group.add(exhaust.group);

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
  function applyPose(state: SimulationState, crankAngle: number, impellerAngle: number) {
    const pose = getEnginePose(vehicle, crankAngle, rpmFromRadiansPerSecond(state.engineAngularVelocity), state.vtecEngagement);
    if (impeller) impeller.rotation.z = impellerAngle;
    const moving = state.engineAngularVelocity > 0.1;
    const burning = state.engineOn && state.combustionTorqueNm > 0;
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
      const chargeHeight = Math.max(0.003, seatY - pistonY - bore * 0.17);
      parts.charge.position.y = seatY - chargeHeight * 0.5;
      parts.charge.scale.y = chargeHeight;
      parts.charge.material = strokes[cylinder.stroke];
      parts.spark.visible = burning && cylinder.ignitionGlow > 0.035;
      parts.spark.scale.setScalar(0.65 + 1.45 * cylinder.ignitionGlow);
      const degrees = cylinder.crankAngleRad * 180 / Math.PI;
      const intakeProgress = (degrees - VALVE_EVENTS.intake.opensDegrees)
        / (VALVE_EVENTS.intake.closesDegrees - VALVE_EVENTS.intake.opensDegrees);
      const exhaustProgress = (degrees - VALVE_EVENTS.exhaust.opensDegrees)
        / (VALVE_EVENTS.exhaust.closesDegrees - VALVE_EVENTS.exhaust.opensDegrees);
      parts.intakePacket.visible = moving && cylinder.intakeLiftM > 0.0001;
      parts.exhaustPacket.visible = moving && cylinder.exhaustLiftM > 0.0001;
      parts.intakePacket.position.set(parts.x - bore * 0.16, seatY - bore * intakeProgress * 0.32,
        parts.intakeSide * bore * (0.72 - intakeProgress * 0.62));
      parts.exhaustPacket.position.set(parts.x + bore * 0.16, seatY - bore * (0.29 - exhaustProgress * 0.17),
        parts.exhaustSide * bore * (0.12 + exhaustProgress * 0.51));
    }
    return pose.cylinders;
  }

  function applyCutaway(cutaway: boolean) {
    cover.visible = !cutaway;
    for (const { annotations } of cylinders) annotations.visible = cutaway;
  }

  const layout = isBoxer ? "boxer" : isVEngine ? "v" : "inline";
  return {
    group, cover, applyCutaway, applyPose,
    applyFlame: exhaust.applyFlame, applyExhaustState: exhaust.applyExhaustState, hasTurbo: exhaust.hasTurbo,
    layout, extraMaterials: Object.values(strokes),
  };
}

function targetPixelRatio(quality: SceneQuality): number {
  const dpr = window.devicePixelRatio || 1;
  if (quality === "low") return 1;
  if (quality === "high") return Math.min(dpr, 2);
  return Math.min(dpr, 1.5);
}

export default function EngineScene({
  vehicle, readState, readExhaustFlame, cutaway, paused, visualSpeed, quality = "medium", onStrokesChange,
}: EngineSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const options = useRef({ readState, readExhaustFlame, cutaway, paused, visualSpeed, quality, onStrokesChange });
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    options.current = { readState, readExhaustFlame, cutaway, paused, visualSpeed, quality, onStrokesChange };
    const activeRenderer = rendererRef.current;
    if (activeRenderer) activeRenderer.setPixelRatio(targetPixelRatio(quality));
  }, [readState, readExhaustFlame, cutaway, paused, visualSpeed, quality, onStrokesChange]);

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
    const subject = vehicle.geometry.rotary ? "轉子引擎內構"
      : vehicle.supercharger ? "引擎與機械增壓器內構" : "引擎內構";
    canvas.setAttribute("aria-label", `${vehicle.name} ${subject}與排氣管示意，可旋轉及縮放`);
    renderer.setPixelRatio(targetPixelRatio(options.current.quality));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current = renderer;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const studio = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    const environment = generator.fromScene(studio, 0.04, 0.1, 20, { size: 64 });
    studio.dispose();
    generator.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.64;
    scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x405165, 1.45));
    const key = new THREE.DirectionalLight(0xe8f5ff, 2.1);
    key.position.set(2.7, 3.5, 3);
    scene.add(key);
    const edge = new THREE.DirectionalLight(0xffd3a3, 1.1);
    edge.position.set(-2.5, 1.6, -2);
    scene.add(edge);

    const engine = buildEngine(vehicle);
    let previousState = options.current.readState();
    let crankAngle = previousState.crankAngleRad;
    let impellerAngle = previousState.superchargerAngleRad;
    let visiblePose = engine.applyPose(previousState, crankAngle, impellerAngle);
    scene.add(engine.group);
    const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 50);
    const controls = new OrbitControls(camera, canvas);
    const bounds = new THREE.Box3().setFromObject(engine.group);
    const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    bounds.getCenter(controls.target);
    const offset = engine.layout === "rotary" ? new THREE.Vector3(1.17, 0.45, 1.02)
      : engine.layout === "boxer" ? new THREE.Vector3(1.37, 0.70, 0.58)
      : engine.layout === "v" ? new THREE.Vector3(1.14, 0.57, 0.93)
      : new THREE.Vector3(0.64, 0.45, 1.21);
    camera.position.copy(controls.target).addScaledVector(offset, size);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = size * 0.65;
    controls.maxDistance = size * 3.7;
    controls.update();

    let frame = 0;
    let lost = false;
    let dirty = true;
    let lastFlame = 0;
    let flameTimeSeconds = 0;
    let turboAngle = 0;
    let headerHeat = 0;
    let slowFrames = 0;
    let lastTime: number | null = null;
    let lastLegendAt = -Infinity;
    let lastStrokes: readonly EngineStroke[] = [];
    engine.applyCutaway(options.current.cutaway);

    function onOrbit() { dirty = true; }

    function draw(timestamp: number) {
      frame = 0;
      if (lost || document.hidden) return;
      const current = options.current;
      const rawElapsed = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
      const elapsed = Math.min(0.075, Math.max(0, rawElapsed));
      lastTime = timestamp;
      const sceneSeconds = current.paused ? 0 : elapsed * current.visualSpeed;
      if (!current.paused) {
        const state = current.readState();
        const nextAngle = current.visualSpeed === 1 ? state.crankAngleRad
          : (crankAngle + state.engineAngularVelocity * sceneSeconds) % cycleTurn;
        const nextImpeller = current.visualSpeed === 1 ? state.superchargerAngleRad
          : (impellerAngle + state.superchargerAngularVelocity * sceneSeconds) % fullTurn;
        if (nextAngle !== crankAngle || nextImpeller !== impellerAngle
          || state.engineAngularVelocity !== previousState.engineAngularVelocity
          || state.engineOn !== previousState.engineOn
          || state.vtecEngagement !== previousState.vtecEngagement
          || state.vvaEngagement !== previousState.vvaEngagement
          || Boolean(state.combustionTorqueNm) !== Boolean(previousState.combustionTorqueNm)) {
          crankAngle = nextAngle;
          impellerAngle = nextImpeller;
          visiblePose = engine.applyPose(state, crankAngle, impellerAngle);
          dirty = true;
        }
        const rpmNorm = Math.min(1.2, rpmFromRadiansPerSecond(state.engineAngularVelocity) / vehicle.physics.referenceRpm);
        const maxBoost = vehicle.turbocharger?.maxBoostBar ?? 1;
        const boostNorm = vehicle.turbocharger ? Math.min(1, state.turboBoostBar / maxBoost) : 0;
        const torqueNorm = Math.min(1, Math.max(0, state.combustionTorqueNm / vehicle.physics.peakTorqueNm));
        const rawThermal = state.engineOn ? rpmNorm * (0.45 * torqueNorm + 0.55 * Math.max(state.throttle, boostNorm)) : 0;
        const targetHeat = Math.min(1, Math.max(0, (rawThermal - 0.30) / 0.62));
        const heatTau = targetHeat > headerHeat ? 1.8 : 3.4;
        const nextHeat = headerHeat + (targetHeat - headerHeat) * (1 - Math.exp(-elapsed / heatTau));
        const turboSpinRate = engine.hasTurbo && state.engineOn ? 14 + 24 * rpmNorm + 96 * boostNorm : 0;
        const nextTurboAngle = (turboAngle + turboSpinRate * sceneSeconds) % fullTurn;
        if (Math.abs(nextHeat - headerHeat) > 0.0015 || nextTurboAngle !== turboAngle) {
          headerHeat = nextHeat;
          turboAngle = nextTurboAngle;
          engine.applyExhaustState(headerHeat, turboAngle);
          dirty = true;
        }
        previousState = state;
      }
      if (current.cutaway && visiblePose && timestamp - lastLegendAt >= 85) {
        lastLegendAt = timestamp;
        const strokes = visiblePose.map(({ stroke }) => stroke);
        if (strokes.some((stroke, index) => lastStrokes[index] !== stroke)) {
          lastStrokes = strokes;
          current.onStrokesChange(strokes);
        }
      }
      const flame = current.readExhaustFlame(sceneSeconds * 1000);
      if (!current.paused) flameTimeSeconds += sceneSeconds;
      if (flame > 0 || lastFlame > 0) {
        engine.applyFlame(flame, flameTimeSeconds);
        if (!current.paused || flame !== lastFlame) dirty = true;
      }
      lastFlame = flame;
      if (engine.cover.visible === current.cutaway) {
        engine.applyCutaway(current.cutaway);
        dirty = true;
      }
      controls.update();
      if (dirty) {
        if (rawElapsed > 0.045 && renderer.getPixelRatio() > 1) {
          slowFrames += 1;
          if (slowFrames >= 24) {
            renderer.setPixelRatio(1);
            slowFrames = 0;
          }
        } else {
          slowFrames = 0;
        }
        renderer.render(scene, camera);
        dirty = false;
      }
      frame = requestAnimationFrame(draw);
    }

    function syncVisibility() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
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
      const materials = new Set<THREE.Material>(engine.extraMaterials);
      const geometries = new Set<THREE.BufferGeometry>();
      engine.group.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          geometries.add(part.geometry);
          materials.add(part.material);
        } else if (part instanceof THREE.Sprite) {
          part.material.map?.dispose();
          materials.add(part.material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      environment.dispose();
      rendererRef.current = null;
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
