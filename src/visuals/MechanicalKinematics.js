import { wrapDegrees } from '../physics/RadialMechanics.js';
export { radialKinematics, radialFiringAngles, radialCyclePhase, radialPistonTravel, wrapDegrees } from '../physics/RadialMechanics.js';
export { rotaryHousingPoint, rotaryKinematics, rotaryCycleKinematics, rotaryChamberState } from '../physics/RotaryMechanics.js';

export function pistonCyclePhase(crankDegrees, cylinder, config) {
  return wrapDegrees(config.firingAngleKind === 'absolute'
    ? crankDegrees - cylinder.firingOffset + 360
    : crankDegrees + cylinder.firingOffset);
}

export function boxerKinematics(angleDegrees, crankRadius = 32, rodLength = 112) {
  const a = angleDegrees * Math.PI / 180;
  return [-1, 1].map(side => ({ side,
    jointX: side * crankRadius * Math.cos(a), jointY: side * crankRadius * Math.sin(a),
    wristX: side * (crankRadius * Math.cos(a) + Math.sqrt(rodLength ** 2 - (crankRadius * Math.sin(a)) ** 2)), wristY: 0,
  }));
}

export function pistonKinematics(phaseDegrees, rodToCrankRatio = 3.5, scale = 1) {
  const angle = phaseDegrees * Math.PI / 180;
  const crankRadius = 32 * scale;
  const rodLength = crankRadius * rodToCrankRatio;
  const crankCenterY = 90 * scale;
  const crankPinX = Math.sin(angle) * crankRadius;
  const crankPinY = crankCenterY - Math.cos(angle) * crankRadius;
  const wristPinY = crankCenterY - Math.cos(angle) * crankRadius
    - Math.sqrt(rodLength ** 2 - crankPinX ** 2);
  const pistonHeight = 44 * scale;
  // More head clearance accommodates the high cam's real overlap lift instead
  // of making the drawn valve pass through the piston at overlap TDC.
  const cylinderTopY = crankCenterY - rodLength - crankRadius - 25 * scale;
  return { crankRadius, rodLength, crankCenterY, crankPinX, crankPinY, wristPinX: 0,
    wristPinY, pistonHeight, cylinderTopY, crownY: wristPinY - pistonHeight * 0.35,
    pistonPos: (crankRadius + rodLength - (crankCenterY - wristPinY)) / (2 * crankRadius) };
}

export function cylinderBankIndex(cylinder, config) {
  const index = cylinder.index;
  if (config.layout === 'w') {
    const bank = config.visualBanks?.[index] ?? config.exhaustBanks?.[index];
    if (config.visualBanks || config.exhaustBanks?.some(value => value > 1)) return bank ?? index % 4;
    return (bank ?? index % 2) * 2 + Math.floor(index / 2) % 2;
  }
  if (config.layout === 'boxer') return config.exhaustBanks?.[index] ?? index % 2;
  return config.layout === 'v' ? config.exhaustBanks?.[index] ?? index % 2 : 0;
}

export function cylinderBankAngle(bank, config) {
  if (config.layout === 'w') {
    // Bugatti: two groups 90° apart, each comprising two rows 15° apart.
    const narrowAngle = config.narrowBankAngle ?? 15;
    const half = (config.bankAngle || 90) / 2;
    return [-half - narrowAngle / 2, -half + narrowAngle / 2,
      half - narrowAngle / 2, half + narrowAngle / 2][bank % 4];
  }
  if (config.layout === 'boxer') return bank === 0 ? -90 : 90;
  return config.layout === 'v' ? (bank === 0 ? -1 : 1) * config.bankAngle / 2 : 0;
}

// An axial cutaway of one assembled engine. The crankshaft recedes diagonally
// into the drawing; both V banks, or all four W rows, share its case and axis.
// Narrow-angle W rows are staggered along the shaft, like their VR blocks.
export function engineAssemblyLayout(cylinders, config, width, height, { showLabels = false } = {}) {
  if (!cylinders.length) return [];
  const banks = new Map();
  const pitch = 105;
  const depthStep = height < 180 ? 8 : 18;
  const raw = cylinders.map(cylinder => {
    const bankIndex = cylinderBankIndex(cylinder, config);
    const column = banks.get(bankIndex) || 0;
    banks.set(bankIndex, column + 1);
    const stagger = config.layout === 'w' ? (bankIndex % 2) * 0.52 : config.layout === 'v' ? bankIndex * 0.14 : 0;
    const angle = cylinderBankAngle(bankIndex, config), radians = angle * Math.PI / 180;
    const journal = { x: (column + stagger) * pitch, y: -(column + stagger) * depthStep };
    const x = journal.x + Math.sin(radians) * 90;
    const y = journal.y - Math.cos(radians) * 90;
    const corners = [-55, 55].flatMap(cx => [-135, 145].map(cy => ({
      x: x + cx * Math.cos(radians) - cy * Math.sin(radians),
      y: y + cx * Math.sin(radians) + cy * Math.cos(radians),
    })));
    return { cylinder, bankIndex, column, angle, x, y, journal, corners };
  });
  const xs = raw.flatMap(cell => cell.corners.map(p => p.x));
  const ys = raw.flatMap(cell => cell.corners.map(p => p.y));
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const padding = 8, topInset = showLabels ? Math.min(76, height * 0.22) : padding;
  const scale = Math.max(0.001, Math.min(1.3, (width - padding * 2) / (right - left),
    (height - topInset - padding) / (bottom - top)));
  const offsetX = (width - (right - left) * scale) / 2 - left * scale;
  const offsetY = topInset + (height - topInset - padding - (bottom - top) * scale) / 2 - top * scale;
  return raw.map(cell => {
    const corners = cell.corners.map(p => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }));
    return { ...cell, x: cell.x * scale + offsetX, y: cell.y * scale + offsetY, scale,
      journal: { x: cell.journal.x * scale + offsetX, y: cell.journal.y * scale + offsetY },
      bounds: { left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)),
        width: Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x)),
        height: Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y)) } };
  });
}

// Cross-section panels show every cylinder. V engines use two bank rows; W16
// shows its four cylinder rows as two narrow-angle pairs. These separate
// cutaways illustrate the firing phases, rather than claiming a CAD assembly.
export function cylinderViewLayout(cylinders, config, width, height, { focusedIndex = null, showLabels = false } = {}) {
  if (!cylinders.length) return [];
  const isW = config.layout === 'w';
  const isV = config.layout === 'v';
  const bankFor = cylinder => cylinderBankIndex(cylinder, config);
  const rotationFor = bank => cylinderBankAngle(bank, config);
  const focused = focusedIndex !== null;
  const selected = focused ? [cylinders[((focusedIndex % cylinders.length) + cylinders.length) % cylinders.length]] : cylinders;
  const groupCount = focused ? 1 : isW ? 4 : isV ? 2 : 1;
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
