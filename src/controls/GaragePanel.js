import { MODIFICATION_CATALOG, isModificationSupported } from '../physics/Modifications.js';

const TABS = [
  { id: 'drive', label: '駕駛', symbol: '◉', subtitle: '即時儀表與駕駛操作' },
  { id: 'garage', label: '改裝', symbol: '◇', subtitle: '零件與安裝位置' },
  { id: 'sound', label: '聲浪', symbol: '≋', subtitle: '進排氣與音色' },
  { id: 'performance', label: '性能', symbol: '▥', subtitle: '加速與改裝比較' },
  { id: 'settings', label: '設定', symbol: '⚙', subtitle: '引擎與傳動設定' },
];

const PART_MARKS = { intake: 'IN', headers: 'EX', camshaft: 'CA', flywheel: 'FW', intercooler: 'IC', pulley: 'SC' };
const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };

/**
 * A garage shell around the existing controls. Controls are moved, never cloned:
 * InputManager/App retain their original element references and event listeners.
 * Physics remains in EngineModel; this class only requests a part installation.
 */
export class GaragePanel {
  constructor({ engine, drive, visual = null, onModificationChange, onViewChange, document: ownerDocument } = {}) {
    this.engine = engine;
    this.drive = drive;
    this.visual = visual;
    this.onModificationChange = onModificationChange;
    this.onViewChange = onViewChange;
    this.document = ownerDocument || globalThis.document;
    this.catalog = MODIFICATION_CATALOG;
    this.activeTab = 'drive';
    this.selectedPart = 'intake';
    this.viewMode = '3d';
    this.moves = [];
    this.listeners = [];
    this.partRows = new Map();
    this.tabButtons = new Map();
    this.panels = new Map();
    this.signature = '';
    this.initialized = false;
    this.pending = false;
    this.statusMessage = '';
  }

  element(tag, className, text, attributes = {}) {
    const node = this.document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }

  listen(node, event, callback) {
    node?.addEventListener(event, callback);
    if (node) this.listeners.push({ node, event, callback });
  }

  move(node, destination) {
    if (!node || !destination) return;
    this.moves.push({ node, parent: node.parentNode, next: node.nextSibling });
    destination.appendChild(node);
  }

  init() {
    if (this.initialized) return this;
    const doc = this.document;
    const main = doc?.querySelector('.sim-grid');
    const viewport = doc?.querySelector('.sticky-engine-viewport');
    const canvasBox = doc?.querySelector('.engine-canvas-box');
    const cluster = doc?.querySelector('.cluster-card');
    const tuning = doc?.querySelector('.tuning-card');
    if (!main || !viewport || !canvasBox || !cluster || !tuning) return this;

    // Read all original controls before moving their parents out of the document.
    const selection = doc.getElementById('engine-select')?.closest('.config-field');
    const metadata = tuning.querySelector('.engine-meta-card');
    const tachometer = cluster.querySelector('.tacho-wrapper');
    const speedometer = cluster.querySelector('.speedo-wrapper');
    const digitalHud = cluster.querySelector('.cockpit-hud-screen');
    const gearDisplay = cluster.querySelector('#hud-gear-display');
    const transmission = cluster.querySelector('.trans-section');
    const startButton = doc.getElementById('btn-start-engine');
    const engineStatus = doc.getElementById('engine-status-badge');

    this.main = main;
    this.originalChildren = [...main.childNodes];
    this.originalEngineParent = canvasBox;
    this.layout = this.element('div', 'garage-layout', null, { 'data-tab': 'drive', 'data-inspect': 'list' });
    this.toolbar = this.element('nav', 'garage-tabs', null, { 'aria-label': '車庫功能', role: 'tablist' });
    for (const tab of TABS) {
      const button = this.element('button', 'garage-tab', null, {
        type: 'button', id: `garage-tab-${tab.id}`, role: 'tab',
        'aria-controls': `garage-panel-${tab.id}`, 'aria-selected': tab.id === this.activeTab,
        tabindex: tab.id === this.activeTab ? 0 : -1,
      });
      button.append(
        this.element('span', 'garage-tab-symbol', tab.symbol, { 'aria-hidden': 'true' }),
        this.element('span', 'garage-tab-label', tab.label),
      );
      button.dataset.tab = tab.id;
      this.listen(button, 'click', () => this.selectTab(tab.id));
      this.listen(button, 'keydown', event => this.tabKeyDown(event, tab.id));
      this.toolbar.appendChild(button);
      this.tabButtons.set(tab.id, button);
    }

    this.engineBar = this.element('div', 'driving-engine-bar');
    this.picker = this.engineBar;
    this.move(selection, this.picker);
    this.specSummary = this.element('div', 'driving-spec-summary', null, { 'aria-label': '目前引擎規格' });
    this.displacementValue = this.element('strong', 'driving-spec-value', '—', { id: 'driving-displacement' });
    this.peakHpValue = this.element('strong', 'driving-spec-value', '—', { id: 'driving-peak-hp' });
    for (const [label, value] of [['排氣量', this.displacementValue], ['峰值馬力', this.peakHpValue]]) {
      const spec = this.element('div', 'driving-spec-item');
      spec.append(this.element('span', 'driving-spec-label', label), value);
      this.specSummary.appendChild(spec);
    }
    this.engineBar.appendChild(this.specSummary);

    this.instruments = this.element('section', 'driving-instruments', null, {
      id: 'garage-panel-drive', role: 'tabpanel', 'aria-labelledby': 'garage-tab-drive',
    });
    this.panels.set('drive', this.instruments);
    this.gauges = this.element('div', 'driving-gauges', null, { 'aria-label': '轉速與時速儀表' });
    this.move(tachometer, this.gauges);
    this.move(speedometer, this.gauges);
    this.instruments.appendChild(this.gauges);
    this.move(digitalHud, this.instruments);
    this.telemetry = this.element('div', 'driving-telemetry');
    for (const [label, id, unit] of [
      ['進氣溫度', 'cockpit-intake-temp', '°C'],
      ['增壓', 'cockpit-boost-value', 'bar'],
      ['時速', 'cockpit-speed-value', 'km/h'],
    ]) {
      const item = this.element('div', 'driving-telemetry-item');
      const reading = this.element('div', 'driving-telemetry-reading');
      reading.append(
        this.element('strong', 'driving-telemetry-value', '—', { id }),
        this.element('span', 'driving-telemetry-unit', unit),
      );
      item.append(this.element('span', 'driving-telemetry-label', label), reading);
      this.telemetry.appendChild(item);
    }
    this.instruments.appendChild(this.telemetry);

    this.library = this.element('aside', 'garage-library garage-surface', null, { 'aria-label': '引擎資訊與改裝零件' });
    this.move(metadata, this.library);

    const partsHeading = this.element('div', 'garage-section-heading');
    partsHeading.append(this.element('span', 'garage-eyebrow', 'MODIFICATION BAY'), this.element('h2', '', '改裝零件'));
    this.library.appendChild(partsHeading);
    this.partList = this.element('div', 'garage-part-list');
    for (const part of this.catalog) {
      const row = this.element('button', 'garage-part-row', null, {
        type: 'button', 'data-part': part.id, 'aria-pressed': part.id === this.selectedPart,
      });
      const mark = this.element('span', 'garage-part-mark', PART_MARKS[part.id] || '');
      const copy = this.element('span', 'garage-part-copy');
      const name = this.element('strong', '', part.name);
      const state = this.element('span', 'garage-part-state', '原廠');
      copy.append(name, state);
      row.append(mark, copy, this.element('span', 'garage-part-arrow', '›', { 'aria-hidden': 'true' }));
      this.listen(row, 'click', () => this.selectPart(part.id));
      this.partRows.set(part.id, { row, state });
      this.partList.appendChild(row);
    }
    this.library.appendChild(this.partList);
    this.libraryNote = this.element('p', 'garage-library-note', '選擇零件，查看效果與引擎上的安裝位置。');
    this.library.appendChild(this.libraryNote);

    this.workspace = this.element('section', 'garage-workspace garage-surface garage-view-3d', null, { 'aria-label': '引擎觀察工作區' });
    const stageHeading = this.element('div', 'garage-stage-heading');
    this.modelTitle = this.element('button', 'garage-model-title', '', { type: 'button', title: '返回車款選擇' });
    this.listen(this.modelTitle, 'click', () => {
      this.selectTab('drive');
      doc.getElementById('engine-select')?.focus({ preventScroll: true });
    });
    this.viewSwitch = this.element('div', 'garage-view-switch', null, { 'aria-label': '引擎觀察方式' });
    this.viewButtons = new Map();
    for (const [mode, label] of [['3d', '完整 3D'], ['cutaway', '機械剖面']]) {
      const button = this.element('button', 'garage-view-button', label, {
        type: 'button', 'data-view': mode, 'aria-pressed': mode === this.viewMode,
      });
      this.listen(button, 'click', () => this.setView(mode));
      this.viewButtons.set(mode, button);
      this.viewSwitch.appendChild(button);
    }
    stageHeading.append(this.modelTitle, this.viewSwitch);
    this.workspace.appendChild(stageHeading);
    this.oldCanvas = viewport.querySelector('#engine-canvas');
    this.move(viewport, this.workspace);

    this.canvas = this.element('canvas', 'garage-engine-3d', null, {
      id: 'engine-3d-canvas', role: 'img', 'aria-label': '完整引擎 3D 外觀，可拖曳旋轉並縮放',
    });
    canvasBox.appendChild(this.canvas);
    this.canvas.hidden = false;
    if (this.oldCanvas) this.oldCanvas.hidden = true;
    this.stageStatus = this.element('span', 'garage-stage-status', '完整引擎', { role: 'status' });
    canvasBox.appendChild(this.stageStatus);
    const stageFooter = this.element('div', 'garage-stage-footer');
    this.viewHint = this.element('p', 'garage-view-hint', '拖曳旋轉 · 滾輪／雙指縮放');
    this.resetViewButton = this.element('button', 'garage-quiet-button', '重設視角', { type: 'button' });
    this.listen(this.resetViewButton, 'click', () => this.resetView());
    stageFooter.append(this.viewHint, this.resetViewButton);
    this.workspace.appendChild(stageFooter);
    this.move(doc.querySelector('.slowmo-control-bar'), this.workspace);
    for (const id of ['btn-view-multi', 'btn-view-focus']) {
      this.listen(viewport.querySelector(`#${id}`), 'click', () => this.setView('cutaway'));
    }

    this.inspector = this.element('aside', 'garage-inspector garage-surface', null, { 'aria-label': '零件資訊與設定' });
    for (const tab of TABS) {
      if (tab.id === 'drive') continue;
      const panel = this.element('section', `garage-pane garage-pane-${tab.id}`, null, {
        id: `garage-panel-${tab.id}`, role: 'tabpanel', 'aria-labelledby': `garage-tab-${tab.id}`,
      });
      panel.hidden = tab.id !== this.activeTab;
      if (tab.id !== 'garage') {
        const heading = this.element('div', 'garage-section-heading');
        heading.append(this.element('span', 'garage-eyebrow', tab.label), this.element('h2', '', tab.subtitle));
        panel.appendChild(heading);
      }
      this.panels.set(tab.id, panel);
      this.inspector.appendChild(panel);
    }
    this.buildPartInspector(this.panels.get('garage'));

    // Reuse all original fields, including model/induction-specific hidden sections.
    // Capturing children first avoids skipping nodes as appendChild moves them.
    for (const child of [...tuning.children]) {
      if (child.classList.contains('tuning-header')) continue;
      const sound = child.querySelector('#warmth-slider') || child.querySelector('.exhaust-cards-grid');
      this.move(child, this.panels.get(sound ? 'sound' : 'settings'));
    }
    const exhaustStage = doc.querySelector('.exhaust-stage-card');
    const dyno = doc.querySelector('.dyno-telemetry-card');
    this.move(exhaustStage, this.panels.get('sound'));
    this.move(dyno, this.panels.get('performance'));
    this.move(doc.querySelector('.performance-panel'), this.panels.get('performance'));
    this.cockpit = this.element('section', 'garage-cockpit', null, { 'aria-label': '駕駛操作與即時儀表' });
    this.gearReadout = this.element('div', 'driving-gear-readout');
    this.gearReadout.appendChild(this.element('span', 'driving-gear-label', '檔位'));
    this.move(gearDisplay, this.gearReadout);
    this.gearPosition = this.element('span', 'driving-gear-position', 'N', { id: 'cockpit-gear-position' });
    this.gearReadout.appendChild(this.gearPosition);
    transmission?.insertBefore(this.gearReadout, transmission.childNodes[0] || null);
    this.move(cluster, this.cockpit);
    this.startRow = this.element('div', 'driving-start-row');
    this.move(startButton, this.startRow);
    this.move(engineStatus, this.startRow);
    this.layout.append(this.engineBar, this.instruments, this.library, this.workspace, this.inspector, this.cockpit, this.startRow);
    main.replaceChildren(this.toolbar, this.layout);
    main.classList.add('garage-main');
    doc.body.classList.add('garage-active', 'driving-active');
    this.initialized = true;
    this.selectTab('drive');
    this.renderPartInspector();
    this.update();
    return this;
  }

  buildPartInspector(panel) {
    this.backButton = this.element('button', 'garage-back-button', '‹ 返回零件', { type: 'button' });
    this.listen(this.backButton, 'click', () => { this.layout.dataset.inspect = 'list'; });
    panel.appendChild(this.backButton);
    const heading = this.element('div', 'garage-section-heading');
    this.partTitle = this.element('h2', '', '');
    heading.append(this.element('span', 'garage-eyebrow', 'PART INSPECTOR'), this.partTitle);
    panel.appendChild(heading);
    this.partLocation = this.element('p', 'garage-part-location');
    this.partPurpose = this.element('p', 'garage-part-purpose');
    this.partTradeoff = this.element('p', 'garage-part-tradeoff');
    panel.append(this.partLocation, this.partPurpose, this.partTradeoff);
    this.installLabel = this.element('label', 'garage-install-label', '安裝配置', { for: 'garage-part-option' });
    this.installSelect = this.element('select', 'custom-select garage-part-option', null, { id: 'garage-part-option', 'aria-describedby': 'garage-install-status' });
    this.listen(this.installSelect, 'change', () => this.changePart(this.selectedPart, this.installSelect.value));
    this.installStatus = this.element('p', 'garage-install-status', '', { id: 'garage-install-status', role: 'status', 'aria-live': 'polite' });
    this.focusButton = this.element('button', 'garage-focus-button', '查看安裝位置', { type: 'button' });
    this.listen(this.focusButton, 'click', () => { this.setView('3d', this.selectedPart); });
    panel.append(this.installLabel, this.installSelect, this.installStatus, this.focusButton);
    const installedHeading = this.element('div', 'garage-section-heading garage-installed-heading');
    this.installedCount = this.element('span', 'garage-installed-count', '0 項改裝');
    installedHeading.append(this.element('h3', '', '目前裝備'), this.installedCount);
    panel.appendChild(installedHeading);
    this.installedList = this.element('ul', 'garage-installed-list');
    this.installedItems = new Map();
    for (const part of this.catalog) {
      const item = this.element('li');
      const label = this.element('span', '', part.name);
      const state = this.element('strong', '', '原廠');
      item.append(label, state);
      this.installedList.appendChild(item);
      this.installedItems.set(part.id, { item, state });
    }
    panel.appendChild(this.installedList);
    const summary = this.element('dl', 'garage-output-summary');
    this.outputPower = this.element('dd', '', '—');
    this.outputInertia = this.element('dd', '', '—');
    summary.append(this.element('dt', '', '目前模擬峰值'), this.outputPower, this.element('dt', '', '轉動慣量'), this.outputInertia);
    panel.appendChild(summary);
    panel.appendChild(this.element('p', 'garage-estimate-note', '零件效果為工程估算；原廠配置沿用實車基準。性能分頁可比較同車、同起步條件的成績。'));
  }

  tabKeyDown(event, currentId) {
    const index = TABS.findIndex(tab => tab.id === currentId);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    this.selectTab(TABS[next].id);
    this.tabButtons.get(TABS[next].id)?.focus({ preventScroll: true });
  }

  selectTab(id) {
    if (!TABS.some(tab => tab.id === id)) return;
    const changed = this.activeTab !== id;
    this.activeTab = id;
    if (this.layout) this.layout.dataset.tab = id;
    for (const [key, button] of this.tabButtons) {
      button.setAttribute('aria-selected', String(key === id));
      button.setAttribute('tabindex', key === id ? '0' : '-1');
    }
    for (const [key, panel] of this.panels) panel.hidden = key !== id;
    if (id === 'garage' && this.layout) this.layout.dataset.inspect = 'list';
    if (changed) {
      if (this.inspector) this.inspector.scrollTop = 0;
      if (this.library) this.library.scrollTop = 0;
    }
  }

  selectPart(id) {
    if (!this.catalog.some(part => part.id === id)) return;
    this.selectedPart = id;
    this.statusMessage = '';
    this.selectTab('garage');
    this.layout.dataset.inspect = 'detail';
    if (this.inspector) this.inspector.scrollTop = 0;
    this.renderPartInspector();
    this.setView('3d', this.supported(id) ? id : null);
    this.update(true);
  }

  unavailableReason(id) {
    if (id === 'camshaft' && this.engine?.config?.layout === 'rotary') return '轉子以進排氣口控制換氣，沒有活塞式凸輪。';
    if (id === 'camshaft' && this.engine?.config?.layout === 'radial') return '星型引擎使用不同的配氣機構，此套件不適用。';
    if (id === 'intercooler') return '增壓冷卻器只適用 Turbo 或機械增壓。';
    if (id === 'pulley') return '請先選擇 Roots／TVS 機械增壓；Turbo 不由皮帶驅動。';
    return '目前引擎配置不支援此套件。';
  }

  supported(id) {
    return Boolean(this.engine?.config && isModificationSupported(this.engine.config, this.engine.forcedInduction, id));
  }

  canInstall() {
    return !this.pending && !this.engine?.isIgnitionOn && Math.abs(Number(this.drive?.speedKmh) || 0) <= 1;
  }

  installationLocation(part) {
    const layout = this.engine?.config?.layout;
    const induction = this.engine?.forcedInduction;
    if (part.id === 'headers' && layout === 'rotary') return '轉子側殼排氣口至集管';
    if (part.id === 'headers' && layout === 'radial') return '各汽缸排氣口與後方環形集管';
    if (part.id === 'headers' && induction === 'turbo') return '排氣口至渦輪熱端前的集管';
    if (part.id === 'intake' && induction === 'turbo') return '空濾、進氣管與渦輪壓縮機入口';
    if (part.id === 'intake' && induction === 'supercharger') return '空濾與節氣門至機械增壓器入口';
    if (part.id === 'intake' && layout === 'radial') return '化油器／TBI 入口與集氣管';
    if (part.id === 'flywheel' && layout === 'radial') return '曲軸輸出與減速負載側（有效慣量示意）';
    if (part.id === 'flywheel' && this.engine?.config?.vehicleKind === 'motorcycle') return '曲軸旋轉負載／離合器側，開罩觀察';
    if (part.id === 'intercooler' && induction === 'supercharger') return '機械增壓器出口至進氣歧管之間的冷卻核心';
    return part.mount;
  }

  renderPartInspector() {
    const part = this.catalog.find(candidate => candidate.id === this.selectedPart);
    if (!part || !this.partTitle) return;
    setText(this.partTitle, part.name);
    setText(this.partLocation, `安裝位置 · ${this.installationLocation(part)}`);
    // A turbo exhaust manifold is upstream of the turbine. Do not present an
    // NA long-tube header as if it were a stock-fit turbo part.
    const turboHeader = part.id === 'headers' && this.engine?.forcedInduction === 'turbo';
    setText(this.partPurpose, turboHeader ? '縮短渦輪前排氣路徑、降低流動壓損；此配置使用渦輪集管，與自然進氣長管頭段不同。' : part.purpose);
    setText(this.partTradeoff, `取捨 · ${part.tradeoff}`);
    this.installSelect.replaceChildren();
    for (const option of part.options) {
      const label = turboHeader && option.value !== 'stock' ? '低阻渦輪集管' : option.label;
      const node = this.element('option', '', label, { value: option.value });
      this.installSelect.appendChild(node);
    }
    this.installSelect.value = this.engine?.modifications?.[part.id] || 'stock';
    for (const [id, { row }] of this.partRows) row.setAttribute('aria-pressed', String(id === part.id));
    this.signature = '';
  }

  async changePart(id, value) {
    const part = this.catalog.find(candidate => candidate.id === id);
    if (!part?.options.some(option => option.value === value)) return;
    if (!this.canInstall() || !this.supported(id)) {
      this.statusMessage = this.supported(id) ? '請停車並熄火後再安裝零件。' : this.unavailableReason(id);
      this.update(true);
      return;
    }
    if (!this.onModificationChange) {
      this.statusMessage = '改裝操作尚未連接，請重新整理頁面。';
      this.update(true);
      return;
    }
    this.pending = true;
    this.statusMessage = '安裝中…';
    this.update(true);
    try {
      const result = await this.onModificationChange(id, value);
      this.statusMessage = result === false ? '未完成安裝，請確認車輛已停妥並熄火。' : '已套用配置；啟動後可比較升降轉與輸出。';
      if (result !== false) this.setView('3d', id);
    } catch (error) {
      this.statusMessage = '安裝未完成，原配置已保留。';
      console.error('Garage part installation failed', error);
    } finally {
      this.pending = false;
      this.update(true);
    }
  }

  setView(mode, focus = null) {
    if (!['3d', 'cutaway'].includes(mode)) return;
    if (mode === '3d' && this.viewButtons.get('3d')?.disabled) return;
    this.viewMode = mode;
    this.workspace?.classList.toggle('garage-view-3d', mode === '3d');
    this.workspace?.classList.toggle('garage-view-cutaway', mode === 'cutaway');
    if (this.canvas) this.canvas.hidden = mode !== '3d';
    if (this.oldCanvas) this.oldCanvas.hidden = mode === '3d';
    for (const [key, button] of this.viewButtons || []) button.setAttribute('aria-pressed', String(key === mode));
    setText(this.viewHint, mode === '3d' ? '拖曳旋轉 · 滾輪／雙指縮放' : '觀察四行程 · 慢動作只改變動畫速度');
    const part = this.catalog.find(candidate => candidate.id === focus);
    setText(this.stageStatus, mode === 'cutaway' ? '機械剖面' : part ? `安裝位置 · ${part.name}` : '完整引擎');
    this.emitView({ focus });
  }

  emitView(extra = {}) {
    this.onViewChange?.({ mode: this.viewMode, focus: null, ...extra });
  }

  resetView() {
    setText(this.stageStatus, this.viewMode === 'cutaway' ? '機械剖面' : '完整引擎');
    this.emitView({ focus: null, reset: true });
  }

  set3DAvailable(available, message = '') {
    const button = this.viewButtons?.get('3d');
    if (button) { button.disabled = !available; button.title = message; }
    if (!available) {
      this.setView('cutaway');
      setText(this.stageStatus, message || '此裝置使用機械剖面');
    }
    this.update(true);
  }

  update(force = false) {
    if (!this.initialized) return;
    const mods = this.engine?.modifications || {};
    const signature = JSON.stringify([this.engine?.config?.id, this.engine?.forcedInduction, mods,
      this.canInstall(), this.pending, this.selectedPart, this.statusMessage]);
    if (force || signature !== this.signature) {
      const supported = this.supported(this.selectedPart);
      const selected = mods[this.selectedPart] || 'stock';
      const configChanged = this.lastConfig !== this.engine?.config?.id;
      if (this.lastInduction !== this.engine?.forcedInduction || configChanged) {
        this.renderPartInspector();
        this.lastInduction = this.engine?.forcedInduction;
        this.lastConfig = this.engine?.config?.id;
        this.statusMessage = '';
        if (configChanged && this.viewMode === '3d') this.setView('3d');
      }
      this.installSelect.value = selected;
      this.installSelect.disabled = !supported || !this.canInstall();
      this.focusButton.disabled = !supported || Boolean(this.viewButtons.get('3d')?.disabled);
      const status = !supported ? this.unavailableReason(this.selectedPart)
        : this.pending ? '安裝中…' : !this.canInstall() ? '請停車並熄火後安裝；可先查看零件與位置。'
        : this.statusMessage || '停車且已熄火，可以更換零件。';
      setText(this.installStatus, status);
      this.installStatus.classList.toggle('garage-install-locked', !supported || !this.canInstall());
      let count = 0;
      for (const part of this.catalog) {
        const value = mods[part.id] || 'stock';
        const available = this.supported(part.id);
        const option = part.options.find(candidate => candidate.value === value) || part.options[0];
        const row = this.partRows.get(part.id);
        const installed = this.installedItems.get(part.id);
        const isModified = available && value !== 'stock';
        if (isModified) count++;
        const caption = available ? option.label : '此配置不適用';
        setText(row.state, caption);
        row.row.classList.toggle('garage-part-unavailable', !available);
        row.row.classList.toggle('garage-part-installed', isModified);
        setText(installed.state, caption);
        installed.item.classList.toggle('garage-part-installed', isModified);
      }
      setText(this.installedCount, `${count} 項改裝`);
      setText(this.libraryNote, this.canInstall() ? '選擇零件，查看效果與引擎上的安裝位置。' : '運轉中可觀察零件；更換零件前請停車並熄火。');
      setText(this.modelTitle, this.engine?.config?.representativeModel || this.engine?.config?.name || '引擎工作區');
      this.signature = signature;
    }
    const hp = Number(this.engine?.dynoData?.maxHp);
    const torque = Number(this.engine?.dynoData?.maxTorque);
    const inertia = Number(this.engine?.inertia);
    const displacement = Number(this.engine?.displacement ?? this.engine?.config?.defaultDisplacement);
    setText(this.displacementValue, Number.isFinite(displacement) && displacement > 0 ? `${Math.round(displacement)} cc` : '—');
    setText(this.peakHpValue, Number.isFinite(hp) ? `${hp.toFixed(0)} HP` : '—');
    setText(this.outputPower, Number.isFinite(hp) && Number.isFinite(torque) ? `${hp.toFixed(0)} HP · ${torque.toFixed(0)} Nm` : '—');
    setText(this.outputInertia, Number.isFinite(inertia) ? `${inertia.toFixed(3)} kg·m²` : '—');
  }

  destroy() {
    if (!this.initialized) return;
    for (const { node, event, callback } of this.listeners) node.removeEventListener(event, callback);
    for (const { node, parent, next } of [...this.moves].reverse()) {
      if (!parent) continue;
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    this.canvas?.remove();
    this.stageStatus?.remove();
    this.gearReadout?.remove();
    if (this.oldCanvas) this.oldCanvas.hidden = false;
    this.main.replaceChildren(...this.originalChildren);
    this.main.classList.remove('garage-main');
    this.document.body.classList.remove('garage-active', 'driving-active');
    this.initialized = false;
    this.listeners = [];
    this.moves = [];
    this.partRows.clear();
    this.tabButtons.clear();
    this.panels.clear();
    this.signature = '';
  }
}
