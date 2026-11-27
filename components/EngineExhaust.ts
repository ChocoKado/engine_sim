import * as THREE from "three";
import type { Vehicle } from "../data/vehicles";

export interface ExhaustPort {
  readonly point: THREE.Vector3;
  readonly outward: THREE.Vector3;
}

const xAxis = new THREE.Vector3(1, 0, 0);
const yAxis = new THREE.Vector3(0, 1, 0);

export function impellerVanes(radius: number) {
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

export function buildExhaust(vehicle: Vehicle, banks: readonly ExhaustPort[][], scale: number) {
  const group = new THREE.Group();
  const race = vehicle.kind === "formula1" || vehicle.kind === "endurance";
  const manifold = new THREE.MeshStandardMaterial({
    color: 0xb59576, metalness: 0.66, roughness: 0.31, emissive: 0xff4510, emissiveIntensity: 0,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aadb6, metalness: 0.7, roughness: 0.24 });
  const cast = new THREE.MeshStandardMaterial({ color: 0x4d5358, metalness: 0.56, roughness: 0.52 });
  const turbineHot = new THREE.MeshStandardMaterial({
    color: 0x564b48, metalness: 0.54, roughness: 0.48, emissive: 0xff4d14, emissiveIntensity: 0,
  });
  const compressorAlloy = new THREE.MeshStandardMaterial({ color: 0xc8d5dc, metalness: 0.68, roughness: 0.26 });
  const impellerBladeMetal = new THREE.MeshStandardMaterial({
    color: 0x7be0be, metalness: 0.42, roughness: 0.30, side: THREE.DoubleSide,
  });
  const dark = new THREE.MeshBasicMaterial({ color: 0x191718, side: THREE.DoubleSide });
  const radius = scale * (race ? 0.056 : 0.066);
  const flames: THREE.Group[] = [];
  const flashLights: THREE.PointLight[] = [];
  const turboImpellers: THREE.Group[] = [];
  const outerFlameMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      uniform float strength;
      uniform float time;
      varying vec2 coords;
      void main() {
        coords = uv;
        vec3 shaped = position;
        float along = uv.y;
        float swell = 1.0 + 0.36 * sin(along * 3.14159) + 0.09 * sin(16.0 * along - 52.0 * time) * along;
        shaped.yz *= swell * (1.0 - 0.58 * smoothstep(0.55, 1.0, along));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(shaped, 1.0);
      }
    `,
    fragmentShader: `
      uniform float strength;
      uniform float time;
      varying vec2 coords;
      void main() {
        float along = coords.y;
        float tongues = 0.74 + 0.26 * sin(22.0 * along + 18.84955 * coords.x - 64.0 * time)
          * cos(11.0 * along - 12.56637 * coords.x + 41.0 * time);
        float shockRing = 0.86 + 0.14 * max(0.0, cos(26.0 * along - 48.0 * time)) * (1.0 - along);
        vec3 nozzleBlue = mix(vec3(0.34, 0.68, 1.0), vec3(0.98, 0.95, 0.86), smoothstep(0.0, 0.20, along));
        vec3 midGold = mix(nozzleBlue, vec3(1.0, 0.76, 0.24), smoothstep(0.16, 0.52, along));
        vec3 outerOrange = mix(midGold, vec3(1.0, 0.24, 0.03), smoothstep(0.46, 0.92, along));
        float envelope = (1.0 - smoothstep(0.56, 1.0, along)) * tongues * shockRing;
        gl_FragColor = vec4(outerOrange * (1.15 + 0.45 * strength), clamp(strength * 1.18 * envelope, 0.0, 1.0));
      }
    `,
  });
  const coreFlameMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
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
        float diamond = 0.80 + 0.20 * cos(30.0 * along - 72.0 * time);
        vec3 coreColor = mix(vec3(0.62, 0.86, 1.0), vec3(1.0, 0.93, 0.68), smoothstep(0.05, 0.65, along));
        float alpha = (1.0 - smoothstep(0.35, 1.0, along)) * diamond;
        gl_FragColor = vec4(coreColor * 1.3, clamp(strength * 1.35 * alpha, 0.0, 1.0));
      }
    `,
  });
  const muzzleGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9d42,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const outerPlumeGeometry = new THREE.CylinderGeometry(radius * 2.15, radius * 1.62, scale * 2.35, 16, 6, true)
    .translate(0, scale * 1.175, 0).rotateZ(-Math.PI / 2);
  const coreJetGeometry = new THREE.ConeGeometry(radius * 1.25, scale * 1.42, 14, 1, true)
    .translate(0, scale * 0.71, 0).rotateZ(-Math.PI / 2);
  const muzzleGlowGeometry = new THREE.SphereGeometry(radius * 2.45, 12, 10);

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
      const hotScroll = new THREE.Mesh(new THREE.TorusGeometry(scale * 0.165, scale * 0.064, 10, 22), turbineHot);
      hotScroll.rotation.y = Math.PI / 2;
      hotScroll.position.copy(turbineCenter);
      group.add(hotScroll);
      sleeve(turbineCenter, xAxis, scale * 0.11, scale * 0.22, cast);

      // Open-bellmouth cold-side compressor housing facing outward so the spinning impeller is clearly visible.
      const compRadius = scale * 0.155;
      const compPos = turbineCenter.clone().add(new THREE.Vector3(scale * 0.04, scale * 0.03, side * scale * 0.18));
      const compHousing = new THREE.Group();
      compHousing.position.copy(compPos);
      if (side < 0) compHousing.rotation.y = Math.PI;
      group.add(compHousing);

      const coldScroll = new THREE.Mesh(new THREE.TorusGeometry(compRadius * 1.06, compRadius * 0.36, 10, 22), compressorAlloy);
      compHousing.add(coldScroll);
      const throat = new THREE.Mesh(new THREE.CircleGeometry(compRadius * 0.98, 20), dark);
      throat.position.z = compRadius * 0.04;
      compHousing.add(throat);
      const bellmouth = new THREE.Mesh(new THREE.TorusGeometry(compRadius * 0.96, compRadius * 0.14, 8, 22), steel);
      bellmouth.position.z = compRadius * 0.22;
      compHousing.add(bellmouth);

      const wheel = new THREE.Group();
      wheel.position.z = compRadius * 0.08;
      wheel.add(new THREE.Mesh(impellerVanes(compRadius * 0.92), impellerBladeMetal));
      const nut = new THREE.Mesh(new THREE.ConeGeometry(compRadius * 0.20, compRadius * 0.34, 12), steel);
      nut.rotation.x = Math.PI / 2;
      nut.position.z = compRadius * 0.22;
      wheel.add(nut);
      compHousing.add(wheel);
      turboImpellers.push(wheel);
    } else {
      sleeve(turbineCenter, xAxis, radius * 1.62, radius * 1.45, steel);
    }
    const pathEnd = trunkStart.clone().add(new THREE.Vector3(scale * (race ? 0.77 : 1.13), -scale * 0.16, 0));
    const lip = pathEnd.clone().addScaledVector(xAxis, scale * 0.28);
    const outletRadius = radius * (race ? 1.58 : vehicle.twoStroke ? 1.05 : 1.68);
    if (vehicle.twoStroke) {
      // Hydroformed 2-stroke expansion chamber: divergent cone -> fat belly -> convergent baffle cone -> thin stinger.
      const bellyStart = trunkStart.clone().lerp(pathEnd, 0.18);
      const bellyMid = trunkStart.clone().lerp(pathEnd, 0.50).add(new THREE.Vector3(0, -scale * 0.06, side * scale * 0.05));
      const baffleEnd = trunkStart.clone().lerp(pathEnd, 0.80);
      const coneA = new THREE.Mesh(new THREE.CylinderGeometry(radius * 2.65, radius * 1.32, bellyStart.distanceTo(bellyMid), 16), manifold);
      coneA.quaternion.setFromUnitVectors(yAxis, bellyMid.clone().sub(bellyStart).normalize());
      coneA.position.copy(bellyStart).lerp(bellyMid, 0.5);
      group.add(coneA);
      const coneB = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius * 2.65, bellyMid.distanceTo(baffleEnd), 16), manifold);
      coneB.quaternion.setFromUnitVectors(yAxis, baffleEnd.clone().sub(bellyMid).normalize());
      coneB.position.copy(bellyMid).lerp(baffleEnd, 0.5);
      group.add(coneB);
      run([trunkStart, bellyStart], radius * 1.32, manifold);
      run([baffleEnd, pathEnd, lip], outletRadius, steel);
      sleeve(pathEnd.clone().addScaledVector(xAxis, -scale * 0.18), xAxis, outletRadius * 1.65, scale * 0.42, cast);
    } else {
      run([trunkStart, trunkStart.clone().lerp(pathEnd, 0.38), pathEnd, lip], outletRadius, steel);
      if (!race) sleeve(pathEnd.clone().addScaledVector(xAxis, -scale * 0.31), xAxis, outletRadius * 1.85, scale * 0.56, cast);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(outletRadius, radius * 0.18, 8, 18), steel);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(lip);
    group.add(ring);
    const outlet = new THREE.Mesh(new THREE.CircleGeometry(outletRadius * 0.94, 18), dark);
    outlet.rotation.y = Math.PI / 2;
    outlet.position.copy(lip).addScaledVector(xAxis, -radius * 0.22);
    group.add(outlet);

    const flameAssembly = new THREE.Group();
    flameAssembly.position.copy(lip);
    flameAssembly.visible = false;
    flameAssembly.scale.setScalar(0.001);
    const outerPlume = new THREE.Mesh(outerPlumeGeometry, outerFlameMaterial);
    const coreJet = new THREE.Mesh(coreJetGeometry, coreFlameMaterial);
    const muzzleGlow = new THREE.Mesh(muzzleGlowGeometry, muzzleGlowMaterial);
    muzzleGlow.scale.set(1.35, 0.92, 0.92);
    muzzleGlow.position.x = scale * 0.14;
    flameAssembly.add(outerPlume, coreJet, muzzleGlow);
    flames.push(flameAssembly);
    group.add(flameAssembly);

    const flashLight = new THREE.PointLight(0xff7d2b, 0, scale * 6.5, 1.5);
    flashLight.position.copy(lip).addScaledVector(xAxis, scale * 0.35);
    flashLights.push(flashLight);
    group.add(flashLight);
  }

  function applyFlame(strength: number, timeSeconds: number) {
    const visible = strength > 0.015;
    const clamped = Math.min(1, 1.35 * strength);
    outerFlameMaterial.uniforms.strength.value = clamped;
    outerFlameMaterial.uniforms.time.value = timeSeconds % 40;
    coreFlameMaterial.uniforms.strength.value = Math.min(1, 1.55 * strength);
    coreFlameMaterial.uniforms.time.value = timeSeconds % 40;
    muzzleGlowMaterial.opacity = visible ? Math.min(0.62, 0.14 + 0.56 * strength) : 0;
    const lengthScale = 0.62 + strength * 1.28;
    const radialScale = 0.72 + strength * 0.88;
    for (const flame of flames) {
      flame.visible = visible;
      flame.scale.set(lengthScale, radialScale, radialScale);
    }
    for (const light of flashLights) {
      light.intensity = visible ? 3.8 * strength : 0;
    }
  }

  function applyExhaustState(headerHeat: number, turboAngleRad: number) {
    const heat = Math.min(1, Math.max(0, headerHeat));
    manifold.emissiveIntensity = 0.88 * heat ** 1.35;
    turbineHot.emissiveIntensity = 1.25 * heat ** 1.15;
    for (const impeller of turboImpellers) {
      impeller.rotation.z = turboAngleRad;
    }
  }

  return { group, applyFlame, applyExhaustState, hasTurbo: turboImpellers.length > 0 };
}
