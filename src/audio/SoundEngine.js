// SoundEngine.js
// Next-Generation Physically-Informed Engine & Exhaust Acoustic Synthesizer
// Inspired by AngeTheGreat engine-sim principles and Antonio-R1 physical modeling:
// 1. Multi-cylinder firing order harmonics & syncopated pulse trains (Crossplane V8 rumble, V10 howl, CP4 rasp, Single-cylinder thump)
// 2. Dynamic load-dependent WaveShaper non-linear saturation (snarl & growl on full throttle, warm purr on decel)
// 3. Multi-stage acoustic cavity formants (Helmholtz sub-bass, manifold collector body, tailpipe metallic rasp)
// 4. Throttle intake induction roar (instant induction bark on throttle press)
// 5. Racing transmission straight-cut gear whine
// 6. Staccato fuel-cut rev limiter bounce & violent overrun backfire pops

import { EXHAUST_MODELS } from './ExhaustModels.js';
import { ENGINE_CONFIGS } from '../physics/EngineConfigurations.js';

export class SoundEngine {
  constructor(contextFactory = null) {
    this.contextFactory = contextFactory;
    this.ctx = null;
    this.isStarted = false;

    // Master Dynamics & Safety
    this.masterGain = null;
    this.compressor = null;
    this.limiterGate = null;

    // WaveShaper Non-linear Saturation
    this.waveShaperNode = null;
    this.saturationDriveGain = null;

    // Acoustic Oscillators & Noise Generators
    this.combustionOsc = null;
    this.harmonicOsc = null;
    this.subBassOsc = null;
    this.camshaftOsc = null; // Half-order / syncopation oscillator for V8, CP4, V2
    this.gearWhineOsc = null; // Transmission straight-cut gear whine
    this.intakeNoiseNode = null;

    // Gain stages
    this.combustionGain = null;
    this.harmonicGain = null;
    this.subBassGain = null;
    this.camshaftGain = null;
    this.gearWhineGain = null;
    this.intakeGain = null;

    // Formant Acoustic Filters
    this.helmholtzFilter = null; // 65 - 130 Hz deep chest thump
    this.manifoldFilter = null;  // 350 - 650 Hz engine body throat
    this.tailpipeFilter = null;  // 900 - 1800 Hz exhaust metallic rasp
    this.mufflerLowpass1 = null; // Primary acoustic muffler
    this.mufflerLowpass2 = null; // Secondary anti-harshness steep filter
    this.intakeFilter = null;    // 180 - 450 Hz induction roar

    // Sound Character & Tone
    this.soundProfile = 'deep'; // 'deep', 'screamer', 'muscle'
    this.toneWarmth = 0.85;     // 0.0 to 1.0 (high warmth = thick bass, zero harshness)
    this.currentExhaust = EXHAUST_MODELS['akrapovic'];
    this.engineConfig = ENGINE_CONFIGS.i4_flat;
    this.volume = 0.8;
    this.running = false;
    this.waveKey = '';

    // Engine jitter & phase
    this.jitterPhase = 0;
  }

  // Initialize Web Audio graph upon user gesture
  async init() {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended' && !this.ctx.startRendering) {
        await this.ctx.resume();
      }
      this.isStarted = true;
      return;
    }

    this.ctx = this.contextFactory ? this.contextFactory() : new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended' && !this.ctx.startRendering) {
      await this.ctx.resume();
    }

    // 1. Master Output Chain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.setValueAtTime(0, this.ctx.currentTime);

    // Studio Dynamics Compressor (glues layers, prevents digital clipping)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-5, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(5.0, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.06, this.ctx.currentTime);

    this.masterGain.connect(this.outputGain);
    this.outputGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // 2. Rev-Limiter Staccato Gate
    this.limiterGate = this.ctx.createGain();
    this.limiterGate.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.limiterGate.connect(this.masterGain);
    // An audio-clock oscillator keeps the 18 Hz limiter independent of rendering FPS.
    this.limiterOsc = this.ctx.createOscillator();
    this.limiterOsc.type = 'square';
    this.limiterOsc.frequency.setValueAtTime(18, this.ctx.currentTime);
    this.limiterModGain = this.ctx.createGain();
    this.limiterModGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.limiterOsc.connect(this.limiterModGain);
    this.limiterModGain.connect(this.limiterGate.gain);
    this.limiterOsc.start();

    // 3. Build Multi-Stage Resonant Formants
    this.setupAcousticFilterMatrix();

    // 4. Build Non-Linear WaveShaper Saturation
    this.setupWaveShaper();

    // 5. Build Acoustic Oscillators and Sound Generators
    this.setupAcousticGenerators();

    this.isStarted = true;
    this.setSoundProfile(this.soundProfile);
    this.setExhaustModel(this.currentExhaust);
    this.setRunning(this.running);
  }

  // Generate asymmetric non-linear transfer curve for cylinder combustion pressure spikes
  generateCombustionTransferCurve(amount = 25) {
    const n = 1025;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      // Web Audio maps both endpoints to [-1, 1]. Include an exact zero sample
      // so a silent input cannot become a DC offset in the distortion stage.
      const x = (i * 2) / (n - 1) - 1;
      if (x >= 0) {
        // Asymmetric positive expansion shockwave: aggressive saturation
        curve[i] = ((3 + amount) * x * 22 * deg) / (Math.PI + amount * Math.abs(x));
      } else {
        // Negative cylinder intake depression: soft tube warmth
        curve[i] = ((2 + amount * 0.6) * x * 18 * deg) / (Math.PI + amount * 0.6 * Math.abs(x));
      }
    }
    return curve;
  }

  setupWaveShaper() {
    this.waveShaperNode = this.ctx.createWaveShaper();
    this.waveShaperNode.curve = this.generateCombustionTransferCurve(25);
    this.waveShaperNode.oversample = '4x'; // 4x oversampling eliminates digital harsh aliasing

    this.saturationDriveGain = this.ctx.createGain();
    this.saturationDriveGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    this.saturationDriveGain.connect(this.waveShaperNode);
    this.waveShaperNode.connect(this.helmholtzFilter);
  }

  // Setup 3-Stage Formants (Helmholtz Sub-Bass, Manifold Throat, Tailpipe Rasp)
  setupAcousticFilterMatrix() {
    const t = this.ctx.currentTime;

    // Formant 1: Helmholtz Bass Cavity (65 - 130 Hz)
    this.helmholtzFilter = this.ctx.createBiquadFilter();
    this.helmholtzFilter.type = 'peaking';
    this.helmholtzFilter.frequency.setValueAtTime(this.currentExhaust.resonanceFreq, t);
    this.helmholtzFilter.Q.setValueAtTime(2.2, t);
    this.helmholtzFilter.gain.setValueAtTime(this.currentExhaust.resonanceGain + 4.0, t);

    // Formant 2: Manifold Collector Body (380 - 580 Hz)
    this.manifoldFilter = this.ctx.createBiquadFilter();
    this.manifoldFilter.type = 'peaking';
    this.manifoldFilter.frequency.setValueAtTime(460, t);
    this.manifoldFilter.Q.setValueAtTime(1.8, t);
    this.manifoldFilter.gain.setValueAtTime(4.5, t);

    // Formant 3: Tailpipe Metallic Rasp Formant (900 - 1600 Hz)
    this.tailpipeFilter = this.ctx.createBiquadFilter();
    this.tailpipeFilter.type = 'peaking';
    this.tailpipeFilter.frequency.setValueAtTime(1150, t);
    this.tailpipeFilter.Q.setValueAtTime(2.4, t);
    this.tailpipeFilter.gain.setValueAtTime(3.0, t);

    // Muffler Lowpass 1 (Acoustic Damping)
    this.mufflerLowpass1 = this.ctx.createBiquadFilter();
    this.mufflerLowpass1.type = 'lowpass';
    this.mufflerLowpass1.frequency.setValueAtTime(this.currentExhaust.filterLowpassCutoff, t);
    this.mufflerLowpass1.Q.setValueAtTime(this.currentExhaust.filterLowpassQ, t);

    // Muffler Lowpass 2 (Steep Anti-Harshness Barrier: completely cuts digital buzz > 2.6kHz)
    this.mufflerLowpass2 = this.ctx.createBiquadFilter();
    this.mufflerLowpass2.type = 'lowpass';
    this.mufflerLowpass2.frequency.setValueAtTime(2600, t);
    this.mufflerLowpass2.Q.setValueAtTime(0.85, t);

    // Connect Filter Series:
    // WaveShaper -> Helmholtz -> Manifold -> Tailpipe -> Lowpass1 -> Lowpass2 -> LimiterGate -> Master
    this.helmholtzFilter.connect(this.manifoldFilter);
    this.manifoldFilter.connect(this.tailpipeFilter);
    this.tailpipeFilter.connect(this.mufflerLowpass1);
    this.mufflerLowpass1.connect(this.mufflerLowpass2);
    this.mufflerLowpass2.connect(this.limiterGate);
  }

  // Sum a decaying pressure pulse at each cylinder's phase over a 720-degree cycle.
  // The oscillator runs at RPM/120; uneven firing spacing survives in the waveform.
  createCombustionPulseWave(character = 'deep', config = this.engineConfig) {
    const numHarmonics = 128;
    const real = new Float32Array(numHarmonics);
    const imag = new Float32Array(numHarmonics);

    real[0] = 0;
    imag[0] = 0;

    for (let i = 1; i < numHarmonics; i++) {
      const width = (character === 'screamer' ? 0.22 : 0.36) / config.cylinders;
      const decay = Math.exp(-i * 0.012) / (1 + (i * width) ** 2);
      // Asymmetric supersonic shockwave steepening (AngeTheGreat blowdown acoustic profile)
      const shockFront = 1.0 + 0.12 * Math.sin(Math.min(Math.PI, i * width));

      for (let cylinder = 0; cylinder < config.firingAngles.length; cylinder++) {
        const phase = (360 - config.firingAngles[cylinder]) / 720 * Math.PI * 2;
        const angle = i * phase;
        // Separate-bank exhaust paths contribute unequal pulse amplitudes.
        const bankGain = config.layout === 'v' && cylinder % 2 ? 0.78 : 1;
        real[i] += bankGain * decay * shockFront * (Math.cos(angle) - i * width * Math.sin(angle)) / config.cylinders;
        imag[i] += bankGain * decay * shockFront * (Math.sin(angle) + i * width * Math.cos(angle)) / config.cylinders;
      }
    }

    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  setupAcousticGenerators() {
    const t = this.ctx.currentTime;
    const combustionWave = this.createCombustionPulseWave(this.soundProfile);

    // 1. Primary Combustion Pulse Train
    this.combustionOsc = this.ctx.createOscillator();
    this.combustionOsc.setPeriodicWave(combustionWave);
    this.combustionGain = this.ctx.createGain();
    this.combustionGain.gain.setValueAtTime(0.55, t);
    this.combustionOsc.connect(this.combustionGain);
    this.combustionGain.connect(this.saturationDriveGain);

    // 2. Higher Harmonic Order (2nd / 3rd firing harmonic)
    this.harmonicOsc = this.ctx.createOscillator();
    this.harmonicOsc.type = 'triangle';
    this.harmonicGain = this.ctx.createGain();
    this.harmonicGain.gain.setValueAtTime(0.28, t);
    this.harmonicOsc.connect(this.harmonicGain);
    this.harmonicGain.connect(this.saturationDriveGain);

    // 3. Deep Sub-Bass Thumping Foundation (Pure sine/triangle)
    this.subBassOsc = this.ctx.createOscillator();
    this.subBassOsc.type = 'sine';
    this.subBassGain = this.ctx.createGain();
    this.subBassGain.gain.setValueAtTime(0.50, t);
    this.subBassOsc.connect(this.subBassGain);
    this.subBassGain.connect(this.saturationDriveGain);

    // 4. Camshaft Syncopation Oscillator (Half-orders for V8 muscle burble, CP4, V-Twin)
    this.camshaftOsc = this.ctx.createOscillator();
    this.camshaftOsc.type = 'sine';
    this.camshaftGain = this.ctx.createGain();
    this.camshaftGain.gain.setValueAtTime(0.35, t);
    this.camshaftOsc.connect(this.camshaftGain);
    this.camshaftGain.connect(this.saturationDriveGain);

    // 5. Transmission Straight-Cut Gear Whine
    this.gearWhineOsc = this.ctx.createOscillator();
    this.gearWhineOsc.type = 'sine';
    this.gearWhineGain = this.ctx.createGain();
    this.gearWhineGain.gain.setValueAtTime(0.0, t); // Quiet baseline
    this.gearWhineOsc.connect(this.gearWhineGain);
    this.gearWhineGain.connect(this.mufflerLowpass1);

    // 6. Intake Induction Roar (Bandpassed airflow noise)
    const bufLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.6;
    }

    this.intakeNoiseNode = this.ctx.createBufferSource();
    this.intakeNoiseNode.buffer = noiseBuf;
    this.intakeNoiseNode.loop = true;

    this.intakeFilter = this.ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.setValueAtTime(280, t);
    this.intakeFilter.Q.setValueAtTime(1.4, t);

    this.intakeGain = this.ctx.createGain();
    this.intakeGain.gain.setValueAtTime(0.0, t);

    this.intakeNoiseNode.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.helmholtzFilter);

    // Start all continuous generators
    this.combustionOsc.start();
    this.harmonicOsc.start();
    this.subBassOsc.start();
    this.camshaftOsc.start();
    this.gearWhineOsc.start();
    this.intakeNoiseNode.start();
  }

  // Adjust sound profile ('deep', 'screamer', 'muscle')
  setSoundProfile(profile) {
    this.soundProfile = profile;
    if (!this.ctx || !this.isStarted) return;

    const wave = this.createCombustionPulseWave(profile);
    this.combustionOsc.setPeriodicWave(wave);
    this.waveKey = '';

    if (profile === 'muscle') {
      this.subBassGain.gain.setTargetAtTime(0.65, this.ctx.currentTime, 0.05);
      this.camshaftGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.05);
      this.harmonicGain.gain.setTargetAtTime(0.20, this.ctx.currentTime, 0.05);
    } else if (profile === 'screamer') {
      this.subBassGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.05);
      this.camshaftGain.gain.setTargetAtTime(0.20, this.ctx.currentTime, 0.05);
      this.harmonicGain.gain.setTargetAtTime(0.40, this.ctx.currentTime, 0.05);
    } else {
      // deep default
      this.subBassGain.gain.setTargetAtTime(0.50, this.ctx.currentTime, 0.05);
      this.camshaftGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.05);
      this.harmonicGain.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.05);
    }
  }

  // Adjust tone warmth (lowpass filter to eliminate harshness)
  setToneWarmth(val) {
    this.toneWarmth = Math.max(0, Math.min(1, val));
    if (!this.ctx || !this.isStarted) return;

    const baseCutoff = this.currentExhaust.filterLowpassCutoff;
    const tunedCutoff = baseCutoff * (0.6 + 0.4 * (1.0 - this.toneWarmth));
    this.mufflerLowpass1.frequency.setTargetAtTime(tunedCutoff, this.ctx.currentTime, 0.05);

    const antiHarshFreq = 1800 + (1.0 - this.toneWarmth) * 1100;
    this.mufflerLowpass2.frequency.setTargetAtTime(antiHarshFreq, this.ctx.currentTime, 0.05);
  }

  setExhaustModel(exhaustModel) {
    this.currentExhaust = exhaustModel;
    if (!this.ctx || !this.isStarted) return;

    const t = this.ctx.currentTime;
    const tunedCutoff = exhaustModel.filterLowpassCutoff * (0.6 + 0.4 * (1.0 - this.toneWarmth));

    this.mufflerLowpass1.frequency.setTargetAtTime(tunedCutoff, t, 0.05);
    this.mufflerLowpass1.Q.setTargetAtTime(exhaustModel.filterLowpassQ, t, 0.05);

    this.helmholtzFilter.frequency.setTargetAtTime(exhaustModel.resonanceFreq, t, 0.05);
    this.helmholtzFilter.gain.setTargetAtTime(exhaustModel.resonanceGain + 4.0, t, 0.05);

    this.tailpipeFilter.gain.setTargetAtTime(exhaustModel.popIntensity > 1.2 ? 4.5 : 2.5, t, 0.05);

    this.setToneWarmth(this.toneWarmth);
    this.applyVolume();
  }

  // Play an explosive overrun pop, gun-shot rev-limiter bang, or crisp shift crack
  playBackfirePop(intensity = 1.0, hasFlame = false, isLimiter = false, when, isShift = false) {
    if (!this.ctx || !this.isStarted || !this.running || this.currentExhaust.id === 'oem'
      || !Number.isFinite(intensity) || intensity <= 0) return;

    const t = Math.max(this.ctx.currentTime, when ?? this.ctx.currentTime);

    // Sub-bass thump (35 - 85 Hz wavefront, tight punch on shift)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(isShift ? 135 : isLimiter ? 120 : 90, t);
    subOsc.frequency.exponentialRampToValueAtTime(35, t + (isShift ? 0.055 : 0.09));

    const subGain = this.ctx.createGain();
    const decayTime = isShift ? Math.min(0.085, this.currentExhaust.popDecay * 0.7) : this.currentExhaust.popDecay;
    const subVol = Math.min(0.85, (isShift ? 0.78 : isLimiter ? 0.5 : 0.6) * intensity * (hasFlame ? 1.15 : 1));
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(subVol, t + (isShift ? 0.0015 : 0.003));
    subGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);

    // Warm organic crackle burst (bandpassed 550 - 1300 Hz, crisp metallic crack on shift)
    const burstLen = Math.floor(this.ctx.sampleRate * decayTime * 0.8);
    const burstBuf = this.ctx.createBuffer(1, burstLen, this.ctx.sampleRate);
    const data = burstBuf.getChannelData(0);
    for (let i = 0; i < burstLen; i++) {
      const decay = Math.exp(-i / (burstLen * 0.20));
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const burstNode = this.ctx.createBufferSource();
    burstNode.buffer = burstBuf;

    const burstFilter = this.ctx.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(this.currentExhaust.popTone * (isShift ? 1.35 : isLimiter ? 1.15 : 1), t);
    burstFilter.Q.setValueAtTime(isShift ? 2.6 : 2.0, t);

    const burstGain = this.ctx.createGain();
    burstGain.gain.setValueAtTime(0.001, t);
    burstGain.gain.linearRampToValueAtTime(subVol * (isShift ? 0.85 : 0.6), t + 0.0015);
    burstGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime * 0.75);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    burstNode.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.masterGain);

    subOsc.start(t);
    subOsc.stop(t + decayTime + 0.01);
    burstNode.start(t);
    burstNode.onended = () => { burstNode.disconnect(); burstFilter.disconnect(); burstGain.disconnect(); };
    subOsc.onended = () => { subOsc.disconnect(); subGain.disconnect(); };
  }

  // Real-time audio frame update
  update(engineState, config, drivetrainState = {}) {
    if (!this.ctx || !this.isStarted) return;

    const t = this.ctx.currentTime;
    this.setEngineConfig(config);
    const rpm = Math.max(120, engineState.rpm || 1000);
    const redline = engineState.redlineRPM || (config && config.defaultRedlineRPM) || 10000;
    const throttle = Math.max(0, Math.min(1, engineState.manifoldThrottle ?? engineState.throttle ?? 0));
    const cylinders = (config && config.cylinders) || 4;
    const speedKmh = Math.max(0, drivetrainState.speedKmh || 0);

    // Organic cycle-to-cycle micro-jitter (±0.35%)
    const jitter = 1.0 + Math.sin(t * 15) * 0.0015;

    // -------------------------------------------------------------
    // 1. Engine Frequencies & Orders Calculation
    // -------------------------------------------------------------
    // F_cycle (Order 0.5): 1 complete 4-stroke cycle per 2 crankshaft rotations
    const cycleFreq = (rpm / 120) * jitter;
    // F_crank (Order 1.0): 1 revolution per second
    const crankFreq = (rpm / 60) * jitter;
    // F_firing (Fundamental firing order): (RPM / 120) * cylinders
    const fundamentalFiringFreq = cycleFreq * cylinders;

    const smoothTime = 0.030;

    // 1. Primary Combustion Pulse Pitch
    this.combustionOsc.frequency.setTargetAtTime(Math.max(1, cycleFreq), t, smoothTime);

    // 2. Harmonic Resonance (2nd order of firing)
    this.harmonicOsc.frequency.setTargetAtTime(Math.min(2200, fundamentalFiringFreq * 2.0), t, smoothTime);

    // 3. Sub-Bass & Camshaft Syncopation Frequencies
    let subBassFreq = crankFreq * 0.5;
    let camshaftFreq = cycleFreq;

    if (cylinders === 1) {
      subBassFreq = cycleFreq; // Single cylinder slow heavy thump (10-60 Hz)
      camshaftFreq = cycleFreq * 2;
    } else if (config.soundCharacter === 'v_twin' || config.soundCharacter === 'muscle_v8') {
      // Uneven firing pulses: strong camshaft half-order creates signature rumble!
      subBassFreq = cycleFreq * 2;
      camshaftFreq = crankFreq;
    } else if (config.soundCharacter === 'v10_howl') {
      // V10: Order 2.5 and 5.0 produce the legendary howling soprano
      subBassFreq = cycleFreq * 2.5;
      camshaftFreq = cycleFreq * 5.0;
    } else if (config.soundCharacter === 'v12_flagship') {
      // V12: Order 3.0 and 6.0 produce smooth turbine symphony
      subBassFreq = cycleFreq * 3.0;
      camshaftFreq = cycleFreq * 6.0;
    }

    this.subBassOsc.frequency.setTargetAtTime(Math.max(14, subBassFreq), t, smoothTime);
    this.camshaftOsc.frequency.setTargetAtTime(Math.max(12, camshaftFreq), t, smoothTime);

    // 4. Transmission Straight-Cut Gear Whine
    if (speedKmh > 5 && drivetrainState.currentGear !== 0) {
      const gearRatio = drivetrainState.gearRatio || 1;
      const whineFreq = Math.min(3200, 320 + speedKmh * 14.0 + (rpm / 60) * gearRatio * 3.2);
      this.gearWhineOsc.frequency.setTargetAtTime(whineFreq, t, smoothTime);
      const whineVol = Math.min(0.06, 0.015 + (speedKmh / 200) * 0.045);
      this.gearWhineGain.gain.setTargetAtTime(whineVol, t, smoothTime);
    } else {
      this.gearWhineGain.gain.setTargetAtTime(0.0, t, 0.05);
    }

    // -------------------------------------------------------------
    // 2. Non-linear WaveShaper Saturation & Shift Ignition Cut Breakpoint
    // -------------------------------------------------------------
    // During an upshift with load, ECU cuts ignition spark:
    // This creates the iconic "breakpoint / 斷點" where the combustion snarl instantly drops!
    const isShiftCut = Boolean(drivetrainState.isShifting && drivetrainState.isUpshift);

    let blowdownBoost = 0;
    if (engineState.cylinderStates) {
      for (const cyl of engineState.cylinderStates) {
        if (cyl.blowdownPulse > blowdownBoost) blowdownBoost = cyl.blowdownPulse;
      }
    }
    const rawDrive = 0.55 + 1.25 * Math.pow(throttle, 1.3) + Math.min(0.25, blowdownBoost * 0.04);
    const driveAmount = isShiftCut ? 0.20 : rawDrive;
    this.saturationDriveGain.gain.setTargetAtTime(driveAmount, t, isShiftCut ? 0.006 : smoothTime);

    // -------------------------------------------------------------
    // 3. Dynamic Intake Induction Roar
    // -------------------------------------------------------------
    // Deep intake roar only manifests when throttle valve is open (cuts on shift)
    const intakeVol = isShiftCut ? 0 : Math.pow(throttle, 1.4) * 0.12;
    this.intakeGain.gain.setTargetAtTime(intakeVol, t, isShiftCut ? 0.008 : 0.025);
    // Induction formant shifts upward with RPM
    const intakeCenterFreq = Math.max(100, Math.min(1800, 220 + (rpm / redline) * 260));
    this.intakeFilter.frequency.setTargetAtTime(intakeCenterFreq, t, smoothTime);

    // Harmonic Cut during shift cut
    if (isShiftCut) {
      this.harmonicGain.gain.setTargetAtTime(0.04, t, 0.006);
    } else {
      const baseHarmonic = this.soundProfile === 'muscle' ? 0.20 : this.soundProfile === 'screamer' ? 0.40 : 0.28;
      this.harmonicGain.gain.setTargetAtTime(baseHarmonic, t, smoothTime);
    }

    // -------------------------------------------------------------
    // 4. Rev Limiter Staccato Gate Handling
    // -------------------------------------------------------------
    // Keep exhaust resonance audible through a shift. Only the redline limiter
    // uses rhythmic gating; AT has a smaller load dip than AMT.
    const shiftDip = (drivetrainState.mode === 'at' ? 0.12 : 0.3) * (drivetrainState.shiftEnvelope || 0);
    this.limiterGate.gain.setTargetAtTime(engineState.isRevLimiting ? 0.72 : 1 - shiftDip, t, 0.018);
    this.limiterModGain.gain.setTargetAtTime(engineState.isRevLimiting ? 0.28 : 0, t, 0.008);

    // -------------------------------------------------------------
    // 5. Dynamic Tone Formant Tracking
    // -------------------------------------------------------------
    // Exhaust collector formant tracks engine revs
    const collectorFreq = Math.max(200, Math.min(2200, 380 + (rpm / redline) * 220));
    this.manifoldFilter.frequency.setTargetAtTime(collectorFreq, t, smoothTime);
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol) || 0));
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.volume * 0.85 * this.currentExhaust.volumeMultiplier, this.ctx.currentTime, 0.04);
  }

  setRunning(running) {
    this.running = Boolean(running);
    if (this.outputGain) this.outputGain.gain.setTargetAtTime(this.running ? 1 : 0, this.ctx.currentTime, 0.035);
  }

  setEngineConfig(config) {
    this.engineConfig = config;
    if (!this.isStarted) return;
    const key = [config.id, this.soundProfile, ...config.firingAngles].join(':');
    if (key === this.waveKey) return;
    this.combustionOsc.setPeriodicWave(this.createCombustionPulseWave(this.soundProfile, config));
    this.waveKey = key;
  }
}
