// app.js
// Main application controller integrating Physics, Audio, Visuals, and User Controls

import { ENGINE_CONFIGS } from './physics/EngineConfigurations.js';
import { EXHAUST_MODELS } from './audio/ExhaustModels.js';
import { EngineModel } from './physics/EngineModel.js';
import { Drivetrain } from './physics/Drivetrain.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { EngineRenderer } from './visuals/EngineRenderer.js';
import { GaugeRenderer } from './visuals/GaugeRenderer.js';
import { InputManager } from './controls/InputManager.js';

class App {
  constructor() {
    // 1. Initialize Physics & Audio models
    this.engine = new EngineModel('i4_flat', 'akrapovic');
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

    // AMT Gear buttons (-1, 0, 1..6)
    const amtBtns = document.querySelectorAll('.amt-gear-btn');
    amtBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.drivetrain.setAmtGear(Number(btn.dataset.gear));
      });
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
        dispVal.textContent = `${this.engine.displacement} cc`;
        this.updateDynoOverview();
      });
    }

    const redlineSlider = document.getElementById('redline-slider');
    const redlineVal = document.getElementById('redline-val');
    if (redlineSlider && redlineVal) {
      redlineSlider.value = this.engine.redlineRPM;
      redlineVal.textContent = `${this.engine.redlineRPM} RPM`;
      redlineSlider.addEventListener('input', (e) => {
        this.engine.setRedlineRPM(e.target.value);
        redlineVal.textContent = `${e.target.value} RPM`;
        this.updateDynoOverview();
      });
    }

    const massSlider = document.getElementById('vehicle-mass-slider');
    if (massSlider) {
      massSlider.addEventListener('input', e => {
        this.drivetrain.setVehicleMass(e.target.value);
        this.updateVehicleLoad();
      });
    }
    this.updateVehicleLoad();

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
    this.updateDynoOverview();
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
    this.updateDynoOverview();

    // Update displacement & redline sliders to match defaults
    const dispSlider = document.getElementById('displacement-slider');
    const dispVal = document.getElementById('displacement-val');
    if (dispSlider && dispVal) {
      dispSlider.min = this.engine.config.minDisplacement;
      dispSlider.max = this.engine.config.maxDisplacement;
      dispSlider.value = this.engine.displacement;
      dispVal.textContent = `${this.engine.displacement} cc`;
    }

    const redlineSlider = document.getElementById('redline-slider');
    const redlineVal = document.getElementById('redline-val');
    if (redlineSlider && redlineVal) {
      redlineSlider.value = this.engine.redlineRPM;
      redlineVal.textContent = `${this.engine.redlineRPM} RPM`;
    }
  }

  selectExhaust(exhaustId) {
    this.engine.setExhaust(exhaustId);
    this.sound.setExhaustModel(this.engine.exhaust);
    this.updateDynoOverview();
  }

  updateVehicleLoad() {
    const slider = document.getElementById('vehicle-mass-slider');
    const label = document.getElementById('vehicle-mass-val');
    if (slider) slider.value = this.drivetrain.vehicleMass;
    if (label) label.textContent = `${this.drivetrain.vehicleMass} kg`;
  }

  selectTransmissionMode(mode) {
    this.drivetrain.setMode(mode);

    // Show/hide relevant controls
    const atControls = document.getElementById('at-controls');
    const amtControls = document.getElementById('amt-controls');

    if (atControls) atControls.style.display = mode === 'at' ? 'flex' : 'none';
    if (amtControls) amtControls.style.display = mode === 'amt' ? 'flex' : 'none';
  }

  updateEngineDescription() {
    const descEl = document.getElementById('engine-desc-text');
    const tagLayout = document.getElementById('tag-layout');
    const tagCyls = document.getElementById('tag-cylinders');
    const tagSound = document.getElementById('tag-sound');

    if (descEl) descEl.textContent = this.engine.config.description;
    if (tagLayout) tagLayout.textContent = `${this.engine.config.layout.toUpperCase()} 架構`;
    if (tagCyls) tagCyls.textContent = `${this.engine.config.cylinders} 汽缸`;
    if (tagSound) tagSound.textContent = `聲浪風格: ${this.engine.config.soundCharacter}`;
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

    if (btnOpenModal && modal) {
      btnOpenModal.addEventListener('click', () => {
        this.input.controlsPaused = true;
        this.input.releaseHeldControls();
        modal.classList.add('visible');
        this.renderKeybindingList();
      });
    }

    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => {
        modal.classList.remove('visible');
        this.input.cancelRebinding();
        this.input.controlsPaused = false;
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
          this.sound.playBackfirePop(pop.intensity, pop.hasFlame, pop.isLimiterPop, when, isShift);
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
    }
    if (brakePedal) {
      if (this.drivetrain.brakeInput > 0.05) brakePedal.classList.add('active');
      else brakePedal.classList.remove('active');
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
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
