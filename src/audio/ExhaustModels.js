// ExhaustModels.js
// Acoustic characteristics and backfire profiles for different exhaust systems

export const EXHAUST_MODELS = {
  'oem': {
    id: 'oem',
    name: '原廠排氣管 (Stock OEM)',
    brand: 'OEM Factory',
    badgeColor: '#6c757d',
    description: '標準多重迷宮回壓消音室設計。有效抑制高頻雜音與爆震，提供低調厚實、溫和綿密的巡航排氣聲浪，完全無刺耳雜音。',
    // Audio filter parameters (Warm, deep acoustic chamber)
    filterLowpassCutoff: 980, // Hz - warm, muffled, zero harshness
    filterLowpassQ: 1.1,
    resonanceFreq: 140, // Deep sub bass rumble
    resonanceGain: 4.5,
    raspGain: 0.05,
    volumeMultiplier: 0.85,
    // Overrun pops & backfire
    popChance: 0,
    popIntensity: 0,
    flameSpitChance: 0.0,
    flameScale: 0, flameDuration: 0, overrunDuration: 0, crackleRate: 0,
    popTone: 500, popDecay: 0.07,
    backpressureHpMod: 0.94,
    backpressureTorqueMod: 1.04
  },

  'akrapovic': {
    id: 'akrapovic',
    name: 'Akrapovič 蠍子管 (Titanium Evolution)',
    brand: 'Akrapovič',
    badgeColor: '#ffb703',
    description: '頂級斯洛維尼亞鈦合金賽事排氣！深沉厚實中低頻共振、天籟般純淨渾厚音質，降低排氣背壓 (+5% 馬力)，極具質感與磁性。',
    // Audio filter parameters (Warm titanium cavity resonance)
    filterLowpassCutoff: 1950, // Warm, rich acoustic body
    filterLowpassQ: 1.8,
    resonanceFreq: 240, // Rich warm Helmholtz resonance
    resonanceGain: 6.5,
    raspGain: 0.25,
    volumeMultiplier: 1.05,
    // Overrun pops & backfire
    popChance: 0.45,
    popIntensity: 0.95,
    flameSpitChance: 0.35,
    flameScale: 0.8, flameDuration: 0.22, overrunDuration: 0.45, crackleRate: 8,
    popTone: 650, popDecay: 0.09,
    backpressureHpMod: 1.05,
    backpressureTorqueMod: 1.01
  },

  'sc_project': {
    id: 'sc_project',
    name: 'SC-Project 賽道狂暴管 (CR-T / SC)',
    brand: 'SC-Project',
    badgeColor: '#e63946',
    description: 'Moto2 / WSBK 賽道大口徑短尾段！極低背壓大幅釋放高轉馬力 (+9% 馬力)，激進金屬共鳴，收油伴隨狂暴密集的斷油放炮。',
    // Audio filter parameters (Throaty race rasp without piercing screech)
    filterLowpassCutoff: 2500, // Clean acoustic cutoff, no piercing buzz
    filterLowpassQ: 2.2,
    resonanceFreq: 1800, // Metallic midrange resonance
    resonanceGain: 6.0,
    raspGain: 0.45,
    volumeMultiplier: 1.15,
    // Overrun pops & backfire
    popChance: 0.8,
    popIntensity: 1.5,
    flameSpitChance: 0.7,
    flameScale: 1.2, flameDuration: 0.32, overrunDuration: 0.7, crackleRate: 14,
    popTone: 1100, popDecay: 0.12,
    backpressureHpMod: 1.09,
    backpressureTorqueMod: 0.98
  },

  'straight': {
    id: 'straight',
    name: '直通賽車管 (Straight Pipe Race)',
    brand: 'Full Straight Race',
    badgeColor: '#d62828',
    description: '完全無阻力賽車直通鋼管！零背壓徹底解放引擎極限動力 (+14% 馬力)，超高轉斷油伴隨震撼槍響與狂暴噴火！',
    // Audio filter parameters
    filterLowpassCutoff: 3000, // Natural pipe air dissipation
    filterLowpassQ: 2.5,
    resonanceFreq: 450,
    resonanceGain: 7.5,
    raspGain: 0.55,
    volumeMultiplier: 1.25,
    // Overrun pops & backfire
    popChance: 0.95,
    popIntensity: 1.9,
    flameSpitChance: 0.9,
    flameScale: 1.45, flameDuration: 0.4, overrunDuration: 0.9, crackleRate: 17,
    popTone: 850, popDecay: 0.15,
    backpressureHpMod: 1.14,
    backpressureTorqueMod: 0.95
  }
};
