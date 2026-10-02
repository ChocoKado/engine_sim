// SoundEngine.js
// Sample-rate cylinder pressure pulses, separate intake acoustics and bounded
// exhaust resonators. This procedural model does not replace vehicle recordings.

import { EXHAUST_MODELS } from './ExhaustModels.js';
import { ENGINE_CONFIGS } from '../physics/EngineConfigurations.js';
import { combustionWorkletSource, inductionEventShape } from './CombustionDSP.js';

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
    this.pressureNode = null;
    this.pressureGain = null;
    this.activeBursts = new Set();
    this.acousticBackend = 'oscillator-fallback';
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
    // A final bounded transfer stage catches transient overshoot after the
    // compressor without allowing pops or valve noises to clip the DAC.
    this.safetyClip = this.ctx.createWaveShaper();
    this.safetyClip.curve = Float32Array.from({ length: 1025 }, (_, i) => {
      const x = i * 2 / 1024 - 1;
      return 0.98 * Math.tanh(x / 0.98);
    });
    this.safetyClip.oversample = '2x';
    this.compressor.connect(this.safetyClip);
    this.safetyClip.connect(this.ctx.destination);

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
    await this.setupPressureGenerator();

    this.isStarted = true;
    this.setSoundProfile(this.soundProfile);
    this.setExhaustModel(this.currentExhaust);
    // Never expose the generators' default 440 Hz tones on the first start.
    this.update({ rpm: this.engineConfig.defaultIdleRPM, displacement: this.engineConfig.defaultDisplacement,
      manifoldThrottle: 0.045, forcedInduction: 'na' }, this.engineConfig, {});
    this.setRunning(this.running);
  }

  async setupPressureGenerator() {
    // Web Audio Worklet preserves individual firing phases between UI frames.
    // Older browsers / test contexts retain the bounded periodic-wave fallback.
    if (!this.ctx.audioWorklet || typeof globalThis.AudioWorkletNode !== 'function') return;
    let url;
    try {
      url = URL.createObjectURL(new Blob([combustionWorkletSource()], { type: 'text/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      this.pressureNode = new AudioWorkletNode(this.ctx, 'combustion-pressure', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { config: { ...this.engineConfig, profile: this.soundProfile } },
      });
      const failed = error => {
        this.workletError = String(error || 'Combustion processor stopped');
        this.pressureNode?.disconnect();
        this.pressureNode = null;
        this.acousticBackend = 'oscillator-fallback';
        this.combustionGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.005);
      };
      this.pressureNode.onprocessorerror = () => failed();
      this.pressureNode.port.onmessage = ({ data }) => { if (data.error) failed(data.error); };
      this.pressureGain = this.ctx.createGain();
      this.pressureGain.gain.setValueAtTime(1.25, this.ctx.currentTime);
      this.pressureNode.connect(this.pressureGain);
      this.pressureGain.connect(this.saturationDriveGain);
      this.combustionGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.acousticBackend = 'pressure-worklet';
    } catch (error) {
      this.pressureNode = null;
      this.acousticBackend = 'oscillator-fallback';
      // Restricted audio policies may disallow a worklet; fallback stays usable.
      this.workletError = String(error.message || error);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  configurePressureGenerator(displacement = this.engineConfig.defaultDisplacement) {
    this.pressureNode?.port.postMessage({ config: {
      ...this.engineConfig, displacement, profile: this.soundProfile,
    } });
    this.pressureConfigurationKey = `${this.engineConfig.id}:${displacement}:${this.soundProfile}`;
  }

  trackBurst(source, nodes) {
    this.activeBursts.add(source);
    source.onended = () => {
      this.activeBursts.delete(source);
      for (const node of nodes) node.disconnect();
    };
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
    this.exhaustHighpass = this.ctx.createBiquadFilter();
    this.exhaustHighpass.type = 'highpass';
    this.exhaustHighpass.frequency.setValueAtTime(22, this.ctx.currentTime);
    this.exhaustHighpass.Q.setValueAtTime(0.6, this.ctx.currentTime);
    this.waveShaperNode.connect(this.exhaustHighpass);
    this.exhaustHighpass.connect(this.helmholtzFilter);
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
      // Fourier fallback approximates a steep pressure rise and slower decay.
      const shockFront = 1.0 + 0.12 * Math.sin(Math.min(Math.PI, i * width));

      for (let cylinder = 0; cylinder < config.firingAngles.length; cylinder++) {
        const phase = (360 - config.firingAngles[cylinder]) / 720 * Math.PI * 2;
        const angle = i * phase;
        // Separate-bank exhaust paths contribute unequal pulse amplitudes.
        const bank = config.exhaustBanks?.[cylinder] ?? (cylinder % 2);
        const bankGain = (config.layout === 'v' || config.layout === 'w') && bank ? 0.78 : 1;
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
    // Audible shaft order; actual compressor blade-pass orders are higher.
    real[1] = 0.85;
    // Housing scroll aerodynamic harmonics
    real[2] = 0.10;
    real[3] = 0.03;
    real[4] = 0.008;
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
    // Intake and exhaust are separate acoustic paths. Sending intake noise
    // through exhaust resonators masked the ignition-cut breakpoint.
    this.intakeGain.connect(this.masterGain);

    // 7A. Quiet turbo shaft-order tone underneath intake airflow.
    this.turboSpoolOsc = this.ctx.createOscillator();
    const turboWave = this.createTurboWhistleWave();
    this.turboSpoolOsc.setPeriodicWave(turboWave);
    this.turboSpoolFilter = this.ctx.createBiquadFilter();
    this.turboSpoolFilter.type = 'lowpass';
    this.turboSpoolFilter.frequency.setValueAtTime(1400, t);
    this.turboSpoolFilter.Q.setValueAtTime(0.55, t);
    this.turboSpoolGain = this.ctx.createGain();
    this.turboSpoolGain.gain.setValueAtTime(0.0, t);
    this.turboSpoolOsc.connect(this.turboSpoolFilter);
    this.turboSpoolFilter.connect(this.turboSpoolGain);
    this.turboSpoolGain.connect(this.masterGain);

    // 7B. Turbocharger Pressurized Intake Air Suction Rush (1.5 kHz - 4.2 kHz roaring whoosh)
    this.turboAirFilter = this.ctx.createBiquadFilter();
    this.turboAirFilter.type = 'bandpass';
    this.turboAirFilter.frequency.setValueAtTime(1800, t);
    this.turboAirFilter.Q.setValueAtTime(0.65, t);
    this.turboAirGain = this.ctx.createGain();
    this.turboAirGain.gain.setValueAtTime(0.0, t);
    this.intakeNoiseNode.connect(this.turboAirFilter);
    this.turboAirFilter.connect(this.turboAirGain);
    this.turboAirGain.connect(this.masterGain);

    // 8. Roots / TVS rotor passage whine.
    this.scWhineOsc = this.ctx.createOscillator();
    // Four-lobe TVS passage pressure ripple; a sawtooth sounded like a synth.
    this.scWhineOsc.setPeriodicWave(this.ctx.createPeriodicWave(
      new Float32Array([0, 0.82, 0.18, 0.055, 0.015]), new Float32Array(5),
      { disableNormalization: false },
    ));
    this.scWhineFilter = this.ctx.createBiquadFilter();
    this.scWhineFilter.type = 'bandpass';
    this.scWhineFilter.frequency.setValueAtTime(1600, t);
    this.scWhineFilter.Q.setValueAtTime(0.80, t);
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
    this.configurePressureGenerator(this.currentDisplacement);

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
    this.trackBurst(burstNode, [burstNode, burstFilter, burstGain]);
    this.trackBurst(subOsc, [subOsc, subGain]);
  }

  // Valve sound follows the stored charge pressure and vent duration.
  playBovSound(eventOrIntensity = 1.0) {
    if (!this.ctx || !this.isStarted || !this.running) return;
    const event = inductionEventShape(eventOrIntensity, 'bov');
    if (event.intensity <= 0) return;
    const t = Math.max(this.ctx.currentTime, Number(event.when) || this.ctx.currentTime);
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.ceil(sampleRate * event.duration), sampleRate);
    const data = buffer.getChannelData(0);
    let noiseBody = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / sampleRate;
      const progress = time / event.duration;
      const envelope = (1 - Math.exp(-time / 0.0025)) * Math.exp(-progress * 4.8) * (1 - progress);
      const noise = Math.random() * 2 - 1;
      noiseBody += (noise - noiseBody) * 0.28;
      // Broad pressure-driven vent rush with a small lip tone, not a laser chirp.
      const lipHz = 1300 + Math.sqrt(event.pressure) * 340 - progress * 480;
      data[i] = (noise * 0.48 + noiseBody * 0.5 + Math.sin(2 * Math.PI * lipHz * time) * 0.045) * envelope;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(480, t);
    filter.Q.setValueAtTime(0.6, t);
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(3800 + Math.min(2200, event.pressure * 750), t);
    lowpass.Q.setValueAtTime(0.6, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.68, 0.26 * Math.sqrt(event.pressure) * event.intensity), t);
    source.connect(filter);
    filter.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);
    this.trackBurst(source, [source, filter, lowpass, gain]);
    source.start(t);
  }

  // Surge pulses slow and weaken as charge pressure and rotor energy decay.
  playFlutterSound(eventOrIntensity = 1.0) {
    if (!this.ctx || !this.isStarted || !this.running) return;
    const event = inductionEventShape(eventOrIntensity, 'flutter');
    if (event.intensity <= 0) return;
    const t = Math.max(this.ctx.currentTime, Number(event.when) || this.ctx.currentTime);
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.ceil(sampleRate * event.duration), sampleRate);
    const data = buffer.getChannelData(0);
    let pulseStart = 0;
    let pulse = 0;
    while (pulseStart < event.duration) {
      const progress = pulseStart / event.duration;
      const rate = event.pulseRate * (1 - progress * 0.58);
      const interval = 1 / Math.max(5, rate);
      const pulseDuration = Math.min(interval * 0.83, 0.10);
      const amplitude = Math.exp(-progress * 3.1) * (1 - progress);
      const rotorRatio = Math.max(0.24, 1 - progress * 0.75);
      const toneStart = 650 + event.rotorRPM / 85 * rotorRatio;
      const toneEnd = toneStart * 0.56;
      const cavityHz = 205 + Math.sqrt(event.pressure) * 58;
      const first = Math.floor(pulseStart * sampleRate);
      const last = Math.min(data.length, Math.ceil((pulseStart + pulseDuration) * sampleRate));
      for (let i = first; i < last; i++) {
        const age = i / sampleRate - pulseStart;
        const envelope = (1 - Math.exp(-age / 0.0014)) * Math.exp(-age / (pulseDuration * 0.24));
        // Integrate a chirp's frequency; f(t)*t would double its sweep speed.
        const phase = 2 * Math.PI * (toneStart * age + (toneEnd - toneStart) * age * age / (2 * pulseDuration));
        const stalledBlade = Math.sin(phase) * 0.39;
        const pipePressure = Math.sin(2 * Math.PI * cavityHz * age) * 0.30;
        const turbulentChop = (Math.random() * 2 - 1) * 0.38;
        data[i] += (stalledBlade + pipePressure + turbulentChop) * envelope * amplitude;
      }
      pulseStart += interval;
      pulse++;
      if (pulse > 40) break;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(4200, t);
    lowpass.Q.setValueAtTime(0.65, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.78, 0.42 * Math.sqrt(event.pressure) * event.intensity), t);
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);
    this.trackBurst(source, [source, lowpass, gain]);
    source.start(t);
  }
  // Real-time audio frame update
  update(engineState, config, drivetrainState = {}) {
    if (!this.ctx || !this.isStarted) return;

    const t = this.ctx.currentTime;
    this.setEngineConfig(config);
    const rpm = Math.max(120, engineState.rpm || 1000);
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
      const whineVol = Math.min(0.012, 0.002 + (speedKmh / 200) * 0.010);
      this.gearWhineGain.gain.setTargetAtTime(whineVol, t, smoothTime);
    } else {
      this.gearWhineGain.gain.setTargetAtTime(0.0, t, 0.05);
    }

    // -------------------------------------------------------------
    // 2. Non-linear WaveShaper Saturation & Shift Ignition Cut Breakpoint
    // -------------------------------------------------------------
    // During an upshift with load, ECU cuts ignition spark:
    // This creates an authentic ignition cut without a silent dead hole:
    // Combustion snap dips into a deep, muffled hollow burble (~45%),
    // keeping exhaust resonance and crank momentum audibly continuous!
    const shiftingUp = Boolean(drivetrainState.isShifting && drivetrainState.isUpshift);
    const measuredCut = drivetrainState.cutAmount ?? engineState.cutAmount;
    const torqueScale = engineState.torqueScale ?? drivetrainState.torqueScale;
    const fallbackCut = shiftingUp ? (drivetrainState.mode === 'at' ? 0.34 : 0.90) : 0;
    const cutAmount = Math.max(0, Math.min(1, measuredCut
      ?? (engineState.ignitionCut ? (torqueScale == null ? 1 : 1 - torqueScale) : fallbackCut)));
    const isShiftCut = cutAmount > 0.05;
    const limiterAmount = Math.max(0, Math.min(1, engineState.revLimiterCutAmount
      ?? (engineState.isRevLimiting ? 1 : 0)));
    const displacement = engineState.displacement || (config && config.defaultDisplacement) || 1000;
    const dispLiters = Math.max(0.125, displacement / 1000);
    this.currentDisplacement = displacement;
    if (`${config.id}:${displacement}:${this.soundProfile}` !== this.pressureConfigurationKey) {
      this.configurePressureGenerator(displacement);
    }
    if (this.pressureNode) {
      const pressureLoad = Math.min(1.6, throttle * Math.sqrt(1 + Math.max(0, engineState.boostPressure || 0)));
      this.pressureNode.parameters.get('rpm').setTargetAtTime(rpm, t, 0.0025);
      this.pressureNode.parameters.get('load').setTargetAtTime(pressureLoad, t, 0.006);
      this.pressureNode.parameters.get('ignitionCut').setTargetAtTime(cutAmount, t, 0.001);
      this.pressureNode.parameters.get('limiter').setTargetAtTime(limiterAmount, t, 0.003);
    }

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
    const driveAmount = rawDrive * (1 - cutAmount * 0.30);
    this.saturationDriveGain.gain.setTargetAtTime(driveAmount, t, isShiftCut ? 0.002 : smoothTime);

    // Primary combustion pulse softens into a muffled hollow ignition-cut tone (never 0 dead air!)
    const combustionVol = this.pressureNode ? 0 : 0.07 + 0.48 * (1 - cutAmount);
    this.combustionGain.gain.setTargetAtTime(combustionVol, t, isShiftCut ? 0.0015 : 0.007);

    // Sub-bass thump (30-80 Hz) physically scales with displacement volume:
    // Large displacement engines deliver deep chest-thumping bass; small engines have tighter pulse
    const dispBassMod = 0.52 + 0.48 * Math.min(2.2, Math.sqrt(dispLiters));
    // These are quiet mechanical orders; exhaust pressure supplies the body.
    // Large pure sine layers obscured both firing order and the shift breakpoint.
    const baseSubBassVol = (this.soundProfile === 'muscle' ? 0.075 : this.soundProfile === 'screamer' ? 0.028 : 0.045) * dispBassMod;
    const baseCamVol = (this.soundProfile === 'muscle' ? 0.035 : this.soundProfile === 'screamer' ? 0.010 : 0.019) * Math.min(1.8, 0.65 + 0.35 * Math.sqrt(dispLiters));
    const orderLayerScale = this.pressureNode ? 0.18 : 1;
    this.subBassGain.gain.setTargetAtTime(baseSubBassVol * orderLayerScale * (1 - cutAmount * 0.18), t, 0.005);
    this.camshaftGain.gain.setTargetAtTime(baseCamVol * orderLayerScale * (1 - cutAmount * 0.18), t, 0.005);

    // -------------------------------------------------------------
    // 3. Dynamic Intake Induction Roar
    // -------------------------------------------------------------
    // Airflow volume is proportional to displacement * RPM
    const intakeAirflow = Math.min(2.4, Math.sqrt(dispLiters));
    const intakeVol = Math.pow(throttle, 1.35) * (0.020 + 0.045 * intakeAirflow);
    this.intakeGain.gain.setTargetAtTime(intakeVol, t, 0.015);
    // Induction formant shifts with displacement and revs
    const intakeCenterFreq = Math.max(110, Math.min(1600, (220 + rpm * 0.028) * Math.pow(1.0 / dispLiters, 0.14)));
    this.intakeFilter.frequency.setTargetAtTime(intakeCenterFreq, t, smoothTime);

    // Harmonic Cut during shift cut: softens high-order firing ping while preserving body
    const baseHarmonic = this.soundProfile === 'muscle' ? 0.015 : this.soundProfile === 'screamer' ? 0.042 : 0.025;
    this.harmonicGain.gain.setTargetAtTime(baseHarmonic * (this.pressureNode ? 0.12 : 1) * (1 - cutAmount * 0.94), t, isShiftCut ? 0.0015 : 0.007);

    // -------------------------------------------------------------
    // 4. Rev Limiter Staccato Gate Handling
    // -------------------------------------------------------------
    // Keep exhaust resonance audible through a shift. Only the redline limiter
    // uses rhythmic gating; AT has a smaller load dip than AMT.
    this.limiterGate.gain.setTargetAtTime(!this.pressureNode ? 1 - limiterAmount * 0.28 : 1, t, 0.008);
    this.limiterModGain.gain.setTargetAtTime(!this.pressureNode ? limiterAmount * 0.28 : 0, t, 0.008);

    // -------------------------------------------------------------
    // 5. Dynamic Tone Formant Tracking
    // -------------------------------------------------------------
    // Exhaust Helmholtz resonance and collector formant scale with displacement:
    // Large displacement lowers Helmholtz frequency (55-80 Hz vs 120-160 Hz for small engines)
    const baseHelmholtz = this.currentExhaust.resonanceFreq;
    const tunedHelmholtz = Math.max(52, Math.min(200, baseHelmholtz * Math.pow(1.0 / dispLiters, 0.18)));
    this.helmholtzFilter.frequency.setTargetAtTime(tunedHelmholtz, t, smoothTime);

    const baseCollector = 380 * Math.sqrt(1 + throttle * 0.55);
    const collectorFreq = Math.max(220, Math.min(1800, baseCollector * Math.pow(1.0 / dispLiters, 0.12)));
    this.manifoldFilter.frequency.setTargetAtTime(collectorFreq, t, smoothTime);

    // -------------------------------------------------------------
    // 6. Forced Induction (Turbo Whistle & Supercharger Screaming Whine)
    // -------------------------------------------------------------
    const forcedInduction = engineState.forcedInduction || 'na';
    const turboRPM = Math.max(0, Number(engineState.turboRPM) || (engineState.turboSpool || 0) * 155000);
    const airFlow = Math.max(0, Number(engineState.airFlow) || dispLiters * rpm / 120 * 0.0012 * throttle);
    const boost = Math.max(0, engineState.boostPressure || 0);

    if (this.turboSpoolOsc && this.turboSpoolGain) {
      if (forcedInduction === 'turbo' && turboRPM > 3000) {
        // Audible shaft order sits beneath broad compressor airflow. Blade-pass
        // energy is mostly ultrasonic; it should not dominate as a shrill beep.
        const turboPitch = Math.max(70, Math.min(3100, turboRPM / 60));
        this.turboSpoolOsc.frequency.setTargetAtTime(turboPitch, t, smoothTime);
        this.turboSpoolFilter.frequency.setTargetAtTime(Math.min(3500, turboPitch * 1.18 + 400), t, smoothTime);
        const turboVol = Math.min(0.075, Math.sqrt(turboRPM / 180000) * (0.008 + Math.sqrt(airFlow) * 0.042));
        this.turboSpoolGain.gain.setTargetAtTime(turboVol, t, 0.025);

        // Pressurized intake airflow suction rush (clean intercooler pipe whoosh)
        if (this.turboAirFilter && this.turboAirGain) {
          const airFreq = Math.min(3400, 650 + turboRPM / 105 + Math.sqrt(boost) * 280);
          this.turboAirFilter.frequency.setTargetAtTime(airFreq, t, smoothTime);
          const airVol = Math.min(0.27, Math.sqrt(airFlow) * (0.12 + Math.sqrt(boost) * 0.085));
          this.turboAirGain.gain.setTargetAtTime(airVol, t, 0.018);
        }
      } else {
        this.turboSpoolGain.gain.setTargetAtTime(0.0, t, 0.04);
        if (this.turboAirGain) this.turboAirGain.gain.setTargetAtTime(0.0, t, 0.04);
      }
    }

    if (this.scWhineOsc && this.scWhineGain) {
      if (forcedInduction === 'supercharger') {
        const rotorRPM = Math.max(0, Number(engineState.superchargerRPM) || rpm * 2.35);
        const lobeCount = engineState.superchargerLobes || 4;
        const scPitch = Math.max(35, Math.min(6000, rotorRPM / 60 * lobeCount));
        this.scWhineOsc.frequency.setTargetAtTime(scPitch, t, smoothTime);
        this.scWhineFilter.frequency.setTargetAtTime(Math.min(7200, scPitch * 1.3), t, smoothTime);
        const bypass = Math.max(0, Math.min(1, engineState.bypassOpening ?? 1 - throttle));
        const inductionLoad = Math.max(0, Math.min(1.5, engineState.inductionLoad ?? throttle * Math.sqrt(boost + 0.1)));
        const scVol = Math.min(0.23, Math.sqrt(rotorRPM / 18000) * (0.012 + inductionLoad * 0.13) * (1 - bypass * 0.82));
        // The belt and rotors keep turning during an ignition cut.
        this.scWhineGain.gain.setTargetAtTime(scVol, t, 0.012);
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
    if (!this.running) {
      for (const source of this.activeBursts) {
        try { source.stop(); } catch { /* already ended */ }
      }
      this.activeBursts.clear();
    }
    if (this.outputGain) this.outputGain.gain.setTargetAtTime(this.running ? 1 : 0, this.ctx.currentTime, 0.035);
  }

  setEngineConfig(config) {
    this.engineConfig = config;
    if (!this.isStarted) return;
    const key = [config.id, this.soundProfile, ...config.firingAngles].join(':');
    if (key === this.waveKey) return;
    this.combustionOsc.setPeriodicWave(this.createCombustionPulseWave(this.soundProfile, config));
    this.waveKey = key;
    this.configurePressureGenerator(this.currentDisplacement || config.defaultDisplacement);
  }
}
