// EngineRenderer.js
// High-performance 2D Canvas rendering of engine mechanical cross-section:
// Pistons, connecting rods, crankshaft counterweights, camshaft valves,
// spark plug electric arc ignition, combustion fireball, and glowing exhaust runners.

import { radialKinematics, radialCyclePhase, cylinderViewLayout,
  rotaryHousingPoint, rotaryCycleKinematics, rotaryChamberState, pistonKinematics, pistonCyclePhase, engineAssemblyLayout } from './MechanicalKinematics.js';
import { camValveLift } from '../physics/CamControl.js';
import { rotaryRotorFacePoint, rotarySparkPlugMounts, rotaryShaftPhase } from '../physics/RotaryMechanics.js';
import { twoStrokePortState } from '../physics/TwoStrokeMechanics.js';
import { radialEngineKinematics } from '../physics/RadialMechanics.js';

export class EngineRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Display options
    this.viewMode = 'multi'; // 'multi' (all/bank cylinders) or 'focused' (single cylinder detail)
    this.focusedCylIndex = 0;

    // Slow-motion visual animation speed (0.05x to 1.0x)
    // Allows user to inspect stroke cycles clearly even at 16,000 RPM!
    this.animationSpeed = 1.0;
    this.visualCrankAngle = 0;
    this.visualConfigId = null;

    // Visual particles for sparks and flames
    this.sparkParticles = [];
    this.smokeParticles = [];

    // Clean animation mode for mobile/compact screens or user choice
    // When true, all overlapping cylinder text and canvas overlays are hidden, leaving pure mechanical animation
    this.cleanMode = false;

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setCleanMode(clean) {
    this.cleanMode = Boolean(clean);
  }

  toggleCleanMode() {
    this.cleanMode = !this.cleanMode;
    return this.cleanMode;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.width = rect.width;
    this.height = Math.max(80, rect.height || 380);

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  setAnimationSpeed(speed) {
    if (Number.isFinite(Number(speed))) this.animationSpeed = Math.max(0.05, Math.min(1.0, Number(speed)));
  }

  setViewMode(mode) {
    this.viewMode = mode;
  }

  setFocusedCylinder(idx) {
    this.focusedCylIndex = idx;
  }

  // Main render pass
  render(engine, drivetrain, dt = 0.016) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Advance visual crank angle scaled by animationSpeed:
    // Engine RPM stays full speed for sound & physics, while visual animation runs at user's chosen speed!
    if (this.visualConfigId !== engine.config.id) {
      this.visualConfigId = engine.config.id;
      this.visualCrankAngle = engine.coreAngle ?? engine.crankAngle;
      this.visualPowerAngle = engine.powerTurbineAngle || 0;
      this.visualOutputAngle = engine.crankAngle || 0;
      this.sparkParticles.length = 0;
    }
    this.frameDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const visualDegPerSec = engine.rpm * 6 * this.animationSpeed;
    const aviation = ['turbine', 'turbojet'].includes(engine.config.layout);
    this.visualCrankAngle = aviation
      ? this.animationSpeed === 1 && Number.isFinite(engine.coreAngle) ? engine.coreAngle
        : (this.visualCrankAngle + Math.max(0, engine.coreRPM ?? engine.rpm) * 6 * this.animationSpeed * this.frameDt) % 360
      : this.animationSpeed === 1 ? engine.crankAngle
        : (this.visualCrankAngle + visualDegPerSec * this.frameDt) % (engine.config.mechanicalCycleDegrees || 720);
    if (aviation) {
      this.visualPowerAngle = this.animationSpeed === 1 && Number.isFinite(engine.powerTurbineAngle) ? engine.powerTurbineAngle
        : ((this.visualPowerAngle || 0) + Math.max(0, engine.powerTurbineRPM || 0) * 6 * this.animationSpeed * this.frameDt) % 360;
      this.visualOutputAngle = this.animationSpeed === 1 ? engine.crankAngle || 0
        : ((this.visualOutputAngle || 0) + Math.max(0, engine.rpm || 0) * 6 * this.animationSpeed * this.frameDt) % 360;
    }

    // Clear background with rich dark mechanical slate gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0d1117');
    bgGrad.addColorStop(0.5, '#161b22');
    bgGrad.addColorStop(1, '#0b0e14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle technical grid
    this.drawTechnicalGrid(ctx, w, h);

    const config = engine.config;
    const cylinders = engine.cylinderStates;

    // Mobile / Narrow screen detection: automatically hide text clutter for pure animation
    const isMobile = w < 650 || (typeof window !== 'undefined' && window.innerWidth < 768);
    const hideText = this.cleanMode || isMobile;

    if (config.layout === 'turbine') {
      this.drawTurbineEngine(ctx, engine, w, h, hideText);
    } else if (config.layout === 'turbojet') {
      this.drawTurbojetEngine(ctx, engine, w, h, hideText);
    } else if (config.layout === 'rotary') {
      this.drawRotaryEngine(ctx, engine, w, h, hideText);
    } else if (config.layout === 'boxer' && this.viewMode !== 'focused') {
      this.drawBoxerEngine(ctx, engine, w, h, hideText);
    } else if (config.layout === 'radial') {
      this.drawRadialEngine(ctx, engine, w, h, hideText);
    } else if (this.viewMode !== 'focused') {
      this.drawAssembledEngine(ctx, engine, w, h, hideText);
    } else {
      const layout = cylinderViewLayout(cylinders, config, w, h, {
        focusedIndex: this.viewMode === 'focused' ? this.focusedCylIndex : null,
        showLabels: !hideText,
      });
      layout.forEach(cell => {
        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.rotate(cell.angle * Math.PI / 180);
        this.drawSingleCylinder(ctx, cell.cylinder, engine, cell.scale, this.visualCrankAngle, hideText || cell.scale < 0.6);
        ctx.restore();
      });
    }

    // Update and draw floating fire/spark particles
    this.renderParticles(ctx, this.frameDt);

    // Draw Telemetry Overlay inside canvas (clean animation hides text)
    if (!hideText && !aviation) {
      this.drawCanvasOverlay(ctx, engine, drivetrain, w, h);
    }
  }

  drawAssembledEngine(ctx, engine, w, h, hideText) {
    const layout = engineAssemblyLayout(engine.cylinderStates, engine.config, w, h, { showLabels: !hideText });
    this.drawCrankcase(ctx, layout.map(cell => cell.journal), layout[0].scale);
    this.drawBankHeads(ctx, layout, engine);
    // Draw distant stations before near stations so the banks resemble one
    // cut-open block. Every cylinder keeps its own live firing phase.
    [...layout].sort((a, b) => b.column - a.column || a.bankIndex - b.bankIndex).forEach(cell => {
      ctx.save(); ctx.translate(cell.x, cell.y); ctx.rotate(cell.angle * Math.PI / 180);
      this.drawSingleCylinder(ctx, cell.cylinder, engine, cell.scale, this.visualCrankAngle, true);
      if (!hideText) {
        ctx.fillStyle = '#cbd5e1'; ctx.font = `600 ${Math.max(9, 12 * cell.scale)}px Rajdhani, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`#${cell.cylinder.index + 1}`, 0, pistonKinematics(0, engine.rodToCrankRatio, cell.scale).cylinderTopY - 30 * cell.scale);
      }
      ctx.restore();
    });
  }

  drawBankHeads(ctx, layout, engine) {
    const banks = new Map();
    for (const cell of layout) {
      // W16 has four narrow-angle rows in two eight-cylinder blocks / heads.
      const bank = engine.config.layout === 'w' ? Math.floor(cell.bankIndex / 2) : engine.config.layout === 'vr' ? 0 : cell.bankIndex;
      const group = banks.get(bank) || [];
      const radians = cell.angle * Math.PI / 180;
      const y = pistonKinematics(0, engine.rodToCrankRatio, cell.scale).cylinderTopY - 6 * cell.scale;
      group.push({ x: cell.x - Math.sin(radians) * y, y: cell.y + Math.cos(radians) * y, scale: cell.scale });
      banks.set(bank, group);
    }
    for (const heads of banks.values()) {
      if (heads.length < 2) continue;
      // The continuous translucent head casting makes the bank relationship
      // readable while the valves and plugs remain visible in the cutaway.
      const sorted = heads.sort((a, b) => a.x - b.x);
      const first = sorted[0], last = sorted.at(-1), scale = first.scale;
      const dx = last.x - first.x, dy = last.y - first.y;
      ctx.save(); ctx.translate(first.x, first.y); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = 'rgba(71,85,105,.55)'; ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5 * scale;
      ctx.beginPath(); ctx.roundRect(-21 * scale, -18 * scale, Math.hypot(dx,dy) + 42 * scale, 36 * scale, 5 * scale);
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  drawCrankcase(ctx, journals, scale) {
    if (!journals.length) return;
    const sorted = [...journals].sort((a, b) => a.x - b.x);
    const first = sorted[0], last = sorted.at(-1);
    const dx = last.x - first.x, dy = last.y - first.y;
    ctx.save(); ctx.translate(first.x, first.y); ctx.rotate(Math.atan2(dy, dx));
    const length = Math.hypot(dx, dy);
    ctx.fillStyle = 'rgba(30,41,59,.74)'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.roundRect(-41 * scale, -24 * scale, length + 82 * scale, 64 * scale, 20 * scale);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 7 * scale;
    ctx.beginPath(); ctx.moveTo(-24 * scale, 0); ctx.lineTo(length + 24 * scale, 0); ctx.stroke();
    ctx.restore();
  }

  drawBoxerEngine(ctx, engine, w, h, hideText) {
    const pairs = engine.config.boxerPairs || [[0, 1], [2, 3]];
    const top = hideText ? 4 : 65;
    const rowHeight = (h - top - 6) / pairs.length;
    const scale = Math.min((w - 12) / 425, rowHeight / 98);
    this.drawCrankcase(ctx, pairs.map((_pair, row) => ({ x: w / 2, y: top + rowHeight * (row + 0.5) })), scale);
    pairs.forEach((pair, row) => {
      const cy = top + rowHeight * (row + 0.5);
      pair.forEach((index, side) => {
        ctx.save();
        ctx.translate(w / 2 + (side ? 90 : -90) * scale, cy);
        ctx.rotate((side ? 1 : -1) * Math.PI / 2);
        this.drawSingleCylinder(ctx, engine.cylinderStates[index], engine, scale, this.visualCrankAngle, true);
        ctx.restore();
      });
      if (!hideText) {
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`對向汽缸 ${pair[0] + 1} / ${pair[1] + 1} · 獨立曲柄銷`, w / 2, cy + rowHeight * 0.44);
        ctx.textAlign = 'left';
      }
    });
  }

  drawTurbineEngine(ctx, engine, w, h, hideText) {
    this.drawFreeTurboshaft(ctx, engine, w, h, hideText);
  }

  drawFreeTurboshaft(ctx, engine, w, h, hideText) {
    const focused = this.viewMode === 'focused';
    const top = hideText ? 4 : 30, bottom = hideText ? 4 : 22;
    const region = focused ? { left: 25, right: 170, height: 116 } : { left: -177, right: 177, height: 154 };
    const scale = Math.max(.001, Math.min((w - 12) / (region.right - region.left), Math.max(1, h - top - bottom) / region.height));
    const mid = (region.left + region.right) / 2;
    const burning = this.hasCombustion(engine);
    ctx.save(); ctx.beginPath(); ctx.rect(5, top, w - 10, Math.max(1, h - top - bottom)); ctx.clip();
    ctx.translate(w / 2 - mid * scale, top + (h - top - bottom) / 2); ctx.scale(scale, scale);
    // Compressor delivery goes aft through external ducts. Hot gas returns
    // forward through separate gas-generator and free-power turbine shafts.
    ctx.strokeStyle = '#657887'; ctx.lineWidth = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-25, side * 30); ctx.lineTo(-15, side * 54);
      ctx.lineTo(145, side * 54); ctx.lineTo(155, side * 28); ctx.stroke();
    }
    ctx.strokeStyle = '#9dabb5'; ctx.lineWidth = 3;
    ctx.strokeRect(-155, -36, 129, 72); ctx.strokeRect(35, -35, 72, 70);
    ctx.fillStyle = '#8596a4'; ctx.fillRect(-147, -4, 254, 8);
    ctx.fillStyle = '#526879'; ctx.beginPath(); ctx.moveTo(-171, 0); ctx.lineTo(-146, -12); ctx.lineTo(-146, 12); ctx.closePath(); ctx.fill();
    const corePhase = this.visualCrankAngle * Math.PI / 180;
    const powerPhase = (this.visualPowerAngle || 0) * Math.PI / 180;
    const stages = (start, count, gap, phase, hot) => {
      for (let stage = 0; stage < count; stage++) {
        const x = start + stage * gap;
        ctx.fillStyle = '#526879'; ctx.fillRect(x - 3, -30, 2, 26); ctx.fillRect(x - 3, 4, 2, 26);
        const width = 3.6 + 1.5 * Math.cos(phase + stage * .5);
        ctx.fillStyle = hot && burning ? '#cb9b71' : '#a6bccb';
        ctx.fillRect(x, -30, width, 26); ctx.fillRect(x, 4, 7 - width, 26);
      }
    };
    stages(-143, engine.config.compressorStages || 6, 18, corePhase, false);
    ctx.strokeStyle = '#acbcc8'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-24, 0, 33, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = '#b1c0cc'; ctx.fillRect(-28, -29, 6, 58);
    stages(42, engine.config.powerTurbineStages || 2, 15, powerPhase, true);
    stages(80, engine.config.gasGeneratorTurbineStages || 2, 15, corePhase, true);
    ctx.fillStyle = '#32434f'; ctx.strokeStyle = '#b29d86'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(110, -39, 55, 78, 18); ctx.fill(); ctx.stroke();
    if (burning) {
      const flame = ctx.createLinearGradient(160, 0, 110, 0);
      flame.addColorStop(0, 'rgba(206,232,255,.9)'); flame.addColorStop(.4, 'rgba(255,209,116,.9)'); flame.addColorStop(1, 'rgba(246,121,57,.3)');
      ctx.fillStyle = flame;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(158, side * 23); ctx.lineTo(114, side * 12); ctx.lineTo(114, side * 30); ctx.closePath(); ctx.fill(); }
    }
    ctx.strokeStyle = '#8e9ca6'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(23, -26); ctx.lineTo(23, -67); ctx.stroke();
    // No glowing rocket plume belongs to an ordinary turboshaft outlet.
    ctx.fillStyle = '#263945'; ctx.strokeStyle = '#7f929f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-95, 43, 90, 28, 5); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d1d9de'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-163, 57); ctx.lineTo(-95, 57); ctx.stroke();
    const angle = (this.visualOutputAngle || 0) * Math.PI / 180;
    ctx.fillStyle = '#a9bac8'; ctx.fillRect(-153, 52 + Math.sin(angle) * 3, 25, 3);
    ctx.restore();
    if (!hideText) {
      ctx.save(); ctx.fillStyle = '#c4ced7'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(focused ? '逆流燃燒室 / 獨立氣體產生器與動力渦輪' : 'M250 · 6軸流+1離心 / 逆流燃燒 / 自由動力渦輪', 12, 18);
      ctx.font = '10px sans-serif';
      const n1 = Number.isFinite(engine.corePercent) ? engine.corePercent.toFixed(1) : '—';
      const n2 = Number.isFinite(engine.powerTurbinePercent) ? engine.powerTurbinePercent.toFixed(1) : '—';
      ctx.fillText('N1 ' + n1 + '% · N2 ' + n2 + '% · 輸出 ' + Math.round(engine.rpm) + ' RPM · EGT ' + (Number.isFinite(engine.exhaustTemperatureC) ? Math.round(engine.exhaustTemperatureC) + '°C' : '—'), 12, h - 6);
      ctx.restore();
    }
  }

  drawTurbojetEngine(ctx, engine, w, h, hideText) {
    this.drawAviationEngine(ctx, engine, w, h, hideText, true);
  }

  drawAviationEngine(ctx, engine, w, h, hideText, jet) {
    const focused = this.viewMode === 'focused';
    const marginTop = hideText ? 4 : 31;
    const marginBottom = hideText ? 4 : 23;
    const region = focused ? (jet ? { left: -30, right: 272, height: 72 } : { left: -42, right: 66, height: 72 })
      : { left: -187, right: jet ? 272 : 187, height: 132 };
    const scale = Math.max(0.001, Math.min((w - 12) / (region.right - region.left),
      Math.max(1, h - marginTop - marginBottom) / region.height));
    const midX = (region.left + region.right) / 2;
    const midY = marginTop + Math.max(1, h - marginTop - marginBottom) / 2;
    const burning = this.hasCombustion(engine);
    const afterburner = jet && burning ? Math.max(0, Math.min(1, Number(engine.afterburnerAmount) || 0)) : 0;
    const faultFire = jet ? Math.max(0, Math.min(1, Number(engine.faultFireAmount) || 0)) : 0;
    const nozzleArea = jet ? Math.max(.65, Math.min(2, Number(engine.nozzleAreaRatio) || 1)) : 1;
    const nozzleRadius = 22 * Math.sqrt(nozzleArea);
    const shaftPhase = this.visualCrankAngle * Math.PI / 180;
    ctx.save();
    // A real view change crops the drawing to the combustor/reheat area.
    ctx.beginPath(); ctx.rect(5, marginTop, w - 10, Math.max(1, h - marginTop - marginBottom)); ctx.clip();
    ctx.translate(w / 2 - midX * scale, midY); ctx.scale(scale, scale);
    ctx.lineCap = 'round';

    const casing = ctx.createLinearGradient(0, -60, 0, 60);
    casing.addColorStop(0, '#8b969e'); casing.addColorStop(.5, '#303e4b'); casing.addColorStop(1, '#87929a');
    ctx.fillStyle = casing; ctx.strokeStyle = '#a0abb3'; ctx.lineWidth = 1.6;
    // Cut-open stationary casing, with unobstructed inlet and outlet.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-176, side * 51); ctx.lineTo(-128, side * 46); ctx.lineTo(-33, side * 37);
      ctx.lineTo(32, side * 42); ctx.lineTo(jet ? 126 : 144, side * 39);
      ctx.lineTo(jet ? 126 : 144, side * 47); ctx.lineTo(32, side * 50);
      ctx.lineTo(-33, side * 45); ctx.lineTo(-128, side * 54); ctx.lineTo(-176, side * 59);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#81909d'; ctx.fillRect(-138, -5, jet ? 198 : 267, 10);
    ctx.fillStyle = '#4b5c6a';
    ctx.beginPath(); ctx.moveTo(-169, 0); ctx.lineTo(-135, -12); ctx.lineTo(-135, 12); ctx.closePath(); ctx.fill();
    // Shaft-aligned rotor blades alternate behind and in front of stationary
    // guide vanes. Their phase wraps by 360°, exactly one physical revolution.
    const disk = (x, radius, index, hot = false) => {
      const blade = 3.5 + 1.8 * Math.cos(shaftPhase + index * .6);
      ctx.fillStyle = '#516779';
      for (const side of [-1, 1]) ctx.fillRect(x - 5, side > 0 ? 6 : -radius, 2, radius - 6);
      ctx.fillStyle = hot ? (burning ? '#cf986c' : '#8f9396') : '#96b5c7';
      ctx.fillRect(x, -radius, blade, radius - 6); ctx.fillRect(x, 6, 7 - blade, radius - 6);
      ctx.fillStyle = '#d3dbe1'; ctx.fillRect(x - 1, -7, 5, 14);
    };
    const compressorCount = jet ? (engine.config.compressorStages || 9) : 4;
    for (let stage = 0; stage < compressorCount; stage++) {
      disk(-128 + stage * (jet ? 90 / Math.max(1, compressorCount - 1) : 22), 40 - stage * (jet ? 1.65 : 3), stage);
    }
    // Annular flame zones: no reciprocating piston, valves, spark timing or
    // pedal-based fuel cut. Combustion comes from the engine's actual state.
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#81909d'; ctx.lineWidth = 1.2;
      ctx.strokeRect(-27, side > 0 ? 9 : -31, 59, 22);
      ctx.fillStyle = '#b89b58'; ctx.fillRect(-33, side * 20 - 2, 7, 4);
      for (let hole = 0; hole < 6; hole++) {
        ctx.fillStyle = '#a9b4bc'; ctx.fillRect(-23 + hole * 10, side * 31 - 1, 2, 2);
      }
      if (burning) {
        const flame = ctx.createLinearGradient(-25, 0, 31, 0);
        flame.addColorStop(0, 'rgba(155,218,255,.7)'); flame.addColorStop(.3, 'rgba(255,234,164,.95)'); flame.addColorStop(1, 'rgba(243,112,50,.15)');
        ctx.fillStyle = flame; ctx.beginPath();
        ctx.moveTo(-25, side * 20); ctx.quadraticCurveTo(0, side * 7, 30, side * 20);
        ctx.quadraticCurveTo(0, side * 33, -25, side * 20); ctx.fill();
      }
    }
    const turbineCount = jet ? 2 : 3;
    for (let stage = 0; stage < turbineCount; stage++) disk(40 + stage * (jet ? 14 : 25), 31 + stage * 2, stage + 8, true);
    if (jet) {
      ctx.strokeStyle = '#ac9468'; ctx.lineWidth = 2;
      for (const x of [74, 91]) for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x - 4, side * 15); ctx.lineTo(x + 3, side * 21); ctx.lineTo(x - 4, side * 27); ctx.stroke();
      }
      if (afterburner > 0) {
        const flame = ctx.createLinearGradient(72, 0, 174, 0);
        flame.addColorStop(0, 'rgba(113,183,255,' + (.4 * afterburner) + ')');
        flame.addColorStop(.6, 'rgba(255,168,77,' + (.8 * afterburner) + ')');
        flame.addColorStop(1, 'rgba(246,105,61,' + (.2 * afterburner) + ')');
        ctx.fillStyle = flame; ctx.beginPath(); ctx.moveTo(72, -14);
        ctx.lineTo(174, -nozzleRadius); ctx.lineTo(174, nozzleRadius); ctx.lineTo(72, 14); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#667786'; ctx.beginPath(); ctx.moveTo(124, -7); ctx.lineTo(156, 0); ctx.lineTo(124, 7); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#697785'; ctx.strokeStyle = '#a6b0b8'; ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(128, side * 40); ctx.lineTo(151, side * nozzleRadius);
      ctx.lineTo(174, side * (nozzleRadius + 4)); ctx.lineTo(174, side * (nozzleRadius + 10));
      ctx.lineTo(128, side * 47); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // Only physical reheat draws luminous exhaust. Flame shape and mixing
    // brightness are illustrative, not a CFD prediction of shock-cell spacing.
    const luminous = Math.max(afterburner, faultFire * .85);
    if (luminous > .01) {
      const velocityFactor = Number.isFinite(engine.jetVelocity) ? Math.max(.45, Math.min(1, engine.jetVelocity / 1200)) : 1;
      const length = 90 * Math.sqrt(luminous) * velocityFactor;
      const end = 174 + length;
      const outer = ctx.createLinearGradient(174, 0, end, 0);
      outer.addColorStop(0, (faultFire > 0 ? 'rgba(255,146,63,' : 'rgba(108,181,255,') + .62 * luminous + ')');
      outer.addColorStop(.42, 'rgba(255,163,73,' + .85 * luminous + ')');
      outer.addColorStop(1, 'rgba(211,102,72,0)');
      ctx.fillStyle = outer; ctx.beginPath(); ctx.moveTo(174, -nozzleRadius * .78);
      ctx.quadraticCurveTo(198, -nozzleRadius * 1.05, end, -2);
      ctx.lineTo(end, 2); ctx.quadraticCurveTo(198, nozzleRadius * 1.05, 174, nozzleRadius * .78);
      ctx.closePath(); ctx.fill();
      const core = ctx.createLinearGradient(174, 0, end, 0);
      core.addColorStop(0, 'rgba(221,242,255,' + .95 * luminous + ')');
      core.addColorStop(.38, 'rgba(144,196,255,' + .88 * luminous + ')');
      core.addColorStop(1, 'rgba(132,177,255,0)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(174, -nozzleRadius * .42);
      ctx.lineTo(end, 0); ctx.lineTo(174, nozzleRadius * .42); ctx.closePath(); ctx.fill();
      for (const fraction of [.22, .48, .73]) {
        const x = 174 + length * fraction;
        const radius = nozzleRadius * .20 * (1 - fraction * .65);
        ctx.fillStyle = 'rgba(218,235,255,' + (.48 * luminous * (1 - fraction)) + ')';
        ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x, -radius);
        ctx.lineTo(x + 5, 0); ctx.lineTo(x, radius); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    if (!hideText) {
      ctx.save(); ctx.font = '600 12px Rajdhani, sans-serif'; ctx.fillStyle = '#c1cbd4'; ctx.textAlign = 'left';
      ctx.fillText(focused ? (jet ? '燃燒室 / 後燃器 / 可變噴嘴' : '連續燃燒室特寫') : engine.config.shortName + ' · 機構示意剖面', 12, 18);
      ctx.font = '500 10px Rajdhani, sans-serif';
      const egt = Number.isFinite(engine.exhaustTemperatureC) ? Math.round(engine.exhaustTemperatureC) + '°C' : '—';
      const n1 = Number.isFinite(engine.corePercent) ? engine.corePercent.toFixed(1) + '%' : Math.round(engine.rpm) + ' RPM';
      const thrust = Number.isFinite(engine.thrustN) ? ' · 推力 ' + (engine.thrustN / 1000).toFixed(2) + ' kN' : '';
      ctx.fillText((faultFire > .01 ? '啟動異常 / 尾管餘燃' : burning ? (afterburner > .01 ? '後燃器工作' : '燃燒中') : '未燃燒 / 轉子惰轉') + ' · N1 ' + n1 + thrust + ' · EGT ' + egt, 12, h - 7);
      ctx.restore();
    }
  }

  drawRotaryEngine(ctx, engine, w, h, hideText) {
    const focused = this.viewMode === 'focused';
    const count = engine.config.rotors || engine.cylinderStates.length;
    const indices = focused ? [((this.focusedCylIndex % count) + count) % count]
      : Array.from({ length: count }, (_, index) => index);
    const top = hideText ? 4 : 62;
    const cellWidth = w / indices.length;
    const scale = Math.max(0.01, Math.min((cellWidth - 16) / 190, (h - top - 12) / 176));
    indices.forEach((index, column) => {
      const shaftAngle = rotaryShaftPhase(this.visualCrankAngle, engine.config.firingAngles[index], engine.config.firingAngleKind);
      const geometry = rotaryCycleKinematics(shaftAngle);
      ctx.save(); ctx.translate(cellWidth * (column + 0.5), top + (h - top) * 0.5); ctx.scale(scale, scale);
      // Each face runs its own four stages over 1080 shaft degrees. Chamber
      // colours are illustrative gas states; the housing/apex geometry is exact.
      geometry.apexes.forEach((apex, face) => {
        const { stage } = rotaryChamberState(shaftAngle, face);
        const colors = ['rgba(56,189,248,.34)', 'rgba(167,139,250,.35)', 'rgba(255,115,35,.65)', 'rgba(148,163,184,.28)'];
        ctx.beginPath(); ctx.moveTo(apex.x, apex.y);
        for (let i = 1; i <= 48; i++) {
          const p = rotaryHousingPoint(apex.t + i / 48 * Math.PI * 2 / 3);
          ctx.lineTo(p.x, p.y);
        }
        // The chamber closes along the same curved rotor face, rather than a
        // straight chord hidden beneath an unrelated triangular silhouette.
        for (let i = 23; i >= 0; i--) {
          const p = rotaryRotorFacePoint(geometry, face, i / 24);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = stage === 2 && !this.hasCombustion(engine) ? colors[3] : colors[stage];
        ctx.fill();
      });
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) {
        const p = rotaryHousingPoint(i / 180 * Math.PI * 2);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.closePath(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(geometry.apexes[0].x, geometry.apexes[0].y);
      for (let face = 0; face < 3; face++) for (let i = 1; i <= 24; i++) {
        const p = rotaryRotorFacePoint(geometry, face, i / 24);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.fillStyle = '#334155'; ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.stroke();
      geometry.apexes.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#f8fafc'; ctx.fill();
      });
      // Mark the three faces so the real 1:3 rotor speed is observable even
      // though the triangle itself repeats its silhouette each shaft turn.
      geometry.apexes.forEach((p, face) => {
        const next = geometry.apexes[(face + 1) % 3];
        ctx.fillStyle = ['#38bdf8', '#c084fc', '#fbbf24'][face];
        ctx.beginPath(); ctx.arc((p.x + next.x) * 0.5 * 0.72 + geometry.center.x * 0.28,
          (p.y + next.y) * 0.5 * 0.72 + geometry.center.y * 0.28, 4, 0, Math.PI * 2); ctx.fill();
      });
      // R26B peripheral ports pass through the outer housing; RENESIS uses
      // side ports. Neither mechanism has poppet valves or connecting rods.
      const ports = engine.config.rotaryPortKind === 'peripheral'
        ? [[-79, 0, '#38bdf8'], [79, 0, '#fb923c']] : [[-25, 42, '#38bdf8'], [25, 42, '#fb923c']];
      for (const [x, y, color] of ports) {
        ctx.fillStyle = color; ctx.fillRect(x - 6, y - 5, 12, 10);
      }
      ctx.beginPath(); ctx.arc(geometry.center.x, geometry.center.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#64748b'; ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(geometry.center.x, geometry.center.y);
      ctx.lineWidth = 6; ctx.strokeStyle = '#fbbf24'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fillStyle = '#e2e8f0'; ctx.fill();
      // Two plugs in the stationary housing (leading / trailing).
      const firing = this.hasCombustion(engine)
        && geometry.apexes.some((_p, face) => rotaryChamberState(shaftAngle, face).isIgnitionPhase);
      const mounts = rotarySparkPlugMounts();
      if ((engine.config.plugsPerRotor || 2) === 3) {
        const wall = rotaryHousingPoint(Math.PI * 1.5);
        mounts.splice(1, 0, { tip: { x: 0, y: wall.y - .8 }, rotation: 0 });
      }
      for (const plug of mounts) {
        ctx.save(); ctx.translate(plug.tip.x,plug.tip.y); ctx.rotate(plug.rotation);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-2.5,-16,5,10);
        ctx.fillStyle = '#64748b'; ctx.fillRect(-3,-6,6,5);
        ctx.fillStyle = firing ? '#fde68a' : '#94a3b8'; ctx.fillRect(-1.5,-1,3,1);
        ctx.restore();
      }
      if (!hideText) {
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`ROTOR ${index + 1} · 轉子 : 輸出軸 = 1 : 3`, 0, 78);
      }
      ctx.restore();
    });
  }

  hasCombustion(engine) {
    if (typeof engine.isCombusting === 'boolean') return engine.isCombusting && !engine.ignitionCut;
    if (['turbine', 'turbojet'].includes(engine.config?.layout)) {
      return typeof engine.isCombusting === 'boolean' ? engine.isCombusting : engine.rpm > 0 && engine.isIgnitionOn;
    }
    return engine.rpm > 0 && engine.isIgnitionOn && !engine.isRevLimitingCut && !engine.ignitionCut
      && ((engine.manifoldThrottle || 0) > 0.01 || engine.rpm < engine.idleRPM * 1.15);
  }

  drawTechnicalGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const step = 30;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw Radial Star Engine cross-section (7 cylinders radiating 360°)
  drawRadialEngine(ctx, engine, w, h, hideText = false, rowGeometry = null, rowFocusIndex = null) {
    if ((engine.config.radialRows || 1) > 1 && !rowGeometry) {
      this.drawMultiRowRadial(ctx, engine, w, h, hideText);
      return;
    }
    const cylinders = engine.cylinderStates;
    const numCyls = cylinders.length;
    const focused = this.viewMode === 'focused';
    const focusedIndex = rowFocusIndex ?? ((this.focusedCylIndex % numCyls) + numCyls) % numCyls;
    const topInset = hideText ? 6 : 76;
    const availableHeight = Math.max(1, h - topInset - 6);
    const scale = Math.max(0.01, Math.min(1.4, focused
      ? Math.min((w - 12) / 116, availableHeight / 210)
      : Math.min((w - 12) / 316, availableHeight / 316)));
    const cx = w * 0.5;
    const cy = focused ? topInset + 155 * scale : topInset + availableHeight / 2;
    ctx.save();
    if (focused) {
      const rotation = rowGeometry ? rowGeometry[focusedIndex].angleRad + Math.PI / 2 : focusedIndex * Math.PI * 2 / numCyls;
      ctx.translate(cx, cy); ctx.rotate(-rotation); ctx.translate(-cx, -cy);
    }

    const crankRadius = 24 * scale;
    const rodLength = 80 * scale;
    const bore = 34 * scale;
    const halfBore = bore / 2;
    const pistonHeight = 26 * scale;
    const outerCylDist = rodLength + crankRadius + 24 * scale;

    // Crankpin location (Visual angle)
    const geometry = rowGeometry ? rowGeometry.map(cylinder => ({ ...cylinder, index: cylinder.localIndex,
      dist: cylinder.dist * scale, rodLength: cylinder.rodLength * scale,
      wristX: cylinder.wristX * scale, wristY: cylinder.wristY * scale,
      jointX: cylinder.jointX * scale, jointY: cylinder.jointY * scale }))
      : radialKinematics(this.visualCrankAngle, numCyls, crankRadius, rodLength, 13 * scale);
    const pinX = cx + geometry[0].jointX;
    const pinY = cy + geometry[0].jointY;

    // 1. Draw Central Crankcase Base Housing
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 46 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crankcase perimeter stud bolts
    for (let b = 0; b < 14; b++) {
      const bAngle = (b / 14) * Math.PI * 2;
      const bx = cx + Math.cos(bAngle) * 40 * scale;
      const by = cy + Math.sin(bAngle) * 40 * scale;
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(bx, by, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crankshaft counterweight rotating opposite to the crankpin
    const cwAngle = Math.atan2(pinY - cy, pinX - cx) + Math.PI;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 38 * scale, cwAngle - 0.7, cwAngle + 0.7);
    ctx.lineTo(cx + Math.cos(cwAngle) * 12 * scale, cy + Math.sin(cwAngle) * 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // All wrists and rod joints use the same rigid master-and-articulated geometry.
    const cylKinematics = [];
    for (let i = 0; i < numCyls; i++) {
      // Dynamic phase angle and stroke for this cylinder
      const cyl = cylinders[i];
      const visualAngle = rowGeometry ? rowGeometry[i].phaseAngle : radialCyclePhase(this.visualCrankAngle, i, numCyls);
      let stroke = 'intake';
      if (visualAngle >= 180 && visualAngle < 360) stroke = 'compression';
      else if (visualAngle >= 360 && visualAngle < 540) stroke = 'power';
      else if (visualAngle >= 540) stroke = 'exhaust';

      cylKinematics.push({
        ...geometry[i],
        cyl,
        wristX: cx + geometry[i].wristX,
        wristY: cy + geometry[i].wristY,
        jointX: cx + geometry[i].jointX,
        jointY: cy + geometry[i].jointY,
        visualAngle,
        stroke,
        isFiring: stroke === 'power' && visualAngle < 430 && this.hasCombustion(engine),
        isSpark: visualAngle >= 350 && visualAngle < 375 && this.hasCombustion(engine),
      });
    }

    // 2. Draw Cylinder Barrels, Cooling Fins, Cylinder Heads & Combustion Fireballs
    cylKinematics.forEach(k => {
      if (focused && k.index !== focusedIndex) return;
      ctx.save();
      ctx.translate(cx, cy);
      // Rotate so cylinder points along negative Y (upwards in local frame)
      ctx.rotate(k.angleRad + Math.PI / 2);

      const topY = -outerCylDist;
      const wristLocalY = -k.dist;
      const crownLocalY = wristLocalY - pistonHeight * 0.5;

      // Air cooling fins on cylinder barrel
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8 * scale;
      const numFins = 6;
      for (let f = 0; f < numFins; f++) {
        const finY = topY + 16 * scale + f * (8.5 * scale);
        const finWidth = bore + 18 * scale;
        ctx.beginPath();
        ctx.moveTo(-finWidth / 2, finY);
        ctx.lineTo(finWidth / 2, finY);
        ctx.stroke();
      }

      // Cylinder Barrel Sleeve Walls
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2 * scale;
      ctx.fillRect(-halfBore, topY, bore, outerCylDist - 38 * scale);
      ctx.strokeRect(-halfBore, topY, bore, outerCylDist - 38 * scale);

      // Cylinder Head with Rocker Box
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.roundRect(-halfBore - 6 * scale, topY - 14 * scale, bore + 12 * scale, 16 * scale, 4 * scale);
      ctx.fill();
      ctx.stroke();

      // Spark Plug
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-2 * scale, topY - 22 * scale, 4 * scale, 9 * scale);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-1.5 * scale, topY - 25 * scale, 3 * scale, 4 * scale);

      // Valve lift uses the same four-stroke phase as the actual rod geometry.
      // Rocker valves enter the cylinder head; they are not static decorative
      // ports disconnected from the slow-motion cycle.
      const blend = engine.cam?.blend || 0;
      const valves = camValveLift(k.visualAngle, engine.modifications?.camshaft === 'sport' ? blend + (1 - blend) * 0.25 : blend);
      this.drawValves(ctx, topY, bore, { index: k.cyl.index, phaseAngle: k.visualAngle, stroke: k.stroke, intakeValve: valves.intake,
        exhaustValve: valves.exhaust, blowdownPulse: k.stroke === 'exhaust' ? 0.5 : 0 }, scale * 0.6);

      // Combustion Fireball & Spark Arc
      if (k.isFiring) {
        const fireHeight = Math.max(0, crownLocalY - topY);
        const fireGrad = ctx.createRadialGradient(0, topY + 4 * scale, 2, 0, topY + fireHeight * 0.5, fireHeight);
        fireGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        fireGrad.addColorStop(0.25, 'rgba(255, 210, 60, 0.95)');
        fireGrad.addColorStop(0.65, 'rgba(255, 75, 10, 0.85)');
        fireGrad.addColorStop(1, 'rgba(200, 20, 0, 0.2)');

        ctx.fillStyle = fireGrad;
        ctx.fillRect(-halfBore + 2 * scale, topY, bore - 4 * scale, fireHeight);

        // Electric Spark Arc
        ctx.strokeStyle = k.isSpark ? '#00ffff' : 'transparent';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo((Math.random() - 0.5) * 6 * scale, topY + 6 * scale);
        ctx.stroke();
        ctx.shadowBlur = 0;

      }

      // Piston Assembly
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.roundRect(-halfBore + 1.5 * scale, crownLocalY, bore - 3 * scale, pistonHeight, 2 * scale);
      ctx.fill();
      ctx.stroke();

      // Piston Rings
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let r = 0; r < 2; r++) {
        const ringY = crownLocalY + (4 + r * 3) * scale;
        ctx.beginPath();
        ctx.moveTo(-halfBore + 2 * scale, ringY);
        ctx.lineTo(halfBore - 2 * scale, ringY);
        ctx.stroke();
      }

      // Wristpin
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(0, wristLocalY, 4 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Text Badge (Only when !hideText)
      if (!hideText) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `700 ${8.5 * scale}px Rajdhani, sans-serif`;
        ctx.fillStyle = k.stroke === 'power' ? '#f97316' : k.stroke === 'compression' ? '#a855f7' : k.stroke === 'exhaust' ? '#ef4444' : '#38bdf8';
        ctx.fillText(`#${k.cyl.index + 1}`, 0, topY - 17 * scale);
        ctx.restore();
      }

      ctx.restore();
    });

    // 3. Draw Connecting Rods (Master Rod for Cyl 0, Articulated Rods for Cyl 1..6)
    const master = cylKinematics[0];

    // Articulated Rods (Cylinders 1..6)
    for (let i = 1; i < numCyls; i++) {
      const k = cylKinematics[i];
      if (focused && i !== focusedIndex) continue;
      // Knuckle pin offset on the master rod hub
      const kx = k.jointX;
      const ky = k.jointY;

      // Draw Articulated Rod Beam
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 5 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(k.wristX, k.wristY);
      ctx.stroke();

      // Rod center groove
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(k.wristX, k.wristY);
      ctx.stroke();

      // Knuckle Pin
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(kx, ky, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Master Rod (Cylinder 0)
    ctx.save();
    if (focused && focusedIndex !== 0) ctx.globalAlpha = 0.32;
    // Master Rod Big-End Hub Ring (houses the crankpin bearing + knuckle pins)
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.arc(pinX, pinY, 16 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Master Rod Beam to Cylinder 0 Wristpin
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 7 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pinX, pinY);
    ctx.lineTo(master.wristX, master.wristY);
    ctx.stroke();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(pinX, pinY);
    ctx.lineTo(master.wristX, master.wristY);
    ctx.stroke();

    // Master Crankpin Cap
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 7 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Center Crankshaft Hub
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  drawMultiRowRadial(ctx, engine, w, h, hideText) {
    const rows = engine.config.radialRows;
    const count = engine.config.cylindersPerRow || engine.config.cylinders / rows;
    const geometry = radialEngineKinematics(this.visualCrankAngle, engine.config);
    const focused = this.viewMode === 'focused';
    const selected = ((this.focusedCylIndex % engine.config.cylinders) + engine.config.cylinders) % engine.config.cylinders;
    const visibleRows = focused ? [Math.floor(selected / count)] : Array.from({ length: rows }, (_, index) => index);
    const columns = focused || h > w ? 1 : Math.min(rows, 2);
    const rowCount = Math.ceil(visibleRows.length / columns);
    const top = hideText ? 0 : 68;
    const width = w / columns, height = (h - top) / rowCount;
    visibleRows.forEach((row, cell) => {
      const x = cell % columns * width, y = top + Math.floor(cell / columns) * height;
      const rowEngine = { ...engine, config: { ...engine.config, radialRows: 1, cylinders: count },
        cylinderStates: engine.cylinderStates.slice(row * count, (row + 1) * count) };
      ctx.save(); ctx.translate(x, y);
      this.drawRadialEngine(ctx, rowEngine, width, height, true, geometry.filter(cylinder => cylinder.row === row), selected % count);
      if (!hideText) {
        ctx.fillStyle = '#a5b6c4'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText((row ? '後排' : '前排') + ' · 9缸 / 獨立主副連桿', width / 2, height - 4);
      }
      ctx.restore();
    });
  }

  // Draw a single complete cylinder assembly
  drawSingleCylinder(ctx, cyl, engine, scale = 1.0, visualCrankAngle = 0, hideText = false) {
    if (engine.config.cycleKind === 'two-stroke') {
      this.drawTwoStrokeCylinder(ctx, cyl, engine, scale, visualCrankAngle, hideText);
      return;
    }
    // Mechanical Dimensions
    const bore = 70 * scale; // cylinder bore diameter
    const strokeHeight = 110 * scale;
    const cylVisualAngle = pistonCyclePhase(visualCrankAngle, cyl, engine.config);
    const geometry = pistonKinematics(cylVisualAngle, engine.rodToCrankRatio, scale);
    const { crankRadius, crankCenterY, cylinderTopY, crankPinX, crankPinY,
      wristPinX, wristPinY, pistonHeight, crownY, pistonPos: visualPistonPos } = geometry;
    const visualStroke = ['intake', 'compression', 'power', 'exhaust'][Math.floor(cylVisualAngle / 180)];
    const visualIsFiring = cylVisualAngle >= 350 && cylVisualAngle <= 375 && this.hasCombustion(engine);

    const blend = engine.cam?.blend || 0;
    const valves = camValveLift(cylVisualAngle, engine.modifications?.camshaft === 'sport' ? blend + (1 - blend) * 0.25 : blend);
    const visualCyl = {
      index: cyl.index,
      phaseAngle: cylVisualAngle,
      pistonPos: visualPistonPos,
      stroke: visualStroke,
      intakeValve: valves.intake,
      exhaustValve: valves.exhaust,
      isFiring: visualIsFiring,
      // Live pressure belongs to the physical phase, not the slowed visual phase.
      gasPressure: this.animationSpeed === 1 ? cyl.gasPressure : undefined,
      blowdownPulse: this.animationSpeed === 1 ? cyl.blowdownPulse || 0 : visualStroke === 'exhaust' ? 0.5 : 0,
      gasTorque: cyl.gasTorque || 0
    };

    // 1. Draw Cylinder Sleeve / Block Walls
    this.drawCylinderSleeve(ctx, cylinderTopY, bore, strokeHeight + 50 * scale, engine.exhaustHeat, scale);

    // 2. Draw Combustion Chamber & Fireball
    this.drawCombustionChamber(ctx, cylinderTopY, crownY, bore, visualCyl, engine, scale);

    // 3. Draw Valves & Camshaft
    this.drawValves(ctx, cylinderTopY, bore, visualCyl, scale);

    // 4. Draw Spark Plug & Electrical Arc
    this.drawSparkPlug(ctx, cylinderTopY, visualCyl, scale);

    // 5. Draw Connecting Rod
    this.drawConnectingRod(ctx, wristPinX, wristPinY, crankPinX, crankPinY, scale);

    // 6. Draw Piston Assembly
    this.drawPiston(ctx, wristPinX, wristPinY, bore, pistonHeight, scale);

    // 7. Draw Crankshaft Web & Counterweight
    this.drawCrankshaft(ctx, 0, crankCenterY, crankPinX, crankPinY, crankRadius, scale);

    // 8. Cylinder Label & Current 4-Stroke Cycle Badge (hidden in clean animation mode)
    if (!hideText) {
      this.drawCylinderInfo(ctx, cylinderTopY - 45 * scale, visualCyl, scale);
    }
  }

  drawTwoStrokeCylinder(ctx, cyl, engine, scale, visualCrankAngle, hideText) {
    const phase = pistonCyclePhase(visualCrankAngle, cyl, engine.config);
    const state = twoStrokePortState(phase, engine.config);
    const geometry = pistonKinematics(phase, engine.rodToCrankRatio, scale);
    const { cylinderTopY: top, crownY, crankCenterY, crankPinX, crankPinY, crankRadius, wristPinY, pistonHeight } = geometry;
    const bore = 70 * scale;
    // Crankcase is a pumping chamber, not the oil-filled sump of a four-stroke.
    ctx.fillStyle = state.crankcaseIntake > 0 ? 'rgba(48,107,140,.65)' : 'rgba(38,61,73,.7)';
    ctx.strokeStyle = '#6b8494'; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.roundRect(-46 * scale, 40 * scale, 92 * scale, 95 * scale, 24 * scale); ctx.fill(); ctx.stroke();
    this.drawCylinderSleeve(ctx, top, bore, 155 * scale, 0, scale);
    const visual = { ...cyl, ...state, phaseAngle: state.stroke === 'power' ? phase + 360 : phase,
      isFiring: state.isIgnitionPhase && this.hasCombustion(engine) };
    this.drawCombustionChamber(ctx, top, crownY, bore, visual, engine, scale);
    // Exhaust and transfer windows are physically uncovered by piston travel.
    const ports = [ { x: 35, y: 57, amount: state.exhaustPort, color: '#e49d65', name: 'exhaust' },
      { x: -44, y: 62, amount: state.transferPort, color: '#65bfda', name: 'transfer' } ];
    for (const port of ports) {
      ctx.fillStyle = '#101923'; ctx.fillRect(port.x * scale, top + port.y * scale, 9 * scale, 9 * scale);
      if (port.amount > 0) {
        ctx.fillStyle = port.color; ctx.globalAlpha = port.amount;
        ctx.fillRect(port.x * scale, top + port.y * scale, 9 * scale, 9 * scale); ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = '#547383'; ctx.lineWidth = 5 * scale;
    ctx.beginPath(); ctx.moveTo(-43 * scale, top + 68 * scale); ctx.lineTo(-43 * scale, 48 * scale); ctx.stroke();
    // No cam lobes, poppet valves or valve stems belong to this mechanism.
    this.drawSparkPlug(ctx, top, visual, scale);
    this.drawConnectingRod(ctx, 0, wristPinY, crankPinX, crankPinY, scale);
    this.drawPiston(ctx, 0, wristPinY, bore, pistonHeight, scale);
    this.drawCrankshaft(ctx, 0, crankCenterY, crankPinX, crankPinY, crankRadius, scale);
    if (!hideText) {
      ctx.fillStyle = '#b8cbd6'; ctx.font = '600 ' + (11 * scale) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('#' + (cyl.index + 1) + ' · ' + (state.portPhase === 'scavenging' ? '掃氣 / 氣口開啟' : state.portPhase === 'blowdown' ? '排氣洩壓' : state.portPhase === 'expansion' ? '膨脹作功' : '壓縮'), 0, top - 31 * scale);
    }
  }

  // Draw Cylinder Walls with Heat Glow
  drawCylinderSleeve(ctx, topY, bore, height, heat, scale = 1) {
    const halfBore = bore / 2;
    const wallThick = 9 * scale;

    ctx.save();
    // Sleeve interior shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(-halfBore, topY, bore, height);

    // Cylinder left wall
    const wallGrad = ctx.createLinearGradient(-halfBore - wallThick, topY, -halfBore, topY);
    wallGrad.addColorStop(0, '#2d3748');
    wallGrad.addColorStop(0.7, '#4a5568');
    wallGrad.addColorStop(1, '#1a202c');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(-halfBore - wallThick, topY, wallThick, height);

    // Cylinder right wall
    const rightGrad = ctx.createLinearGradient(-halfBore + bore, topY, -halfBore + bore + wallThick, topY);
    rightGrad.addColorStop(0, '#1a202c');
    rightGrad.addColorStop(0.3, '#4a5568');
    rightGrad.addColorStop(1, '#2d3748');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(halfBore, topY, wallThick, height);

    // Exhaust header heat glow on side
    if (heat > 0.25) {
      const glowAlpha = Math.min(0.85, (heat - 0.25) * 1.3);
      ctx.fillStyle = `rgba(255, 69, 0, ${glowAlpha * 0.35})`;
      ctx.fillRect(halfBore, topY, wallThick + 4 * scale, height * 0.6);
      ctx.shadowColor = '#ff4500';
      ctx.shadowBlur = 15 * heat;
      ctx.strokeStyle = `rgba(255, 120, 0, ${glowAlpha})`;
      ctx.strokeRect(halfBore, topY, wallThick, height * 0.6);
    }

    ctx.restore();
  }

  // Draw Combustion Fireball / Gas in chamber
  drawCombustionChamber(ctx, topY, pistonCrownY, bore, cyl, engine, scale = 1) {
    const chamberHeight = Math.max(0, pistonCrownY - topY);
    const halfBore = (bore / 2) - 2 * scale;

    ctx.save();
    if (cyl.stroke === 'power' && this.hasCombustion(engine)) {
      // Fireball explosion!
      const intensity = 1.0 - (cyl.phaseAngle - 360) / 180;
      const fireGrad = ctx.createRadialGradient(0, topY + 10 * scale, 2 * scale, 0, topY + chamberHeight * 0.5, chamberHeight);
      fireGrad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * intensity})`);
      fireGrad.addColorStop(0.2, `rgba(255, 200, 50, ${0.9 * intensity})`);
      fireGrad.addColorStop(0.6, `rgba(255, 70, 10, ${0.75 * intensity})`);
      fireGrad.addColorStop(1, `rgba(180, 20, 0, ${0.2 * intensity})`);

      ctx.fillStyle = fireGrad;
      ctx.fillRect(-halfBore, topY, halfBore * 2, chamberHeight);

      // Chamber glow
      ctx.shadowColor = '#ff5722';
      ctx.shadowBlur = 20 * intensity;
      ctx.strokeStyle = `rgba(255, 180, 50, ${0.8 * intensity})`;
      ctx.strokeRect(-halfBore, topY, halfBore * 2, chamberHeight);
    } else if (cyl.stroke === 'intake') {
      // Fuel-Air mixture (Cool blue mist)
      const mistGrad = ctx.createLinearGradient(0, topY, 0, topY + chamberHeight);
      mistGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      mistGrad.addColorStop(1, 'rgba(14, 165, 233, 0.08)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(-halfBore, topY, halfBore * 2, chamberHeight);
    } else if (cyl.stroke === 'exhaust') {
      // Burnt exhaust gas (smoky orange/grey)
      const exGrad = ctx.createLinearGradient(0, topY, 0, topY + chamberHeight);
      exGrad.addColorStop(0, 'rgba(234, 88, 12, 0.4)');
      exGrad.addColorStop(1, 'rgba(100, 116, 139, 0.15)');
      ctx.fillStyle = exGrad;
      ctx.fillRect(-halfBore, topY, halfBore * 2, chamberHeight);
    }
    ctx.restore();
  }

  // Draw Valves (Intake & Exhaust)
  drawValves(ctx, topY, bore, cyl, scale) {
    const valveRadius = 12 * scale;
    const stemWidth = 4 * scale;
    const intakeX = -bore * 0.28;
    const exhaustX = bore * 0.28;

    ctx.save();
    // Intake Valve (Left)
    const inLift = cyl.intakeValve * 10 * scale;
    ctx.fillStyle = '#94a3b8';
    // Stem
    ctx.fillRect(intakeX - stemWidth / 2, topY - 24 * scale + inLift, stemWidth, 24 * scale);
    // Valve Face
    ctx.beginPath();
    ctx.moveTo(intakeX - valveRadius, topY + inLift);
    ctx.lineTo(intakeX + valveRadius, topY + inLift);
    ctx.lineTo(intakeX + stemWidth, topY - 5 * scale + inLift);
    ctx.lineTo(intakeX - stemWidth, topY - 5 * scale + inLift);
    ctx.closePath();
    ctx.fillStyle = inLift > 2 ? '#38bdf8' : '#64748b'; // Glow blue when opening
    ctx.fill();

    // Exhaust Valve (Right)
    const exLift = cyl.exhaustValve * 10 * scale;
    ctx.fillStyle = '#94a3b8';
    // Stem
    ctx.fillRect(exhaustX - stemWidth / 2, topY - 24 * scale + exLift, stemWidth, 24 * scale);
    // Valve Face
    ctx.beginPath();
    ctx.moveTo(exhaustX - valveRadius, topY + exLift);
    ctx.lineTo(exhaustX + valveRadius, topY + exLift);
    ctx.lineTo(exhaustX + stemWidth, topY - 5 * scale + exLift);
    ctx.lineTo(exhaustX - stemWidth, topY - 5 * scale + exLift);
    ctx.closePath();
    ctx.fillStyle = exLift > 2 ? '#fb923c' : '#71717a'; // Glow orange when venting
    ctx.fill();

    // Exhaust Gas Blowdown Shock Pulse escaping into manifold runner (AngeTheGreat blowdown visualization)
    if (exLift > 1.5 && (cyl.blowdownPulse > 0.1 || cyl.stroke === 'exhaust')) {
      const pulseEnergy = Math.min(1, (cyl.blowdownPulse || 0.5) / 2.5);
      ctx.save();
      const exShockGrad = ctx.createRadialGradient(exhaustX + 12 * scale, topY - 10 * scale, 2, exhaustX + 12 * scale, topY - 10 * scale, 18 * scale * pulseEnergy);
      exShockGrad.addColorStop(0, `rgba(255, 140, 20, ${0.9 * pulseEnergy})`);
      exShockGrad.addColorStop(0.5, `rgba(239, 68, 68, ${0.65 * pulseEnergy})`);
      exShockGrad.addColorStop(1, 'rgba(100, 116, 139, 0)');
      ctx.fillStyle = exShockGrad;
      ctx.beginPath();
      ctx.arc(exhaustX + 12 * scale, topY - 10 * scale, 18 * scale * pulseEnergy, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw Spark Plug & Electric Arc Flash
  drawSparkPlug(ctx, topY, cyl, scale) {
    ctx.save();
    const plugW = 10 * scale;
    const plugH = 22 * scale;

    // Ceramic body
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-plugW / 2, topY - plugH, plugW, plugH);

    // Threaded metal hex
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-plugW * 0.65, topY - 6 * scale, plugW * 1.3, 6 * scale);

    // Central electrode
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-1.5 * scale, topY, 3 * scale, 4 * scale);

    // Ground electrode bent tab
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(4 * scale, topY);
    ctx.lineTo(4 * scale, topY + 5 * scale);
    ctx.lineTo(0, topY + 5 * scale);
    ctx.stroke();

    // Electric Spark Arc (when isFiring is true!)
    if (cyl.isFiring) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * scale;

      // Jagged electrical lightning arc
      ctx.beginPath();
      ctx.moveTo(0, topY + 1 * scale);
      ctx.lineTo((Math.random() - 0.5) * 4 * scale, topY + 3 * scale);
      ctx.lineTo(2 * scale, topY + 4 * scale);
      ctx.stroke();

      // Bright spark flash ball
      const sparkGrad = ctx.createRadialGradient(0, topY + 3 * scale, 1, 0, topY + 3 * scale, 12 * scale);
      sparkGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      sparkGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.9)');
      sparkGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = sparkGrad;
      ctx.beginPath();
      ctx.arc(0, topY + 3 * scale, 12 * scale, 0, Math.PI * 2);
      ctx.fill();

      // The electrical discharge belongs inside this chamber. Do not emit
      // free-floating sparks into the outer canvas at local cylinder coordinates.
    }

    ctx.restore();
  }

  // Draw Piston with Rings and Wrist Pin
  drawPiston(ctx, x, y, bore, height, scale) {
    const halfB = (bore / 2) - 2 * scale;
    const crownY = y - height * 0.35;
    const skirtY = crownY + height;

    ctx.save();
    // Piston Body Metallic Gradient
    const pGrad = ctx.createLinearGradient(-halfB, crownY, halfB, crownY);
    pGrad.addColorStop(0, '#94a3b8');
    pGrad.addColorStop(0.25, '#e2e8f0');
    pGrad.addColorStop(0.6, '#cbd5e1');
    pGrad.addColorStop(0.9, '#64748b');
    pGrad.addColorStop(1, '#475569');

    ctx.fillStyle = pGrad;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5 * scale;

    // Piston Crown & Skirt Path
    ctx.beginPath();
    ctx.roundRect(-halfB, crownY, halfB * 2, height, [4 * scale, 4 * scale, 8 * scale, 8 * scale]);
    ctx.fill();
    ctx.stroke();

    // Piston Ring Grooves (Compression & Oil control rings)
    ctx.fillStyle = '#1e293b';
    for (let r = 0; r < 3; r++) {
      const ringY = crownY + 7 * scale + r * 5 * scale;
      ctx.fillRect(-halfB, ringY, halfB * 2, 2 * scale);
    }

    // Wrist pin hole & pin
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(x, y, 9 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(x, y, 6 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw Connecting Rod with Bearings
  drawConnectingRod(ctx, x1, y1, x2, y2, scale) {
    ctx.save();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    ctx.translate(x1, y1);
    ctx.rotate(angle);

    const rodThick = 11 * scale;

    // Rod H-Beam Metallic Gradient
    const rodGrad = ctx.createLinearGradient(0, -rodThick, 0, rodThick);
    rodGrad.addColorStop(0, '#64748b');
    rodGrad.addColorStop(0.3, '#cbd5e1');
    rodGrad.addColorStop(0.7, '#94a3b8');
    rodGrad.addColorStop(1, '#475569');

    ctx.fillStyle = rodGrad;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;

    // Small end eye (Wrist pin)
    ctx.beginPath();
    ctx.arc(0, 0, 11 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rod Beam
    ctx.beginPath();
    ctx.moveTo(10 * scale, -rodThick * 0.45);
    ctx.lineTo(length - 16 * scale, -rodThick * 0.65);
    ctx.lineTo(length - 16 * scale, rodThick * 0.65);
    ctx.lineTo(10 * scale, rodThick * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Big end cap & bearing (Crank pin journal)
    ctx.beginPath();
    ctx.arc(length, 0, 16 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rod bolts
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(length - 4 * scale, -18 * scale, 4 * scale, 3 * scale);
    ctx.fillRect(length - 4 * scale, 15 * scale, 4 * scale, 3 * scale);

    ctx.restore();
  }

  // Draw Crankshaft Journal & Counterweight
  drawCrankshaft(ctx, cx, cy, pinX, pinY, radius, scale) {
    ctx.save();
    // Crank Center Main Journal
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(cx, cy, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Counterweight Web (opposite to crank pin for balance)
    const angleToPin = Math.atan2(pinY - cy, pinX - cx);
    const counterAngle = angleToPin + Math.PI;

    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(cx, cy, 38 * scale, counterAngle - 0.7, counterAngle + 0.7);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crank Pin (Connected to connecting rod big end)
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 9 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.stroke();

    ctx.restore();
  }

  // Draw Cylinder Number & Cycle Badge
  drawCylinderInfo(ctx, y, cyl, scale) {
    ctx.save();
    ctx.textAlign = 'center';

    // Cylinder number
    ctx.font = `600 ${13 * scale}px Rajdhani, Orbitron, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`CYLINDER #${cyl.index + 1}`, 0, y);

    // Stroke badge with distinctive colors
    let badgeText = '';
    let badgeColor = '#94a3b8';

    switch (cyl.stroke) {
      case 'intake':
        badgeText = '進氣 INTAKE';
        badgeColor = '#38bdf8';
        break;
      case 'compression':
        badgeText = '壓縮 COMPRESSION';
        badgeColor = '#a855f7';
        break;
      case 'power':
        badgeText = '點火作功 POWER';
        badgeColor = '#f97316';
        break;
      case 'exhaust':
        badgeText = '排氣 EXHAUST';
        badgeColor = '#ef4444';
        break;
    }

    const badgeW = 105 * scale;
    const badgeH = 20 * scale;
    const badgeY = y + 7 * scale;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 4 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.font = `bold ${10 * scale}px Rajdhani, sans-serif`;
    ctx.fillStyle = badgeColor;
    ctx.fillText(badgeText, 0, badgeY + 14 * scale);

    // Estimated live pressure, shown only when the visual phase is synchronized.
    if (cyl.gasPressure !== undefined) {
      ctx.font = `700 ${9.5 * scale}px Orbitron, monospace`;
      const p = cyl.gasPressure;
      ctx.fillStyle = p > 25 ? '#ff0055' : p > 10 ? '#f97316' : p > 2 ? '#a855f7' : '#38bdf8';
      ctx.fillText(`≈ ${p.toFixed(1)} bar`, 0, badgeY + 31 * scale);
    }

    ctx.restore();
  }

  // Technical Overlay inside Canvas
  drawCanvasOverlay(ctx, engine, drivetrain, w, h) {
    ctx.save();
    // Top Left: Engine Architecture & Layout info
    ctx.font = '700 14px Orbitron, Rajdhani, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(engine.config.name.toUpperCase(), 20, 30);

    ctx.font = '500 12px Rajdhani, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`排氣量: ${engine.displacement} cc | ${engine.config.layout === 'rotary' ? '每面循環 1080° · 轉子 1:3' : engine.config.cycleKind === 'two-stroke' ? '二行程循環 360° · 活塞控制氣口' : '四行程循環 720°'} | ${engine.exhaust.brand}`, 20, 50);

    // Top Right: Firing status & Crank angle & Slow-mo indicator
    ctx.textAlign = 'right';
    ctx.font = '600 13px Orbitron, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`VISUAL CRANK: ${Math.round(this.visualCrankAngle)}°`, w - 20, 30);

    ctx.font = '600 11px Rajdhani, sans-serif';
    ctx.fillStyle = this.animationSpeed < 0.95 ? '#00f0ff' : '#64748b';
    ctx.fillText(`慢動作倍率: ${this.animationSpeed.toFixed(2)}x ${this.animationSpeed < 0.95 ? '(SLOW-MO ON)' : '(REALTIME)'}`, w - 20, 48);

    ctx.font = '500 11px Rajdhani, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`視角模式: ${this.viewMode === 'multi' ? '多缸全覽' : '單缸細部'} (可點擊切換)`, w - 20, 66);

    ctx.restore();
  }

  // Floating spark & smoke particles
  renderParticles(ctx, dt = 0.016) {
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.life <= 0) {
        this.sparkParticles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 0.25);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
