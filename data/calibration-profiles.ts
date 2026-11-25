export interface CalibrationProfile {
  readonly vehicleId: string;
  readonly idleRpm: number;
  readonly recommendedLoadRpm: number;
  readonly speedEvidence: string;
  readonly acousticStatus: string;
  readonly referenceLabel?: string;
  readonly referenceUrl?: string;
  readonly bundledSampleSrc?: string;
  readonly bundledSampleNote?: string;
}

// M23 six priority models: versioned measurement anchors and audio licensing status.
export const calibrationProfiles: Readonly<Record<string, CalibrationProfile>> = {
  "toyota-gr-supra": {
    vehicleId: "toyota-gr-supra",
    idleRpm: 735,
    recommendedLoadRpm: 4200,
    speedEvidence: "原廠北美規格電子限速 155 mph（249 km/h，A 級）；模擬限速 248.7 km/h。",
    acousticStatus: "內建 CC0 測功機片段（世代與原始轉速未知，僅供獨立試聽）；同步 A/B 請匯入具參考 RPM 之授權實錄。",
    referenceLabel: "editboy23・CC0 1.0 原始來源",
    referenceUrl: "https://freesound.org/people/editboy23/sounds/496171/",
    bundledSampleSrc: "/recordings/supra-dyno-496171.wav",
    bundledSampleNote: "Supra 測功機錄音節選・CC0 1.0（世代／轉速未標註）",
  },
  "toyota-supra-a80": {
    vehicleId: "toyota-supra-a80",
    idleRpm: 700,
    recommendedLoadRpm: 4000,
    speedEvidence: "1993 日規 RZ 180 km/h 道路限速（C 級同規慣例）；解除限速平路模擬約 264 km/h。",
    acousticStatus: "2JZ-GTE 原廠／改裝多工況公開授權音檔待補；可試聽 CC0 Supra 片段或匯入本機實錄。",
    referenceLabel: "editboy23・CC0 1.0 原始來源",
    referenceUrl: "https://freesound.org/people/editboy23/sounds/496171/",
    bundledSampleSrc: "/recordings/supra-dyno-496171.wav",
    bundledSampleNote: "Supra 測功機錄音節選・CC0 1.0（世代／轉速未標註）",
  },
  "mazda-rx7-spirit-r": {
    vehicleId: "mazda-rx7-spirit-r",
    idleRpm: 850,
    recommendedLoadRpm: 4500,
    speedEvidence: "2002 日規 Type A 5MT 廠方齒比與 280 PS 錨點；平路無速限模擬約 271.5 km/h（同版 GPS 待補）。",
    acousticStatus: "13B-REW 外部參考為原廠／改裝廠公開試聽，未含再散布授權，未隨站打包。",
    referenceLabel: "AutoExe RX-7 FD 排氣聲浪參考",
    referenceUrl: "https://www.autoexe.co.jp/?page_id=30712",
  },
  "kawasaki-h2": {
    vehicleId: "kawasaki-h2",
    idleRpm: 1150,
    recommendedLoadRpm: 8000,
    speedEvidence: "2019 歐規齒比與 170 kW 錨點；模擬道路限速 298.6 km/h（解除後 309.0 km/h，C 級）。",
    acousticStatus: "9.18 倍葉輪軸頻有原廠技報依據；實車進氣嘯聲與收油聲僅附外部參考連結，待授權實錄校準。",
    referenceLabel: "Kawasaki 機械增壓聲浪參考",
    referenceUrl: "https://www.youtube.com/watch?v=9sTa7tngJZY",
  },
  "yamaha-r3": {
    vehicleId: "yamaha-r3",
    idleRpm: 1500,
    recommendedLoadRpm: 7500,
    speedEvidence: "2026 台規六檔齒比與 41 PS 錨點；模擬 176.1 km/h（跨市場道路測試參考 181 km/h）。",
    acousticStatus: "180°／540° 燃燒間隔為 B 級推導；2026 台規原廠排氣多工況授權實錄待補。",
    referenceLabel: "Yamaha 台灣 R3 官方規格入口",
    referenceUrl: "https://www.yamaha-motor.com.tw/motor/motor_R3",
  },
  "cadillac-v-series-r": {
    vehicleId: "cadillac-v-series-r",
    idleRpm: 1700,
    recommendedLoadRpm: 6600,
    speedEvidence: "2025 勒芒正賽 #12 測速點 343.4 km/h（A 級賽事紀錄）；平路模擬校準為 343.4 km/h。",
    acousticStatus: "電推出站切換 5.5L 十字曲軸 V8 為賽事車載公開參考，未隨站打包音檔。",
    referenceLabel: "ACO Cadillac V-Series.R 勒芒車載原聲",
    referenceUrl: "https://www.24h-lemans.com/en/news/enjoy-a-lap-of-the-circuit-des-24-heures-du-mans-on-board-the-cadillac-v-series-r-57781",
  },
};

export const extraAudioReferences: Readonly<Record<string, { label: string; url: string }>> = {
  "kawasaki-h2r": {
    label: "Kawasaki 機械增壓聲浪參考",
    url: "https://www.youtube.com/watch?v=9sTa7tngJZY",
  },
};
