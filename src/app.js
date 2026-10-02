// app.js
// Main application controller integrating Physics, Audio, Visuals, and User Controls

import { ENGINE_CONFIGS } from './physics/EngineConfigurations.js';
import { EXHAUST_MODELS } from './audio/ExhaustModels.js';
import { EngineModel } from './physics/EngineModel.js';
import { Drivetrain } from './physics/Drivetrain.js';
import { VEHICLE_PROFILES } from './physics/VehicleProfiles.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { EngineRenderer } from './visuals/EngineRenderer.js';
import { GaugeRenderer } from './visuals/GaugeRenderer.js';
import { InputManager } from './controls/InputManager.js';

export class App {
  constructor() {
    // 1. Initialize Physics & Audio models
    this.engine = new EngineModel('i4_flat', 'oem');
    this.drivetrain = new Drivetrain(this.engine);
    this.sound = new SoundEngine();

    // 2. Canvases
    this.engineCanvas = document.getElementById('engine-canvas');
    this.tachoCanvas = document.getElementById('tachometer-canvas');
    this.exhaustCanvas = document.getElementById('exhaust-canvas');

    this.engineRenderer = new EngineRenderer(this.engineCanvas);
    this.gaugeRenderer = new GaugeRenderer(this.tachoCanvas, this.exhaustCanvas);

    // 3. User Controls
    this.input = new InputManager(this.drivetrain, () => this.toggleEnginePower());

    // 4. State
    this.isEngineRunning = false;
    this.powerChanging = false;
    this.lastTime = performance.now();

    // 5. Setup UI & Event Listeners
    this.initUI();

    // 6. Start Main Animation Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  async toggleEnginePower() {
    if (this.powerChanging) return;
    const button = document.getElementById('btn-start-engine');
    this.powerChanging = true;
    if (button) button.disabled = true;
    try {
      const running = !this.isEngineRunning;
      if (running) {
        await this.sound.init();
        this.sound.setEngineConfig(this.engine.config);
        this.sound.setExhaustModel(this.engine.exhaust);
      }
      this.engine.setRunning(running);
      this.drivetrain.resetShift();
      this.isEngineRunning = running;
      if (running) this.sound.update(this.engine.snapshot(), this.engine.config);
      this.sound.setRunning(running);
      this.updatePowerButtonUI(running);
      this.drivetrain.lastShiftMessage = '';
    } catch (error) {
      console.error('Audio initialization failed', error);
      this.drivetrain.lastShiftMessage = '聲音啟動失敗，請再按一次啟動引擎';
    } finally {
      this.powerChanging = false;
      if (button) button.disabled = false;
    }
  }

  updatePowerButtonUI(running) {
    const btn = document.getElementById('btn-start-engine');
    const statusText = document.getElementById('engine-status-badge');
    if (!btn || !statusText) return;

    if (running) {
      btn.classList.add('running');
      btn.innerHTML = `
        <span class="pulse-ring"></span>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
        <span>引擎運轉中 (STOP)</span>
      `;
      statusText.textContent = 'ENGINE ACTIVE';
      statusText.className = 'status-badge active';
    } else {
      btn.classList.remove('running');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
        <span>啟動引擎 (START)</span>
      `;
      statusText.textContent = 'STANDBY';
      statusText.className = 'status-badge standby';
    }
  }

  initUI() {
    // Start Engine Button
    const startBtn = document.getElementById('btn-start-engine');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggleEnginePower());
    }

    // Engine Selection Dropdown
    const engineSelect = document.getElementById('engine-select');
    if (engineSelect) {
      engineSelect.innerHTML = '';
      for (let key in ENGINE_CONFIGS) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${ENGINE_CONFIGS[key].name} (${ENGINE_CONFIGS[key].cylinders}缸)`;
        if (key === 'i4_flat') opt.selected = true;
        engineSelect.appendChild(opt);
      }

      engineSelect.addEventListener('change', (e) => {
        this.selectEngineConfig(e.target.value);
      });
    }

    // Exhaust System Cards Selection
    const exhaustCards = document.querySelectorAll('.exhaust-card');
    exhaustCards.forEach(card => {
      card.addEventListener('keydown', event => {
        if (event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          card.click();
        }
      });
      card.addEventListener('click', () => {
        exhaustCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const exhaustId = card.dataset.exhaust;
        this.selectExhaust(exhaustId);
      });
    });

    // Transmission Mode Buttons
    const transBtns = document.querySelectorAll('.trans-btn');
    transBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        transBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.selectTransmissionMode(mode);
      });
    });

    // AT Selector buttons (P, R, N, D)
    const atBtns = document.querySelectorAll('.at-btn');
    atBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.drivetrain.setAtSelector(btn.dataset.pos);
      });
    });

    // Delegation supports each reference vehicle's actual number of gears.
    document.querySelector('.amt-shifter')?.addEventListener('click', event => {
      const button = event.target.closest('.amt-gear-btn');
      if (button) this.drivetrain.setAmtGear(Number(button.dataset.gear));
    });

    // Paddle Shifters (+ / -)
    const paddleLeft = document.getElementById('paddle-left');
    const paddleRight = document.getElementById('paddle-right');
    if (paddleLeft) {
      paddleLeft.addEventListener('click', () => this.drivetrain.shiftDown());
    }
    if (paddleRight) {
      paddleRight.addEventListener('click', () => this.drivetrain.shiftUp());
    }

    // Sound Character Profile Buttons (Deep / Screamer / Muscle)
    const profileBtns = document.querySelectorAll('.sound-profile-btn');
    profileBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        profileBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const profile = btn.dataset.profile;
        this.sound.setSoundProfile(profile);
      });
    });

    // Tone Warmth / Anti-Harshness Low-Pass Slider
    const warmthSlider = document.getElementById('warmth-slider');
    const warmthVal = document.getElementById('warmth-val');
    if (warmthSlider && warmthVal) {
      warmthSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.sound.setToneWarmth(val / 100);
        let desc = '深沉溫潤';
        if (val >= 90) desc = '極致深沉重低音 (完全無刺耳)';
        else if (val <= 35) desc = '清脆高轉';
        else if (val <= 65) desc = '均衡原音';
        warmthVal.textContent = `${val}% (${desc})`;
      });
    }

    // Sliders: Displacement & Redline
    const dispSlider = document.getElementById('displacement-slider');
    const dispVal = document.getElementById('displacement-val');
    if (dispSlider && dispVal) {
      dispSlider.min = this.engine.config.minDisplacement;
      dispSlider.max = this.engine.config.maxDisplacement;
      dispSlider.value = this.engine.displacement;
      dispVal.textContent = `${this.engine.displacement} cc`;
      dispSlider.addEventListener('input', (e) => {
        this.engine.setDisplacement(e.target.value);
        this.syncTuningUI();
      });
    }

    const redlineSlider = document.getElementById('redline-slider');
    const redlineVal = document.getElementById('redline-val');
    if (redlineSlider && redlineVal) {
      redlineSlider.addEventListener('input', (e) => {
        this.engine.setRedlineRPM(e.target.value);
        this.syncTuningUI();
      });
    }

    const massSlider = document.getElementById('vehicle-mass-slider');
    if (massSlider) {
      massSlider.addEventListener('input', e => {
        this.drivetrain.setVehicleMass(e.target.value);
        this.updateVehicleLoad();
        this.updateReferenceStatus();
      });
    }
    this.updateVehicleLoad();

    // Forced Induction Selection (NA, Turbo, Supercharger)
    const inductionBtns = document.querySelectorAll('.induction-btn');
    inductionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const indType = btn.dataset.induction;
        this.engine.setForcedInduction(indType);
        this.syncTuningUI();
      });
    });

    document.querySelectorAll('.turbo-size-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.engine.setTurboSize(button.dataset.turboSize);
        this.syncTuningUI();
      });
    });

    // BOV Type Selection (Vent Pshhh vs Flutter 貓叫聲)
    const bovBtns = document.querySelectorAll('.bov-btn');
    bovBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.engine.setBovType(btn.dataset.bov);
        this.syncTuningUI();
      });
    });

    // Boost Pressure Slider (Supported for both Turbo and Supercharger)
    const boostSlider = document.getElementById('boost-slider');
    if (boostSlider) {
      boostSlider.addEventListener('input', (e) => {
        const bar = Number(e.target.value) / 100;
        this.engine.setMaxBoost(bar);
        this.syncTuningUI();
      });
    }


    // Throttle Slider (continuous hold)
    const throttleSlider = document.getElementById('throttle-slider');
    const throttleVal = document.getElementById('throttle-val');
    if (throttleSlider && throttleVal) {
      throttleSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.input.manualThrottleSlider = val / 100;
        throttleVal.textContent = `${val}%`;
      });
    }

    // Touch/Mouse Interactive Pedals (Gas & Brake)
    const gasPedal = document.getElementById('pedal-gas');
    const brakePedal = document.getElementById('pedal-brake');

    const handlePedal = (element, onPress, onRelease) => {
      if (!element) return;
      element.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        element.setPointerCapture(e.pointerId);
        onPress();
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        element.addEventListener(event, onRelease);
      }
      window.addEventListener('blur', onRelease);
      element.addEventListener('keydown', event => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          onPress();
        }
      });
      element.addEventListener('keyup', event => {
        if (event.code === 'Space' || event.code === 'Enter') onRelease();
      });
      element.addEventListener('blur', onRelease);
    };

    handlePedal(gasPedal, () => {
      this.input.isThrottlePressed = true;
      gasPedal.classList.add('pressed');
    }, () => {
      this.input.isThrottlePressed = false;
      gasPedal.classList.remove('pressed');
    });

    handlePedal(brakePedal, () => {
      this.input.isBrakePressed = true;
      brakePedal.classList.add('pressed');
    }, () => {
      this.input.isBrakePressed = false;
      brakePedal.classList.remove('pressed');
    });

    // View Mode Toggle (Multi vs Focused)
    const btnViewMulti = document.getElementById('btn-view-multi');
    const btnViewFocus = document.getElementById('btn-view-focus');
    if (btnViewMulti && btnViewFocus) {
      btnViewMulti.addEventListener('click', () => {
        btnViewMulti.classList.add('active');
        btnViewFocus.classList.remove('active');
        this.engineRenderer.setViewMode('multi');
      });
      btnViewFocus.addEventListener('click', () => {
        btnViewFocus.classList.add('active');
        btnViewMulti.classList.remove('active');
        this.engineRenderer.setViewMode('focused');
      });
    }

    // Clean Animation Mode Toggle (Hide text annotations on canvas)
    const btnToggleClean = document.getElementById('btn-toggle-clean');
    if (btnToggleClean) {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        btnToggleClean.classList.add('active');
        this.engineRenderer.setCleanMode(true);
      }
      btnToggleClean.addEventListener('click', () => {
        const isClean = this.engineRenderer.toggleCleanMode();
        btnToggleClean.classList.toggle('active', isClean);
      });
    }

    // Slow-Motion Speed Controls for Engine Mechanical View
    const slowmoBtns = document.querySelectorAll('.slowmo-btn');
    const slowmoSlider = document.getElementById('slowmo-slider');
    const slowmoBadge = document.getElementById('slowmo-badge');

    const updateSlowmoSpeed = (speed) => {
      this.engineRenderer.setAnimationSpeed(speed);
      if (slowmoBadge) {
        slowmoBadge.textContent = `${speed.toFixed(2)}x ${speed < 0.95 ? '(慢速觀察)' : '(即時速度)'}`;
        if (speed < 0.95) slowmoBadge.classList.add('active');
        else slowmoBadge.classList.remove('active');
      }
      if (slowmoSlider) {
        slowmoSlider.value = Math.round(speed * 100);
      }
      slowmoBtns.forEach(b => {
        if (Math.abs(Number(b.dataset.speed) - speed) < 0.05) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    };

    slowmoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        updateSlowmoSpeed(Number(btn.dataset.speed));
      });
    });

    if (slowmoSlider) {
      slowmoSlider.addEventListener('input', (e) => {
        updateSlowmoSpeed(Number(e.target.value) / 100);
      });
    }

    // Keybindings Modal
    this.initKeybindingsUI();

    // Volume slider
    const volSlider = document.getElementById('master-volume');
    if (volSlider) {
      this.sound.setVolume(Number(volSlider.value) / 100);
      volSlider.addEventListener('input', (e) => {
        this.sound.setVolume(Number(e.target.value) / 100);
      });
    }

    // Initial specs presentation
    this.updateEngineDescription();
    this.syncTuningUI();
    this.updateKeyHints();
  }

  selectEngineConfig(configId) {
    // Reconfigure in neutral without discarding the vehicle's momentum.
    if (this.drivetrain.mode === 'at') this.drivetrain.setAtSelector('N');
    else this.drivetrain.setAmtGear(0);
    this.engine.setConfig(configId);
    this.drivetrain.configureVehicle();
    this.updateVehicleLoad();
    this.sound.setEngineConfig(this.engine.config);
    this.updateEngineDescription();
    this.syncTuningUI();
  }

  // All tuning controls are views of model state, including after preset changes.
  syncTuningUI() {
    const config = this.engine.config;
    const dispSlider = document.getElementById('displacement-slider');
    const dispVal = document.getElementById('displacement-val');
    if (dispSlider && dispVal) {
      dispSlider.min = config.minDisplacement;
      dispSlider.max = config.maxDisplacement;
      dispSlider.step = 0.1;
      dispSlider.value = this.engine.displacement;
      dispVal.textContent = `${this.engine.displacement} cc`;
    }

    const redlineSlider = document.getElementById('redline-slider');
    const redlineVal = document.getElementById('redline-val');
    if (redlineSlider && redlineVal) {
      redlineSlider.min = config.minRedlineRPM ?? Math.max(config.defaultIdleRPM + 500, Math.floor(config.defaultRedlineRPM * 0.65 / 100) * 100);
      redlineSlider.max = config.maxRedlineRPM ?? Math.ceil(config.defaultRedlineRPM * 1.25 / 100) * 100;
      redlineSlider.step = 50;
      redlineSlider.value = this.engine.redlineRPM;
      redlineVal.textContent = `${this.engine.redlineRPM} RPM`;
    }

    const induction = this.engine.forcedInduction;
    for (const button of document.querySelectorAll('.induction-btn')) {
      const selected = button.dataset.induction === induction;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    for (const button of document.querySelectorAll('.turbo-size-btn')) {
      const selected = button.dataset.turboSize === this.engine.turboSize;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    for (const button of document.querySelectorAll('.bov-btn')) {
      const selected = button.dataset.bov === this.engine.bovType;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const panel = document.getElementById('turbo-controls-panel');
    if (panel) panel.style.display = induction === 'na' ? 'none' : 'block';
    for (const row of document.querySelectorAll('.bov-selection-row, .turbo-size-row')) {
      row.style.display = induction === 'turbo' ? 'flex' : 'none';
    }
    const scNote = document.getElementById('supercharger-note');
    if (scNote) scNote.hidden = induction !== 'supercharger';
    const slider = document.getElementById('boost-slider');
    if (slider) {
      slider.min = 30;
      slider.max = 300;
      slider.value = Math.round(this.engine.maxBoost * 100);
    }
    const boost = document.getElementById('boost-val');
    if (boost) boost.textContent = `+${this.engine.maxBoost.toFixed(2)} bar`;
    const title = document.getElementById('boost-slider-title');
    if (title) title.textContent = induction === 'supercharger' ? 'TVS 全油門目標增壓' : '渦輪目標增壓';
    const badge = document.getElementById('boost-status-badge');
    if (badge) badge.textContent = induction === 'na' ? '自然進氣 (NA)' :
      `${induction === 'turbo' ? `TURBO · ${this.engine.turboSize === 'large' ? '大渦輪' : '小渦輪'}` : 'ROOTS / TVS'} · ${this.engine.maxBoost.toFixed(2)} bar`;
    this.syncGearControls();
    this.updateReferenceStatus();
    this.updateDynoOverview();
  }

  syncGearControls() {
    const group = document.querySelector('.amt-shifter');
    if (!group) return;
    const hasReverse = Boolean(this.drivetrain.gearRatios?.[-1]);
    for (const button of document.querySelectorAll('.at-btn[data-pos="R"]')) {
      button.hidden = !hasReverse;
      button.disabled = !hasReverse;
    }
    const maxGear = this.drivetrain.maxGear ?? Math.max(...Object.keys(this.drivetrain.gearRatios).map(Number));
    const values = [...(hasReverse ? [-1] : []), 0, ...Array.from({ length: maxGear }, (_, index) => index + 1)];
    group.style.gridTemplateColumns = `repeat(${values.length}, minmax(0, 1fr))`;
    group.replaceChildren(...values.map(gear => {
      const button = document.createElement('button');
      button.className = 'amt-gear-btn';
      button.dataset.gear = gear;
      button.textContent = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear);
      button.setAttribute('aria-label', gear === -1 ? '倒檔' : gear === 0 ? '空檔' : `${gear} 檔`);
      button.classList.toggle('active', gear === this.drivetrain.currentGear);
      return button;
    }));
  }

  selectExhaust(exhaustId) {
    this.engine.setExhaust(exhaustId);
    this.sound.setExhaustModel(this.engine.exhaust);
    this.updateDynoOverview();
    this.updateReferenceStatus();
  }

  updateVehicleLoad() {
    const slider = document.getElementById('vehicle-mass-slider');
    const label = document.getElementById('vehicle-mass-val');
    if (slider) {
      slider.min = Math.min(180, this.drivetrain.vehicleMass);
      slider.max = Math.max(3000, this.drivetrain.vehicleMass);
      slider.step = 1;
      slider.value = this.drivetrain.vehicleMass;
    }
    if (label) label.textContent = `${Number(this.drivetrain.vehicleMass.toFixed(1))} kg`;
  }

  selectTransmissionMode(mode) {
    this.drivetrain.setMode(mode);

    // Show/hide relevant controls
    const atControls = document.getElementById('at-controls');
    const amtControls = document.getElementById('amt-controls');

    if (atControls) atControls.style.display = mode === 'at' ? 'flex' : 'none';
    if (amtControls) amtControls.style.display = mode === 'amt' ? 'flex' : 'none';
    this.updateReferenceStatus();
  }

  updateEngineDescription() {
    const descEl = document.getElementById('engine-desc-text');
    const tagLayout = document.getElementById('tag-layout');
    const tagCyls = document.getElementById('tag-cylinders');
    const tagSound = document.getElementById('tag-sound');

    if (descEl) descEl.textContent = this.engine.config.description;
    if (tagLayout) tagLayout.textContent = `${this.engine.config.layout.toUpperCase()} 架構`;
    if (tagCyls) tagCyls.textContent = `${this.engine.config.cylinders} 汽缸`;
    if (tagSound) tagSound.textContent = `聲浪風格: ${this.engine.config.soundCharacter || this.engine.config.shortName}`;
  }

  updateReferenceStatus() {
    const config = this.engine.config;
    const profile = VEHICLE_PROFILES[config.id];
    const label = document.getElementById('reference-model-name');
    const source = document.getElementById('reference-model-source');
    const state = document.getElementById('tuning-state-badge');
    const note = document.getElementById('reference-model-note');
    const transmissionNote = document.getElementById('transmission-context-note');
    const model = config.representativeModel || config.name;
    if (label) label.textContent = config.modelYear && !model.startsWith(String(config.modelYear))
      ? `${config.modelYear} ${model}` : model;
    if (source) {
      source.hidden = !config.referenceSource;
      if (config.referenceSource) source.href = config.referenceSource;
    }
    const isStock = this.engine.displacement === config.defaultDisplacement
      && this.engine.redlineRPM === config.defaultRedlineRPM
      && this.engine.forcedInduction === (config.defaultInduction || 'na')
      && (this.engine.forcedInduction === 'na' || Math.abs(this.engine.maxBoost - (config.defaultBoost || 0)) < 0.001)
      && (this.engine.forcedInduction !== 'turbo' || this.engine.turboSize === (config.defaultTurboSize || 'small'))
      && (this.engine.forcedInduction !== 'turbo' || this.engine.bovType === 'bov')
      && this.engine.exhaust.id === 'oem'
      && Math.abs(this.drivetrain.vehicleMass - (profile?.mass ?? 0)) <= 0.5;
    if (state) state.textContent = isStock ? '原廠基準' : '自訂改裝';
    if (note) note.textContent = config.layout === 'radial'
      ? '航空引擎基準；車速與換檔為實驗負載台模擬。'
      : '原廠數據基準（中間曲線為推估）；改裝輸出為模型估算。';
    if (transmissionNote) {
      transmissionNote.textContent = config.layout === 'radial' ? '實驗負載台，不代表航空傳動。'
        : profile?.transmissionKind === 'manual' ? (this.drivetrain.mode === 'at'
          ? '原車為手排；AT 為模擬操作模式。' : '原車為手排；以自動離合模擬撥片操作。') : '';
      transmissionNote.hidden = !transmissionNote.textContent;
    }
    document.querySelectorAll('.exhaust-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.exhaust === this.engine.exhaust.id);
      card.setAttribute('aria-pressed', String(card.dataset.exhaust === this.engine.exhaust.id));
    });
  }

  updateDynoOverview() {
    const dyno = this.engine.dynoData;
    const peakHpEl = document.getElementById('spec-peak-hp');
    const peakTorqueEl = document.getElementById('spec-peak-torque');

    if (peakHpEl) {
      peakHpEl.textContent = `${dyno.maxHp} HP @ ${dyno.maxHpRPM} RPM`;
    }
    if (peakTorqueEl) {
      peakTorqueEl.textContent = `${dyno.maxTorque} Nm @ ${dyno.maxTorqueRPM} RPM`;
    }
  }

  initKeybindingsUI() {
    const btnOpenModal = document.getElementById('btn-open-keybinds');
    const modal = document.getElementById('keybinds-modal');
    const btnCloseModal = document.getElementById('btn-close-keybinds');
    const closeModal = () => {
      modal.classList.remove('visible');
      this.input.cancelRebinding();
      this.input.controlsPaused = false;
      btnOpenModal?.focus();
    };

    if (btnOpenModal && modal) {
      btnOpenModal.addEventListener('click', () => {
        this.input.controlsPaused = true;
        this.input.releaseHeldControls();
        modal.classList.add('visible');
        this.renderKeybindingList();
        btnCloseModal?.focus();
      });
    }

    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', closeModal);
    }
    if (modal) {
      modal.addEventListener('keydown', event => {
        if (event.code === 'Escape' && !this.input.bindingTarget) {
          event.preventDefault();
          closeModal();
        }
        if (event.code !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      });
    }

    // Reset default keybinds
    const btnReset = document.getElementById('btn-reset-keybinds');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.input.keybindings = {
          throttle: 'KeyW',
          brake: 'KeyS',
          shiftUp: 'KeyE',
          shiftDown: 'KeyQ',
          startEngine: 'KeyX'
        };
        this.input.saveCustomKeybindings();
        this.renderKeybindingList();
      });
    }
  }

  renderKeybindingList() {
    this.updateKeyHints();
    const actions = [
      { id: 'throttle', label: '油門 (Throttle / Rev)' },
      { id: 'brake', label: '煞車 (Brake / Slow Down)' },
      { id: 'shiftUp', label: '升檔 / 撥片 (+) (Shift Up)' },
      { id: 'shiftDown', label: '降檔 / 撥片 (-) (Shift Down)' },
      { id: 'startEngine', label: '啟動 / 熄火 (Start / Stop)' }
    ];

    const listEl = document.getElementById('keybindings-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    actions.forEach(act => {
      const row = document.createElement('div');
      row.className = 'keybind-row';

      const code = this.input.keybindings[act.id];
      const name = this.input.getKeyDisplayName(code);

      row.innerHTML = `
        <span class="keybind-label">${act.label}</span>
        <button class="keybind-btn" data-action="${act.id}">
          <kbd>${name}</kbd>
          <span class="click-hint">點擊修改</span>
        </button>
      `;

      const btn = row.querySelector('.keybind-btn');
      btn.addEventListener('click', () => {
        btn.classList.add('recording');
        btn.querySelector('kbd').textContent = '請按下任一鍵...';
        this.input.startRebinding(act.id, (actionId, newCode) => {
          this.renderKeybindingList();
        });
      });

      listEl.appendChild(row);
    });
  }

  // Main Simulation & Animation Loop (60+ FPS)
  loop(currentTime) {
    const dt = Math.min(0.25, Math.max(0, (currentTime - this.lastTime) / 1000));
    this.lastTime = currentTime;

    // Get input values
    const throttle = this.input.getThrottle();
    const brake = this.input.getBrake();

    // Drivetrain & Engine update
    const drivetrainStatus = this.drivetrain.update(dt, throttle, brake);
    const engineStatus = drivetrainStatus.engine;

    // Web Audio Sound Engine update
    if (this.isEngineRunning) {
      this.sound.update(engineStatus, this.engine.config, drivetrainStatus);

      // Play backfire pops, overrun crackles, and rev-limiter bangs
      if (engineStatus.popEvents && engineStatus.popEvents.length > 0) {
        for (const pop of engineStatus.popEvents) {
          const when = this.sound.ctx.currentTime + Math.max(0, 0.02 - (this.engine.time - pop.timestamp));
          const isShift = pop.kind === 'shift';
          this.sound.playBackfirePop(pop.intensity, pop.hasFlame, pop.isLimiterPop, when, isShift, this.engine.displacement);
        }
      }

      // Play Blow-off valve (BOV) or compressor surge flutter sounds
      if (engineStatus.bovEvents && engineStatus.bovEvents.length > 0) {
        for (const bov of engineStatus.bovEvents) {
          const event = { ...bov, when: this.sound.ctx.currentTime
            - Math.max(0, (engineStatus.simTime ?? this.engine.time) - bov.timestamp) };
          if (bov.type === 'flutter') {
            this.sound.playFlutterSound(event);
          } else {
            this.sound.playBovSound(event);
          }
        }
      }

    }

    // Visual Renderers (Passing dt to enable smooth slow-motion kinematics)
    this.engineRenderer.render(this.engine, this.drivetrain, dt);
    this.gaugeRenderer.render(this.engine, this.drivetrain, dt, engineStatus.popEvents);

    // Update Real-time Telemetry UI
    this.updateTelemetryHUD(engineStatus, drivetrainStatus);

    requestAnimationFrame((t) => this.loop(t));
  }

  updateTelemetryHUD(engineStatus, drivetrainStatus) {
    const shiftMessage = document.getElementById('shift-message');
    if (shiftMessage && shiftMessage.textContent !== drivetrainStatus.message) {
      shiftMessage.textContent = drivetrainStatus.message;
    }
    // Dedicated Supercar Digital Cockpit HUD Screen (Always 100% visible, no needle obstruction)
    const digitalSpeed = document.getElementById('hud-digital-speed');
    const digitalRpm = document.getElementById('hud-digital-rpm');
    if (digitalSpeed) digitalSpeed.textContent = `${drivetrainStatus.speedKmh}`;
    if (digitalRpm) {
      digitalRpm.textContent = `${Math.round(engineStatus.rpm)}`;
      if (engineStatus.isRevLimiting) digitalRpm.classList.add('rev-limiting');
      else digitalRpm.classList.remove('rev-limiting');
    }

    // Sticky In-Viewport Telemetry HUD (Always visible on mobile & desktop sticky canvas)
    const stickySpeed = document.getElementById('sticky-hud-speed');
    const stickyRpm = document.getElementById('sticky-hud-rpm');
    const stickyGear = document.getElementById('sticky-hud-gear');
    const stickyRevFill = document.getElementById('sticky-rev-fill');

    if (stickySpeed) stickySpeed.textContent = `${drivetrainStatus.speedKmh}`;
    if (stickyRpm) {
      stickyRpm.textContent = `${Math.round(engineStatus.rpm)}`;
      if (engineStatus.isRevLimiting) stickyRpm.classList.add('rev-limiting');
      else stickyRpm.classList.remove('rev-limiting');
    }
    if (stickyGear) {
      stickyGear.textContent = drivetrainStatus.gearDisplay;
      stickyGear.className = `sticky-hud-val gear-badge ${drivetrainStatus.currentGear === 0 ? 'neutral' : 'in-gear'}`;
    }
    if (stickyRevFill) {
      const redline = engineStatus.redlineRPM || 10000;
      const ratio = Math.max(0, Math.min(1, engineStatus.rpm / redline));
      stickyRevFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      if (ratio >= 0.90) stickyRevFill.classList.add('redline-flash');
      else stickyRevFill.classList.remove('redline-flash');
    }

    // Current Realtime HP, Torque & Cylinder Pressure
    const liveHpEl = document.getElementById('live-hp-val');
    const liveTorqueEl = document.getElementById('live-torque-val');
    const livePressureEl = document.getElementById('live-pressure-val');
    const specMapEl = document.getElementById('spec-map-val');
    const dyno = engineStatus.dyno;

    if (liveHpEl) liveHpEl.textContent = `${dyno.hp} HP`;
    if (liveTorqueEl) liveTorqueEl.textContent = `${dyno.torque} Nm`;
    if (livePressureEl) {
      const p = engineStatus.peakCylinderPressure || '1.0';
      livePressureEl.textContent = `${p} bar`;
    }
    if (specMapEl) {
      specMapEl.textContent = `${engineStatus.manifoldPressure || '1.00'} bar`;
    }

    // Boost & Turbo / Supercharger Spool Telemetry
    const liveBoostEl = document.getElementById('live-boost-val');
    const liveSpoolEl = document.getElementById('live-spool-val');
    const liveSpoolLabel = document.getElementById('live-spool-label');
    if (liveSpoolLabel) {
      liveSpoolLabel.textContent = engineStatus.forcedInduction === 'supercharger' ? '機械轉速' : '渦輪轉速';
    }
    if (liveBoostEl) {
      if (engineStatus.forcedInduction === 'na') {
        liveBoostEl.textContent = 'NA (0.00 bar)';
      } else {
        liveBoostEl.textContent = `+${(engineStatus.boostPressure || 0).toFixed(2)} bar`;
      }
    }
    if (liveSpoolEl) {
      if (engineStatus.forcedInduction === 'na') {
        liveSpoolEl.textContent = '—';
      } else {
        const rpm = engineStatus.forcedInduction === 'supercharger'
          ? engineStatus.superchargerRPM : engineStatus.turboRPM;
        liveSpoolEl.textContent = `${Math.round(rpm || 0).toLocaleString()} RPM`;
      }
    }

    // Active Gear Display
    const gearEl = document.getElementById('hud-gear-display');
    if (gearEl) {
      gearEl.textContent = drivetrainStatus.gearDisplay;
      gearEl.className = `gear-badge ${drivetrainStatus.currentGear === 0 ? 'neutral' : 'in-gear'}`;
    }

    // Realtime pedal highlight states
    const gasPedal = document.getElementById('pedal-gas');
    const brakePedal = document.getElementById('pedal-brake');
    if (gasPedal) {
      if (engineStatus.throttle > 0.05) gasPedal.classList.add('active');
      else gasPedal.classList.remove('active');
      gasPedal.setAttribute('aria-pressed', String(this.input.isThrottlePressed));
    }
    if (brakePedal) {
      if (this.drivetrain.brakeInput > 0.05) brakePedal.classList.add('active');
      else brakePedal.classList.remove('active');
      brakePedal.setAttribute('aria-pressed', String(this.input.isBrakePressed));
    }

    // Synchronize active gear buttons
    if (drivetrainStatus.mode === 'amt') {
      const amtBtns = document.querySelectorAll('.amt-gear-btn');
      amtBtns.forEach(btn => {
        if (Number(btn.dataset.gear) === drivetrainStatus.currentGear) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } else if (drivetrainStatus.mode === 'at') {
      const atBtns = document.querySelectorAll('.at-btn');
      atBtns.forEach(btn => {
        if (btn.dataset.pos === this.drivetrain.atSelector) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  updateKeyHints() {
    const label = action => this.input.getKeyDisplayName(this.input.keybindings[action]);
    const gas = document.querySelector('#pedal-gas .pedal-key-hint');
    const brake = document.querySelector('#pedal-brake .pedal-key-hint');
    if (gas) gas.textContent = `按住 [${label('throttle')}] 拉轉加速`;
    if (brake) brake.textContent = `按住 [${label('brake')}] 減速降轉`;
    document.getElementById('pedal-gas').title = `按住油門 (${label('throttle')})`;
    document.getElementById('pedal-brake').title = `按住煞車 (${label('brake')})`;
    document.getElementById('btn-start-engine').title = `啟動／熄火 (${label('startEngine')})`;
    document.querySelector('#paddle-left .paddle-sub').textContent = `DOWN (${label('shiftDown')})`;
    document.querySelector('#paddle-right .paddle-sub').textContent = `UP (${label('shiftUp')})`;
    document.getElementById('paddle-left').title = `降檔 (${label('shiftDown')})`;
    document.getElementById('paddle-right').title = `升檔 (${label('shiftUp')})`;
  }
}

// Instantiate on window load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { new App(); });
}
