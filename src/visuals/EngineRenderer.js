// EngineRenderer.js
// High-performance 2D Canvas rendering of engine mechanical cross-section:
// Pistons, connecting rods, crankshaft counterweights, camshaft valves,
// spark plug electric arc ignition, combustion fireball, and glowing exhaust runners.

import { radialKinematics, radialFiringAngles, wrapDegrees, cylinderViewLayout } from './MechanicalKinematics.js';

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
    this.animationSpeed = Math.max(0.05, Math.min(1.0, Number(speed)));
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
    const visualDegPerSec = engine.rpm * 6 * this.animationSpeed;
    this.visualCrankAngle = this.animationSpeed === 1 ? engine.crankAngle
      : (this.visualCrankAngle + visualDegPerSec * dt) % 720;

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

    if (config.layout === 'radial' && this.viewMode !== 'focused') {
      this.drawRadialEngine(ctx, engine, w, h, hideText);
    } else {
      const layout = cylinderViewLayout(cylinders, config, w, h, {
        focusedIndex: this.viewMode === 'focused' ? this.focusedCylIndex : null,
        showLabels: !hideText,
      });
      const labeledGroups = new Set();
      layout.forEach(cell => {
        if (!hideText && this.viewMode !== 'focused' && !labeledGroups.has(cell.groupIndex)
          && (config.layout === 'w' || config.layout === 'v' && cylinders.length > 6)) {
          ctx.save();
          ctx.font = '600 10px Rajdhani, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(`BANK ${cell.bankIndex + 1} · 汽缸剖面`, cell.group.left + 4, cell.group.top + 12);
          ctx.restore();
          labeledGroups.add(cell.groupIndex);
        }
        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.rotate(cell.angle * Math.PI / 180);
        this.drawSingleCylinder(ctx, cell.cylinder, engine, cell.scale, this.visualCrankAngle, hideText || cell.scale < 0.6);
        ctx.restore();
      });
    }

    // Update and draw floating fire/spark particles
    this.renderParticles(ctx);

    // Draw Telemetry Overlay inside canvas (clean animation hides text)
    if (!hideText) {
      this.drawCanvasOverlay(ctx, engine, drivetrain, w, h);
    }
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
  drawRadialEngine(ctx, engine, w, h, hideText = false) {
    const cylinders = engine.cylinderStates;
    const numCyls = cylinders.length;
    const cx = w * 0.5;
    const cy = h * 0.52;

    // Responsive scaling
    const maxRadius = Math.min(w * 0.46, h * 0.45);
    const scale = Math.max(0.2, Math.min(1.4, maxRadius / 155));

    const crankRadius = 24 * scale;
    const rodLength = 80 * scale;
    const bore = 34 * scale;
    const halfBore = bore / 2;
    const pistonHeight = 26 * scale;
    const outerCylDist = rodLength + crankRadius + 24 * scale;

    // Crankpin location (Visual angle)
    const crankAngleRad = (this.visualCrankAngle * Math.PI) / 180;
    const pinX = cx + Math.sin(crankAngleRad) * crankRadius;
    const pinY = cy - Math.cos(crankAngleRad) * crankRadius;

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
    const cwAngle = crankAngleRad + Math.PI;
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

    const geometry = radialKinematics(this.visualCrankAngle, numCyls, crankRadius, rodLength, 13 * scale);
    if (this.radialCylinderCount !== numCyls) {
      this.radialCylinderCount = numCyls;
      this.radialTiming = radialFiringAngles(numCyls);
    }
    // All wrists and rod joints use the same rigid master-and-articulated geometry.
    const cylKinematics = [];
    for (let i = 0; i < numCyls; i++) {
      // Dynamic phase angle and stroke for this cylinder
      const cyl = cylinders[i];
      const visualAngle = wrapDegrees(this.visualCrankAngle - this.radialTiming[i] + 360);
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
        isFiring: stroke === 'power' && visualAngle < 430 && engine.isIgnitionOn
          && !engine.isRevLimitingCut && !engine.ignitionCut
      });
    }

    // 2. Draw Cylinder Barrels, Cooling Fins, Cylinder Heads & Combustion Fireballs
    cylKinematics.forEach(k => {
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

      // Combustion Fireball & Spark Arc
      if (k.isFiring) {
        const fireHeight = Math.max(8 * scale, crownLocalY - topY);
        const fireGrad = ctx.createRadialGradient(0, topY + 4 * scale, 2, 0, topY + fireHeight * 0.5, fireHeight);
        fireGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        fireGrad.addColorStop(0.25, 'rgba(255, 210, 60, 0.95)');
        fireGrad.addColorStop(0.65, 'rgba(255, 75, 10, 0.85)');
        fireGrad.addColorStop(1, 'rgba(200, 20, 0, 0.2)');

        ctx.fillStyle = fireGrad;
        ctx.fillRect(-halfBore + 2, topY, bore - 4, fireHeight);

        // Electric Spark Arc
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, topY);
        ctx.lineTo((Math.random() - 0.5) * 6 * scale, topY + 6 * scale);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Spark particles
        if (Math.random() < 0.4) {
          this.sparkParticles.push({
            x: k.wristX + (Math.random() - 0.5) * 10,
            y: k.wristY + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            life: 0.18,
            color: '#fbbf24'
          });
        }
      }

      // Piston Assembly
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.roundRect(-halfBore + 1.5, crownLocalY, bore - 3, pistonHeight, 2 * scale);
      ctx.fill();
      ctx.stroke();

      // Piston Rings
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let r = 0; r < 2; r++) {
        const ringY = crownLocalY + (4 + r * 3) * scale;
        ctx.beginPath();
        ctx.moveTo(-halfBore + 2, ringY);
        ctx.lineTo(halfBore - 2, ringY);
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
        ctx.fillText(`#${k.index + 1}`, 0, topY - 17 * scale);
        ctx.restore();
      }

      ctx.restore();
    });

    // 3. Draw Connecting Rods (Master Rod for Cyl 0, Articulated Rods for Cyl 1..6)
    const master = cylKinematics[0];

    // Articulated Rods (Cylinders 1..6)
    for (let i = 1; i < numCyls; i++) {
      const k = cylKinematics[i];
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
  }

  // Draw a single complete cylinder assembly
  drawSingleCylinder(ctx, cyl, engine, scale = 1.0, visualCrankAngle = 0, hideText = false) {
    // Mechanical Dimensions
    const bore = 70 * scale; // cylinder bore diameter
    const strokeHeight = 110 * scale;
    const crankRadius = 32 * scale;
    const rodLength = crankRadius * engine.rodToCrankRatio;
    const pistonHeight = 44 * scale;

    const crankCenterY = 90 * scale;
    const cylinderTopY = crankCenterY - rodLength - crankRadius - 20 * scale;

    // Dynamic visual angle for this cylinder:
    const cylVisualAngle = (visualCrankAngle + cyl.firingOffset) % 720;

    // Crank pin position
    const crankAngleRad = (cylVisualAngle * Math.PI) / 180;
    const crankPinX = Math.sin(crankAngleRad) * crankRadius;
    const crankPinY = crankCenterY - Math.cos(crankAngleRad) * crankRadius;

    // Kinematic piston position for visual angle
    const r = 1.0;
    const l = engine.rodToCrankRatio;
    const cosA = Math.cos(crankAngleRad);
    const sinA = Math.sin(crankAngleRad);
    const distFromCrankCenter = r * cosA + Math.sqrt(l * l - r * r * sinA * sinA);
    const maxDist = r + l;
    const minDist = -r + Math.sqrt(l * l);
    const visualPistonPos = (maxDist - distFromCrankCenter) / (maxDist - minDist);

    const wristPinY = crankCenterY - distFromCrankCenter * crankRadius;
    const wristPinX = 0;

    // Visual 4-stroke cycle phases:
    let visualStroke = 'intake';
    let visualIntakeValve = 0;
    let visualExhaustValve = 0;
    let visualIsFiring = false;

    if (cylVisualAngle < 180) {
      visualStroke = 'intake';
      visualIntakeValve = Math.sin((cylVisualAngle / 180) * Math.PI);
    } else if (cylVisualAngle < 360) {
      visualStroke = 'compression';
    } else if (cylVisualAngle < 540) {
      visualStroke = 'power';
    } else {
      visualStroke = 'exhaust';
      visualExhaustValve = Math.sin(((cylVisualAngle - 540) / 180) * Math.PI);
    }

    // Spark fires at TDC (around 360 degrees)
    if (cylVisualAngle >= 350 && cylVisualAngle <= 375 && engine.isIgnitionOn
      && !engine.isRevLimitingCut && !engine.ignitionCut) {
      visualIsFiring = true;
    }

    const visualCyl = {
      index: cyl.index,
      phaseAngle: cylVisualAngle,
      pistonPos: visualPistonPos,
      stroke: visualStroke,
      intakeValve: visualIntakeValve,
      exhaustValve: visualExhaustValve,
      isFiring: visualIsFiring,
      // Live pressure belongs to the physical phase, not the slowed visual phase.
      gasPressure: this.animationSpeed === 1 ? cyl.gasPressure : undefined,
      blowdownPulse: cyl.blowdownPulse || 0,
      gasTorque: cyl.gasTorque || 0
    };

    // 1. Draw Cylinder Sleeve / Block Walls
    this.drawCylinderSleeve(ctx, cylinderTopY, bore, strokeHeight + 50 * scale, engine.exhaustHeat, scale);

    // 2. Draw Combustion Chamber & Fireball
    this.drawCombustionChamber(ctx, cylinderTopY, wristPinY - 15 * scale, bore, visualCyl, engine);

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
  drawCombustionChamber(ctx, topY, pistonCrownY, bore, cyl, engine) {
    const chamberHeight = Math.max(8, pistonCrownY - topY);
    const halfBore = (bore / 2) - 2;

    ctx.save();
    if (cyl.stroke === 'power' && engine.isIgnitionOn && !engine.isRevLimitingCut && !engine.ignitionCut) {
      // Fireball explosion!
      const intensity = 1.0 - (cyl.phaseAngle - 360) / 180;
      const fireGrad = ctx.createRadialGradient(0, topY + 10, 2, 0, topY + chamberHeight * 0.5, chamberHeight);
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

      // Spawn spark particles occasionally
      if (Math.random() < 0.4) {
        this.sparkParticles.push({
          x: 0,
          y: topY + 4 * scale,
          vx: (Math.random() - 0.5) * 80,
          vy: Math.random() * 90 + 30,
          life: 0.25,
          color: '#38bdf8'
        });
      }
    }

    ctx.restore();
  }

  // Draw Piston with Rings and Wrist Pin
  drawPiston(ctx, x, y, bore, height, scale) {
    const halfB = (bore / 2) - 2;
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
    ctx.lineWidth = 1.5;

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
    ctx.fillText(`排氣量: ${engine.displacement} cc | 點火循環: 720° 四行程 | 排氣系統: ${engine.exhaust.brand}`, 20, 50);

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
  renderParticles(ctx) {
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.life -= 0.016;

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
