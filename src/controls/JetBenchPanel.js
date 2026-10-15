const isJet = engine => engine?.config?.propulsionKind === 'turbojet';
const write = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const number = (value, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';

/** Presents the same jet state used by physics, audio and the mechanical views. */
export class JetBenchPanel {
  constructor({ engine, garage, document: ownerDocument } = {}) {
    this.engine = engine;
    this.garage = garage;
    this.document = ownerDocument || globalThis.document;
    this.labels = new Map();
    this.attributes = new Map();
    this.created = [];
    this.active = false;
    this.init();
  }

  create(tag, className, text, parent) {
    const node = this.document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    parent?.appendChild(node);
    return node;
  }

  init() {
    if (!this.garage?.initialized) return;
    const doc = this.document;
    const trans = doc.querySelector('.trans-section');
    this.controls = this.create('div', 'jet-only jet-bench-controls', null, trans);
    this.created.push(this.controls);
    this.create('span', 'garage-eyebrow', 'STATIC THRUST BENCH', this.controls);
    this.status = this.create('strong', 'jet-operating-status', 'STANDBY', this.controls);
    const label = this.create('label', 'jet-afterburner-toggle', null, this.controls);
    this.afterburner = this.create('input', '', null, label);
    this.afterburner.setAttribute('type', 'checkbox');
    this.afterburner.setAttribute('id', 'jet-afterburner-enabled');
    this.create('span', '', '後燃器', label);
    this.abStatus = this.create('span', 'jet-ab-status', 'OFF', this.controls);
    this.onAfterburner = () => this.engine.setAfterburnerEnabled(this.afterburner.checked);
    this.afterburner.addEventListener('change', this.onAfterburner);

    this.details = this.create('section', 'jet-only jet-bench-details', null, this.garage.panels.get('performance'));
    this.created.push(this.details);
    this.create('h3', '', '即時噴射狀態', this.details);
    const grid = this.create('dl', 'jet-readings-grid', null, this.details);
    this.readings = new Map();
    for (const [id, labelText] of [
      ['thrust', '靜態推力'], ['core', 'N1 核心轉速'], ['egt', '渦輪出口 EGT'],
      ['fuel', '燃油流量'], ['pressure', '壓縮機壓比'], ['airflow', '空氣流量'],
      ['nozzle', '噴嘴溫度'], ['velocity', '噴流速度'], ['afterburner', '後燃器輸出'],
    ]) {
      const item = this.create('div', 'jet-reading', null, grid);
      this.create('dt', '', labelText, item);
      this.readings.set(id, this.create('dd', '', '—', item));
    }
    this.create('p', 'meta-desc', '海平面、15°C、固定測試台。推力以公開 J85-21 額定值校準；中間工況、溫度、流量與加減速為工程估算。', this.details);

    this.architecture = this.create('div', 'jet-only jet-architecture', null, this.garage.library);
    this.created.push(this.architecture);
    this.create('h3', '', '單軸渦輪噴射', this.architecture);
    this.create('p', '', '進氣 → 9 級軸流壓縮機 → 環形燃燒室 → 2 級渦輪 → 後燃器 → 可變面積噴嘴。', this.architecture);
    this.create('p', 'meta-desc', '壓縮機與渦輪共用同一根軸，燃燒連續進行；噴流產生推力，沒有驅動車輪的變速箱。', this.architecture);
    this.create('p', 'meta-desc', '外觀與剖面是機構示意，可旋轉或放慢觀察；不是原廠 CAD。', this.architecture);

    this.setup = this.create('div', 'jet-only jet-bench-setup', null, this.garage.panels.get('settings'));
    this.created.push(this.setup);
    this.create('h3', '', 'J85-GE-21 · 海平面靜態基準', this.setup);
    this.create('p', '', '最大乾推力 15.50 kN；額定後燃推力 22.24 kN。用油門控制燃油調度，後燃器在高 N1 且接近全油門時才允許接通。', this.setup);
    this.create('p', 'meta-desc', 'N1 以額定核心轉速百分比顯示。公開資料未確認精確軸轉速，因此不把內部聲學／動畫參考 RPM 當作實機規格。', this.setup);
    const startLabel = this.create('label', 'lab-field', '啟動情境（停機且轉子停妥後設定）', this.setup);
    this.scenario = this.create('select', '', null, startLabel); this.scenario.setAttribute('id', 'jet-start-scenario');
    for (const [value, text] of [['normal', '正常啟動'], ['no-lightoff', '未點火 · 中止並乾轉吹除'], ['hot-start', '熱啟動 · EGT 過高保護']]) {
      const option = this.create('option', '', text, this.scenario); option.value = value;
    }
    this.onScenario = () => {
      const accepted = this.engine.setStartScenario(this.scenario.value);
      if (!accepted) this.scenario.value = this.engine.jet?.startScenario || 'normal';
      write(this.startMessage, accepted ? '情境已設定；按啟動開始。' : '請停機並等待轉子停止、溫度下降。');
    };
    this.scenario.addEventListener('change', this.onScenario);
    this.resetFault = this.create('button', 'lab-button', '清除故障／準備重啟', this.setup); this.resetFault.setAttribute('id', 'jet-reset-fault'); this.resetFault.type = 'button';
    this.onResetFault = () => write(this.startMessage, this.engine.resetStartFault() ? '故障已清除；選擇正常情境後可再啟動。' : '請先熄火，等待轉子低於 1% 且 EGT 低於 200°C。');
    this.resetFault.addEventListener('click', this.onResetFault);
    this.startMessage = this.create('p', 'lab-message', '', this.setup); this.startMessage.setAttribute('aria-live', 'polite');
    this.create('p', 'meta-desc', '流程：起動馬達吹除 → 供油點火 → 怠速穩定。異常會切斷燃油並乾轉吹除；故障溫度門檻與時序為教學估算，非飛行操作程序。', this.setup);
    const link = this.create('a', '', 'NASA J85-21 實驗資料 ↗', this.setup);
    link.setAttribute('href', 'https://ntrs.nasa.gov/citations/19800012848');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');

    this.soundNote = this.create('p', 'jet-only jet-sound-note meta-desc', '連續燃燒氣流聲與轉子階次隨 N1 改變，後燃器增加噴流低頻。音量與溫潤度可調，聲浪為程序合成。', this.garage.panels.get('sound'));
    this.created.push(this.soundNote);

    const incompatible = new Set([
      doc.getElementById('displacement-slider')?.closest('.sliders-grid'),
      ...['ecu-mode', 'vehicle-mass-slider', 'final-drive-slider', 'boost-status-badge']
        .map(id => doc.getElementById(id)?.closest('.config-field')),
      doc.querySelector('.exhaust-cards-grid')?.closest('.config-field'),
      doc.querySelector('.sound-profiles-grid'), doc.querySelector('.exhaust-stage-card'),
      doc.querySelector('.dyno-telemetry-card'), doc.querySelector('.performance-panel'),
      this.garage.partList, this.garage.libraryNote,
      this.garage.library?.querySelector('.garage-section-heading'),
    ]);
    this.incompatible = [...incompatible].filter(Boolean);
    for (const node of this.incompatible) node.classList.add('jet-incompatible');
    this.sync();
  }

  label(selector, value) {
    const node = this.document.querySelector(selector);
    if (!node) return;
    if (!this.labels.has(node)) this.labels.set(node, node.textContent);
    write(node, value);
  }

  describe(id, value) {
    const node = this.document.getElementById(id);
    if (!node) return;
    if (!this.attributes.has(node)) this.attributes.set(node, node.getAttribute('aria-label'));
    node.setAttribute('aria-label', value);
  }

  sync() {
    if (!this.controls) return;
    const next = isJet(this.engine);
    this.active = next;
    this.document.body.classList.toggle('jet-bench-active', next);
    if (!next) {
      for (const [node, original] of this.labels) write(node, original);
      this.labels.clear();
      for (const [node, original] of this.attributes) node.setAttribute('aria-label', original || '');
      this.attributes.clear();
      return;
    }
    if (this.garage.layout) this.garage.layout.dataset.inspect = 'list';
    for (const [id, label] of [['drive', '測試'], ['garage', '構造'], ['performance', '推力']]) {
      this.label(`#garage-tab-${id} .garage-tab-label`, label);
    }
    this.label('.hud-rpm-unit', '% N1');
    this.describe('tachometer-canvas', 'N1 核心轉速百分比儀表');
    this.describe('speedometer-canvas', '靜態噴射推力 kN 儀表');
    this.label('.hud-speed-unit', 'kN');
    this.label('.hud-rpm-box .hud-label', 'N1 核心轉速');
    this.label('.hud-speed-box .hud-label', 'THRUST 推力');
    this.label('.speed-hud .sticky-hud-sub', 'THRUST 推力');
    this.label('.speed-hud .sticky-hud-unit', 'kN');
    this.label('.rpm-hud .sticky-hud-sub', 'N1 核心轉速');
    this.label('.rpm-hud .sticky-hud-unit', '%');
    this.label('.gear-hud .sticky-hud-sub', 'TEST BENCH');
    this.label('.driving-spec-item .driving-spec-label', '核心');
    this.label('.driving-spec-item:last-child .driving-spec-label', '額定後燃');
    this.label('.driving-telemetry-item:nth-child(1) .driving-telemetry-label', '渦輪 EGT');
    this.label('.driving-telemetry-item:nth-child(2) .driving-telemetry-label', '壓比');
    this.label('.driving-telemetry-item:nth-child(2) .driving-telemetry-unit', ': 1');
    this.label('.driving-telemetry-item:nth-child(3) .driving-telemetry-label', '燃油流量');
    this.label('.driving-telemetry-item:nth-child(3) .driving-telemetry-unit', 'kg/s');
    this.label('#pedal-gas .pedal-text', 'THROTTLE 油門');
    this.label('.garage-pane-performance .garage-section-heading h2', '靜態噴射推力');
    this.label('.garage-pane-performance .garage-eyebrow', 'THRUST BENCH');
    this.label('.garage-pane-settings .garage-section-heading h2', '噴射測試條件');
    this.afterburner.checked = Boolean(this.engine.afterburnerEnabled);
  }

  update(state) {
    if (!this.active || !state) return;
    const d = this.document;
    const text = (id, value) => write(d.getElementById(id), value);
    const n1 = number(state.corePercent, 1);
    const thrust = number(state.thrustN / 1000, 2);
    const egt = number(state.exhaustTemperatureC);
    text('hud-digital-rpm', n1);
    text('hud-digital-speed', thrust);
    text('sticky-hud-rpm', n1);
    text('sticky-hud-speed', thrust);
    text('sticky-hud-gear', 'TEST');
    text('cockpit-intake-temp', egt);
    text('cockpit-boost-value', number(state.pressureRatio, 2));
    text('cockpit-speed-value', number(state.fuelFlowKgS, 2));
    text('driving-displacement', `${n1}% N1`);
    text('driving-peak-hp', `${number(this.engine.config.ratedAfterburnerThrustN / 1000, 2)} kN`);
    const phases = { purge: 'PURGE · 乾轉', lightoff: 'LIGHTOFF · 點火', running: state.afterburnerAmount > 0.05 ? 'AFTERBURNER' : 'RUNNING', abort: 'ABORT · 中止', cooldown: 'COOLDOWN · 降溫' };
    const status = state.faultCode ? `${state.faultCode} · ${phases[state.startState] || state.startState}` : phases[state.startState] || (state.starterActive ? 'STARTING' : state.isIgnitionOn
      ? state.afterburnerAmount > 0.05 ? 'AFTERBURNER' : 'RUNNING'
      : state.corePercent > 0.1 ? 'SPOOLING DOWN' : 'STANDBY');
    write(this.status, status);
    if (this.scenario) { this.scenario.value = this.engine.jet?.startScenario || 'normal'; this.scenario.disabled = state.isIgnitionOn || state.corePercent > 1; }
    this.afterburner.checked = Boolean(state.afterburnerEnabled);
    write(this.abStatus, !state.afterburnerEnabled ? 'OFF' : state.afterburnerAmount > 0.05
      ? `${number(state.afterburnerAmount * 100)}%` : 'ARMED · 等待高 N1');
    const values = {
      thrust: `${thrust} kN`, core: `${n1}%`, egt: `${egt} °C`,
      fuel: `${number(state.fuelFlowKgS, 3)} kg/s`, pressure: `${number(state.pressureRatio, 2)} : 1`,
      airflow: `${number(state.massFlowKgS, 2)} kg/s`, nozzle: `${number(state.nozzleTemperatureC)} °C`,
      velocity: `${number(state.jetVelocity)} m/s`, afterburner: `${number(state.afterburnerAmount * 100)}%`,
    };
    for (const [id, node] of this.readings) write(node, values[id]);
  }

  destroy() {
    this.scenario?.removeEventListener('change', this.onScenario);
    this.resetFault?.removeEventListener('click', this.onResetFault);
    this.afterburner?.removeEventListener('change', this.onAfterburner);
    for (const [node, original] of this.labels) write(node, original);
    for (const [node, original] of this.attributes) node.setAttribute('aria-label', original || '');
    this.document.body.classList.remove('jet-bench-active');
    for (const node of this.incompatible || []) node.classList.remove('jet-incompatible');
    for (const node of this.created) node.remove();
    this.labels.clear();
    this.attributes.clear();
  }
}
