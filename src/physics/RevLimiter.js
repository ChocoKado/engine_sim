const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ECU_MODES = {
  soft: '原廠柔和限轉', hard: '賽車硬切斷油', sequential: '逐缸切斷',
};

// A bounded RPM regulator controls mean combustion torque. The audio DSP resolves
// individual cut events at sample rate; cadence must never latch a long power cut.
export class RevLimiter {
  constructor() { this.mode = 'soft'; this.hz = 18; this.depth = 0.85; this.reset(); }
  reset() { this.phase = 0; this.active = false; this.cut = 0; }
  setMode(mode) { if (Object.hasOwn(ECU_MODES, mode)) { this.mode = mode; this.reset(); } }
  setHz(value) { if (Number.isFinite(Number(value))) this.hz = clamp(Number(value), 8, 32); }
  setDepth(value) { if (Number.isFinite(Number(value))) this.depth = clamp(Number(value), 0.3, 1); }
  getControlRange(limit) {
    const band = clamp(limit * 0.02, 100, 300);
    return this.mode === 'hard' ? band * 0.65 : band;
  }
  update(dt, rpm, limit, throttle, running) {
    const band = this.getControlRange(limit);
    this.active = running && rpm > limit - band && (throttle >= 0.15 || rpm >= limit);
    if (!this.active) { this.phase = 0; this.cut = 0; return false; }
    const before = Math.floor(this.phase);
    this.phase += dt * this.hz;
    const mean = clamp((rpm - limit + band) / band, 0, 1);
    const amplitude = this.mode === 'soft' ? 0.06 : this.mode === 'hard' ? 0.32 * this.depth : 0.12 * this.depth;
    const pulse = this.phase % 1 < 0.5 ? 1 + amplitude : 1 - amplitude;
    this.cut = rpm >= limit ? 1 : clamp(mean * pulse, 0, 1);
    return Math.floor(this.phase) > before;
  }
}
