// EngineConfigurations.js
// Engine architecture definitions. Published ratings and their calibration
// assumptions are recorded below and in docs/engine-reference.md.

import { ADDITIONAL_ENGINES } from './AdditionalEngines.js';
import { radialFiringAngles } from './RadialMechanics.js';

export const ENGINE_CONFIGS = {
  // 1-Cylinder (Single)
  'i1': {
    id: 'i1',
    name: '單缸 (Single Cylinder)',
    shortName: 'I1',
    cylinders: 1,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0],
    defaultDisplacement: 690, // cc (KTM 690 Duke)
    minDisplacement: 250,
    maxDisplacement: 800,
    defaultIdleRPM: 1350,
    defaultRedlineRPM: 9000,
    flywheelInertia: 0.045,
    revResponseSpeed: 1.0,
    engineBrakeFactor: 2.2,
    specificTorque: 108,
    peakTorqueRpmRatio: 0.68,
    torqueSpread: 0.30,
    soundCharacter: 'thumpy',
    description: '經典大單缸重機配置（如 KTM 690 / Yamaha SR400）。活塞質量大、慣性重、拉轉沉穩有力、節奏分明的重砲排氣聲浪。'
  },

  // 2-Cylinder Parallel 180°
  'i2_180': {
    id: 'i2_180',
    name: '並列雙缸 180° (Parallel Twin 180°)',
    shortName: 'I2 180°',
    cylinders: 2,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0, 180],
    defaultDisplacement: 400,
    minDisplacement: 250,
    maxDisplacement: 650,
    defaultIdleRPM: 1250,
    defaultRedlineRPM: 12500,
    flywheelInertia: 0.032,
    revResponseSpeed: 1.4,
    engineBrakeFactor: 1.8,
    specificTorque: 105,
    peakTorqueRpmRatio: 0.72,
    torqueSpread: 0.28,
    soundCharacter: 'twin_180',
    description: '經典雙缸仿賽配置（如 Ninja 400）。高轉延伸性佳、聲音偏清脆的高頻雙缸脈衝。'
  },

  // 2-Cylinder 270° Crossplane
  'i2_270': {
    id: 'i2_270',
    name: '並列雙缸 270° 十字曲軸 (CP2 Twin)',
    shortName: 'I2 270°',
    cylinders: 2,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0, 270],
    defaultDisplacement: 700,
    minDisplacement: 500,
    maxDisplacement: 1200,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 10500,
    flywheelInertia: 0.028,
    revResponseSpeed: 1.5,
    engineBrakeFactor: 1.9,
    specificTorque: 110,
    peakTorqueRpmRatio: 0.65,
    torqueSpread: 0.32,
    soundCharacter: 'v_twin',
    description: 'Yamaha MT-07 / R7 (CP2 引擎) 標誌性配置。不對稱點火間隔營造出飽滿熱血的 V-Twin 咆哮聲與充沛低轉扭力。'
  },

  // 90° V-Twin (L-Twin)
  'v2_90': {
    id: 'v2_90',
    name: '90° V型雙缸 (Ducati L-Twin)',
    shortName: 'V2 90°',
    cylinders: 2,
    layout: 'v',
    bankAngle: 90,
    firingAngles: [0, 270],
    defaultDisplacement: 955,
    minDisplacement: 600,
    maxDisplacement: 1300,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 11500,
    flywheelInertia: 0.026,
    revResponseSpeed: 1.6,
    engineBrakeFactor: 1.9,
    specificTorque: 116,
    peakTorqueRpmRatio: 0.74,
    torqueSpread: 0.28,
    soundCharacter: 'v_twin',
    description: 'Ducati Panigale V2 靈魂架構。90度夾角兼具完美的一階平衡與猛烈的爆發聲，聲浪鏗鏘有力。'
  },

  // 3-Cylinder 120° (Triple)
  'i3': {
    id: 'i3',
    name: '直列三缸 120° (Triple CP3)',
    shortName: 'I3',
    cylinders: 3,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0, 240, 480],
    defaultDisplacement: 900,
    minDisplacement: 675,
    maxDisplacement: 1500,
    defaultIdleRPM: 1150,
    defaultRedlineRPM: 11500,
    flywheelInertia: 0.022,
    revResponseSpeed: 1.8,
    engineBrakeFactor: 1.5,
    specificTorque: 112,
    peakTorqueRpmRatio: 0.70,
    torqueSpread: 0.30,
    soundCharacter: 'triple',
    description: 'Triumph Daytona 675 / Yamaha MT-09 CP3。融合雙缸低扭與四缸高轉，排氣帶有獨特金屬哨音與低吼。'
  },

  // 4-Cylinder Inline Flatplane (Classic Screamer)
  'i4_flat': {
    id: 'i4_flat',
    name: '直列四缸 180° 平面曲軸 (I4 Screamer)',
    shortName: 'I4 Flat',
    cylinders: 4,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0, 180, 540, 360],
    defaultDisplacement: 1000,
    minDisplacement: 600,
    maxDisplacement: 2500,
    defaultIdleRPM: 1100,
    defaultRedlineRPM: 14500,
    flywheelInertia: 0.016,
    revResponseSpeed: 2.2,
    engineBrakeFactor: 1.3,
    specificTorque: 115,
    peakTorqueRpmRatio: 0.78,
    torqueSpread: 0.25,
    soundCharacter: 'screamer_4',
    description: '經典公升級日系四缸跑車（CBR1000RR / ZX-10R / S1000RR）。高轉萬轉尖叫、聲音綿密極致、拉轉飛快。'
  },

  // 4-Cylinder Crossplane (Yamaha R1 CP4)
  'i4_cross': {
    id: 'i4_cross',
    name: '直列四缸 90° 十字曲軸 (Yamaha R1 CP4)',
    shortName: 'I4 CP4',
    cylinders: 4,
    layout: 'inline',
    bankAngle: 0,
    // Physical cylinder order 1–3–2–4; event gaps 270–180–90–180°.
    firingAngles: [0, 450, 270, 540],
    firingAngleKind: 'absolute',
    defaultDisplacement: 1000,
    minDisplacement: 998,
    maxDisplacement: 1300,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 14000,
    flywheelInertia: 0.017,
    revResponseSpeed: 2.1,
    engineBrakeFactor: 1.5,
    specificTorque: 118,
    peakTorqueRpmRatio: 0.76,
    torqueSpread: 0.26,
    soundCharacter: 'crossplane_4',
    description: 'Yamaha MotoGP YZR-M1 與 YZF-R1 傳奇十字曲軸。非對稱點火消除了慣性扭矩，聲浪如狂暴野獸怒吼。'
  },

  // 6-Cylinder Inline (BMW I6 / 2JZ)
  'i6': {
    id: 'i6',
    name: '直列六缸 120° (BMW M / Toyota 2JZ)',
    shortName: 'I6',
    cylinders: 6,
    layout: 'inline',
    bankAngle: 0,
    firingAngles: [0, 480, 240, 600, 120, 360],
    defaultDisplacement: 3000,
    minDisplacement: 2500,
    maxDisplacement: 4000,
    defaultIdleRPM: 850,
    defaultRedlineRPM: 7600,
    flywheelInertia: 0.018,
    revResponseSpeed: 2.0,
    engineBrakeFactor: 1.2,
    specificTorque: 112,
    peakTorqueRpmRatio: 0.65,
    torqueSpread: 0.32,
    soundCharacter: 'smooth_i6',
    description: '經典直列六缸（BMW S58 / Supra 2JZ）。一階與二階振動完全抵消，聲浪絲滑優雅、高轉渾厚天籟。'
  },

  // 6-Cylinder V6 60° (Nissan GT-R VR38)
  'v6': {
    id: 'v6',
    name: '60° V型六缸 (Nissan GT-R / Alfa V6)',
    shortName: 'V6 60°',
    cylinders: 6,
    layout: 'v',
    bankAngle: 60,
    firingAngles: [0, 120, 240, 360, 480, 600],
    defaultDisplacement: 3800,
    minDisplacement: 2900,
    maxDisplacement: 4200,
    defaultIdleRPM: 850,
    defaultRedlineRPM: 7500,
    flywheelInertia: 0.019,
    revResponseSpeed: 2.0,
    engineBrakeFactor: 1.2,
    specificTorque: 115,
    peakTorqueRpmRatio: 0.65,
    torqueSpread: 0.32,
    soundCharacter: 'v6_roar',
    description: '東瀛戰神 GT-R VR38DETT 與現代性能跑車最愛。充滿金屬顆粒感的低喉與極富侵略性的高轉咆哮。'
  },

  // 8-Cylinder Crossplane V8 (American Muscle)
  'v8_cross': {
    id: 'v8_cross',
    name: '十字曲軸 V8 (American Muscle V8)',
    shortName: 'V8 Cross',
    cylinders: 8,
    layout: 'v',
    bankAngle: 90,
    firingAngles: [0, 90, 180, 270, 360, 450, 540, 630],
    defaultDisplacement: 5000,
    minDisplacement: 4000,
    maxDisplacement: 7200,
    defaultIdleRPM: 750,
    defaultRedlineRPM: 7500,
    flywheelInertia: 0.022,
    revResponseSpeed: 1.9,
    engineBrakeFactor: 1.1,
    specificTorque: 110,
    peakTorqueRpmRatio: 0.62,
    torqueSpread: 0.35,
    soundCharacter: 'muscle_v8',
    description: '美式肌肉車靈魂（Mustang 5.0 / Corvette / HEMI）。怠速獨特低沉「咕嚕咕嚕」碎震，全油門宛如雷霆萬鈞。'
  },

  // 8-Cylinder Flatplane V8 (Ferrari Screamer)
  'v8_flat': {
    id: 'v8_flat',
    name: '平面曲軸 V8 (Ferrari 458 / 180° V8)',
    shortName: 'V8 Flat',
    cylinders: 8,
    layout: 'v',
    bankAngle: 90,
    firingAngles: [0, 180, 90, 270, 360, 540, 450, 630],
    defaultDisplacement: 4500,
    minDisplacement: 3800,
    maxDisplacement: 5200,
    defaultIdleRPM: 1000,
    defaultRedlineRPM: 9000,
    flywheelInertia: 0.014,
    revResponseSpeed: 2.6,
    engineBrakeFactor: 1.1,
    specificTorque: 120,
    peakTorqueRpmRatio: 0.74,
    torqueSpread: 0.28,
    soundCharacter: 'ferrari_v8',
    description: '法拉利 458 Italia / 488 招牌平面曲軸 V8。拉轉如同雙聯四缸極限尖叫，高頻聲浪穿透力無與倫比。'
  },

  // 10-Cylinder V10 (LFA / Gallardo)
  'v10': {
    id: 'v10',
    name: '72° V型十缸 (Lexus LFA / Carrera GT)',
    shortName: 'V10',
    cylinders: 10,
    layout: 'v',
    bankAngle: 72,
    firingAngles: [0, 72, 144, 216, 288, 360, 432, 504, 576, 648],
    defaultDisplacement: 4800,
    minDisplacement: 4500,
    maxDisplacement: 6000,
    defaultIdleRPM: 950,
    defaultRedlineRPM: 9500,
    flywheelInertia: 0.011,
    revResponseSpeed: 2.9,
    engineBrakeFactor: 1.0,
    specificTorque: 114,
    peakTorqueRpmRatio: 0.75,
    torqueSpread: 0.28,
    soundCharacter: 'v10_howl',
    description: '車壇封神音浪（Lexus LFA 1LR-GUE / 藍寶堅尼 V10）。高頻交響樂般的天籟高歌，響應速度快若閃電。'
  },

  // 12-Cylinder V12 (Ferrari / Lamborghini V12)
  'v12': {
    id: 'v12',
    name: '60° V型十二缸 (Aventador / 812 V12)',
    shortName: 'V12',
    cylinders: 12,
    layout: 'v',
    bankAngle: 60,
    firingAngles: [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660],
    defaultDisplacement: 6500,
    minDisplacement: 5500,
    maxDisplacement: 7500,
    defaultIdleRPM: 900,
    defaultRedlineRPM: 8500,
    flywheelInertia: 0.010,
    revResponseSpeed: 3.0,
    engineBrakeFactor: 0.9,
    specificTorque: 116,
    peakTorqueRpmRatio: 0.72,
    torqueSpread: 0.30,
    soundCharacter: 'v12_flagship',
    description: '頂級旗艦王者（Lamborghini Aventador / Ferrari 812）。每轉6次爆發的超高密度燃燒，震撼人心的頂級超跑狂嚎。'
  },

  // 16-Cylinder W16 (Bugatti Chiron)
  'w16': {
    id: 'w16',
    name: 'W型十六缸 (Bugatti Chiron W16)',
    shortName: 'W16',
    cylinders: 16,
    layout: 'w',
    bankAngle: 90,
    firingAngles: [0, 45, 90, 135, 180, 225, 270, 315, 360, 405, 450, 495, 540, 585, 630, 675],
    defaultDisplacement: 8000,
    minDisplacement: 7000,
    maxDisplacement: 10000,
    defaultIdleRPM: 850,
    defaultRedlineRPM: 7200,
    flywheelInertia: 0.015,
    revResponseSpeed: 2.4,
    engineBrakeFactor: 0.8,
    specificTorque: 195,
    peakTorqueRpmRatio: 0.58,
    torqueSpread: 0.40,
    soundCharacter: 'w16_turbine',
    description: '地表極速怪獸（Bugatti Chiron 四渦輪 W16）。高達 1500+ 匹馬力與 1600 Nm 狂暴扭力，頂級奢華與極致工藝的結晶。'
  },

  // 7-Cylinder Radial Aero Engine
  'radial_7': {
    id: 'radial_7',
    name: '星型七缸航空引擎 (7-Cyl Radial Aero)',
    shortName: 'Radial 7',
    cylinders: 7,
    layout: 'radial',
    bankAngle: 51.43,
    // 4-stroke radial firing order: 1 - 3 - 5 - 7 - 2 - 4 - 6
    firingAngles: [
      0,
      Number((4 * 720 / 7).toFixed(2)), // 411.43
      Number((1 * 720 / 7).toFixed(2)), // 102.86
      Number((5 * 720 / 7).toFixed(2)), // 514.29
      Number((2 * 720 / 7).toFixed(2)), // 205.71
      Number((6 * 720 / 7).toFixed(2)), // 617.14
      Number((3 * 720 / 7).toFixed(2))  // 308.57
    ],
    defaultDisplacement: 3600,
    minDisplacement: 2200,
    maxDisplacement: 6200,
    defaultIdleRPM: 650,
    defaultRedlineRPM: 3200,
    flywheelInertia: 0.038,
    revResponseSpeed: 1.6,
    engineBrakeFactor: 1.5,
    specificTorque: 125,
    peakTorqueRpmRatio: 0.65,
    torqueSpread: 0.36,
    soundCharacter: 'radial_7',
    description: '經典七缸航空星型發動機 (7-Cylinder Radial)。採用中央主連桿（Master Rod）與六根副連桿結構，圓周360度對稱排列。經典 1-3-5-7-2-4-6 隔缸點火循環，怠速如同重砲般深沉震撼，拉轉伴隨大排氣量螺旋槳的沉穩機械轟鳴。'
  }
};

// Stock crankshaft torque anchors (Nm). Only the rated torque/power points and
// explicitly documented plateaus are published measurements; intermediate
// points are conservative interpolation anchors, not claimed dyno recordings.
const powerTorque = (kw, rpm) => kw * 60000 / (2 * Math.PI * rpm);
const REFERENCES = {
  i1: {
    representativeModel: '2016 KTM 690 Duke', modelYear: 2016,
    defaultDisplacement: 692.7, defaultIdleRPM: 1600, defaultRedlineRPM: 9000,
    minRedlineRPM: 7500, maxRedlineRPM: 10000,
    ratedPowerKW: 54, ratedPowerRPM: 8000, ratedTorqueNm: 74, ratedTorqueRPM: 6500,
    torquePoints: [[1600, 25], [2500, 42], [4000, 58], [5500, 70], [6500, 74], [8000, powerTorque(54, 8000)], [9000, 52]],
    referenceSource: 'https://press.ktm.com/news-ktm-heads-to-school-ktm-sportmotorcycle-uk?id=57880&l=uk&menueid=5904',
    description: '以 2016 KTM 690 Duke LC4 為基準。大單缸脈衝分明，中轉扭力飽滿；原廠怠速約 1,600 RPM。'
  },
  i2_180: {
    representativeModel: '2019 Kawasaki Ninja 400 (EU)', modelYear: 2019,
    defaultDisplacement: 399, defaultIdleRPM: 1300, defaultRedlineRPM: 12000,
    minRedlineRPM: 10000, maxRedlineRPM: 13000,
    ratedPowerKW: 33.4, ratedPowerRPM: 10000, ratedTorqueNm: 38, ratedTorqueRPM: 8000,
    torquePoints: [[1300, 8], [3000, 20], [5000, 28], [7000, 36], [8000, 38], [10000, powerTorque(33.4, 10000)], [12000, 24]],
    referenceSource: 'https://www.kawasaki.cz/cs/products/Supersport___Sport/2019/Ninja_400/specifications?Uid=08AEXlgLWV5bDA0LWlFeXA1RXVBQXQoLUQ0LUApdX1xQClA',
    description: '以歐規 Ninja 400 為基準：399 cc、45 PS。180° 曲軸形成 180°／540° 點火間隔，高轉聲音清脆。'
  },
  i2_270: {
    representativeModel: '2022 Yamaha YZF-R7 (EU)', modelYear: 2022,
    defaultDisplacement: 689, defaultIdleRPM: 1250, defaultRedlineRPM: 10000,
    minRedlineRPM: 9000, maxRedlineRPM: 11000,
    ratedPowerKW: 54, ratedPowerRPM: 8750, ratedTorqueNm: 67, ratedTorqueRPM: 6500,
    torquePoints: [[1250, 18], [2500, 40], [4500, 62], [6500, 67], [8750, powerTorque(54, 8750)], [10000, 50]],
    referenceSource: 'https://cdn2.yamaha-motor.eu/prod/product-assets/2022/YZF700R7/Factsheets/2022-YZF700R7_en.pdf',
    description: '以 Yamaha R7 CP2 為基準：689 cc、73.4 PS。270°／450° 點火間隔搭配寬廣中轉扭力，保留雙缸節奏。'
  },
  v2_90: {
    representativeModel: '2020 Ducati Panigale V2 955', modelYear: 2020,
    defaultDisplacement: 955, defaultIdleRPM: 1400, defaultRedlineRPM: 11500,
    minRedlineRPM: 10000, maxRedlineRPM: 12500,
    ratedPowerKW: 114, ratedPowerRPM: 10750, ratedTorqueNm: 104, ratedTorqueRPM: 9000,
    torquePoints: [[1400, 25], [3000, 60], [5000, 80], [7000, 95], [9000, 104], [10750, powerTorque(114, 10750)], [11500, 88]],
    referenceSource: 'https://www.ducati.com/th/th/bikes/panigale-v2-2020',
    description: '以 2020 Panigale V2 Superquadro 955 為基準：155 PS。90° L-Twin 的不等距排氣脈衝與高轉出力，並非新版 890 cc V2。'
  },
  i3: {
    representativeModel: '2021 Yamaha MT-09 (EU)', modelYear: 2021,
    defaultDisplacement: 890, defaultIdleRPM: 1200, defaultRedlineRPM: 11000,
    minRedlineRPM: 10000, maxRedlineRPM: 12000,
    ratedPowerKW: 87.5, ratedPowerRPM: 10000, ratedTorqueNm: 93, ratedTorqueRPM: 7000,
    torquePoints: [[1200, 20], [2500, 52], [4000, 74], [7000, 93], [10000, powerTorque(87.5, 10000)], [11000, 69]],
    referenceSource: 'https://cdn2.yamaha-motor.eu/prod/product-assets/2021/MT09DX/Factsheets/2021-MT09DX_sl-SI.pdf',
    description: '以 2021 歐規 MT-09 CP3 為基準：890 cc、119 PS。每 240° 一次點火，中轉扭力強，進氣共鳴隨負載增強。'
  },
  i4_flat: {
    representativeModel: '2017 Honda CBR1000RR (SC77)', modelYear: 2017,
    defaultDisplacement: 999, defaultIdleRPM: 1200, defaultRedlineRPM: 14000,
    minRedlineRPM: 12000, maxRedlineRPM: 15500,
    ratedPowerKW: 141, ratedPowerRPM: 13000, ratedTorqueNm: 114, ratedTorqueRPM: 11000,
    torquePoints: [[1200, 18], [3000, 48], [5000, 66], [8000, 96], [11000, 114], [13000, powerTorque(141, 13000)], [14000, 86]],
    referenceSource: 'https://global.honda/jp/news/2017/2170316-cbr1000rr.html',
    description: '以 2017 CBR1000RR SC77 為基準：999 cc、192 PS。等距四缸點火與高轉出力，採該代原廠六檔齒比。'
  },
  i4_cross: {
    representativeModel: '2020 Yamaha YZF-R1 (EU)', modelYear: 2020,
    defaultDisplacement: 998, defaultIdleRPM: 1150, defaultRedlineRPM: 14000,
    minRedlineRPM: 12500, maxRedlineRPM: 15500,
    ratedPowerKW: 147.1, ratedPowerRPM: 13500, ratedTorqueNm: 113.3, ratedTorqueRPM: 11500,
    torquePoints: [[1150, 18], [3000, 43], [6000, 78], [9000, 103], [11500, 113.3], [13500, powerTorque(147.1, 13500)], [14000, 92]],
    referenceSource: 'https://cdn2.yamaha-motor.eu/prod/product-assets/2020/YZF1000R1/Factsheets/2020-YZF1000R1_en.pdf',
    description: '以 2020 YZF-R1 CP4 為基準：998 cc、200 PS。270°／180°／90°／180° 點火間隔產生特有的低沉節奏，六檔包含一次減速與鏈條終傳。'
  },
  i6: {
    representativeModel: '1993 Toyota Supra Turbo (US, 6MT)', modelYear: 1993,
    defaultDisplacement: 2997, defaultIdleRPM: 750, defaultRedlineRPM: 6800,
    minRedlineRPM: 6000, maxRedlineRPM: 8500,
    ratedPowerKW: 239, ratedPowerRPM: 5600, ratedTorqueNm: 427, ratedTorqueRPM: 4000,
    torquePoints: [[750, 90], [1500, 140], [2500, 280], [4000, 427], [5600, powerTorque(239, 5600)], [6800, 320]],
    defaultInduction: 'turbo', defaultBoost: 0.75, calibrationBoost: 0.75, defaultTurboSize: 'small',
    referenceSource: 'https://pressroom.toyota.com/toyota-supra-icon-half-century-in-making/',
    description: '以美規 A80 Supra 2JZ-GTE 為基準：原廠序列雙渦輪、320 hp。原廠扭力已包含增壓；改裝小／大渦輪為等效模擬，不重複疊加原廠馬力。'
  },
  v6: {
    representativeModel: '2017 Nissan GT-R Premium (US)', modelYear: 2017,
    defaultDisplacement: 3799, defaultIdleRPM: 850, defaultRedlineRPM: 7100,
    minRedlineRPM: 6500, maxRedlineRPM: 8500,
    ratedPowerKW: 565 * 0.745699872, ratedPowerRPM: 6800, ratedTorqueNm: 467 * 1.355817948, ratedTorqueRPM: 3300,
    torquePoints: [[850, 120], [2000, 380], [3300, 467 * 1.355817948], [5800, 467 * 1.355817948], [6800, powerTorque(565 * 0.745699872, 6800)], [7100, 545]],
    defaultInduction: 'turbo', defaultBoost: 1.0, calibrationBoost: 1.0, defaultTurboSize: 'small',
    referenceSource: 'https://usa.nissannews.com/en-US/releases/us-2017-nissan-gt-r-press-kit',
    description: '以 2017 GT-R VR38DETT 為基準：565 hp、雙渦輪、六檔雙離合。3,300～5,800 RPM 為原廠最大扭力平台。'
  },
  v8_cross: {
    representativeModel: '2019 Ford Mustang GT 5.0 (US, 6MT)', modelYear: 2019,
    defaultDisplacement: 5038, defaultIdleRPM: 750, defaultRedlineRPM: 7500,
    minRedlineRPM: 6500, maxRedlineRPM: 8500,
    ratedPowerKW: 460 * 0.745699872, ratedPowerRPM: 7000, ratedTorqueNm: 420 * 1.355817948, ratedTorqueRPM: 4600,
    torquePoints: [[750, 150], [1500, 300], [3000, 485], [4600, 420 * 1.355817948], [6000, 535], [7000, powerTorque(460 * 0.745699872, 7000)], [7500, 415]],
    exhaustBanks: [0, 1, 0, 1, 1, 0, 1, 0],
    referenceSource: 'https://www.trackey.ford.com/download/PDFS/2020FPPcatalog.pdf',
    description: '以 2019 Mustang GT 第三代 Coyote 5.0 為基準：460 hp。十字曲軸各缸總點火等距，但左右排氣銀行內脈衝不等距，形成 V8 特有顆粒聲。'
  },
  v8_flat: {
    representativeModel: '2010 Ferrari 458 Italia', modelYear: 2010,
    defaultDisplacement: 4499, defaultIdleRPM: 1000, defaultRedlineRPM: 9000,
    minRedlineRPM: 8000, maxRedlineRPM: 10500,
    ratedPowerKW: 419, ratedPowerRPM: 9000, ratedTorqueNm: 540, ratedTorqueRPM: 6000,
    torquePoints: [[1000, 240], [2000, 355], [3250, 435], [6000, 540], [7500, 520], [9000, powerTorque(419, 9000)]],
    exhaustBanks: [0, 0, 1, 1, 0, 0, 1, 1],
    referenceSource: 'https://brochureshub.com/wp-content/uploads/2020/04/Ferrari_int-458Italia.pdf',
    description: '以 Ferrari 458 Italia 為基準：4.5 L 自然進氣、570 PS、9,000 RPM。平面曲軸各銀行以 180° 等距排氣，搭配七檔雙離合。'
  },
  v10: {
    representativeModel: '2012 Lexus LFA', modelYear: 2012,
    defaultDisplacement: 4805, defaultIdleRPM: 950, defaultRedlineRPM: 9000,
    minRedlineRPM: 8000, maxRedlineRPM: 10500,
    ratedPowerKW: 412, ratedPowerRPM: 8700, ratedTorqueNm: 480, ratedTorqueRPM: 6800,
    torquePoints: [[950, 180], [2000, 350], [3700, 432], [5500, 468], [6800, 480], [8700, powerTorque(412, 8700)], [9000, 432]],
    referenceSource: 'https://media.lexus.co.uk/lexus-lfa/',
    description: '以 Lexus LFA 1LR-GUE 為基準：560 PS、9,000 RPM 紅線，3,700 RPM 已有 90% 最大扭力。六檔 ASG 自手排包含額外前段減速。'
  },
  v12: {
    representativeModel: '2012 Lamborghini Aventador LP700-4', modelYear: 2012,
    defaultDisplacement: 6498, defaultIdleRPM: 900, defaultRedlineRPM: 8500,
    minRedlineRPM: 7500, maxRedlineRPM: 9500,
    ratedPowerKW: 515, ratedPowerRPM: 8250, ratedTorqueNm: 690, ratedTorqueRPM: 5500,
    torquePoints: [[900, 220], [2000, 400], [3500, 580], [5500, 690], [7000, 660], [8250, powerTorque(515, 8250)], [8500, 555]],
    referenceSource: 'https://www.dana.com/globalassets/resource-library/light-vehicle/spec-sheets/dana-specsheet-longitudinaltransmission.pdf',
    description: '以 Aventador LP700-4 為基準：6.5 L、700 PS。七檔 ISR 單離合自手排有明確扭力中斷；V12 每 60° 點火，聲音密集。'
  },
  w16: {
    representativeModel: '2016 Bugatti Chiron', modelYear: 2016,
    defaultDisplacement: 7993, defaultIdleRPM: 850, defaultRedlineRPM: 7100,
    minRedlineRPM: 6500, maxRedlineRPM: 8000,
    ratedPowerKW: 1103, ratedPowerRPM: 6700, ratedTorqueNm: 1600, ratedTorqueRPM: 2000,
    torquePoints: [[850, 300], [1500, 900], [2000, 1600], [6000, 1600], [6700, powerTorque(1103, 6700)], [7100, 1400]],
    defaultInduction: 'turbo', defaultBoost: 1.8, calibrationBoost: 1.8, defaultTurboSize: 'small',
    referenceSource: 'https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf',
    description: '以原版 Chiron 為基準：四渦輪 W16、1,500 PS、1,600 Nm。原廠雙階段渦輪以等效系統模擬，七檔比例依官方各檔速度校準。'
  },
  radial_7: {
    representativeModel: 'Rotec R2800 / 實驗地面負載',
    defaultDisplacement: 2800, defaultIdleRPM: 700, defaultRedlineRPM: 3700,
    minRedlineRPM: 3000, maxRedlineRPM: 4500,
    ratedPowerKW: 110 * 0.745699872, ratedPowerRPM: 3700,
    ratedTorqueNm: 220, ratedTorqueRPM: 3200, curveKind: 'estimate',
    torquePoints: [[700, 75], [1500, 140], [2500, 195], [3200, 220], [3700, powerTorque(110 * 0.745699872, 3700)]],
    referenceSource: 'https://www.rotecaerosport.com/_files/ugd/ef523b_cad71e078ddf483195daf43a05a0b5f2.pdf',
    description: '以七缸 Rotec R2800 為基準：2,800 cc、110 hp／3,700 曲軸 RPM，主連桿加六副連桿。此處車重與六檔為地面負載示範，不代表航空傳動；R3600 實為九缸。'
  }
};

for (const [id, reference] of Object.entries(REFERENCES)) {
  Object.assign(ENGINE_CONFIGS[id], {
    defaultInduction: 'na', defaultBoost: 0.7, calibrationBoost: 0,
    defaultTurboSize: 'small', curveKind: 'published-peaks-interpolated',
    ...reference,
  });
  ENGINE_CONFIGS[id].vehicleKind = ENGINE_CONFIGS[id].cylinders <= 4 ? 'motorcycle' : 'car';
}
Object.assign(ENGINE_CONFIGS, ADDITIONAL_ENGINES);
// Articulated-rod TDC differs slightly from evenly spaced cylinder axes.
ENGINE_CONFIGS.radial_7.firingAngles = [...radialFiringAngles(7)];
ENGINE_CONFIGS.radial_7.firingAngleKind = 'absolute';
