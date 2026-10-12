// GaugeRenderer.js
// Physical cockpit dials and the existing exhaust / backfire animation.
// Numeric telemetry is displayed separately by the dashboard HUD.

import { advanceGaugeNeedle } from './MechanicalKinematics.js';

export class GaugeRenderer {
  constructor(tachoCanvas, exhaustCanvas, speedCanvas = null) {
    this.tachoCanvas = tachoCanvas;
    this.tachoCtx = tachoCanvas.getContext('2d');

    this.speedCanvas = speedCanvas;
    this.speedCtx = speedCanvas?.getContext('2d') || null;

    this.exhaustCanvas = exhaustCanvas;
    this.exhaustCtx = exhaustCanvas.getContext('2d');

    // Backfire flame particles
    this.flameParticles = [];
    this.lastPopId = 0;
    this.flameJet = null;
    this.exhaustId = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // Each dial follows its own wrapper, including side-by-side mobile layouts.
    // Reset the backing transform so repeated resizes cannot accumulate DPR.
    for (const [canvas, ctx, sizeKey] of [
      [this.tachoCanvas, this.tachoCtx, 'tachoSize'],
      [this.speedCanvas, this.speedCtx, 'speedSize']
    ]) {
      if (!canvas || !ctx) continue;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = rect.width || 180;
      const size = Math.max(1, Math.min(width, rect.height || width));
      this[sizeKey] = size;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }

    // Exhaust pipe canvas resize
    if (this.exhaustCanvas) {
      const rect = this.exhaustCanvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.exWidth = rect.width;
      this.exHeight = Math.max(80, rect.height || 180);
      this.exhaustCanvas.width = this.exWidth * dpr;
      this.exhaustCanvas.height = this.exHeight * dpr;
      this.exhaustCanvas.style.width = `${this.exWidth}px`;
      this.exhaustCanvas.style.height = `${this.exHeight}px`;
      this.exhaustCtx.resetTransform();
      this.exhaustCtx.scale(dpr, dpr);
    }
  }

  // Trigger exhaust backfire flames
  triggerBackfireFlame(intensity = 1.0, duration = 0.3) {
    intensity = Math.min(2.4, intensity);
    this.flameJet = { intensity: Math.max(intensity, (this.flameJet?.intensity || 0) * 0.7),
      life: duration, duration };
    const count = Math.floor(18 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() - 0.5) * 0.45;
      const speed = (210 + Math.random() * 210) * Math.sqrt(intensity);
      const life = duration * (0.6 + Math.random() * 0.4);
      this.flameParticles.push({
        x: this.exWidth * 0.28 + 5,
        y: this.exHeight * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * (speed * 0.35),
        size: (12 + Math.random() * 16) * Math.sqrt(intensity),
        life,
        maxLife: life,
        hue: Math.random() < 0.35 ? 200 : 35 // Blue core or orange/yellow fire
      });
    }
    if (this.flameParticles.length > 240) this.flameParticles.splice(0, this.flameParticles.length - 240);
  }

  // Render all dashboard gauges
  render(engine, drivetrain, dt = 1 / 60, popEvents = []) {
    if (this.exhaustId !== engine.exhaust.id || !engine.isIgnitionOn) {
      this.flameParticles.length = 0;
      this.flameJet = null;
      this.exhaustId = engine.exhaust.id;
    }
    this.consumePopEvents(popEvents);
    this.renderTachometer(engine, drivetrain, dt);
    this.renderSpeedometer(engine, drivetrain, dt);
    this.renderExhaustPipe(engine, dt);
  }

  consumePopEvents(popEvents) {
    for (const pop of popEvents) {
      if (pop.id <= this.lastPopId) continue;
      this.lastPopId = pop.id;
      if (pop.hasFlame) this.triggerBackfireFlame(pop.flameIntensity ?? pop.intensity, pop.flameDuration);
    }
  }

  // All dial geometry uses a common 320 px design space; the backing canvas
  // remains independently sized and scaled for its wrapper and display DPR.
  beginDial(ctx, size) {
    const s = 320, cx = s / 2, cy = s / 2, radius = s * 0.405;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.scale(size / s, size / s);

    const bezel = ctx.createLinearGradient(0, 0, s, s);
    bezel.addColorStop(0, '#53575b');
    bezel.addColorStop(0.16, '#232629');
    bezel.addColorStop(0.5, '#08090a');
    bezel.addColorStop(0.8, '#34383c');
    bezel.addColorStop(1, '#131517');
    ctx.fillStyle = bezel;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#060708';
    ctx.lineWidth = 2;
    ctx.stroke();

    const face = ctx.createRadialGradient(cx, cy * 0.7, 10, cx, cy, radius * 1.055);
    face.addColorStop(0, '#1c1d1f');
    face.addColorStop(0.6, '#101113');
    face.addColorStop(1, '#050607');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return { cx, cy, radius, startAngle: Math.PI * 0.75, sweep: Math.PI * 1.5 };
  }

  drawDialScale(ctx, dial, maximum, majorStep, label, units, redline = null) {
    const { cx, cy, radius, startAngle, sweep } = dial;
    const redAngle = redline === null ? startAngle + sweep
      : startAngle + sweep * Math.max(0, Math.min(1, redline / maximum));
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
    ctx.stroke();
    if (redline !== null) {
      ctx.strokeStyle = '#c9372b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, redAngle, startAngle + sweep);
      ctx.stroke();
    }

    const steps = Math.round(maximum / majorStep) * 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const value = maximum * i / steps;
      const angle = startAngle + sweep * i / steps;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const major = i % 5 === 0;
      const red = redline !== null && value >= redline;
      ctx.strokeStyle = red ? '#ef5945' : major ? '#f3f1eb' : '#8c8d8a';
      ctx.lineWidth = major ? 2.4 : 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + cos * (radius - (major ? 15 : 7)), cy + sin * (radius - (major ? 15 : 7)));
      ctx.lineTo(cx + cos * radius, cy + sin * radius);
      ctx.stroke();
      if (!major) continue;
      ctx.fillStyle = red ? '#ef5945' : '#f3f1eb';
      ctx.font = '600 16px Arial, sans-serif';
      const text = units === '×1000 r/min' ? Number((value / 1000).toFixed(1)).toString() : Math.round(value).toString();
      ctx.fillText(text, cx + cos * (radius - 34), cy + sin * (radius - 34));
    }

    // Markings sit in the unused lower sweep gap. Live numbers belong to HUD.
    ctx.fillStyle = '#f1eee7';
    ctx.font = '600 14px Arial, sans-serif';
    ctx.fillText(label, cx, cy + radius * 0.53);
    ctx.fillStyle = '#a3a29d';
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(units, cx, cy + radius * 0.70);
  }

  drawDialNeedle(ctx, dial, value, maximum) {
    const { cx, cy, radius, startAngle, sweep } = dial;
    const angle = startAngle + sweep * Math.max(0, Math.min(1, value / maximum));
    const cos = Math.cos(angle), sin = Math.sin(angle);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = '#ef542e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - cos * 18, cy - sin * 18);
    ctx.lineTo(cx + cos * (radius - 14), cy + sin * (radius - 14));
    ctx.stroke();
    ctx.restore();

    const hub = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 16);
    hub.addColorStop(0, '#4b4e50');
    hub.addColorStop(0.45, '#26282a');
    hub.addColorStop(1, '#08090a');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5b5e60';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#121314';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  renderTachometer(engine, drivetrain, dt = 1 / 60) {
    if (!this.tachoCtx || !this.tachoSize) return;
    if (this.needleRPM === undefined) {
      this.needleRPM = engine.isIgnitionOn ? engine.rpm : 0;
      this.needleVelocity = 0;
    }
    const needle = advanceGaugeNeedle(this.needleRPM, this.needleVelocity,
      engine.isIgnitionOn ? engine.rpm : 0, dt);
    this.needleRPM = needle.position;
    this.needleVelocity = needle.velocity;
    const redline = Math.max(1, engine.redlineRPM);
    const majorStep = redline > 10000 ? 2000 : redline < 5000 ? 500 : 1000;
    const maximum = Math.ceil((redline + majorStep * 0.5) / majorStep) * majorStep;
    const dial = this.beginDial(this.tachoCtx, this.tachoSize);
    this.drawDialScale(this.tachoCtx, dial, maximum, majorStep, 'RPM', '×1000 r/min', redline);
    this.drawDialNeedle(this.tachoCtx, dial, this.needleRPM, maximum);
    this.tachoCtx.restore();
  }

  speedScale(engine, drivetrain) {
    let theoretical = 0;
    // Use every forward ratio, rather than assuming all presets have six gears.
    if (drivetrain?.calcSpeedFromRPM) {
      for (const gear of Object.keys(drivetrain.gearRatios || {}).map(Number)) {
        if (gear <= 0) continue;
        const speed = drivetrain.calcSpeedFromRPM(gear, engine.redlineRPM);
        if (Number.isFinite(speed)) theoretical = Math.max(theoretical, speed);
      }
    }
    const rangeStep = theoretical > 480 ? 80 : 40;
    const maximum = Math.max(240, Math.ceil(theoretical / rangeStep) * rangeStep);
    const majorStep = maximum <= 280 ? 20 : maximum <= 480 ? 40
      : maximum <= 800 ? 80 : Math.ceil(maximum / 1000) * 100;
    // Large experimental ratios can require a coarser range as well as ticks.
    return { maximum: Math.ceil(maximum / majorStep) * majorStep, majorStep };
  }

  renderSpeedometer(engine, drivetrain, dt = 1 / 60) {
    if (!this.speedCtx || !this.speedSize) return;
    // A speedometer reads road motion even with ignition off, including reverse.
    const speed = Math.abs(Number(drivetrain?.speedKmh) || 0);
    if (this.needleSpeed === undefined) {
      this.needleSpeed = speed;
      this.speedNeedleVelocity = 0;
    }
    const needle = advanceGaugeNeedle(this.needleSpeed, this.speedNeedleVelocity, speed, dt);
    this.needleSpeed = needle.position;
    this.speedNeedleVelocity = needle.velocity;
    const { maximum, majorStep } = this.speedScale(engine, drivetrain);
    this.speedMaxKmh = maximum;
    const dial = this.beginDial(this.speedCtx, this.speedSize);
    this.drawDialScale(this.speedCtx, dial, maximum, majorStep, 'SPEED', 'km/h');
    this.drawDialNeedle(this.speedCtx, dial, this.needleSpeed, maximum);
    this.speedCtx.restore();
  }

  // Render Exhaust Tailpipe & Backfire Flame Spit
  renderExhaustPipe(engine, dt = 1 / 60) {
    if (!this.exhaustCtx) return;
    const ctx = this.exhaustCtx;
    const w = this.exWidth;
    const h = this.exHeight;

    ctx.clearRect(0, 0, w, h);

    const pipeX = w * 0.28;
    const pipeY = h * 0.5;
    const pipeR = 34;

    ctx.save();

    // Exhaust Pipe Body
    const bodyGrad = ctx.createLinearGradient(0, pipeY - pipeR, pipeX, pipeY + pipeR);
    if (engine.exhaust.id === 'akrapovic') {
      // Titanium blued gradient (grey to violet-blue)
      bodyGrad.addColorStop(0, '#475569');
      bodyGrad.addColorStop(0.4, '#64748b');
      bodyGrad.addColorStop(0.7, '#6366f1'); // Titanium violet
      bodyGrad.addColorStop(0.9, '#38bdf8'); // Blue flame burn
      bodyGrad.addColorStop(1, '#1e293b');
    } else if (engine.exhaust.id === 'sc_project') {
      // Carbon fiber dark pattern + matte metal
      bodyGrad.addColorStop(0, '#18181b');
      bodyGrad.addColorStop(0.6, '#27272a');
      bodyGrad.addColorStop(1, '#09090b');
    } else {
      // Chrome/Steel
      bodyGrad.addColorStop(0, '#334155');
      bodyGrad.addColorStop(0.5, '#94a3b8');
      bodyGrad.addColorStop(1, '#1e293b');
    }

    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, pipeY - pipeR, pipeX, pipeR * 2);

    // Exhaust Tip Bevel Ring
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(pipeX, pipeY, 10, pipeR, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Dark pipe interior
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.ellipse(pipeX, pipeY, 8, pipeR - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heat glow at pipe rim if hot
    if (engine.exhaustHeat > 0.3) {
      const glowA = (engine.exhaustHeat - 0.3) * 1.4;
      ctx.strokeStyle = `rgba(255, 87, 34, ${glowA})`;
      ctx.shadowColor = '#ff5722';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.ellipse(pipeX, pipeY, 9, pipeR - 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // A connected blue core and orange plume make strong bursts readable even
    // between particles. Length and lifetime come from the selected exhaust.
    if (this.flameJet?.life > 0) {
      const jet = this.flameJet;
      jet.life = Math.max(0, jet.life - dt);
      const envelope = Math.sin(Math.PI * Math.min(0.5, jet.life / jet.duration));
      const length = Math.min(w * 0.65, 45 + 82 * jet.intensity) * envelope;
      const radius = Math.min(pipeR * 0.9, 10 + jet.intensity * 12) * envelope;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#ff7525';
      ctx.shadowBlur = 18 * envelope;
      const plume = ctx.createLinearGradient(pipeX, pipeY, pipeX + Math.max(1, length), pipeY);
      plume.addColorStop(0, `rgba(210,245,255,${envelope})`);
      plume.addColorStop(0.18, `rgba(60,180,255,${envelope * 0.9})`);
      plume.addColorStop(0.45, `rgba(255,180,60,${envelope * 0.9})`);
      plume.addColorStop(1, 'rgba(255,50,10,0)');
      ctx.fillStyle = plume;
      ctx.beginPath();
      ctx.moveTo(pipeX + 3, pipeY - radius * 0.65);
      ctx.bezierCurveTo(pipeX + length * 0.35, pipeY - radius, pipeX + length * 0.7, pipeY - radius * 0.4, pipeX + length, pipeY);
      ctx.bezierCurveTo(pipeX + length * 0.7, pipeY + radius * 0.4, pipeX + length * 0.35, pipeY + radius, pipeX + 3, pipeY + radius * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Render Flame Particles
    for (let i = this.flameParticles.length - 1; i >= 0; i--) {
      const p = this.flameParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size *= Math.pow(0.96, dt * 60);
      p.life -= dt;

      if (p.life <= 0) {
        this.flameParticles.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.shadowColor = p.hue === 200 ? '#00f0ff' : '#ff6600';
      ctx.shadowBlur = 25;

      const fGrad = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
      if (p.hue === 200) {
        fGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        fGrad.addColorStop(0.3, `rgba(56, 189, 248, ${alpha * 0.9})`);
        fGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      } else {
        fGrad.addColorStop(0, `rgba(255, 255, 200, ${alpha})`);
        fGrad.addColorStop(0.4, `rgba(249, 115, 22, ${alpha * 0.9})`);
        fGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      }

      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}
