import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EngineAssembly3D, engineAssemblySignature } from './EngineAssembly3D.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function fitAssemblyCamera(bounds, direction, verticalFov, aspect, padding = 1.07) {
  const target = bounds.getCenter(new THREE.Vector3());
  const view = direction.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(view).normalize();
  const up = view.clone().cross(right).normalize();
  const tanVertical = Math.tan(verticalFov * Math.PI / 360);
  const tanHorizontal = tanVertical * Math.max(0.01, aspect);
  let distance = 0.1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(target);
    const framing = Math.max(Math.abs(corner.dot(right)) / tanHorizontal, Math.abs(corner.dot(up)) / tanVertical);
    distance = Math.max(distance, corner.dot(view) + framing * padding, corner.dot(view) + 0.1);
  }
  return { position: target.clone().add(view.multiplyScalar(distance)), target, distance };
}

export class Engine3DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.available = false;
    this.disposed = false;
    this.animationSpeed = 1;
    this.focusedPart = null;
    this.assembly = null;
    this.signature = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111a23);
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.025, 50);
    this.camera.position.set(3.4, 2.5, 4.3);
    this.resize = this.resize.bind(this);
    this.onContextLost = event => {
      event.preventDefault();
      this.available = false;
      this.error = 'WebGL context lost';
      if (this.canvas.dataset) this.canvas.dataset.rendererStatus = 'unavailable';
    };
    this.onContextRestored = () => {
      if (this.disposed) return;
      this.available = true;
      this.error = null;
      if (this.canvas.dataset) this.canvas.dataset.rendererStatus = 'ready';
      this.resize();
    };
    if (!canvas) {
      this.error = 'Missing 3D canvas';
      return;
    }
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 0.65;
      this.controls.maxDistance = 12;
      this.controls.maxPolarAngle = Math.PI * 0.83;
      this.controls.enablePan = true;
      this.controls.addEventListener('start', () => { this.cameraTween = null; });
      this.buildStudio();
      canvas.addEventListener('webglcontextlost', this.onContextLost);
      canvas.addEventListener('webglcontextrestored', this.onContextRestored);
      this.onPointerDown = event => { this.pointerStart = { x: event.clientX, y: event.clientY }; };
      this.onPointerUp = event => this.selectAtPointer(event);
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointerup', this.onPointerUp);
      this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
      if (canvas.parentElement) this.observer?.observe(canvas.parentElement);
      globalThis.window?.addEventListener('resize', this.resize);
      this.available = true;
      if (canvas.dataset) canvas.dataset.rendererStatus = 'ready';
      this.resize();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      if (canvas.dataset) canvas.dataset.rendererStatus = 'unavailable';
      // App can retain the working 2D cutaway on browsers without WebGL.
      this.controls?.dispose();
      this.renderer?.dispose();
    }
  }

  buildStudio() {
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = generator.fromScene(room, 0.05);
    this.scene.environment = this.environmentTarget.texture;
    room.dispose();
    generator.dispose();
    this.scene.add(new THREE.HemisphereLight(0xc4d8e5, 0x1a2630, 1.6));
    const key = new THREE.DirectionalLight(0xe8f3ff, 4.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3.5;
    key.shadow.camera.right = key.shadow.camera.top = 3.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0001;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fbed6, 2.5);
    rim.position.set(-4, 3, -2);
    this.scene.add(rim);
    const warm = new THREE.DirectionalLight(0xffbc85, 0.6);
    warm.position.set(2, 0.5, -4);
    this.scene.add(warm);
    this.floorGeometry = new THREE.PlaneGeometry(30, 30);
    this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0x17212a, roughness: 0.94, metalness: 0.09 });
    this.floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = new THREE.GridHelper(12, 24, 0x344653, 0x243440);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.3;
    this.scene.add(this.grid);
  }

  resize() {
    if (!this.available || this.disposed) return false;
    const parent = this.canvas.parentElement;
    const rect = parent?.getBoundingClientRect?.() || this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false; // Hidden tabs preserve their last usable viewport.
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.width === width && this.height === height) return true;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.assembly) this.frame(this.assembly.getBounds(this.focusedPart), false, this.focusedPart);
    return true;
  }

  render(engine, drivetrain, dt = 0) {
    if (!this.available || this.disposed || !engine?.config) return false;
    const signature = engineAssemblySignature(engine);
    if (signature !== this.signature) {
      const priorConfig = this.assembly?.config.id;
      this.assembly?.dispose();
      this.assembly = new EngineAssembly3D(engine);
      this.scene.add(this.assembly.group);
      this.signature = signature;
      const bounds = this.assembly.getBounds();
      this.floor.position.y = bounds.min.y - 0.025;
      this.grid.position.y = bounds.min.y - 0.023;
      if (priorConfig !== engine.config.id) this.focusedPart = null;
      if (this.focusedPart && this.assembly.parts.has(this.focusedPart)) this.setFocus(this.focusedPart);
      else this.frame(bounds, false);
    }
    this.assembly.update(engine, dt, this.animationSpeed);
    if (this.cameraTween) {
      const blend = 1 - Math.exp(-Math.max(0.001, dt) * 9);
      this.camera.position.lerp(this.cameraTween.position, blend);
      this.controls.target.lerp(this.cameraTween.target, blend);
      if (this.camera.position.distanceToSquared(this.cameraTween.position) < 0.00005) {
        this.camera.position.copy(this.cameraTween.position);
        this.controls.target.copy(this.cameraTween.target);
        this.cameraTween = null;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  frame(bounds, smooth = true, partId = null) {
    if (bounds.isEmpty()) return;
    const direction = partId === 'flywheel' ? new THREE.Vector3(0.48, 0.28, -1)
      : partId === 'camshaft' ? new THREE.Vector3(0.45, 1.15, 0.7)
        : partId === 'headers' || partId === 'turbo' ? new THREE.Vector3(1.2, 0.55, 0.6)
          : partId === 'intake' || partId === 'intercooler' ? new THREE.Vector3(-1.0, 0.52, 1.2)
            : new THREE.Vector3(1, 0.68, 1.42);
    const { position, target, distance } = fitAssemblyCamera(bounds, direction, this.camera.fov, this.camera.aspect, partId ? 1.14 : 1.05);
    this.controls.maxDistance = Math.max(10, distance * 2.4);
    this.controls.minDistance = partId ? 0.45 : 0.65;
    if (smooth) this.cameraTween = { position, target };
    else {
      this.cameraTween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  setFocus(partId) {
    if (!this.assembly) { this.focusedPart = partId || null; return false; }
    const part = this.assembly.setFocus(partId);
    this.focusedPart = this.assembly.focusedPart;
    this.frame(this.assembly.getBounds(this.focusedPart), true, this.focusedPart);
    return part !== this.assembly.group;
  }

  resetCamera() {
    this.focusedPart = null;
    this.assembly?.setFocus(null);
    if (this.assembly && this.available) this.frame(this.assembly.getBounds(), true);
  }

  setAnimationSpeed(speed) {
    this.animationSpeed = clamp(Number.isFinite(Number(speed)) ? Number(speed) : 1, 0.05, 1);
    return this.animationSpeed;
  }

  selectAtPointer(event) {
    if (!this.pointerStart || !this.assembly || !this.available) return;
    const travel = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    this.pointerStart = null;
    if (travel > 5) return;
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const hit = raycaster.intersectObject(this.assembly.group, true)[0];
    let node = hit?.object;
    while (node && !node.userData.partId) node = node.parent;
    if (!node?.userData.partId) return;
    const partId = node.userData.partId;
    this.setFocus(partId);
    this.onPartSelected?.(partId);
    if (typeof CustomEvent !== 'undefined') this.canvas.dispatchEvent(new CustomEvent('engine-part-select', { detail: { partId } }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.available = false;
    this.observer?.disconnect();
    globalThis.window?.removeEventListener('resize', this.resize);
    this.canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.onPointerDown) this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    if (this.onPointerUp) this.canvas?.removeEventListener('pointerup', this.onPointerUp);
    this.controls?.dispose();
    this.assembly?.dispose();
    this.floorGeometry?.dispose();
    this.floorMaterial?.dispose();
    this.grid?.geometry.dispose();
    this.grid?.material.dispose();
    this.scene.traverse(node => { if (node.isLight) node.shadow?.map?.dispose(); });
    this.environmentTarget?.dispose();
    this.renderer?.dispose();
    this.scene.clear();
  }
}
