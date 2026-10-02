const TAU = Math.PI * 2;
export const wrapRotaryDegrees = angle => ((angle % 1080) + 1080) % 1080;

export function rotaryHousingPoint(t, radius = 70, eccentricity = 11) {
  return { x: radius * Math.cos(t) + eccentricity * Math.cos(3 * t),
    y: radius * Math.sin(t) + eccentricity * Math.sin(3 * t) };
}

// Shaft angle describes geometry; the rotor turns once per three shaft turns.
export function rotaryKinematics(shaftDegrees, radius = 70, eccentricity = 11) {
  const shaft = shaftDegrees * Math.PI / 180;
  const center = { x: eccentricity * Math.cos(shaft), y: eccentricity * Math.sin(shaft) };
  const angle = shaft / 3;
  return { center, angle, apexes: Array.from({ length: 3 }, (_, face) => {
    const t = angle + face * TAU / 3;
    return { x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t), t };
  }) };
}

// +90 aligns the four illustrative stages to actual chamber volume extrema:
// 0 intake minimum, 270 maximum, 540 combustion minimum, 810 maximum. It also
// places combustion at the fixed upper plugs, and intake/exhaust at the bottom.
export function rotaryCycleKinematics(cycleDegrees, radius = 70, eccentricity = 11) {
  return rotaryKinematics(cycleDegrees + 90, radius, eccentricity);
}

// Convex rotor faces retain their three apex seals. A 10-unit sagitta fits the
// R70/e11 illustrative housing throughout the entire shaft cycle; a full
// Reuleaux profile would protrude through this particular epitrochoid.
export function rotaryRotorFacePoint(geometry, face, fraction, sagitta = 10) {
  const u = Math.max(0, Math.min(1, fraction));
  const start = geometry.apexes[((face % 3) + 3) % 3];
  const end = geometry.apexes[((face + 1) % 3 + 3) % 3];
  const nx = (start.x + end.x) * 0.5 - geometry.center.x;
  const ny = (start.y + end.y) * 0.5 - geometry.center.y;
  const length = Math.hypot(nx, ny);
  const bulge = 4 * sagitta * u * (1 - u);
  return { x: start.x + (end.x - start.x) * u + nx / length * bulge,
    y: start.y + (end.y - start.y) * u + ny / length * bulge };
}

// Fixed plugs sit outside the inner housing surface: the apex seals sweep
// that surface, so an electrode drawn inside it would intersect the rotor.
export function rotarySparkPlugMounts(radius = 70, eccentricity = 11) {
  return [-13, 13].map(x => {
    let t = Math.PI * 1.5;
    for (let i = 0; i < 8; i++) {
      const wall = rotaryHousingPoint(t, radius, eccentricity);
      const dx = -radius * Math.sin(t) - 3 * eccentricity * Math.sin(3*t);
      t -= (wall.x - x)/dx;
    }
    const wall = rotaryHousingPoint(t, radius, eccentricity);
    const dx = -radius * Math.sin(t) - 3 * eccentricity * Math.sin(3*t);
    const dy = radius * Math.cos(t) + 3 * eccentricity * Math.cos(3*t);
    const length = Math.hypot(dx,dy);
    const normal = { x: dy/length, y: -dx/length };
    const tip = { x: wall.x + normal.x * 0.8, y: wall.y + normal.y * 0.8 };
    return { wall, normal, tip, rotation: Math.atan2(normal.x,-normal.y) };
  });
}

export function rotaryChamberState(cycleDegrees, face = 0) {
  const phaseAngle = wrapRotaryDegrees(cycleDegrees + face * 360);
  const stage = Math.floor(phaseAngle / 270);
  const u = phaseAngle % 270 / 270;
  // Curving the rotor faces subtracts the same constant area at every angle;
  // normalized chamber travel stays sinusoidal, rather than four linear ramps.
  // Clearance and pressure remain illustrative, rather than CFD data.
  const travel = (1 - Math.cos(u * Math.PI)) * 0.5;
  return { face, phaseAngle, stage, stroke: ['intake', 'compression', 'power', 'exhaust'][stage],
    volume: 0.1 + 0.9 * (stage % 2 === 0 ? travel : 1 - travel),
    isIgnitionPhase: phaseAngle >= 528 && phaseAngle < 562 };
}
