const TAU = Math.PI * 2;
export const wrapDegrees = angle => ((angle % 720) + 720) % 720;

// FAA AMT Powerplant, chapter 1: articulated rods pivot on a rigid master rod
// flange rather than each having a separate crankpin. Dimensions are schematic.
export function radialKinematics(angleDegrees, cylinderCount = 7, crankRadius = 24, masterLength = 80, knuckleRadius = 13) {
  const angle = angleDegrees * Math.PI / 180;
  const pin = { x: Math.sin(angle) * crankRadius, y: -Math.cos(angle) * crankRadius };
  const masterDistance = -pin.y + Math.sqrt(masterLength ** 2 - pin.x ** 2);
  const masterWrist = { x: 0, y: -masterDistance };
  const masterTilt = Math.atan2(masterWrist.x - pin.x, -(masterWrist.y - pin.y));
  return Array.from({ length: cylinderCount }, (_, index) => {
    const cylinderAngle = index * TAU / cylinderCount - Math.PI / 2;
    const ux = Math.cos(cylinderAngle), uy = Math.sin(cylinderAngle);
    const jointAngle = cylinderAngle + masterTilt;
    const joint = index === 0 ? pin : {
      x: pin.x + Math.cos(jointAngle) * knuckleRadius,
      y: pin.y + Math.sin(jointAngle) * knuckleRadius,
    };
    const rodLength = index === 0 ? masterLength : masterLength - knuckleRadius;
    const projection = joint.x * ux + joint.y * uy;
    const cross = joint.x * uy - joint.y * ux;
    const distance = projection + Math.sqrt(Math.max(0, rodLength ** 2 - cross ** 2));
    return { index, angleRad: cylinderAngle, ux, uy, dist: distance, rodLength,
      jointX: joint.x, jointY: joint.y, wristX: distance * ux, wristY: distance * uy };
  });
}

const referenceCache = new Map();
function radialReference(cylinderCount) {
  if (!referenceCache.has(cylinderCount)) {
    const travel = Array.from({ length: cylinderCount }, () => ({ min: Infinity, max: -Infinity, tdc: 0 }));
    for (let angle = 0; angle < 360; angle += 0.1) radialKinematics(angle, cylinderCount).forEach((c, index) => {
      const reference = travel[index];
      reference.min = Math.min(reference.min, c.dist);
      if (c.dist > reference.max) { reference.max = c.dist; reference.tdc = angle; }
    });
    const order = Array.from({ length: cylinderCount }, (_, rank) => rank * 2 % cylinderCount);
    const timing = travel.map(({ tdc }, index) => {
      const nominal = 360 + order.indexOf(index) * 720 / cylinderCount;
      return wrapDegrees(tdc + Math.round((nominal - tdc) / 360) * 360);
    });
    referenceCache.set(cylinderCount, { timing: Object.freeze(timing), travel: Object.freeze(travel) });
  }
  return referenceCache.get(cylinderCount);
}

// Absolute crank angles of compression TDC / firing, not additive phase offsets.
// Physical and visual cycle: wrap(crank - firing + 360).
export function radialFiringAngles(cylinderCount = 7) {
  return radialReference(cylinderCount).timing;
}
export function radialCyclePhase(crankDegrees, index, cylinderCount = 7) {
  return wrapDegrees(crankDegrees - radialFiringAngles(cylinderCount)[index] + 360);
}
export function radialPistonTravel(cylinderCount = 7) {
  return radialReference(cylinderCount).travel;
}

// Two-row installation: two independent master/articulated-rod assemblies.
// R-2800's 9+9 architecture is real; dimensions/row clocking are schematic.
// Rear local crank = global crank + 180-degree throw - 20-degree row clocking.
export function radialEngineKinematics(crankDegrees, config = {}) {
  const rows = config.radialRows || 1;
  const perRow = config.cylindersPerRow || (config.cylinders || 7) / rows;
  const clocking = config.rowClockingDegrees ?? config.rowClocking ?? 20;
  const throwPhase = config.crankThrowDegrees ?? config.crankThrowPhaseDegrees ?? 180;
  const travel = radialPistonTravel(perRow);
  return Array.from({ length: rows }, (_, row) => {
    const rotation = row * clocking * Math.PI / 180;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const rotate = (x, y) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
    return radialKinematics(crankDegrees + row * (throwPhase - clocking), perRow).map((c, localIndex) => {
      const index = row * perRow + localIndex;
      const wrist = rotate(c.wristX, c.wristY), joint = rotate(c.jointX, c.jointY), axis = rotate(c.ux, c.uy);
      const firing = config.firingAngles?.[index]
        ?? wrapDegrees(radialFiringAngles(perRow)[localIndex] + row * (360 - throwPhase + clocking));
      return { ...c, index, row, localIndex, angleRad: c.angleRad + rotation,
        ux: axis.x, uy: axis.y, wristX: wrist.x, wristY: wrist.y, jointX: joint.x, jointY: joint.y,
        phaseAngle: wrapDegrees(crankDegrees - firing + 360),
        pistonPos: Math.max(0, Math.min(1, (travel[localIndex].max - c.dist)
          / (travel[localIndex].max - travel[localIndex].min))) };
    });
  }).flat();
}

export function radialEnginePistonTravel(config = {}) {
  const rows = config.radialRows || 1;
  const perRow = config.cylindersPerRow || (config.cylinders || 7) / rows;
  return Array.from({ length: rows }, () => radialPistonTravel(perRow)).flat();
}
