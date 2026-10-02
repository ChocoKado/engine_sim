import { PerformanceMeter, readPerformanceHistory, savePerformanceHistory } from '../physics/PerformanceMeter.js';
import { performanceAssessment } from '../physics/PerformanceAnalysis.js';

const seconds = value => value == null ? '—' : `${value.toFixed(2)} s`;
export function capturePerformanceSetup(engine, drive) {
  return { engineId: engine.config.id, model: engine.config.representativeModel || engine.config.name,
    displacement: engine.displacement, redlineRPM: engine.redlineRPM,
    exhaust: engine.exhaust.id, induction: engine.forcedInduction, boost: engine.maxBoost,
    turboSize: engine.turboSize, bov: engine.bovType, mass: drive.vehicleMass, transmission: drive.mode,
    finalDrive: drive.finalDrive, primaryRatio: drive.primaryRatio, gearRatios: { ...drive.gearRatios }, tireRadius: drive.tireRadius,
    ecu: engine.limiter.mode, limiterHz: engine.limiter.hz, limiterDepth: engine.limiter.depth,
    vtec: engine.cam.enabled, vtecRPM: engine.cam.engageRPM,
    peakHP: engine.dynoData.maxHp, peakTorque: engine.dynoData.maxTorque };
}
export function setupCaption(s) {
  const boost = s.induction === 'na' ? 'NA' : `${s.induction === 'turbo' ? `Turbo ${s.turboSize === 'large' ? '大' : '小'}` : 'TVS'} ${Number(s.boost).toFixed(2)} bar`;
  const release = s.induction === 'turbo' ? ` · ${s.bov === 'flutter' ? 'Flutter' : 'BOV'}` : '';
  const gearing = Number.isFinite(s.finalDrive) ? ` · 終傳 ${s.finalDrive.toFixed(3)}` : '';
  return `${s.displacement} cc · 上限 ${s.redlineRPM} RPM · ${s.transmission?.toUpperCase()} · ${Math.round(s.mass)} kg · ${s.exhaust} · ${boost}${release}${gearing} · ${s.peakHP} HP · ECU ${s.ecu} ${s.limiterHz} Hz / ${Math.round(s.limiterDepth * 100)}%${s.vtecRPM ? ` · VTEC ${s.vtec ? s.vtecRPM : 'OFF'}` : ''}`;
}

export class PerformancePanel {
  constructor(engine, drive, resetVehicle, storage) {
    this.engine = engine; this.drive = drive;
    this.meter = new PerformanceMeter();
    try { this.storage = storage === undefined ? window.localStorage : storage; } catch { this.storage = null; }
    this.history = readPerformanceHistory(this.storage);
    this.baselineId = this.history[0]?.id || '';
    this.signature = '';
    this.lastDraw = -Infinity;
    drive.onStep = sample => this.meter.sample(sample);
    document.getElementById('perf-arm')?.addEventListener('click', () => this.arm());
    document.getElementById('perf-reset')?.addEventListener('click', () => {
      this.meter.cancel('已回到起點。'); resetVehicle?.(); this.arm();
    });
    document.getElementById('perf-stop')?.addEventListener('click', () => { this.meter.stop(); this.update(); });
    document.getElementById('perf-baseline')?.addEventListener('change', e => { this.baselineId = e.target.value; this.renderComparison(); });
    document.getElementById('perf-clear')?.addEventListener('click', () => {
      this.history = []; this.baselineId = ''; savePerformanceHistory(this.storage, []); this.renderHistory(); this.renderComparison();
    });
    this.renderHistory(); this.renderComparison(); this.update();
  }
  arm() {
    if (['armed', 'running'].includes(this.meter.state)) return;
    const setup = capturePerformanceSetup(this.engine, this.drive);
    const mode = document.getElementById('perf-mode')?.value || 'standing';
    const okay = this.meter.arm({ time: this.engine.time, speed: this.drive.speedKmh, distance: this.drive.distanceMeters,
      running: this.engine.isIgnitionOn, gear: this.drive.currentGear }, setup, mode);
    if (okay) this.signature = JSON.stringify(setup);
    this.update();
  }
  beforeStep() {
    if (['armed', 'running'].includes(this.meter.state)
      && this.signature !== JSON.stringify(capturePerformanceSetup(this.engine, this.drive))) {
      this.meter.cancel('引擎或改裝設定已變更，請重新準備測試。');
    }
  }
  brakeForLaunch(throttle, brake) {
    return this.meter.state === 'armed' && this.meter.mode === 'standing' && throttle <= 0.02 ? 1 : brake;
  }
  update() {
    const meter = this.meter;
    if (meter.result && meter.result.id !== this.savedId) {
      this.savedId = meter.result.id;
      this.history.unshift(meter.result); this.history = this.history.slice(0, 8);
      if (!this.history.some(run => run.id === this.baselineId)) this.baselineId = this.history.at(-1)?.id || '';
      if (!savePerformanceHistory(this.storage, this.history)) meter.message = '成績已保留於本頁；瀏覽器未允許儲存，重整後會清除。';
      this.renderHistory(); this.renderComparison();
    }
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    text('perf-status', meter.message);
    const assessment = performanceAssessment(this.engine, this.drive);
    text('perf-limit', assessment.text);
    text('perf-gearing-limit', `最高檔紅線輪速 ${assessment.theoreticalTop.toFixed(1)} km/h · 齒比上限，非實測尾速`);
    text('perf-sc-load', this.engine.forcedInduction === 'supercharger'
      ? `增壓器實際驅動耗功 ${assessment.shaftPowerKW.toFixed(1)} kW · 當前增壓 ${this.engine.boostPressure.toFixed(2)} bar` : '');
    text('perf-live-time', seconds(meter.elapsed));
    text('perf-zero-100', seconds(meter.metrics?.zeroTo100));
    text('perf-100-200', seconds(meter.metrics?.hundredTo200));
    text('perf-quarter', seconds(meter.metrics?.quarterMile));
    text('perf-finish-speed', meter.metrics?.finishSpeed == null ? '終點速度 —' : `終點速度 ${meter.metrics.finishSpeed.toFixed(1)} km/h`);
    const active = ['armed', 'running'].includes(meter.state);
    const arm = document.getElementById('perf-arm'); if (arm) arm.disabled = active;
    const stop = document.getElementById('perf-stop'); if (stop) stop.disabled = !active;
    const mode = document.getElementById('perf-mode'); if (mode) mode.disabled = active;
    if (this.engine.time - this.lastDraw > 0.25) { this.renderChart(); this.lastDraw = this.engine.time; }
  }
  renderHistory() {
    const select = document.getElementById('perf-baseline');
    const list = document.getElementById('perf-history');
    if (select) {
      select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = '選擇比較基準'; select.appendChild(empty);
    }
    if (list) list.replaceChildren();
    this.history.forEach(run => {
      const date = new Date(run.date);
      const stamp = Number.isFinite(date.getTime()) ? date.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      if (select) {
        const option = document.createElement('option'); option.value = run.id;
        option.textContent = `${stamp} · ${run.setup.model} · ${run.setup.peakHP} HP`;
        select.appendChild(option);
      }
      if (list) {
        const item = document.createElement('li');
        const title = document.createElement('strong'); title.textContent = `${stamp} · ${run.setup.model}`;
        const setup = document.createElement('p'); setup.textContent = setupCaption(run.setup);
        const scores = document.createElement('p');
        scores.textContent = `0–100 ${seconds(run.metrics.zeroTo100)} / 100–200 ${seconds(run.metrics.hundredTo200)} / ¼ mile ${seconds(run.metrics.quarterMile)}${run.reason === 'timeout' ? ' · 120 秒結束' : run.reason === 'stopped' ? ' · 手動結束' : ''}`;
        item.append(title, setup, scores); list.appendChild(item);
      }
    });
    if (select) select.value = this.baselineId;
    const empty = document.getElementById('perf-history-empty'); if (empty) empty.hidden = this.history.length > 0;
  }
  renderComparison() {
    const baseline = this.history.find(run => run.id === this.baselineId);
    const current = this.history[0];
    const el = document.getElementById('perf-comparison');
    if (el) {
      if (!baseline || !current || baseline.id === current.id) el.textContent = '完成另一組設定的測試後，即可與基準比較。';
      else {
        const comparisons = [['0–100', 'zeroTo100'], ['100–200', 'hundredTo200'], ['¼ mile', 'quarterMile']]
          .filter(([, key]) => baseline.metrics[key] !== null && current.metrics[key] !== null)
          .map(([name, key]) => { const delta = current.metrics[key] - baseline.metrics[key];
            return `${name} ${delta < -0.005 ? '快' : delta > 0.005 ? '慢' : '相同'} ${Math.abs(delta).toFixed(2)} s`; });
        el.textContent = `最新成績對比 ${baseline.setup.model}：${comparisons.join(' · ') || '沒有共同完成的項目'}。`;
      }
    }
    this.renderChart();
  }
  renderChart() {
    const svg = document.getElementById('perf-chart'); if (!svg) return;
    const currentRun = this.meter.state === 'running' || this.meter.state === 'armed' ? this.meter : this.history[0];
    const baseline = this.history.find(run => run.id === this.baselineId);
    // Standing starts and rolling tests have different origins; never overlay them.
    const reference = baseline?.mode === currentRun?.mode ? baseline : null;
    const traces = [currentRun?.trace || [], reference?.trace || []];
    const maxT = Math.max(10, ...traces.map(points => points.at(-1)?.time || 0));
    const maxV = Math.max(100, ...traces.map(points => Math.max(0, ...points.map(p => p.speed))));
    const ns = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs, label) => { const el = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); if (label) el.textContent = label; return el; };
    svg.replaceChildren(node('title', {}, '車速與時間比較；青色為本次，琥珀色為基準。'));
    for (let i = 0; i <= 4; i++) {
      const y = 150 - i * 32;
      svg.append(node('line', { x1: 46, x2: 505, y1: y, y2: y, stroke: '#334155' }),
        node('text', { x: 40, y: y + 4, 'text-anchor': 'end', fill: '#94a3b8', 'font-size': 10 }, `${Math.round(maxV * i / 4)}`));
    }
    svg.append(node('text', { x: 46, y: 174, fill: '#94a3b8', 'font-size': 10 }, '0 s'),
      node('text', { x: 505, y: 174, fill: '#94a3b8', 'font-size': 10, 'text-anchor': 'end' }, `${maxT.toFixed(1)} s`),
      node('text', { x: 8, y: 10, fill: '#94a3b8', 'font-size': 10 }, 'km/h'));
    traces.forEach((points, index) => {
      if (!points.length) return;
      svg.append(node('polyline', { points: points.map(p => `${46 + p.time / maxT * 459},${150 - p.speed / maxV * 128}`).join(' '),
        fill: 'none', stroke: index ? '#fbbf24' : '#00f0ff', 'stroke-width': 2, 'stroke-dasharray': index ? '5 3' : 'none' }));
    });
  }
}
