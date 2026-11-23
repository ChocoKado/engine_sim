import type { Vehicle } from "../data/vehicles";

const RADIANS_PER_STROKE = Math.PI;
const CYCLE_RAD = 4 * Math.PI;
const STROKES = ["power", "exhaust", "intake", "compression"] as const;

export const VALVE_EVENTS = {
  intake: { opensDegrees: 345, closesDegrees: 560 },
  exhaust: { opensDegrees: 155, closesDegrees: 375 },
} as const;

function wrapCycle(angle: number): number {
  return ((angle % CYCLE_RAD) + CYCLE_RAD) % CYCLE_RAD;
}

function valveLift(angleRad: number, opensDegrees: number, closesDegrees: number, maximum: number): number {
  const angleDegrees = angleRad * 180 / Math.PI;
  if (angleDegrees <= opensDegrees || angleDegrees >= closesDegrees) return 0;

  const opening = (angleDegrees - opensDegrees) / (closesDegrees - opensDegrees);
  return maximum * Math.sin(Math.PI * opening) ** 2;
}

export function getEnginePose(vehicle: Vehicle, crankAngleRad: number, engineRpm = 0) {
  const angle = wrapCycle(crankAngleRad);
  const { strokeM, rodLengthM, intakeLiftM, exhaustLiftM, vva } = vehicle.geometry;
  const crankRadius = strokeM / 2;
  const vvaMode = !vva ? null : vva.switchRpm === null ? "unknown" : engineRpm >= vva.switchRpm ? "high" : "low";
  const intakeMaximum = vvaMode === "high" && vva ? vva.highIntakeLiftM : intakeLiftM;

  const firingAngles = vehicle.geometry.cylinderFiringAnglesRad ?? vehicle.audio.firingAnglesRad;
  const cylinders = firingAngles.map((firingAngle) => {
    const localAngle = wrapCycle(angle - firingAngle);
    const crankPinYM = crankRadius * Math.cos(localAngle);
    const crankPinZM = crankRadius * Math.sin(localAngle);
    return {
      crankAngleRad: localAngle,
      crankPinYM,
      crankPinZM,
      pistonYM: crankPinYM + Math.sqrt(rodLengthM ** 2 - crankPinZM ** 2),
      intakeLiftM: valveLift(localAngle, VALVE_EVENTS.intake.opensDegrees, VALVE_EVENTS.intake.closesDegrees, intakeMaximum),
      exhaustLiftM: valveLift(localAngle, VALVE_EVENTS.exhaust.opensDegrees, VALVE_EVENTS.exhaust.closesDegrees, exhaustLiftM),
      stroke: STROKES[Math.floor(localAngle / RADIANS_PER_STROKE)],
    };
  });

  return { camAngleRad: angle / 2, cylinders, vvaMode };
}
