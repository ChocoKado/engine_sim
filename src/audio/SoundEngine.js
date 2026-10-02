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
    this.turboAirFilter = null;  // Pressurized intake airflow rush under boost
    this.turboAirGain = null;

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

  // Harmonic aerodynamic profile for turbocharger compressor blade passing whistle
  createTurboWhistleWave() {
    const numHarmonics = 16;
    const real = new Float32Array(numHarmonics);
    const imag = new Float32Array(numHarmonics);
    real[0] = 0;
    imag[0] = 0;
    // Fundamental compressor blade pass
    real[1] = 0.85;
    // Housing scroll aerodynamic harmonics
    real[2] = 0.32;
    real[3] = 0.12;
    real[4] = 0.05;
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

    // 7A. Turbocharger Turbine Spool Whistle (1.2 kHz - 4.6 kHz with blade harmonics)
    this.turboSpoolOsc = this.ctx.createOscillator();
    const turboWave = this.createTurboWhistleWave();
    this.turboSpoolOsc.setPeriodicWave(turboWave);
    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = 'peaking';
    this.turboSpoolFilter.frequency.setValueAtTime(1400, t);
    this.turboSpoolFilter.Q.setValueAtTime(3.5, t);
    this.turboSpoolFilter.gain.setValueAtTime(6.0, t);
    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.setValueAtTime(0.0, t);
    this.turboSpoolOsc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterGain);

    // 7B. Turbocharger Pressurized Intake Air Suction Rush (1.5 kHz - 4.2 kHz roaring whoosh)
    this.turboAirFilter = this.ctx.createBiquadFilter();
    this.turboAirFilter.type = 'bandpass';
    this.turboAirFilter.frequency.setValueAtTime(1800, t);
    this.turboAirFilter.Q.setValueAtTime(1.8, t);
    this.turboAirGain = this.ctx.createGain();
    this.turboAirGain.gain.setValueAtTime(0.0, t);
    this.intakeNoiseNode.connect(this.turboAirFilter);
    this.turboAirFilter.connect(this.turboAirGain);
    this.turboAirGain.connect(this.masterGain);

    // 8. Supercharger Screw Screaming Whine (800 Hz - 3500 Hz)
    this.scWhineOsc = this.ctx.createOscillator();
    this.scWhineOsc.type = 'sawtooth';
    this.scWhineFilter = this.ctx.createBiquadFilter();
    this.scWhineFilter.type = 'bandpass';
    this.scWhineFilter.frequency.setValueAtTime(1600, t);
    this.scWhineFilter.Q.setValueAtTime(3.8, t);
    this.scWhineGain = this.ctx.createGain();
    this.scWhineGain.gain.setValueAtTime(0.0, t);
    this.scWhineOsc.connect(this.scWhineFilter);
    this.scWhineFilter.connect(this.scWhineGain);
    this.scWhineGain.connect(this.masterGain);

    // Start all continuous generators
    this.combustionOsc.start();
    this.harmonicOsc.start();
    this.subBassOsc.start();
    this.camshaftOsc.start();
    this.gearWhineOsc.start();
    this.intakeNoiseNode.start();
    this.turboSpoolOsc.start();
    this.scWhineOsc.start();
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
  playBackfirePop(intensity = 1.0, hasFlame = false, isLimiter = false, when, isShift = false, displacement = 1000) {
    if (!this.ctx || !this.isStarted || !this.running
      || (this.currentExhaust.id === 'oem' && !isShift)
      || !Number.isFinite(intensity) || intensity <= 0) return;

    const t = Math.max(this.ctx.currentTime, when ?? this.ctx.currentTime);
    const isOem = this.currentExhaust.id === 'oem';
    const dispLiters = Math.max(0.125, (Number(displacement) || 1000) / 1000);
    const dispScale = Math.min(2.2, Math.sqrt(dispLiters));

    // Sub-bass thump (frequency scales down with displacement for deeper concussive boom)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    const baseFreq = (isShift ? 145 : isLimiter ? 120 : 90) * Math.pow(1.0 / dispLiters, 0.18);
    const initialFreq = Math.max(45, Math.min(195, baseFreq));
    subOsc.frequency.setValueAtTime(initialFreq, t);
    subOsc.frequency.exponentialRampToValueAtTime(Math.max(20, 32 / Math.min(1.5, dispScale)), t + (isShift ? 0.048 : 0.09) * Math.min(1.4, 0.75 + 0.25 * dispScale));

    const subGain = this.ctx.createGain();
    const decayTime = (isShift ? Math.min(0.080, this.currentExhaust.popDecay * 0.65) : this.currentExhaust.popDecay) * Math.min(1.3, 0.8 + 0.2 * dispScale);
    const baseSubVol = (isShift ? 0.92 : isLimiter ? 0.5 : 0.6) * intensity * (hasFlame ? 1.15 : 1) * Math.min(1.25, 0.75 + 0.25 * dispScale);
    const subVol = Math.min(0.95, isOem ? baseSubVol * 0.72 : baseSubVol);
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(subVol, t + (isShift ? 0.0012 : 0.003));
    subGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);

    // Warm organic crackle burst (bandpassed 550 - 1600 Hz, crisp metallic crack on shift)
    const burstLen = Math.floor(this.ctx.sampleRate * decayTime * 0.85);
    const burstBuf = this.ctx.createBuffer(1, burstLen, this.ctx.sampleRate);
    const data = burstBuf.getChannelData(0);
    for (let i = 0; i < burstLen; i++) {
      const decay = Math.exp(-i / (burstLen * 0.18));
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const burstNode = this.ctx.createBufferSource();
    burstNode.buffer = burstBuf;

    const burstFilter = this.ctx.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(this.currentExhaust.popTone * (isShift ? 1.45 : isLimiter ? 1.15 : 1), t);
    burstFilter.Q.setValueAtTime(isShift ? 2.8 : 2.0, t);

    const burstGain = this.ctx.createGain();
    burstGain.gain.setValueAtTime(0.001, t);
    burstGain.gain.linearRampToValueAtTime(subVol * (isShift ? 0.95 : 0.6), t + 0.0012);
    burstGain.gain.exponentialRampToValueAtTime(0.001, t + decayTime * 0.70);

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

  // Play Blow-off Valve (BOV) Atmospheric Vent ("TSSSHHH-TSUU!")
  playBovSound(intensity = 1.0) {
    if (!this.ctx || !this.isStarted || !this.running) return;
    const t = this.ctx.currentTime;
    const duration = 0.38;
    const sampleRate = this.ctx.sampleRate;
    const bufLen = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufLen, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const time = i / sampleRate;
      // Initial supersonic crack (first 12ms)
      const crack = time < 0.012 ? (Math.random() * 2 - 1) * Math.sin(time * 3000 * Math.PI * 2) * 1.5 : 0;
      // High-pressure pneumatic venting hiss with exponential decay
      const hissDecay = Math.exp(-time * 11);
      const hiss = (Math.random() * 2 - 1) * hissDecay;
      // Secondary sequential valve trailing chirp ("-tsuu" at 0.12 - 0.26s)
      const chirpTime = time - 0.12;
      const chirp = (chirpTime > 0 && chirpTime < 0.14)
        ? Math.sin(2 * Math.PI * (3400 - chirpTime * 8000) * chirpTime) * Math.exp(-chirpTime * 28) * 0.45
        : 0;
      data[i] = crack + hiss * 0.75 + chirp;
    }
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + duration * 0.7);
    filter.Q.setValueAtTime(2.2, t);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.95, 0.52 * intensity);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    node.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    node.start(t);
    node.onended = () => { node.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  // Play Compressor Surge / Flutter ("Stutututu / Supra 2JZ 經典放油門反串流 / 貓叫鳥叫聲")
  playFlutterSound(intensity = 1.0) {
    if (!this.ctx || !this.isStarted || !this.running) return;
    const t = this.ctx.currentTime;
    const duration = 0.88;
    const sampleRate = this.ctx.sampleRate;
    const bufLen = Math.floor(sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufLen, sampleRate);
    const data = buf.getChannelData(0);
    const numPulses = 10;
    const pulseInterval = 0.068; // ~14.7 Hz authentic Supra 2JZ big turbo flutter cadence
    for (let i = 0; i < bufLen; i++) {
      const time = i / sampleRate;
      let val = 0;
      for (let p = 0; p < numPulses; p++) {
        const pStart = p * pulseInterval;
        const pTime = time - pStart;
        if (pTime >= 0 && pTime < 0.078) {
          // Decreasing amplitude per pulse: 1.0, 0.80, 0.64, 0.51, 0.40, 0.32, 0.25, 0.18, 0.12, 0.06
          const pAmplitude = Math.pow(0.80, p);
          const pDecay = Math.exp(-pTime * 42) * pAmplitude;

          // 1. Cavitation shockwave transient slap on compressor wheel (first 10ms of each chop)
          const transient = pTime < 0.010
            ? (Math.random() * 2 - 1) * Math.cos(pTime * 2800 * Math.PI) * Math.exp(-pTime * 300) * 0.85
            : 0;

          // 2. Hollow aluminum intercooler charge pipe cavity thump ("DOO / TU")
          // 260 Hz fundamental pipe cavity resonance dropping slightly per pulse
          const pipeFreq = Math.max(180, 260 - p * 8);
          const pipeThump = Math.sin(2 * Math.PI * pipeFreq * pTime) * 0.72;

          // 3. Compressor impeller blade stall chirp ("TSHU / bird chirp")
          // Exponential downward pitch sweep from ~2350 Hz down to ~1100 Hz
          const startFreq = 2350 - p * 75;
          const endFreq = 1100 - p * 45;
          const chirpFreq = Math.max(650, startFreq - (startFreq - endFreq) * (pTime / 0.078));
          const bladeChop = Math.sin(2 * Math.PI * chirpFreq * pTime) * 0.65;

          // 4. Intercooler charge pipe air turbulence
          const turbulence = (Math.random() * 2 - 1) * 0.28;

          val += (transient + pipeThump + bladeChop + turbulence) * pDecay;
        }
      }
      data[i] = val * 0.65;
    }
    const node = this.ctx.createBufferSource();
    node.buffer = buf;

    // Acoustic filtering: Preserves the deep hollow pipe thumps (200-450 Hz) while accentuating
    // the metallic blade chirp at 1950 Hz, with a gentle lowpass at 5200 Hz to prevent harshness
    const peakFilter = this.ctx.createBiquadFilter();
    peakFilter.type = 'peaking';
    peakFilter.frequency.setValueAtTime(1950, t);
    peakFilter.Q.setValueAtTime(2.2, t);
    peakFilter.gain.setValueAtTime(4.0, t);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(5200, t);
    lowpass.Q.setValueAtTime(0.85, t);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.95, 0.72 * intensity);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    node.connect(peakFilter);
    peakFilter.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);

    node.start(t);
    node.onended = () => { node.disconnect(); peakFilter.disconnect(); lowpass.disconnect(); gain.disconnect(); };
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

    const smoothTime = drivetrainState.isShifting ? 0.005 : 0.030;

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
    } else if (config.soundCharacter === 'radial_7') {
      // 7-cylinder radial: Order 3.5 primary firing with order 1.75 camshaft/master-rod pulse
      subBassFreq = cycleFreq * 3.5;
      camshaftFreq = cycleFreq * 1.75;
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
    // This creates the iconic "breakpoint / 斷點" where the combustion snarl instantly drops to zero!
    const isShiftCut = Boolean(drivetrainState.isShifting && drivetrainState.isUpshift);
    const displacement = engineState.displacement || (config && config.defaultDisplacement) || 1000;
    const dispLiters = Math.max(0.125, displacement / 1000);

    let blowdownBoost = 0;
    if (engineState.cylinderStates) {
      for (const cyl of engineState.cylinderStates) {
        if (cyl.blowdownPulse > blowdownBoost) blowdownBoost = cyl.blowdownPulse;
      }
    }
    // Cylinder pressure pulse scales with cylinder unit volume and engine displacement:
    const dispPerCyl = dispLiters / Math.max(1, cylinders);
    const dispDriveMod = 0.78 + 0.32 * Math.min(2.0, Math.sqrt(dispPerCyl / 0.25));
    const rawDrive = (0.55 + 1.25 * Math.pow(throttle, 1.3) + Math.min(0.25, blowdownBoost * 0.04)) * dispDriveMod;
    const driveAmount = isShiftCut ? 0.0001 : rawDrive;
    this.saturationDriveGain.gain.setTargetAtTime(driveAmount, t, isShiftCut ? 0.0015 : smoothTime);

    // Primary combustion pulse instantly silences during ignition cut
    const combustionVol = isShiftCut ? 0.0001 : 0.55;
    this.combustionGain.gain.setTargetAtTime(combustionVol, t, isShiftCut ? 0.0015 : smoothTime);

    // Sub-bass thump (30-80 Hz) physically scales with displacement volume:
    // Large displacement engines deliver deep chest-thumping bass; small engines have tighter pulse
    const dispBassMod = 0.52 + 0.48 * Math.min(2.2, Math.sqrt(dispLiters));
    const baseSubBassVol = (this.soundProfile === 'muscle' ? 0.65 : 0.50) * dispBassMod;
    const baseCamVol = (this.soundProfile === 'muscle' ? 0.55 : 0.40) * Math.min(1.8, 0.65 + 0.35 * Math.sqrt(dispLiters));
    this.subBassGain.gain.setTargetAtTime(isShiftCut ? 0.0001 : baseSubBassVol, t, isShiftCut ? 0.0015 : smoothTime);
    this.camshaftGain.gain.setTargetAtTime(isShiftCut ? 0.0001 : baseCamVol, t, isShiftCut ? 0.0015 : smoothTime);

    // -------------------------------------------------------------
    // 3. Dynamic Intake Induction Roar
    // -------------------------------------------------------------
    // Airflow volume is proportional to displacement * RPM
    const intakeAirflow = Math.min(2.4, Math.sqrt(dispLiters));
    const intakeVol = isShiftCut ? 0.0001 : Math.pow(throttle, 1.35) * (0.05 + 0.09 * intakeAirflow);
    this.intakeGain.gain.setTargetAtTime(intakeVol, t, isShiftCut ? 0.0015 : 0.025);
    // Induction formant shifts with displacement and revs
    const intakeCenterFreq = Math.max(110, Math.min(1600, (220 + (rpm / redline) * 260) * Math.pow(1.0 / dispLiters, 0.14)));
    this.intakeFilter.frequency.setTargetAtTime(intakeCenterFreq, t, smoothTime);

    // Harmonic Cut during shift cut
    if (isShiftCut) {
      this.harmonicGain.gain.setTargetAtTime(0.0001, t, 0.0015);
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
    // Exhaust Helmholtz resonance and collector formant scale with displacement:
    // Large displacement lowers Helmholtz frequency (55-80 Hz vs 120-160 Hz for small engines)
    const baseHelmholtz = this.currentExhaust.resonanceFreq;
    const tunedHelmholtz = Math.max(52, Math.min(200, baseHelmholtz * Math.pow(1.0 / dispLiters, 0.18)));
    this.helmholtzFilter.frequency.setTargetAtTime(tunedHelmholtz, t, smoothTime);

    const baseCollector = 380 + (rpm / redline) * 220;
    const collectorFreq = Math.max(220, Math.min(1800, baseCollector * Math.pow(1.0 / dispLiters, 0.12)));
    this.manifoldFilter.frequency.setTargetAtTime(collectorFreq, t, smoothTime);

    // -------------------------------------------------------------
    // 6. Forced Induction (Turbo Whistle & Supercharger Screaming Whine)
    // -------------------------------------------------------------
    const forcedInduction = engineState.forcedInduction || 'na';
    const turboSpool = engineState.turboSpool || 0;

    if (this.turboSpoolOsc && this.turboSpoolGain) {
      if (forcedInduction === 'turbo' && turboSpool > 0.03) {
        // High turbine whistling siren: 1300 Hz to 4600 Hz
        const turboPitch = Math.min(4600, 1300 + Math.pow(turboSpool, 1.35) * 3200);
        this.turboSpoolOsc.frequency.setTargetAtTime(turboPitch, t, smoothTime);
        this.turboSpoolFilter.frequency.setTargetAtTime(turboPitch, t, smoothTime);
        const turboVol = Math.pow(turboSpool, 1.25) * (0.05 + 0.13 * throttle);
        this.turboSpoolGain.gain.setTargetAtTime(isShiftCut ? turboVol * 0.4 : turboVol, t, smoothTime);

        // High-velocity pressurized intake air suction whoosh (roaring airflow under boost)
        if (this.turboAirFilter && this.turboAirGain) {
          const airFreq = Math.min(3800, 1500 + turboSpool * 2000);
          this.turboAirFilter.frequency.setTargetAtTime(airFreq, t, smoothTime);
          const boostFactor = Math.min(1.8, Math.sqrt((engineState.boostPressure || 0) + 0.20));
          const airVol = Math.pow(turboSpool, 1.15) * Math.pow(throttle, 0.90) * 0.20 * boostFactor;
          this.turboAirGain.gain.setTargetAtTime(isShiftCut ? 0.01 : airVol, t, smoothTime);
        }
      } else {
        this.turboSpoolGain.gain.setTargetAtTime(0.0, t, 0.04);
        if (this.turboAirGain) this.turboAirGain.gain.setTargetAtTime(0.0, t, 0.04);
      }
    }

    if (this.scWhineOsc && this.scWhineGain) {
      if (forcedInduction === 'supercharger') {
        const scPitch = Math.min(3600, 680 + (rpm / redline) * 2450);
        this.scWhineOsc.frequency.setTargetAtTime(scPitch, t, smoothTime);
        this.scWhineFilter.frequency.setTargetAtTime(scPitch, t, smoothTime);
        const scVol = (0.04 + 0.22 * (rpm / redline)) * Math.pow(throttle, 0.95);
        this.scWhineGain.gain.setTargetAtTime(isShiftCut ? 0.01 : scVol, t, isShiftCut ? 0.002 : smoothTime);
      } else {
        this.scWhineGain.gain.setTargetAtTime(0.0, t, 0.04);
      }
    }
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
