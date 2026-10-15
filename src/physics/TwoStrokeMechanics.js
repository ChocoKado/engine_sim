const clamp = n => Math.max(0, Math.min(1, n));

// Port timings/area laws are illustrative piston-controlled windows, not an OEM
// port map. One shaft revolution completes compression, expansion and scavenging.
// https://global.yamaha-motor.com/business/mc/mc-tech/standard-technology/2st4st.html
export function twoStrokePortState(phaseDegrees, config = {}) {
  const phaseAngle = ((phaseDegrees % 360) + 360) % 360;
  const { exhaustOpen = 110, exhaustClose = 250, transferOpen = 125,
    transferClose = 235 } = config.twoStrokePorts || {};
  const opening = (start, end) => phaseAngle > start && phaseAngle < end
    ? Math.sin(Math.PI * (phaseAngle - start) / (end - start)) ** 1.3 : 0;
  const exhaustPort = opening(exhaustOpen, exhaustClose);
  const transferPort = opening(transferOpen, transferClose);
  const crankcaseIntake = phaseAngle > 215 ? Math.sin(Math.PI * (phaseAngle - 215) / 145) : 0;
  const rad = phaseAngle * Math.PI / 180;
  const ratio = 3.5;
  const pistonPos = (1 + ratio - Math.cos(rad) - Math.sqrt(ratio * ratio - Math.sin(rad) ** 2)) / 2;
  const portPhase = transferPort > 0 ? 'scavenging' : exhaustPort > 0 ? 'blowdown'
    : phaseAngle < 180 ? 'expansion' : 'compression';
  return { phaseAngle, exhaustPort, transferPort, crankcaseIntake: clamp(crankcaseIntake),
    pistonPos, portPhase, stroke: portPhase === 'expansion' ? 'power'
      : portPhase === 'compression' ? 'compression' : 'exhaust', isIgnitionPhase: phaseAngle < 18 };
}
