// Illustrative chassis + driver loads. These are not manufacturer performance
// claims. Motorcycle engines must not inherit the mass of a passenger car.
export const VEHICLE_PROFILES = {
  i1: { mass: 210, dragArea: 0.42 },
  i2_180: { mass: 260, dragArea: 0.4 },
  i2_270: { mass: 275, dragArea: 0.42 },
  v2_90: { mass: 285, dragArea: 0.4 },
  i3: { mass: 280, dragArea: 0.38 },
  i4_flat: { mass: 285, dragArea: 0.36 },
  i4_cross: { mass: 285, dragArea: 0.36 },
  i6: { mass: 1550, dragArea: 0.66 },
  v6: { mass: 1750, dragArea: 0.68 },
  v8_cross: { mass: 1750, dragArea: 0.72 },
  v8_flat: { mass: 1550, dragArea: 0.62 },
  v10: { mass: 1550, dragArea: 0.64 },
  v12: { mass: 1750, dragArea: 0.65 },
  w16: { mass: 2050, dragArea: 0.76 }
};

export function converterCharacteristics(speedRatio) {
  // Pump reaction is proportional to pump speed squared. Torque multiplication
  // fades as the turbine catches the pump; output power never exceeds input.
  // Model structure: MathWorks Powertrain Blockset, Torque Converter.
  const points = [[0, 1, 2.1], [0.5, 0.91, 1.5], [0.7, 0.8, 1.25],
    [0.85, 0.6, 1.07], [0.92, 0.38, 1.01], [1, 0, 1]];
  const s = Math.max(0, Math.min(1, speedRatio));
  for (let i = 1; i < points.length; i++) {
    if (s <= points[i][0]) {
      const a = points[i - 1], b = points[i], f = (s - a[0]) / (b[0] - a[0]);
      return { capacity: a[1] + (b[1] - a[1]) * f, torqueRatio: a[2] + (b[2] - a[2]) * f };
    }
  }
}
