const TAU = Math.PI * 2;
export const wrapDegrees = angle => ((angle % 720) + 720) % 720;

export function boxerKinematics(angleDegrees, crankRadius = 32, rodLength = 112) {
  const a = angleDegrees * Math.PI / 180;
  return [-1, 1].map(side => ({ side,
    jointX: side * crankRadius * Math.cos(a), jointY: side * crankRadius * Math.sin(a),
    wristX: side * (crankRadius * Math.cos(a) + Math.sqrt(rodLength ** 2 - (crankRadius * Math.sin(a)) ** 2)), wristY: 0,
  }));
}

export function rotaryHousingPoint(t, radius = 70, eccentricity = 11) {
  return { x: radius * Math.cos(t) + eccentricity * Math.cos(3 * t),
    y: radius * Math.sin(t) + eccentricity * Math.sin(3 * t) };
}
export function rotaryKinematics(shaftDegrees, radius = 70, eccentricity = 11) {
  const shaft = shaftDegrees * Math.PI / 180;
  const center = { x: eccentricity * Math.cos(shaft), y: eccentricity * Math.sin(shaft) };
  const angle = shaft / 3;
  return { center, angle, apexes: Array.from({ length: 3 }, (_, face) => {
    const t = angle + face * TAU / 3;
    return { x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t), t };
  }) };
}

// Cross-section panels show every cylinder. V engines use two bank rows; W16
// shows its four cylinder rows as two narrow-angle pairs. These separate
// cutaways illustrate the firing phases, rather than claiming a CAD assembly.
export function cylinderViewLayout(cylinders, config, width, height, { focusedIndex = null, showLabels = false } = {}) {
  if (!cylinders.length) return [];
  const isW = config.layout === 'w';
  const isV = config.layout === 'v';
  const bankFor = cylinder => {
    const index = cylinder.index;
    if (isW) {
      const bank = config.visualBanks?.[index] ?? config.exhaustBanks?.[index];
      if (config.visualBanks || config.exhaustBanks?.some(value => value > 1)) return bank ?? index % 4;
      return (bank ?? index % 2) * 2 + Math.floor(index / 2) % 2;
    }
    return isV ? config.exhaustBanks?.[index] ?? index % 2 : 0;
  };
  const rotationFor = bank => isW
    ? [-45 - config.bankAngle / 2, -45 + config.bankAngle / 2,
      45 - config.bankAngle / 2, 45 + config.bankAngle / 2][bank % 4]
    : isV ? (bank === 0 ? -1 : 1) * config.bankAngle / 2 : 0;
  const focused = focusedIndex !== null;
  const selected = focused ? [cylinders[((focusedIndex % cylinders.length) + cylinders.length) % cylinders.length]] : cylinders;
  const groupCount = focused ? 1 : isW ? 4 : isV && cylinders.length > 6 ? 2 : 1;
  const groups = Array.from({ length: groupCount }, () => []);
  selected.forEach(cylinder => groups[groupCount === 1 ? 0 : bankFor(cylinder) % groupCount].push(cylinder));
  const groupColumns = isW && !focused && !(width < 520 && height > width * 0.95) ? 2 : 1;
  const groupRows = Math.ceil(groupCount / groupColumns);
  const padding = 6;
  const topInset = showLabels ? Math.min(76, height * 0.22) : padding;
  const groupWidth = (width - padding * 2) / groupColumns;
  const groupHeight = (height - topInset - padding) / groupRows;
  const layout = [];
  groups.forEach((group, groupIndex) => {
    const left = padding + groupIndex % groupColumns * groupWidth;
    const top = topInset + Math.floor(groupIndex / groupColumns) * groupHeight;
    const headerHeight = showLabels && groupCount > 1 ? 16 : 0;
    const cellWidth = groupWidth / Math.max(1, group.length);
    const cellHeight = groupHeight - headerHeight;
    group.forEach((cylinder, column) => {
      const bankIndex = bankFor(cylinder);
      const angle = rotationFor(bankIndex);
      const radians = Math.abs(angle * Math.PI / 180);
      // Includes valve train, spark plug, block, and the full crank web sweep.
      const rotatedWidth = 110 * Math.abs(Math.cos(radians)) + 290 * Math.abs(Math.sin(radians));
      const rotatedHeight = 110 * Math.abs(Math.sin(radians)) + 290 * Math.abs(Math.cos(radians));
      const scale = Math.max(0.01, Math.min(focused ? 1.3 : 0.95,
        (cellWidth - 6) / rotatedWidth, (cellHeight - 6) / rotatedHeight));
      const x = left + (column + 0.5) * cellWidth;
      const y = top + headerHeight + cellHeight / 2;
      layout.push({ cylinder, bankIndex, groupIndex, column, x, y, scale, angle,
        group: { left, top, width: groupWidth, height: groupHeight },
        bounds: { left: x - rotatedWidth * scale / 2, top: y - rotatedHeight * scale / 2,
          width: rotatedWidth * scale, height: rotatedHeight * scale } });
    });
  });
  return layout;
}

// FAA AMT Powerplant, chapter 1: one master rod carries the articulated rods.
// Joint positions rotate with the master rod; every rod retains its fixed length.
export function radialKinematics(angleDegrees, cylinderCount = 7, crankRadius = 24, masterLength = 80, knuckleRadius = 13) {
  const angle = angleDegrees * Math.PI / 180;
  const pin = { x: Math.sin(angle) * crankRadius, y: -Math.cos(angle) * crankRadius };
  const masterDistance = -pin.y + Math.sqrt(masterLength ** 2 - pin.x ** 2);
  const masterWrist = { x: 0, y: -masterDistance };
  const masterTilt = Math.atan2(masterWrist.x - pin.x, -(masterWrist.y - pin.y));
  return Array.from({ length: cylinderCount }, (_, index) => {
    const cylinderAngle = index * TAU / cylinderCount - Math.PI / 2;
    const ux = Math.cos(cylinderAngle);
    const uy = Math.sin(cylinderAngle);
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

// The articulated rods slightly alter piston TDC. Align visual combustion with
// each actual TDC while retaining the seven-cylinder 1-3-5-7-2-4-6 firing order.
export function radialFiringAngles(cylinderCount = 7) {
  const order = Array.from({ length: cylinderCount }, (_, rank) => rank * 2 % cylinderCount);
  return Array.from({ length: cylinderCount }, (_, index) => {
    let tdc = 0;
    let maxDistance = -Infinity;
    for (let angle = 0; angle < 360; angle += 0.5) {
      const distance = radialKinematics(angle, cylinderCount)[index].dist;
      if (distance > maxDistance) { maxDistance = distance; tdc = angle; }
    }
    const nominal = 360 + order.indexOf(index) * 720 / cylinderCount;
    return wrapDegrees(tdc + Math.round((nominal - tdc) / 360) * 360);
  });
}

// Exact underdamped step response. Remains stable at 15, 30, 60 and 144 FPS.
export function advanceGaugeNeedle(position, velocity, target, dt, omega = 46, damping = 0.84) {
  if (!Number.isFinite(position) || !Number.isFinite(velocity)) return { position: target, velocity: 0 };
  const time = Math.max(0, Math.min(0.25, Number(dt) || 0));
  const decayRate = damping * omega;
  const frequency = omega * Math.sqrt(1 - damping ** 2);
  const error = position - target;
  const coefficient = (velocity + decayRate * error) / frequency;
  const decay = Math.exp(-decayRate * time);
  const cosine = Math.cos(frequency * time);
  const sine = Math.sin(frequency * time);
  const nextError = decay * (error * cosine + coefficient * sine);
  const nextVelocity = decay * (-decayRate * (error * cosine + coefficient * sine)
    + frequency * (-error * sine + coefficient * cosine));
  return { position: target + nextError, velocity: nextVelocity };
}
