export interface ExhaustVoicing {
  readonly body: number;
  readonly harmonics: number;
  readonly reflection: number;
  readonly pulseTail: number;
  readonly turbulence: number;
}

export type TuningId = "baseline" | "baffled-exhaust" | "open-exhaust" | "high-flow-intake";

export interface TuningProfile {
  readonly id: TuningId;
  readonly label: string;
  readonly version: number;
  readonly voicing: ExhaustVoicing;
}

export const tuningProfiles = [
  { id: "baseline", label: "車型基準", version: 1, voicing: { body: 1, harmonics: 1, reflection: 1, pulseTail: 1, turbulence: 1 } },
  { id: "baffled-exhaust", label: "排氣・加消音塞", version: 1, voicing: { body: 1.12, harmonics: 0.58, reflection: 1.48, pulseTail: 1.28, turbulence: 0.73 } },
  { id: "open-exhaust", label: "排氣・開放管", version: 1, voicing: { body: 0.92, harmonics: 1.36, reflection: 0.62, pulseTail: 0.78, turbulence: 1.16 } },
  { id: "high-flow-intake", label: "進氣・高流量", version: 1, voicing: { body: 1.02, harmonics: 1.08, reflection: 1, pulseTail: 0.96, turbulence: 1.38 } },
] as const satisfies readonly TuningProfile[];
