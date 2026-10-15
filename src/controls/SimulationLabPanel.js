import { SimulationSession, CHANNELS, captureSetup, runCSV } from './SimulationSession.js';

const write = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const thermalLabels = { normal: '正常', warm: '正常', warming: '暖機中', cold: '冷車', hot: '高溫', overheating: '過熱保護', overheat: '過熱保護' };

export class SimulationLabPanel {
  constructor({ app, document: ownerDocument, session } = {}) {
    this.app = app; this.document = ownerDocument || globalThis.document;
    this.session = session || new SimulationSession(); this.listeners = []; this.created = [];
    this.revision = ''; this.lastDraw = 0; this.init();
  }
  el(tag, className = '', text, parent) {
    const node = this.document.createElement(tag); node.className = className;
    if (text != null) node.textContent = text;
    parent?.appendChild(node); return node;
  }
  on(node, event, callback) { node.addEventListener(event, callback); this.listeners.push([node, event, callback]); }
  select(parent, label, id, options, callback) {
    const row = this.el('label', 'lab-field', label, parent);
    const select = this.el('select', '', null, row); select.id = id;
    for (const [value, text] of options) { const option = this.el('option', '', text, select); option.value = value; }
    this.on(select, 'change', () => callback(select.value)); return select;
  }
  button(parent, label, callback, id) {
    const button = this.el('button', 'lab-button', label, parent); button.type = 'button'; if (id) button.id = id;
    this.on(button, 'click', callback); return button;
  }
  section(parent, title) {
    const section = this.el('section', 'simulation-lab', null, parent);
    this.created.push(section); this.el('h3', '', title, section); return section;
  }
  init() {
    const garage = this.app.garagePanel;
    if (!garage?.initialized) return;
    this.soundSection = this.section(garage.panels.get('sound'), '聆聽位置');
    this.listening = this.select(this.soundSection, '麥克風位置', 'listening-position', [
      ['balanced', '均衡 · 全車'], ['intake', '進氣口'], ['exhaust', '排氣出口'], ['mechanical', '機械本體'],
    ], value => this.app.sound.setListeningPosition(value));
    this.el('p', 'meta-desc', '位置會改變進氣、排氣與機械聲的相對比例及濾波。聲音仍由即時模型合成。', this.soundSection);

    this.thermalSection = this.section(garage.panels.get('settings'), '暖機與散熱');
    this.thermalHeading = this.thermalSection.querySelector('h3');
    this.thermalMode = this.select(this.thermalSection, '測試初始狀態', 'thermal-mode', [['warm', '已暖機'], ['cold', '冷車啟動']], value => {
      if (!this.canChange()) { this.thermalMode.value = this.app.engine.thermal.thermalMode; return; }
      this.app.engine.setThermalMode(value);
    });
    this.fanLabel = this.el('label', 'lab-check', null, this.thermalSection);
    this.fan = this.el('input', '', null, this.fanLabel); this.fan.type = 'checkbox'; this.fan.id = 'cooling-fan';
    this.el('span', '', '散熱風扇開啟', this.fanLabel);
    this.on(this.fan, 'change', () => this.app.engine.setCoolingFan(this.fan.checked));
    this.temps = this.el('p', 'lab-live', '—', this.thermalSection);
    this.thermalHelp = this.el('p', 'meta-desc', '', this.thermalSection);

    this.shaftReadings = this.el('div', 'turboshaft-readings', '', this.document.querySelector('.trans-section'));
    this.shaftReadings.id = 'turboshaft-readings'; this.created.push(this.shaftReadings);
    this.shaftReadings.hidden = true;

    this.records = this.section(garage.panels.get('performance'), '測試紀錄簿 · 數據曲線');
    this.el('p', 'meta-desc', '錄製目前操作，最長 120 秒、每秒 10 筆。可比較空檔拉轉、道路加速與噴射推力；保存最近 8 次，設定最多 12 組，僅存於此瀏覽器。', this.records);
    const label = this.el('label', 'lab-field', '設定／測試名稱', this.records);
    this.name = this.el('input', '', null, label); this.name.id = 'lab-name'; this.name.maxLength = 60; this.name.placeholder = '例如 原廠／改裝進氣';
    const controls = this.el('div', 'lab-actions', null, this.records);
    this.recordButton = this.button(controls, '開始錄製', () => {
      if (this.session.active) this.session.stop();
      else {
        this.session.start(this.name.value || this.app.engine.config.shortName, this.capture(), this.app.engine.time);
        if (this.app.engine.jet && ['rpm', 'speed', 'power', 'coolant'].includes(this.channel.value)) this.channel.value = 'thrust';
      }
      this.refresh();
    }, 'lab-record');
    this.button(controls, '保存目前設定', () => {
      this.session.saveSetup(this.name.value || this.app.engine.config.shortName, this.capture());
      write(this.message, '設定已保存在此瀏覽器。'); this.refresh();
    }, 'lab-save-setup');
    this.status = this.el('p', 'lab-status', '', this.records); this.status.setAttribute('aria-live', 'polite');
    this.setupSelect = this.select(this.records, '已保存設定', 'lab-setup-select', [], () => {});
    const setups = this.el('div', 'lab-actions', null, this.records);
    this.applyButton = this.button(setups, '套用設定', () => {
      const item = this.session.setups.find(item => item.id === this.setupSelect.value);
      if (!item) return;
      const result = this.app.applySavedSetup(item.setup); write(this.message, result.message);
    }, 'lab-apply-setup');
    this.button(setups, '刪除設定', () => { this.session.remove('setups', this.setupSelect.value); this.refresh(); });
    this.runSelect = this.select(this.records, '測試紀錄', 'lab-run-select', [], () => this.draw());
    this.baseline = this.select(this.records, '疊圖比較', 'lab-baseline-select', [['', '無']], () => this.draw());
    this.channel = this.select(this.records, '曲線項目', 'lab-channel', Object.entries(CHANNELS).map(([id, [name, unit]]) => [id, `${name}（${unit}）`]), () => this.draw());
    this.chart = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.chart.setAttribute('viewBox', '0 0 640 230'); this.chart.setAttribute('role', 'img'); this.chart.setAttribute('aria-label', '測試紀錄曲線'); this.chart.classList.add('lab-chart'); this.records.appendChild(this.chart);
    this.legend = this.el('p', 'lab-legend', '', this.records);
    const exports = this.el('div', 'lab-actions', null, this.records);
    this.exportJSON = this.button(exports, '匯出 JSON', () => this.download('json'));
    this.exportCSV = this.button(exports, '匯出 CSV', () => this.download('csv'));
    this.button(exports, '刪除紀錄', () => { this.session.remove('runs', this.runSelect.value); this.refresh(); });
    this.message = this.el('p', 'lab-message', this.session.error, this.records); this.message.setAttribute('aria-live', 'polite');
    this.refresh(); this.sync();
  }
  capture() { return captureSetup(this.app.engine, this.app.drivetrain, this.app.sound); }
  canChange() { return !this.app.engine.isIgnitionOn && Math.abs(this.app.drivetrain.speedKmh) < 0.5; }
  sync() {
    if (!this.records) return;
    const e = this.app.engine, aviation = ['turbine', 'turbojet'].includes(e.config.layout);
    this.listening.value = this.app.sound.listeningPosition;
    this.thermalMode.value = e.thermal.thermalMode;
    this.fan.checked = e.thermal.coolingFanEnabled;
    this.thermalMode.disabled = !this.canChange();
    this.fan.disabled = aviation || e.config.coolingKind === 'air';
    this.thermalMode.disabled ||= aviation;
    this.thermalMode.parentElement.hidden = aviation;
    this.fanLabel.hidden = !e.thermal.liquidCooled;
    write(this.thermalHeading, aviation ? '機油與運轉溫度' : '暖機與散熱');
    write(this.thermalHelp, aviation ? '機油溫度隨運轉累積，EGT 由燃氣模型計算；航空引擎沒有汽車冷卻液與水箱。溫度與時間常數為工程估算。'
      : e.thermal.liquidCooled ? '冷油增加阻力；高負載累積熱量，過熱會降低輸出。車速、風扇與升級水箱會影響散熱。切換初始狀態前請停車熄火。熱參數為工程估算。'
      : '氣冷引擎由空氣與機油帶走熱量，沒有冷卻液或水箱。高油溫會降低輸出；熱參數為工程估算。');
    this.shaftReadings.hidden = !e.turboshaft;
  }
  options(select, items, placeholder) {
    const current = select.value; select.replaceChildren();
    const none = this.el('option', '', placeholder, select); none.value = '';
    for (const item of items) { const option = this.el('option', '', item.name, select); option.value = item.id; }
    select.value = items.some(item => item.id === current) ? current : '';
  }
  refresh() {
    if (!this.records) return;
    this.options(this.setupSelect, this.session.setups, '選擇設定');
    this.options(this.runSelect, this.session.runs, '即時錄製／選擇紀錄');
    this.options(this.baseline, this.session.runs, '無');
    if (!this.session.active && this.session.runs.length) this.runSelect.value = this.session.runs[0].id;
    this.draw();
  }
  update(state, drive) {
    if (!this.records) return;
    const wasActive = Boolean(this.session.active);
    this.session.update(state, drive.speedKmh, this.capture());
    if (wasActive && !this.session.active) this.refresh();
    this.sync();
    write(this.recordButton, this.session.active ? '停止並保存' : '開始錄製');
    const active = this.session.active;
    write(this.status, active ? `錄製中 · ${number(active.samples.at(-1)?.t, 1)} 秒 · ${active.samples.length} 筆` : this.session.runs[0] ? `已保存 ${this.session.runs.length} 次 · ${this.session.runs[0].stopReason}` : '按下開始錄製，再操作油門。');
    this.applyButton.disabled = !this.canChange() || !this.setupSelect.value || (state.corePercent || 0) > 1;
    this.exportJSON.disabled = this.exportCSV.disabled = !this.runSelect.value;
    const aviation = ['turbine', 'turbojet'].includes(this.app.engine.config.layout);
    write(this.temps, aviation ? `機油 ${number(state.oilTemperatureC)} °C · EGT ${number(state.exhaustTemperatureC)} °C`
      : `${state.coolantTemperatureC == null ? '' : `冷卻液 ${number(state.coolantTemperatureC)} °C · `}機油 ${number(state.oilTemperatureC)} °C · 進氣 ${number(state.chargeTemperatureC)} °C · ${thermalLabels[state.thermalState] || state.thermalState} · 輸出 ${number(state.thermalPowerFactor * 100)}%`);
    if (state.propulsionKind === 'turboshaft') {
      write(this.shaftReadings, `N1 ${number(state.corePercent, 1)}% · N2 ${number(state.powerTurbinePercent, 1)}% · ${number(state.shaftPowerKW)} kW · EGT ${number(state.exhaustTemperatureC)}°C`);
      write(this.document.getElementById('cockpit-boost-value'), number(state.corePercent, 1));
      write(this.document.getElementById('driving-displacement'), `${number(this.app.engine.config.ratedPowerKW)} kW`);
    }
    if (performance.now() - this.lastDraw > 250 && active) { this.draw(); this.lastDraw = performance.now(); }
    if (this.session.error) write(this.message, this.session.error);
  }
  draw() {
    if (!this.chart) return;
    this.chart.replaceChildren();
    const current = this.session.active || this.session.runs.find(run => run.id === this.runSelect.value);
    const baseline = this.session.runs.find(run => run.id === this.baseline.value);
    const key = this.channel.value || 'rpm';
    const runs = [current, baseline].filter(Boolean);
    const points = runs.flatMap(run => run.samples.filter(sample => Number.isFinite(sample[key])));
    const line = (tag, attrs, text) => { const node = this.document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value); if (text) node.textContent = text; this.chart.appendChild(node); };
    if (!points.length) { line('text', { x: 320, y: 110, 'text-anchor': 'middle', fill: '#98a2b3' }, '這筆紀錄沒有此項數據'); write(this.legend, ''); return; }
    const maxT = Math.max(1, ...points.map(sample => sample.t));
    const minY = Math.min(0, ...points.map(sample => sample[key]));
    const maxY = Math.max(minY + 1, ...points.map(sample => sample[key])) * 1.05;
    for (let i = 0; i <= 4; i++) {
      const y = 15 + i * 45; line('path', { d: `M55 ${y}H625`, stroke: '#303443' });
      line('text', { x: 48, y: y + 4, 'text-anchor': 'end', fill: '#98a2b3', 'font-size': 11 }, number(maxY - i * (maxY - minY) / 4));
      line('text', { x: 55 + i * 142.5, y: 217, 'text-anchor': 'middle', fill: '#98a2b3', 'font-size': 11 }, `${number(maxT * i / 4, 1)}s`);
    }
    runs.forEach((run, i) => {
      const values = run.samples.filter(sample => Number.isFinite(sample[key]));
      const d = values.map((sample, index) => `${index ? 'L' : 'M'}${55 + sample.t / maxT * 570},${195 - (sample[key] - minY) / (maxY - minY) * 180}`).join(' ');
      line('path', { d, fill: 'none', stroke: i ? '#78a5ff' : '#ff953f', 'stroke-width': 2, ...(i ? { 'stroke-dasharray': '5 3' } : {}) });
    });
    write(this.legend, `橘：${current?.name || '—'}${baseline ? ` ／ 藍：${baseline.name}` : ''} · ${CHANNELS[key][0]} ${CHANNELS[key][1]}`);
  }
  download(format) {
    const run = this.session.runs.find(run => run.id === this.runSelect.value); if (!run) return;
    const blob = new Blob([format === 'csv' ? runCSV(run) : JSON.stringify(run, null, 2)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob); const a = this.el('a'); a.href = url; a.download = `engine-test-${run.id}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  destroy() { this.session.stop('離開測試'); for (const [node, event, callback] of this.listeners) node.removeEventListener(event, callback); for (const node of this.created) node.remove(); }
}
