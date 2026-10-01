// InputManager.js
// Handles keyboard inputs, customizable keybindings, touch/mouse pedal controls,
// paddle shifters, and transmission mode selectors.

export class InputManager {
  constructor(drivetrain, onStartEngine) {
    this.drivetrain = drivetrain;
    this.onStartEngine = onStartEngine;

    // Default keybindings (using event.code)
    this.keybindings = {
      throttle: 'KeyW',
      brake: 'KeyS',
      shiftUp: 'KeyE',
      shiftDown: 'KeyQ',
      startEngine: 'KeyX'
    };

    // Load custom keybindings from localStorage if available
    this.loadCustomKeybindings();

    // Input States
    this.keysPressed = new Set();
    this.isThrottlePressed = false;
    this.isBrakePressed = false;
    this.manualThrottleSlider = 0; // 0 to 1
    this.controlsPaused = false;

    // Key rebinding state
    this.bindingTarget = null; // 'throttle', 'brake', 'shiftUp', 'shiftDown', 'startEngine'

    this.setupListeners();
  }

  loadCustomKeybindings() {
    try {
      const saved = localStorage.getItem('hyperengine_keybindings');
      if (saved) {
        const parsed = JSON.parse(saved);
        const bindings = { ...this.keybindings };
        for (const action of Object.keys(bindings)) {
          if (typeof parsed?.[action] === 'string' && /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(parsed[action])) {
            bindings[action] = parsed[action];
          }
        }
        if (new Set(Object.values(bindings)).size === Object.keys(bindings).length) this.keybindings = bindings;
      }
    } catch (e) {
      console.warn('Failed to load keybindings from localStorage', e);
    }
  }

  saveCustomKeybindings() {
    try {
      localStorage.setItem('hyperengine_keybindings', JSON.stringify(this.keybindings));
    } catch (e) {
      console.warn('Failed to save keybindings', e);
    }
  }

  setupListeners() {
    // Global Keyboard Listeners
    window.addEventListener('keydown', (e) => {
      // If currently listening for a key rebind:
      if (this.bindingTarget) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        // Swap conflicting bindings instead of assigning two actions to one key.
        const previous = this.keybindings[this.bindingTarget];
        const conflict = Object.keys(this.keybindings).find(key => key !== this.bindingTarget && this.keybindings[key] === e.code);
        if (conflict) this.keybindings[conflict] = previous;
        this.keybindings[this.bindingTarget] = e.code;
        this.saveCustomKeybindings();
        if (this.onBindingChanged) {
          this.onBindingChanged(this.bindingTarget, e.code);
        }
        this.bindingTarget = null;
        return;
      }

      if (this.controlsPaused || e.target?.isContentEditable
        || e.target?.matches?.('select, textarea, input:not([type="range"]):not([type="button"])')) return;
      const repeated = e.repeat || this.keysPressed.has(e.code);
      this.keysPressed.add(e.code);

      // Check shift actions (trigger once per press)
      if (e.code === this.keybindings.shiftUp) {
        e.preventDefault();
        if (!repeated) this.drivetrain.shiftUp();
      } else if (e.code === this.keybindings.shiftDown) {
        e.preventDefault();
        if (!repeated) this.drivetrain.shiftDown();
      } else if (e.code === this.keybindings.startEngine) {
        e.preventDefault();
        if (!repeated && this.onStartEngine) this.onStartEngine();
      } else if (e.code === this.keybindings.throttle || e.code === this.keybindings.brake) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);
    });

    // Window blur safety
    window.addEventListener('blur', () => {
      this.releaseHeldControls();
    });
  }

  // Get current continuous throttle value (0.0 to 1.0)
  getThrottle() {
    if (this.controlsPaused) return 0;
    const isKeyDown = this.keysPressed.has(this.keybindings.throttle);
    return (isKeyDown || this.isThrottlePressed) ? 1.0 : this.manualThrottleSlider;
  }

  // Get current continuous brake value (0.0 to 1.0)
  getBrake() {
    if (this.controlsPaused) return 0;
    const isKeyDown = this.keysPressed.has(this.keybindings.brake);
    return (isKeyDown || this.isBrakePressed) ? 1.0 : 0.0;
  }

  // Start listening to rebind a specific action
  startRebinding(action, onDone) {
    this.releaseHeldControls();
    this.bindingTarget = action;
    this.onBindingChanged = onDone;
  }

  cancelRebinding() {
    this.bindingTarget = null;
  }

  releaseHeldControls() {
    this.keysPressed.clear();
    this.isThrottlePressed = false;
    this.isBrakePressed = false;
  }

  getKeyDisplayName(code) {
    if (!code) return '未設定';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return '空白鍵 (Space)';
    if (code === 'ArrowUp') return '上箭頭 (↑)';
    if (code === 'ArrowDown') return '下箭頭 (↓)';
    if (code === 'ArrowLeft') return '左箭頭 (←)';
    if (code === 'ArrowRight') return '右箭頭 (→)';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift 鍵';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl 鍵';
    return code;
  }
}
