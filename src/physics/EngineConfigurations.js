// EngineConfigurations.js
// Definitions of real-world engine configurations with firing orders, angles, and inertia

export const ENGINE_CONFIGS = {
  // 1-Cylinder (Single)
  'i1': {
    id: 'i1',
    name: '單缸 (Single Cylinder)',
    shortName: 'I1',
    cylinders: 1,
    layout: 'inline', // inline, v, w, boxer
    bankAngle: 0,
    firingAngles: [0],
    defaultDisplacement: 450, // cc
    minDisplacement: 125,
    maxDisplacement: 800,
    defaultIdleRPM: 1300,
    defaultRedlineRPM: 9500,
    flywheelInertia: 0.045, // Heavy flywheel, slow rev-up, heavy thumping
    revResponseSpeed: 1.0, // Multiplier on throttle response
    engineBrakeFactor: 2.2, // Heavy single-cylinder engine braking
    soundCharacter: 'thumpy', // Big thumps, distinctive pulse gap
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
    firingAngles: [0, 270], // Uneven 270°-450° interval, mimics 90° V-Twin
    defaultDisplacement: 700,
    minDisplacement: 500,
    maxDisplacement: 1200,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 10500,
    flywheelInertia: 0.028,
    revResponseSpeed: 1.5,
    engineBrakeFactor: 1.9,
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
    defaultDisplacement: 950,
    minDisplacement: 600,
    maxDisplacement: 1300,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 11000,
    flywheelInertia: 0.026,
    revResponseSpeed: 1.6,
    engineBrakeFactor: 1.9,
    soundCharacter: 'v_twin',
    description: 'Ducati 跑車的靈魂架構。90度夾角兼具完美的一階平衡與猛烈的爆發聲，聲浪鏗鏘有力。'
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
    // Firing order 1-3-4-2
    firingAngles: [0, 180, 540, 360],
    defaultDisplacement: 1000,
    minDisplacement: 600,
    maxDisplacement: 2500,
    defaultIdleRPM: 1100,
    defaultRedlineRPM: 14500,
    flywheelInertia: 0.016,
    revResponseSpeed: 2.2,
    engineBrakeFactor: 1.3,
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
    firingAngles: [0, 270, 450, 540],
    defaultDisplacement: 1000,
    minDisplacement: 1000,
    maxDisplacement: 1300,
    defaultIdleRPM: 1200,
    defaultRedlineRPM: 14000,
    flywheelInertia: 0.017,
    revResponseSpeed: 2.1,
    engineBrakeFactor: 1.5,
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
    defaultRedlineRPM: 8000,
    flywheelInertia: 0.018,
    revResponseSpeed: 2.0,
    engineBrakeFactor: 1.2,
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
    defaultRedlineRPM: 7800,
    flywheelInertia: 0.019,
    revResponseSpeed: 2.0,
    engineBrakeFactor: 1.2,
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
    defaultRedlineRPM: 9200,
    flywheelInertia: 0.010,
    revResponseSpeed: 3.0,
    engineBrakeFactor: 0.9,
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
    soundCharacter: 'w16_beast',
    description: 'Bugatti Chiron 8.0L 四渦輪 W16。雙 VR8 結合結構，16個氣缸連續轟炸，宛如噴射戰鬥機掠過的渾厚推力聲威。'
  }
};
