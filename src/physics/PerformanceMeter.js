export const QUARTER_MILE_METERS = 402.336;
const interpolate = (a, b, x, key) => a.time + (b.time - a.time) * (x - a[key]) / (b[key] - a[key]);

// Feed every physics substep, before rounding HUD speed. All clocks use simulation
// time. No rollout, slope or wind correction; quarter-mile speed is at the finish.
export class PerformanceMeter {
  constructor() { this.state = 'idle'; this.message = '煞停後準備測試；踩油門開始計時。'; }
  arm(sample, setup, mode = 'standing') {
    if (!sample.running) return this.reject('請先啟動引擎。');
    if (sample.gear <= 0) return this.reject('請先選 D 檔或 AMT 前進檔。');
    if (sample.speed < 0 || (mode === 'standing' && sample.speed > 0.5)) return this.reject('請先煞停，再準備起步測試。');
    if (mode === 'rolling' && sample.speed >= 100) return this.reject('請先降到 100 km/h 以下，再準備滾動測試。');
    this.mode = mode;
    this.setup = structuredClone(setup);
    this.previous = { ...sample };
    this.armedAt = sample.time;
    this.startTime = null;
    this.startDistance = sample.distance;
    this.at100 = null;
    this.metrics = { zeroTo100: null, hundredTo200: null, quarterMile: null, finishSpeed: null };
    this.trace = [];
    this.result = null;
    this.state = 'armed';
    this.message = mode === 'rolling' ? '已準備：通過 100 km/h 自動開始。' : '已準備：車輛起步自動開始。';
    return true;
  }
  reject(message) { this.message = message; return false; }
  cancel(message = '測試已取消。') {
    if (this.state === 'armed' || this.state === 'running') { this.state = 'cancelled'; this.result = null; this.message = message; }
  }
  finish(reason = 'complete') {
    if (this.state !== 'running') return;
    this.state = 'complete';
    this.message = reason === 'timeout' ? '測試達 120 秒；未完成項目標示未達。' : '測試完成，已保存本次設定與成績。';
    this.result = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString(),
      mode: this.mode, setup: this.setup, metrics: { ...this.metrics }, trace: this.trace.map(p => ({ ...p })), reason };
  }
  stop() {
    if (this.state === 'running' && Object.values(this.metrics).some(v => v !== null)) this.finish('stopped');
    else this.cancel('測試已取消；尚未完成任何項目。');
  }
  sample(b) {
    if (!['armed', 'running'].includes(this.state)) return;
    const a = this.previous;
    if (!a || !Number.isFinite(b.time) || b.time <= a.time) return;
    if (!b.running || b.gear <= 0 || b.speed < -0.1) { this.cancel('熄火、空檔或倒車，測試已取消。'); return; }
    const crossed100 = a.speed < 100 && b.speed >= 100;
    if (this.state === 'armed') {
      if (this.mode === 'rolling' && crossed100) {
        this.startTime = interpolate(a, b, 100, 'speed');
        this.at100 = this.startTime;
      } else if (this.mode === 'standing' && b.speed > 0.000001 && (b.throttle ?? 1) > 0.02) {
        this.startTime = a.time;
        this.startDistance = a.distance;
      }
      if (this.startTime !== null) { this.state = 'running'; this.message = '計時中'; }
    }
    if (this.state === 'running') {
      if (crossed100 && this.at100 === null) {
        this.at100 = interpolate(a, b, 100, 'speed');
        if (this.mode === 'standing') this.metrics.zeroTo100 = this.at100 - this.startTime;
      }
      if (this.at100 !== null && this.metrics.hundredTo200 === null && a.speed < 200 && b.speed >= 200) {
        this.metrics.hundredTo200 = interpolate(a, b, 200, 'speed') - this.at100;
      }
      const finishDistance = this.startDistance + QUARTER_MILE_METERS;
      if (this.mode === 'standing' && this.metrics.quarterMile === null && a.distance < finishDistance && b.distance >= finishDistance) {
        const t = interpolate(a, b, finishDistance, 'distance');
        this.metrics.quarterMile = t - this.startTime;
        this.metrics.finishSpeed = a.speed + (b.speed - a.speed) * (t - a.time) / (b.time - a.time);
      }
      const elapsed = b.time - this.startTime;
      if (!this.trace.length || elapsed - this.trace.at(-1).time >= 0.1) this.trace.push({ time: elapsed, speed: b.speed });
      if (this.mode === 'rolling' ? this.metrics.hundredTo200 !== null
        : this.metrics.zeroTo100 !== null && this.metrics.hundredTo200 !== null && this.metrics.quarterMile !== null) this.finish();
      else if (elapsed >= 120) this.finish('timeout');
    } else if (b.time - this.armedAt > 120) this.cancel('等待起步逾時，請重新準備測試。');
    this.previous = { ...b };
  }
  get elapsed() { return this.startTime === null || this.startTime === undefined ? 0 : Math.max(0, (this.previous?.time || this.startTime) - this.startTime); }
}

export const PERFORMANCE_STORAGE_KEY = 'hyperengine-performance-v1';
export function readPerformanceHistory(storage) {
  try {
    const data = JSON.parse(storage?.getItem(PERFORMANCE_STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(run => typeof run?.id === 'string' && typeof run.setup?.model === 'string'
      && ['standing', 'rolling'].includes(run.mode) && run.metrics && Array.isArray(run.trace)
      && run.trace.length <= 1300 && run.trace.every(p => Number.isFinite(p.time) && Number.isFinite(p.speed) && p.time >= 0)
      && ['zeroTo100', 'hundredTo200', 'quarterMile', 'finishSpeed'].every(k => run.metrics[k] === null || Number.isFinite(run.metrics[k]) && run.metrics[k] >= 0)).slice(0, 8);
  } catch { return []; }
}
export function savePerformanceHistory(storage, history) {
  try { storage?.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(history.slice(0, 8))); return Boolean(storage); }
  catch { return false; }
}
