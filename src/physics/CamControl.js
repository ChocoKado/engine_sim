const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function camValveLift(angle, highCamBlend = 0) {
  const phase = ((angle % 720) + 720) % 720;
  const window = (start, duration) => {
    const t = (phase - start + 720) % 720;
    return t < duration ? Math.sin(t / duration * Math.PI) : 0;
  };
  const blend = clamp(highCamBlend, 0, 1);
  return { intake: window(0, 180) * (1 - blend) + window(690, 240) * 1.3 * blend,
    exhaust: window(540, 180) * (1 - blend) + window(510, 240) * 1.3 * blend };
}

// Warm-engine, load-dependent lift switching. Oil temperature/pressure and VTC
// maps are outside this model. Hysteresis prevents chatter near the switch RPM.
export class CamControl {
  constructor(config) {
    this.configure(config);
  }
  configure(config) {
    this.spec = config.vtec || null;
    this.enabled = Boolean(this.spec);
    this.engageRPM = this.spec?.engageRPM || 0;
    this.reset();
  }
  reset() { this.highCam = false; this.blend = 0; }
  setEnabled(enabled) { this.enabled = Boolean(this.spec && enabled); }
  setEngageRPM(value, redline) {
    if (!this.spec || !Number.isFinite(Number(value))) return;
    this.engageRPM = clamp(Number(value), this.spec.minRPM, Math.min(this.spec.maxRPM, redline - 350));
  }
  update(dt, rpm, load, running) {
    if (!this.enabled || !running || rpm < this.engageRPM - 250 || load < 0.18) this.highCam = false;
    else if (rpm >= this.engageRPM && load > 0.32) this.highCam = true;
    this.blend += ((this.highCam ? 1 : 0) - this.blend) * (1 - Math.exp(-dt / 0.045));
  }
  torqueFactor(rpm, blend = this.blend) {
    if (!this.spec) return 1;
    // OEM torque already includes the high cam. Disabling it limits breathing;
    // engaging it restores that curve instead of adding fictitious peak power.
    const t = clamp((rpm - (this.spec.engageRPM - 650)) / 2200, 0, 1);
    const lowCamPenalty = this.spec.lowCamLoss * t * t * (3 - 2 * t);
    return 1 - lowCamPenalty * (1 - blend);
  }
  steadyFactor(rpm) {
    return this.torqueFactor(rpm, this.enabled && rpm >= this.engageRPM ? 1 : 0);
  }
}
