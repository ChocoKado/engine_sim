// GaugeRenderer.js
// Visualizes Racing Cockpit Gauges:
// 1. High-precision Tachometer with Shift Lights (F1/GT3 style)
// 2. Digital Speedometer & Gear Indicator
// 3. Dynamic Dyno Horsepower & Torque Telemetry
// 4. Exhaust Tailpipe with Animated Backfire Flames

import { advanceGaugeNeedle } from './MechanicalKinematics.js';

export class GaugeRenderer {
  constructor(tachoCanvas, exhaustCanvas) {
    this.tachoCanvas = tachoCanvas;
    this.tachoCtx = tachoCanvas.getContext('2d');

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
    // Tachometer canvas resize
    if (this.tachoCanvas) {
      const rect = this.tachoCanvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const size = Math.min(rect.width, 360);
      this.tachoSize = size;
      this.tachoCanvas.width = size * dpr;
      this.tachoCanvas.height = size * dpr;
      this.tachoCanvas.style.width = `${size}px`;
      this.tachoCanvas.style.height = `${size}px`;
      this.tachoCtx.resetTransform();
      this.tachoCtx.scale(dpr, dpr);
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
    this.renderExhaustPipe(engine, dt);
  }

  consumePopEvents(popEvents) {
    for (const pop of popEvents) {
      if (pop.id <= this.lastPopId) continue;
      this.lastPopId = pop.id;
      if (pop.hasFlame) this.triggerBackfireFlame(pop.flameIntensity ?? pop.intensity, pop.flameDuration);
    }
  }

  // Render Racing Tachometer
  renderTachometer(engine, drivetrain, dt = 1 / 60) {
    if (!this.tachoCtx) return;
    const ctx = this.tachoCtx;
    const s = this.tachoSize;
    const cx = s / 2;
    const cy = s / 2;
    const radius = s * 0.42;

    // Physical stepper motor needle tracking:
    // Natural frequency omega_n = 46 rad/s, damping ratio zeta = 0.84
    // Gives immediate, razor-fast response with authentic mechanical settling on rapid RPM drops
    if (this.needleRPM === undefined) {
      this.needleRPM = engine.rpm;
      this.needleVelocity = 0;
    }
    const targetRPM = engine.isIgnitionOn ? engine.rpm : 0;
    const needle = advanceGaugeNeedle(this.needleRPM, this.needleVelocity, targetRPM, dt);
    this.needleRPM = needle.position;
    this.needleVelocity = needle.velocity;

    ctx.clearRect(0, 0, s, s);

    // Outer Bezel with carbon & dark steel gradient
    const outerGrad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.15);
    outerGrad.addColorStop(0, '#151922');
    outerGrad.addColorStop(0.85, '#1e2532');
    outerGrad.addColorStop(1, '#0b0e14');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2);
    ctx.fill();

    // Metallic ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Tachometer Scale: sweeps from 135 deg to 405 deg (270 degree arc)
    const startAngle = (135 * Math.PI) / 180;
    const endAngle = (405 * Math.PI) / 180;
    const totalAngle = endAngle - startAngle;

    const maxRPM = Math.ceil(engine.redlineRPM / 1000) * 1000;
    const redline = engine.redlineRPM;
    const redlineRatio = redline / maxRPM;
    const redlineAngle = startAngle + totalAngle * redlineRatio;

    // Track arc (Normal zone: Cyan / White)
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, redlineAngle);
    ctx.stroke();

    // Track arc (Redline danger zone)
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, redlineAngle, endAngle);
    ctx.stroke();

    // Tick Marks & Digits
    const numTicks = maxRPM / 1000;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numTicks; i++) {
      const rpmVal = i * 1000;
      const angle = startAngle + (i / numTicks) * totalAngle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const isRedlineTick = rpmVal >= redline;
      ctx.strokeStyle = isRedlineTick ? '#ef4444' : 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2.5;

      // Major tick mark
      ctx.beginPath();
      ctx.moveTo(cx + cos * (radius - 12), cy + sin * (radius - 12));
      ctx.lineTo(cx + cos * radius, cy + sin * radius);
      ctx.stroke();

      // Number label (1, 2, 3... 10 x1000 RPM)
      const labelR = radius - 26;
      ctx.font = '700 13px Orbitron, Rajdhani, sans-serif';
      ctx.fillStyle = isRedlineTick ? '#ef4444' : '#e2e8f0';
      ctx.fillText(`${i}`, cx + cos * labelR, cy + sin * labelR);

      // Minor tick mark (500 RPM)
      if (i < numTicks) {
        const midAngle = angle + (0.5 / numTicks) * totalAngle;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(midAngle) * (radius - 7), cy + Math.sin(midAngle) * (radius - 7));
        ctx.lineTo(cx + Math.cos(midAngle) * radius, cy + Math.sin(midAngle) * radius);
        ctx.stroke();
      }
    }

    // Shift Light LED Bar (GT3 / F1 style)
    this.drawShiftLights(ctx, cx, cy - radius * 0.45, radius * 0.9, engine);

    // Center Inner Disc & Dial Face (Uncluttered, sleek racing hub)
    const innerRadius = radius * 0.52;
    const innerGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, innerRadius);
    innerGrad.addColorStop(0, '#0c1017');
    innerGrad.addColorStop(0.7, '#141a24');
    innerGrad.addColorStop(1, '#1e2634');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dial markings in upper center (above pivot, immune to needle)
    ctx.font = '700 11px Orbitron, Rajdhani, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('TACHOMETER', cx, cy - innerRadius * 0.46);
    ctx.font = '600 10px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('RPM x1000', cx, cy - innerRadius * 0.22);

    // Dynamic Needle (sweeping cleanly across tick marks with physical stepper inertia)
    const currentRpmRatio = Math.min(1.05, Math.max(0, this.needleRPM / maxRPM));
    const needleAngle = startAngle + currentRpmRatio * totalAngle;

    ctx.save();
    ctx.shadowColor = engine.isRevLimiting ? '#ef4444' : '#ff1744';
    ctx.shadowBlur = 14;

    ctx.strokeStyle = engine.isRevLimiting ? '#ff0033' : '#ff1744';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAngle) * 16, cy - Math.sin(needleAngle) * 16);
    ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 10), cy + Math.sin(needleAngle) * (radius - 10));
    ctx.stroke();

    // Center Needle Hub & Cap
    const hubGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
    hubGrad.addColorStop(0, '#334155');
    hubGrad.addColorStop(0.5, '#1e293b');
    hubGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = hubGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = engine.isRevLimiting ? '#ef4444' : '#00f0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing center pivot dot
    ctx.fillStyle = engine.isRevLimiting ? '#ef4444' : '#00f0ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw F1 / GT3 Sequential Shift Lights
  drawShiftLights(ctx, cx, y, width, engine) {
    const numLeds = 10;
    const ledW = (width / numLeds) * 0.72;
    const ledH = 8;
    const startX = cx - width / 2;

    const rpmRatio = engine.rpm / engine.redlineRPM;

    for (let i = 0; i < numLeds; i++) {
      const ledThreshold = 0.55 + (i / numLeds) * 0.45;
      const isLit = rpmRatio >= ledThreshold;
      const x = startX + i * (width / numLeds) + (width / numLeds - ledW) / 2;

      let color = '#22c55e'; // Green for first 4
      if (i >= 4 && i < 7) color = '#eab308'; // Yellow for next 3
      if (i >= 7) color = '#ef4444'; // Red for last 3

      // Flash all red if hitting rev limiter!
      if (engine.isRevLimiting) {
        color = (Math.floor(performance.now() / 60) % 2 === 0) ? '#38bdf8' : '#ef4444';
      }

      ctx.save();
      if (isLit || engine.isRevLimiting) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, ledW, ledH, 3);
      ctx.fill();
      ctx.restore();
    }
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
