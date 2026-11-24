import * as THREE from "three";
import type { Vehicle } from "../data/vehicles";

export interface ExhaustPort {
  readonly point: THREE.Vector3;
  readonly outward: THREE.Vector3;
}

const xAxis = new THREE.Vector3(1, 0, 0);
const yAxis = new THREE.Vector3(0, 1, 0);

export function buildExhaust(vehicle: Vehicle, banks: readonly ExhaustPort[][], scale: number) {
  const group = new THREE.Group();
  const race = vehicle.kind === "formula1";
  const manifold = new THREE.MeshStandardMaterial({ color: 0xb59576, metalness: 0.66, roughness: 0.31 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aadb6, metalness: 0.7, roughness: 0.24 });
  const cast = new THREE.MeshStandardMaterial({ color: 0x4d5358, metalness: 0.56, roughness: 0.52 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x191718, side: THREE.DoubleSide });
  const radius = scale * (race ? 0.056 : 0.066);
  const flames: THREE.Mesh[] = [];
  const flameMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      varying vec2 coords;
      void main() {
        coords = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float strength;
      uniform float time;
      varying vec2 coords;
      void main() {
        float along = coords.y;
        float detail = 0.72 + 0.28 * sin(24.0 * along + 19.0 * coords.x - 61.0 * time);
        vec3 base = mix(vec3(0.3, 0.58, 1.0), vec3(1.0, 0.79, 0.36), smoothstep(0.01, 0.26, along));
        vec3 color = mix(base, vec3(1.0, 0.23, 0.035), smoothstep(0.28, 0.9, along));
        float fade = (1.0 - smoothstep(0.45, 1.0, along)) * detail;
        gl_FragColor = vec4(color, strength * fade);
      }
    `,
  });
  const flameGeometry = new THREE.ConeGeometry(radius * 1.47, scale * 0.94, 12, 1, true)
    .translate(0, scale * 0.47, 0).rotateZ(-Math.PI / 2);

  function run(points: THREE.Vector3[], pipeRadius: number, material: THREE.Material) {
    const path = new THREE.CatmullRomCurve3(points);
    const segments = Math.max(8, 5 * points.length);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, segments, pipeRadius, 10), material));
  }

  function sleeve(point: THREE.Vector3, axis: THREE.Vector3, sleeveRadius: number, length: number, material: THREE.Material) {
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, length, 14), material);
    piece.quaternion.setFromUnitVectors(yAxis, axis);
    piece.position.copy(point);
    group.add(piece);
  }

  const allPorts = banks.flat();
  const endOfHead = Math.max(...allPorts.map(({ point }) => point.x));
  const turbineCount = vehicle.turbocharger ? vehicle.turbocharger.turbineCount ?? 1 : 0;
  const halfway = Math.ceil(allPorts.length / 2);
  const groups = turbineCount === 1 ? [allPorts]
    : turbineCount === 2 && banks.length === 1 ? [allPorts.slice(0, halfway), allPorts.slice(halfway)]
    : banks;

  for (const [index, ports] of groups.entries()) {
    if (!ports.length) continue;
    const average = new THREE.Vector3();
    for (const { point } of ports) average.add(point);
    average.divideScalar(ports.length);
    const side = Math.sign(average.z) || 1;
    const stacked = banks.length === 1 && groups.length === 2;
    const merge = new THREE.Vector3(endOfHead + scale * (0.16 + 0.25 * index), average.y - scale * (stacked ? 0.5 + index * 0.43 : 0.54),
      average.z + side * scale * (turbineCount === 1 && banks.length === 2 ? 0.35 : 0.55));
    for (const { point, outward } of ports) {
      const stub = point.clone().addScaledVector(outward, 0.22 * scale);
      const bend = new THREE.Vector3(point.x + scale * 0.23, merge.y + scale * 0.11, stub.z + side * scale * 0.12);
      sleeve(point, outward, radius * 1.38, radius * 0.72, cast);
      run([point, stub, bend, merge], radius, manifold);
    }

    const turbineCenter = merge.clone().addScaledVector(xAxis, 0.24 * scale);
    const trunkStart = merge.clone().addScaledVector(xAxis, 0.36 * scale);
    run([merge, turbineCenter, trunkStart], radius * 1.36, manifold);
    if (turbineCount) {
      const housing = new THREE.Mesh(new THREE.TorusGeometry(scale * 0.16, scale * 0.063, 9, 20), cast);
      housing.rotation.y = Math.PI / 2;
      housing.position.copy(turbineCenter);
      group.add(housing);
      sleeve(turbineCenter, xAxis, scale * 0.14, scale * 0.20, steel);
    } else {
      sleeve(turbineCenter, xAxis, radius * 1.62, radius * 1.45, steel);
    }
    const pathEnd = trunkStart.clone().add(new THREE.Vector3(scale * (race ? 0.77 : 1.13), -scale * 0.16, 0));
    const lip = pathEnd.clone().addScaledVector(xAxis, scale * 0.28);
    const outletRadius = radius * (race ? 1.58 : 1.68);
    run([trunkStart, trunkStart.clone().lerp(pathEnd, 0.38), pathEnd, lip], outletRadius, steel);
    if (!race) sleeve(pathEnd.clone().addScaledVector(xAxis, -scale * 0.31), xAxis, outletRadius * 1.85, scale * 0.56, cast);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(outletRadius, radius * 0.18, 8, 18), steel);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(lip);
    group.add(ring);
    const outlet = new THREE.Mesh(new THREE.CircleGeometry(outletRadius * 0.94, 18), dark);
    outlet.rotation.y = Math.PI / 2;
    outlet.position.copy(lip).addScaledVector(xAxis, -radius * 0.22);
    group.add(outlet);

    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.copy(lip);
    flame.visible = false;
    flame.scale.setScalar(0.001);
    flames.push(flame);
    group.add(flame);
  }

  function applyFlame(strength: number, timeSeconds: number) {
    flameMaterial.uniforms.strength.value = Math.min(1, 1.4 * strength);
    flameMaterial.uniforms.time.value = timeSeconds % 40;
    for (const flame of flames) {
      flame.visible = strength > 0.02;
      flame.scale.set(0.32 + strength * 1.15, 0.42 + strength * 0.85, 0.42 + strength * 0.85);
    }
  }

  return { group, applyFlame };
}
