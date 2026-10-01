// Illustrative chassis + driver loads. These are not manufacturer performance
// claims. Motorcycle engines must not inherit the mass of a passenger car.
export const VEHICLE_PROFILES = {
  i1: {
    // KTM 690 Duke Single (1st: 65 km/h, 6th: 185 km/h)
    mass: 210, dragArea: 0.42, tireRadius: 0.315, finalDrive: 4.00,
    gearRatios: { '-1': -2.8, 0: 0, 1: 2.50, 2: 1.85, 3: 1.45, 4: 1.20, 5: 1.02, 6: 0.88 }
  },
  i2_180: {
    // Ninja 400 Parallel Twin (1st: 58 km/h, 6th: 195 km/h)
    mass: 240, dragArea: 0.40, tireRadius: 0.315, finalDrive: 4.40,
    gearRatios: { '-1': -2.8, 0: 0, 1: 2.90, 2: 2.10, 3: 1.65, 4: 1.38, 5: 1.18, 6: 1.02 }
  },
  i2_270: {
    // Yamaha MT-07 / R7 CP2 Twin (1st: 68 km/h, 6th: 220 km/h)
    mass: 265, dragArea: 0.39, tireRadius: 0.315, finalDrive: 4.10,
    gearRatios: { '-1': -2.8, 0: 0, 1: 2.84, 2: 2.12, 3: 1.63, 4: 1.30, 5: 1.09, 6: 0.94 }
  },
  v2_90: {
    // Ducati Panigale V2 Superquadro (1st: 91 km/h, 6th: 278 km/h)
    mass: 275, dragArea: 0.36, tireRadius: 0.315, finalDrive: 4.15,
    gearRatios: { '-1': -2.6, 0: 0, 1: 2.47, 2: 1.88, 3: 1.52, 4: 1.28, 5: 1.11, 6: 0.96 }
  },
  i3: {
    // Yamaha MT-09 CP3 / Triumph Daytona (1st: 87 km/h, 6th: 260 km/h)
    mass: 275, dragArea: 0.38, tireRadius: 0.315, finalDrive: 3.95,
    gearRatios: { '-1': -2.6, 0: 0, 1: 2.67, 2: 2.00, 3: 1.60, 4: 1.33, 5: 1.13, 6: 0.97 }
  },
  i4_flat: {
    // Inline 4 Screamer (Standard Ratios preserving test suite benchmarks)
    mass: 285, dragArea: 0.36, tireRadius: 0.33, finalDrive: 3.65,
    gearRatios: { '-1': -3.2, 0: 0, 1: 3.5, 2: 2.15, 3: 1.5, 4: 1.15, 5: 0.9, 6: 0.74 }
  },
  i4_cross: {
    // Authentic Yamaha YZF-R1 Factory Close-Ratio (1st: 153, 2nd: 183, 3rd: 216, 4th: 252, 5th: 288, 6th: 318 km/h)
    mass: 280, dragArea: 0.35, tireRadius: 0.315, finalDrive: 4.188,
    gearRatios: { '-1': -2.5, 0: 0, 1: 2.600, 2: 2.176, 3: 1.842, 4: 1.579, 5: 1.381, 6: 1.250 }
  },
  i6: {
    // Toyota Supra 2JZ / BMW M3 (1st: 68 km/h, 6th: 310 km/h)
    mass: 1600, dragArea: 0.65, tireRadius: 0.335, finalDrive: 3.15,
    gearRatios: { '-1': -3.5, 0: 0, 1: 3.82, 2: 2.36, 3: 1.69, 4: 1.27, 5: 1.00, 6: 0.84 }
  },
  v6: {
    // Nissan GT-R VR38DETT Twin-Turbo (1st: 63 km/h, 6th: 328 km/h)
    mass: 1750, dragArea: 0.68, tireRadius: 0.335, finalDrive: 3.70,
    gearRatios: { '-1': -3.4, 0: 0, 1: 3.70, 2: 2.30, 3: 1.62, 4: 1.25, 5: 1.00, 6: 0.78 }
  },
  v8_cross: {
    // American Muscle V8 Mustang GT 5.0 (1st: 69 km/h, 6th: 302 km/h)
    mass: 1720, dragArea: 0.70, tireRadius: 0.340, finalDrive: 3.55,
    gearRatios: { '-1': -3.4, 0: 0, 1: 3.66, 2: 2.43, 3: 1.69, 4: 1.32, 5: 1.00, 6: 0.82 }
  },
  v8_flat: {
    // Ferrari 458 Italia Flatplane V8 (1st: 82 km/h, 6th: 330 km/h)
    mass: 1485, dragArea: 0.62, tireRadius: 0.335, finalDrive: 4.10,
    gearRatios: { '-1': -3.2, 0: 0, 1: 3.08, 2: 2.20, 3: 1.65, 4: 1.30, 5: 1.06, 6: 0.86 }
  },
  v10: {
    // Lexus LFA V10 Screamer (1st: 87 km/h, 6th: 335 km/h)
    mass: 1520, dragArea: 0.63, tireRadius: 0.335, finalDrive: 3.90,
    gearRatios: { '-1': -3.2, 0: 0, 1: 3.10, 2: 2.18, 3: 1.64, 4: 1.30, 5: 1.05, 6: 0.85 }
  },
  v12: {
    // Lamborghini Aventador V12 (1st: 88 km/h, 6th: 355 km/h)
    mass: 1675, dragArea: 0.65, tireRadius: 0.345, finalDrive: 2.87,
    gearRatios: { '-1': -3.6, 0: 0, 1: 3.91, 2: 2.44, 3: 1.81, 4: 1.46, 5: 1.16, 6: 0.96 }
  },
  w16: {
    // Bugatti Chiron Quad-Turbo W16 (1st: 105 km/h, 6th: 422 km/h)
    mass: 1995, dragArea: 0.70, tireRadius: 0.355, finalDrive: 2.70,
    gearRatios: { '-1': -3.2, 0: 0, 1: 3.15, 2: 2.10, 3: 1.55, 4: 1.20, 5: 0.95, 6: 0.78 }
  },
  radial_7: {
    // 7-Cylinder Radial Aero Engine (1st: 62 km/h, 6th: 210 km/h)
    mass: 650, dragArea: 0.50, tireRadius: 0.350, finalDrive: 2.40,
    gearRatios: { '-1': -2.4, 0: 0, 1: 2.40, 2: 1.85, 3: 1.45, 4: 1.15, 5: 0.95, 6: 0.75 }
  }
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
