export type AerospaceCategory = "aircraft" | "space";
export type AerospaceKind = "piston" | "turboprop" | "turbofan" | "turbojet" | "rocket";

interface AeroBase {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly reference: string;
  readonly source: string;
}

interface PropellerDrive {
  readonly ratedRpm: number;
  readonly ratedPowerKw: number;
  readonly propellerBlades: number;
}

export type AerospaceEngine = AeroBase & (
  | ({ readonly kind: "piston" } & PropellerDrive)
  | ({ readonly kind: "turboprop" } & PropellerDrive)
  | { readonly kind: "turbofan" | "turbojet"; readonly ratedThrustKn: number }
  | { readonly kind: "rocket"; readonly seaLevelThrustKn: number | null; readonly vacuumThrustKn: number }
);

const poundsForceToKilonewtons = 0.004448221615;

export const aerospaceEngines = [
  {
    id: "lycoming-io360-l2a", kind: "piston", name: "Lycoming IO-360-L2A", detail: "Cessna 172S・水平對臥四缸",
    reference: "180 hp／2,700 RPM・螺旋槳直驅",
    ratedRpm: 2700, ratedPowerKw: 180 * 0.745699872, propellerBlades: 2,
    source: "https://www.lycoming.com/sites/default/files/file/2025-11/60297-12%20-%20O-360%2C%20HO-360%2C%20IO-360%2C%20AIO-360%2C%20HIO-360%2C%20and%20TIO-360%20Series.pdf",
  },
  {
    id: "cfm56-7b27", kind: "turbofan", name: "CFM56-7B27", detail: "Boeing 737 NG・高旁通渦扇",
    reference: "海平面靜態起飛推力 121.43 kN",
    ratedThrustKn: 121.43,
    source: "https://www.easa.europa.eu/en/downloads/7795/en",
  },
  {
    id: "olympus-593", kind: "turbojet", name: "Olympus 593 Mk 610", detail: "Concorde・雙轉子純渦噴",
    reference: "海平面標準條件・無加力 31,350 lbf",
    ratedThrustKn: 31350 * poundsForceToKilonewtons,
    source: "https://www.scribd.com/document/724007832/E20eu",
  },
  {
    id: "sls-rs25", kind: "rocket", name: "RS-25", detail: "NASA SLS・液體火箭引擎",
    reference: "109% 基準・海平面 418,000 lbf／真空 512,300 lbf",
    seaLevelThrustKn: 418000 * poundsForceToKilonewtons,
    vacuumThrustKn: 512300 * poundsForceToKilonewtons,
    source: "https://www.nasa.gov/wp-content/uploads/2025/04/sls-4963-sls-rs-25-engine-fact-sheet-508.pdf",
  },
  {
    id: "pt6a-67p", kind: "turboprop", name: "PT6A-67P", detail: "Pilatus PC-12 NG・自由渦輪螺旋槳",
    reference: "最大軸功率 895 kW・螺旋槳 1,700 RPM",
    ratedRpm: 1700, ratedPowerKw: 895, propellerBlades: 4,
    source: "https://www.easa.europa.eu/en/downloads/7348/en",
  },
  {
    id: "ge90-115b", kind: "turbofan", name: "GE90-115B", detail: "Boeing 777-300ER・大直徑高旁通渦扇",
    reference: "額定推力 512 kN",
    ratedThrustKn: 512,
    source: "https://www.geaerospace.com/news/press-releases/commercial-engines/ge90-115b-ges-best-ever-new-jet-engine-entry-airline-service",
  },
  {
    id: "centaur-rl10c-1", kind: "rocket", name: "RL10C-1", detail: "ULA Atlas V・Centaur 上面級",
    reference: "真空推力 101.9 kN",
    seaLevelThrustKn: null, vacuumThrustKn: 101.9,
    source: "https://www.ulalaunch.com/docs/default-source/launch-booklets/mobrochure_nrol101.pdf",
  },
] as const satisfies readonly AerospaceEngine[];
