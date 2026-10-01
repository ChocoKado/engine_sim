// EngineRenderer.js
// High-performance 2D Canvas rendering of engine mechanical cross-section:
// Pistons, connecting rods, crankshaft counterweights, camshaft valves,
// spark plug electric arc ignition, combustion fireball, and glowing exhaust runners.

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

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = Math.max(240, rect.height || 380);

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
    this.visualCrankAngle = (this.visualCrankAngle + visualDegPerSec * dt) % 720;

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
    const totalCyls = cylinders.length;

    // Decide how many cylinders to draw
    let displayCylinders = cylinders;
    if (this.viewMode === 'focused') {
      displayCylinders = [cylinders[this.focusedCylIndex % totalCyls]];
    } else {
      if (totalCyls > 6) {
        displayCylinders = cylinders.slice(0, 6);
      }
    }

    const numToDraw = displayCylinders.length;
    const cylSpacing = w / (numToDraw + 1);

    // Draw each cylinder unit using visualCrankAngle
    displayCylinders.forEach((cyl, i) => {
      const centerX = cylSpacing * (i + 1);
      const isVEngine = config.layout === 'v' && config.bankAngle > 0;
      const bankAngleDeg = isVEngine ? (cyl.index % 2 === 0 ? -config.bankAngle / 2 : config.bankAngle / 2) : 0;

      ctx.save();
      ctx.translate(centerX, h * 0.55);
      if (bankAngleDeg !== 0) {
        ctx.rotate((bankAngleDeg * Math.PI) / 180);
      }

      this.drawSingleCylinder(ctx, cyl, engine, numToDraw === 1 ? 1.3 : (numToDraw > 4 ? 0.75 : 0.95), this.visualCrankAngle);
      ctx.restore();
    });

    // Update and draw floating fire/spark particles
    this.renderParticles(ctx);

    // Draw Telemetry Overlay inside canvas
    this.drawCanvasOverlay(ctx, engine, drivetrain, w, h);
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

  // Draw a single complete cylinder assembly
  drawSingleCylinder(ctx, cyl, engine, scale = 1.0, visualCrankAngle = 0) {
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

    const tdcWristPinY = cylinderTopY + 25 * scale;
    const bdcWristPinY = tdcWristPinY + (crankRadius * 2);
    const wristPinY = tdcWristPinY + visualPistonPos * (bdcWristPinY - tdcWristPinY);
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
    if (cylVisualAngle >= 350 && cylVisualAngle <= 375 && engine.isIgnitionOn && !engine.isRevLimitingCut) {
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
      gasPressure: cyl.gasPressure || 1.0,
      blowdownPulse: cyl.blowdownPulse || 0,
      gasTorque: cyl.gasTorque || 0
    };

    // 1. Draw Cylinder Sleeve / Block Walls
    this.drawCylinderSleeve(ctx, cylinderTopY, bore, strokeHeight + 50 * scale, engine.exhaustHeat);

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

    // 8. Cylinder Label & Current 4-Stroke Cycle Badge
    this.drawCylinderInfo(ctx, cylinderTopY - 45 * scale, visualCyl, scale);
  }

  // Draw Cylinder Walls with Heat Glow
  drawCylinderSleeve(ctx, topY, bore, height, heat) {
    const halfBore = bore / 2;
    const wallThick = 9;

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
      ctx.fillRect(halfBore, topY, wallThick + 4, height * 0.6);
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
    if (cyl.stroke === 'power' && engine.isIgnitionOn && !engine.isRevLimitingCut) {
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

    // Live Thermodynamic Gas Pressure Display (AngeTheGreat physical model)
    if (cyl.gasPressure !== undefined) {
      ctx.font = `700 ${9.5 * scale}px Orbitron, monospace`;
      const p = cyl.gasPressure;
      ctx.fillStyle = p > 25 ? '#ff0055' : p > 10 ? '#f97316' : p > 2 ? '#a855f7' : '#38bdf8';
      ctx.fillText(`${p.toFixed(1)} bar`, 0, badgeY + 31 * scale);
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
