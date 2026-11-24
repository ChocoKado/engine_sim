export type AerospaceCategory = "aircraft" | "space";
export type AerospaceKind = "piston" | "turbofan" | "turbojet" | "rocket";

interface AeroBase {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly reference: string;
  readonly source: string;
}

export type AerospaceEngine = AeroBase & (
  | { readonly kind: "piston"; readonly ratedRpm: number; readonly ratedPowerKw: number }
  | { readonly kind: "turbofan" | "turbojet"; readonly ratedThrustKn: number }
  | { readonly kind: "rocket"; readonly seaLevelThrustKn: number; readonly vacuumThrustKn: number }
);

const poundsForceToKilonewtons = 0.004448221615;

export const aerospaceEngines = [
  {
    id: "lycoming-io360-l2a", kind: "piston", name: "Lycoming IO-360-L2A", detail: "Cessna 172S・水平對臥四缸",
    reference: "180 hp／2,700 RPM・螺旋槳直驅",
    ratedRpm: 2700, ratedPowerKw: 180 * 0.745699872,
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
] as const satisfies readonly AerospaceEngine[];
