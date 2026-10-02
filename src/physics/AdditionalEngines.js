// OEM peaks and gearing sources are documented in docs/engine-reference.md.
// Intermediate torque points, cam response and acoustic path lengths are estimates.
const powerTorque = (kw, rpm) => kw * 60000 / (2 * Math.PI * rpm);
const car = {
  vehicleKind: 'car', cycleDegrees: 720, layout: 'inline', bankAngle: 0,
  defaultInduction: 'na', defaultBoost: 0.7, calibrationBoost: 0, defaultTurboSize: 'small',
  curveKind: 'published-peaks-interpolated', flywheelInertia: 0.07,
  revResponseSpeed: 1.6, engineBrakeFactor: 1.15,
};
const honda = {
  ...car, cylinders: 4, firingAngles: [0, 540, 180, 360],
  minDisplacement: 1600, maxDisplacement: 2400, defaultIdleRPM: 850,
  soundCharacter: 'vtec_4',
};

export const ADDITIONAL_ENGINES = {
  honda_f20c: {
    ...honda, id: 'honda_f20c', name: 'Honda S2000 F20C · VTEC', shortName: 'F20C VTEC',
    representativeModel: '1999 Honda S2000 (JDM)', modelYear: 1999,
    defaultDisplacement: 1997, defaultRedlineRPM: 9000, minRedlineRPM: 7500, maxRedlineRPM: 10000,
    ratedPowerKW: 184, ratedPowerRPM: 8300, ratedTorqueNm: 22.2 * 9.80665, ratedTorqueRPM: 7500,
    torquePoints: [[850, 60], [2000, 130], [4000, 175], [5500, 190], [6500, 208], [7500, 22.2 * 9.80665], [8300, powerTorque(184, 8300)], [9000, 187]],
    vtec: { engageRPM: 6000, minRPM: 4500, maxRPM: 7000, lowCamLoss: 0.25, switchKind: 'estimate' },
    referenceSource: 'https://www.honda.co.jp/factbook/auto/s2000/199904/050.html',
    description: '日規 F20C：2.0 L、250 PS、9,000 RPM。低／高凸輪切換會改變高轉充氣與進氣聲；6,000 RPM 切換點為模擬推估。',
  },
  honda_k20a: {
    ...honda, id: 'honda_k20a', name: 'Honda Civic Type R K20A · i-VTEC', shortName: 'K20A i-VTEC',
    representativeModel: '2007 Honda Civic Type R FD2 (JDM)', modelYear: 2007,
    defaultDisplacement: 1998, defaultRedlineRPM: 8400, minRedlineRPM: 7000, maxRedlineRPM: 9500,
    ratedPowerKW: 165, ratedPowerRPM: 8000, ratedTorqueNm: 215, ratedTorqueRPM: 6100,
    torquePoints: [[850, 65], [2000, 140], [4000, 187], [5500, 201], [6100, 215], [7000, 210], [8000, powerTorque(165, 8000)], [8400, 178]],
    vtec: { engageRPM: 5800, minRPM: 4300, maxRPM: 6800, lowCamLoss: 0.23, switchKind: 'published' },
    referenceSource: 'https://www.honda.co.jp/factbook/auto/CIVIC_TYPE_R/200703/04.html',
    description: 'FD2 K20A：225 PS、215 Nm，原廠 VTEC 5,800 RPM、上限 8,400 RPM。模擬暖機完成後的凸輪升程切換；VTC 相位以原廠扭力曲線等效呈現。',
  },
  boxer4: {
    ...car, id: 'boxer4', name: '水平對臥四缸 · Subaru WRX STI', shortName: 'BOXER 4',
    representativeModel: '2016 Subaru WRX STI (US)', modelYear: 2016,
    cylinders: 4, layout: 'boxer', bankAngle: 180, firingAngles: [0, 360, 540, 180],
    exhaustBanks: [0, 1, 0, 1], exhaustPathDelay: 0.0032,
    defaultDisplacement: 2457, minDisplacement: 2000, maxDisplacement: 3000,
    defaultIdleRPM: 800, defaultRedlineRPM: 6700, minRedlineRPM: 6000, maxRedlineRPM: 8000,
    ratedPowerKW: 305 * 0.745699872, ratedPowerRPM: 6000, ratedTorqueNm: 290 * 1.355817948, ratedTorqueRPM: 4000,
    torquePoints: [[800, 70], [2000, 180], [3000, 320], [4000, 290 * 1.355817948], [5000, 382], [6000, powerTorque(305 * 0.745699872, 6000)], [6700, 296]],
    defaultInduction: 'turbo', defaultBoost: 14.7 * 0.068947573, calibrationBoost: 14.7 * 0.068947573,
    soundCharacter: 'boxer_rumble',
    referenceSource: 'https://subarumedia.iconicweb.com/mediasite/specs/2016_Subaru_WRX_STI_specs.pdf',
    description: 'EJ257：2,457 cc、305 hp、290 lb-ft。左右對向活塞採獨立相反曲柄銷，排氣路徑差帶來低沉脈衝；路徑長度與限轉點為估算。',
  },
  boxer6: {
    ...car, id: 'boxer6', name: '水平對臥六缸 · Porsche 911 GT3', shortName: 'BOXER 6',
    representativeModel: '2025 Porsche 911 GT3 992.2 (EU, 6MT)', modelYear: 2025,
    cylinders: 6, layout: 'boxer', bankAngle: 180, firingAngles: [0, 240, 480, 360, 600, 120],
    // Cylinder order 1..6, banks 1–3 / 4–6; three opposed pairs.
    boxerPairs: [[0, 3], [1, 4], [2, 5]], exhaustBanks: [0, 0, 0, 1, 1, 1], exhaustPathDelay: 0.0007,
    defaultDisplacement: 3996, minDisplacement: 3200, maxDisplacement: 4500,
    defaultIdleRPM: 900, defaultRedlineRPM: 9000, minRedlineRPM: 8000, maxRedlineRPM: 10000,
    ratedPowerKW: 375, ratedPowerRPM: 8500, ratedTorqueNm: 450, ratedTorqueRPM: 6250,
    torquePoints: [[900, 110], [2000, 260], [4000, 400], [5500, 435], [6250, 450], [7500, 440], [8500, powerTorque(375, 8500)], [9000, 395]],
    soundCharacter: 'boxer_six', flywheelInertia: 0.045, revResponseSpeed: 2.0,
    referenceSource: 'https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr:46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf',
    description: '992.2 GT3：4.0 L 自然進氣、510 PS、9,000 RPM。等距六缸點火與左右銀行排氣，搭配該代六速 GT 手排比例。',
  },
  rotary_2: {
    ...car, id: 'rotary_2', name: '雙轉子 · Mazda RX-8 RENESIS', shortName: '13B-MSP 2R',
    representativeModel: '2004 Mazda RX-8 (US, 6MT)', modelYear: 2004,
    cylinders: 2, rotors: 2, layout: 'rotary', bankAngle: 0,
    cycleDegrees: 360, mechanicalCycleDegrees: 1080, firingAngles: [0, 180],
    defaultDisplacement: 1308, minDisplacement: 1000, maxDisplacement: 2000,
    defaultIdleRPM: 850, defaultRedlineRPM: 9000, minRedlineRPM: 7500, maxRedlineRPM: 10500,
    ratedPowerKW: 238 * 0.745699872, ratedPowerRPM: 8500, ratedTorqueNm: 159 * 1.355817948, ratedTorqueRPM: 5500,
    torquePoints: [[850, 42], [2000, 110], [3500, 175], [5500, 159 * 1.355817948], [7000, 208], [8500, powerTorque(238 * 0.745699872, 8500)], [9000, 181]],
    soundCharacter: 'rotary', flywheelInertia: 0.065, engineBrakeFactor: 0.9,
    referenceSource: 'https://news.mazdausa.com/download/RX-8-Spec-Sheet-Final.pdf',
    description: '13B-MSP RENESIS：654 cc × 2、238 hp。輸出軸每轉有兩次燃燒；轉子每轉對應輸出軸三轉，使用側面進排氣埠，沒有往復活塞與氣門。',
  },
};
