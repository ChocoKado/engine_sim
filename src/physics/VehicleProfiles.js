// Published transmission ratios are kept separate: crankshaft -> primary /
// counter reduction -> selected gear -> final drive -> rolling tyre radius.
// Chassis load includes a 75 kg driver. Cd*A and effective rolling radius are
// simulation estimates, not manufacturer acceleration or top-speed claims.
// Full data provenance and the aviation demonstrator exception:
// docs/engine-reference.md.
const DRIVER_MASS = 75;
const rollingRadius = (widthMM, aspectPercent, rimInches) =>
  ((rimInches * 25.4 / 2 + widthMM * aspectPercent / 100) / 1000) * 0.98;
const ratios = (forward, reverse = 0) => Object.fromEntries([
  [-1, -reverse], [0, 0], ...forward.map((ratio, i) => [i + 1, ratio]),
]);
const vehicle = (curbMass, data) => ({
  curbMass, driverMass: DRIVER_MASS, mass: curbMass + DRIVER_MASS,
  referenceKind: 'vehicle', primaryRatio: 1, ...data,
  gearCount: Object.keys(data.gearRatios).filter(gear => Number(gear) > 0).length,
});
const chironRadius = rollingRadius(355, 25, 21);
// Bugatti publishes per-gear speed at 6700 rpm, rather than tooth ratios.
// These are equivalent overall reductions with finalDrive normalized to 1.
const chironRatios = [90, 150, 200, 260, 320, 390, 420].map(speedKMH =>
  6700 * 2 * Math.PI * chironRadius / 60 / (speedKMH / 3.6));

export const VEHICLE_PROFILES = {
  i1: vehicle(163, {
    dragArea: 0.43, tireRadius: rollingRadius(160, 60, 17), primaryRatio: 79 / 36, finalDrive: 40 / 16,
    gearRatios: ratios([35 / 14, 28 / 16, 28 / 21, 23 / 21, 22 / 23, 20 / 23]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://manualzz.com/doc/59289224/ktm-690-duke-2016-owner-manual',
  }),
  i2_180: vehicle(168, {
    dragArea: 0.36, tireRadius: rollingRadius(150, 60, 17), primaryRatio: 71 / 32, finalDrive: 41 / 14,
    gearRatios: ratios([41 / 14, 37 / 18, 34 / 21, 32 / 24, 30 / 26, 28 / 27]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://www.kawasaki.cz/cs/products/Supersport___Sport/2019/Ninja_400/specifications?Uid=08AEXlgLWV5bDA0LWlFeXA1RXVBQXQoLUQ0LUApdX1xQClA',
  }),
  i2_270: vehicle(188, {
    dragArea: 0.36, tireRadius: rollingRadius(180, 55, 17), primaryRatio: 77 / 40, finalDrive: 42 / 16,
    gearRatios: ratios([2.846, 2.125, 1.631, 1.300, 1.090, 0.964]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r7_WGP60th_2021.pdf',
  }),
  v2_90: vehicle(200, {
    dragArea: 0.35, tireRadius: rollingRadius(180, 60, 17), primaryRatio: 1.77, finalDrive: 43 / 15,
    gearRatios: ratios([37 / 15, 30 / 16, 27 / 18, 25 / 20, 24 / 22, 23 / 24]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://www.ducati.com/th/th/bikes/panigale-v2-2020',
  }),
  i3: vehicle(189, {
    dragArea: 0.44, tireRadius: rollingRadius(180, 55, 17), primaryRatio: 79 / 47, finalDrive: 45 / 16,
    gearRatios: ratios([2.571, 1.947, 1.619, 1.380, 1.190, 1.037]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://global.yamaha-motor.com/jp/news/2021/0622/mt-09.html',
  }),
  i4_flat: vehicle(196, {
    dragArea: 0.34, tireRadius: rollingRadius(190, 50, 17), primaryRatio: 1.717, finalDrive: 43 / 16,
    gearRatios: ratios([2.285, 1.777, 1.500, 1.333, 1.214, 1.137]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://global.honda/jp/news/2017/2170316-cbr1000rr.html',
  }),
  i4_cross: vehicle(201, {
    dragArea: 0.35, tireRadius: rollingRadius(190, 55, 17), primaryRatio: 67 / 41, finalDrive: 41 / 16,
    gearRatios: ratios([39 / 15, 37 / 17, 35 / 19, 30 / 19, 29 / 21, 30 / 24]), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_YZF-R1_WGP60th_2021.pdf',
  }),
  i6: vehicle(1549, {
    dragArea: 0.64, tireRadius: rollingRadius(255, 40, 17), finalDrive: 3.133,
    gearRatios: ratios([3.827, 2.360, 1.685, 1.312, 1.000, 0.793], 3.280), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://supra.vanderwaal.eu/manual/New%20Car%20Features.pdf',
  }),
  v6: vehicle(3929 * 0.45359237, {
    dragArea: 0.64, tireRadius: rollingRadius(285, 35, 20), finalDrive: 3.700,
    gearRatios: ratios([4.056, 2.301, 1.595, 1.248, 1.001, 0.796], 3.383), transmissionKind: 'dct',
    gearingKind: 'published', referenceSource: 'https://usa.nissannews.com/en-US/releases/us-2017-nissan-gt-r-press-kit',
  }),
  v8_cross: vehicle(1681, {
    dragArea: 0.72, tireRadius: rollingRadius(275, 40, 19), finalDrive: 3.55,
    gearRatios: ratios([3.237, 2.104, 1.422, 1.000, 0.814, 0.622], 3.32), transmissionKind: 'manual',
    gearingKind: 'published', referenceSource: 'https://media.ford.com/content/dam/fordmedia/North%20America/US/product/2020/mustang/2020-Mustang-Tech_Specs.pdf',
  }),
  v8_flat: vehicle(1485, {
    dragArea: 0.62, tireRadius: rollingRadius(295, 35, 20), finalDrive: 5.143,
    gearRatios: ratios([3.077, 2.185, 1.626, 1.286, 1.028, 0.839, 0.693], 2.791), transmissionKind: 'dct',
    gearingKind: 'published', referenceSource: 'https://www.manualslib.com/manual/900232/Ferrari-458-Italia.html?page=27',
  }),
  v10: vehicle(1480, {
    dragArea: 0.61, tireRadius: rollingRadius(305, 30, 20), primaryRatio: 1.259, finalDrive: 3.417,
    gearRatios: ratios([3.231, 2.188, 1.609, 1.233, 0.970, 0.795], 3.587), transmissionKind: 'amt',
    gearingKind: 'published', referenceSource: 'https://media.lexus.co.uk/lexus-lfa/',
  }),
  v12: vehicle(1675, {
    dragArea: 0.68, tireRadius: rollingRadius(335, 30, 20), primaryRatio: 47 / 38, finalDrive: 43 / 15,
    gearRatios: ratios([43 / 11, 39 / 16, 38 / 21, 35 / 24, 32 / 27, 29 / 30, 27 / 32], 41 / 14), transmissionKind: 'amt',
    gearingKind: 'published', referenceSource: 'https://www.dana.com/globalassets/resource-library/light-vehicle/spec-sheets/dana-specsheet-longitudinaltransmission.pdf',
  }),
  w16: vehicle(1995, {
    dragArea: 0.78, tireRadius: chironRadius, finalDrive: 1,
    gearRatios: ratios(chironRatios, chironRatios[0]), transmissionKind: 'dct',
    gearingKind: 'derived-from-published-speeds',
    referenceSource: 'https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf',
  }),
  radial_7: vehicle(575, {
    // Aviation engine in an experimental ground-load demonstrator. These road
    // ratios are intentionally not labelled a Rotec propeller drivetrain.
    referenceKind: 'experimental', dragArea: 0.50, tireRadius: 0.35, finalDrive: 2.4,
    gearRatios: ratios([2.40, 1.85, 1.45, 1.15, 0.95, 0.75]), transmissionKind: 'manual',
    gearingKind: 'experimental', referenceSource: 'https://www.rotecaerosport.com/r2800',
  }),
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
