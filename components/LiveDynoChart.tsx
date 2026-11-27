"use client";

import { useMemo } from "react";
import type { Vehicle } from "../data/vehicles";
import { engineFullThrottleTorqueAtRpm, rpmFromRadiansPerSecond } from "../lib/simulation";
import type { SimulationState } from "../lib/simulation";

const WATTS_PER_PS = 735.49875;
const CHART_W = 360;
const CHART_H = 148;
const PAD_L = 32;
const PAD_R = 32;
const PAD_T = 14;
const PAD_B = 24;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;
const SAMPLE_COUNT = 64;

export function LiveDynoChart({ vehicle, snapshot }: { vehicle: Vehicle; snapshot: SimulationState }) {
  const { idleRpm, fuelCutRpm, referenceRpm } = vehicle.physics;
  const maxChartRpm = Math.max(referenceRpm, fuelCutRpm);

  const curve = useMemo(() => {
    const points: { rpm: number; torqueNm: number; powerPs: number }[] = [];
    let maxTorque = 10;
    let maxPower = 10;
    for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
      const rpm = idleRpm + ((maxChartRpm - idleRpm) * index) / SAMPLE_COUNT;
      const torqueNm = rpm <= fuelCutRpm ? engineFullThrottleTorqueAtRpm(rpm, vehicle) : 0;
      const omega = (rpm * 2 * Math.PI) / 60;
      const powerPs = (torqueNm * omega) / WATTS_PER_PS;
      if (torqueNm > maxTorque) maxTorque = torqueNm;
      if (powerPs > maxPower) maxPower = powerPs;
      points.push({ rpm, torqueNm, powerPs });
    }
    const torqueScale = maxTorque * 1.12;
    const powerScale = maxPower * 1.12;
    const xAt = (rpm: number) => PAD_L + ((rpm - idleRpm) / Math.max(100, maxChartRpm - idleRpm)) * PLOT_W;
    const yTorque = (nm: number) => PAD_T + PLOT_H - (nm / torqueScale) * PLOT_H;
    const yPower = (ps: number) => PAD_T + PLOT_H - (ps / powerScale) * PLOT_H;

    const torquePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.rpm).toFixed(1)},${yTorque(p.torqueNm).toFixed(1)}`)
      .join(" ");
    const powerPath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.rpm).toFixed(1)},${yPower(p.powerPs).toFixed(1)}`)
      .join(" ");

    const markers: { rpm: number; label: string }[] = [];
    if (vehicle.geometry.vtec) markers.push({ rpm: vehicle.geometry.vtec.switchRpm, label: "VTEC" });
    if (vehicle.geometry.vva?.switchRpm) markers.push({ rpm: vehicle.geometry.vva.switchRpm, label: "VVA" });
    if (vehicle.twoStroke) markers.push({ rpm: vehicle.twoStroke.powerbandStartRpm, label: "Powerband" });

    return { torquePath, powerPath, torqueScale, powerScale, maxTorque, maxPower, markers };
  }, [fuelCutRpm, idleRpm, maxChartRpm, vehicle]);

  const liveRpm = rpmFromRadiansPerSecond(snapshot.engineAngularVelocity);
  const clampedRpm = Math.min(maxChartRpm, Math.max(idleRpm, liveRpm));
  const liveX = PAD_L + ((clampedRpm - idleRpm) / Math.max(100, maxChartRpm - idleRpm)) * PLOT_W;
  const netEngineTorqueNm = Math.max(0, snapshot.combustionTorqueNm - vehicle.physics.frictionNm);
  const livePowerPs = snapshot.engineOn
    ? (netEngineTorqueNm * snapshot.engineAngularVelocity) / WATTS_PER_PS
    : 0;
  const liveTorqueY = PAD_T + PLOT_H - Math.min(1, netEngineTorqueNm / curve.torqueScale) * PLOT_H;
  const livePowerY = PAD_T + PLOT_H - Math.min(1, livePowerPs / curve.powerScale) * PLOT_H;
  const redlineX = PAD_L + ((referenceRpm - idleRpm) / Math.max(100, maxChartRpm - idleRpm)) * PLOT_W;

  return (
    <div className="dyno-panel" aria-label="即時馬力與扭力曲線">
      <div className="dyno-header">
        <span className="dyno-legend">
          <span className="dyno-swatch dyno-power-swatch" />馬力 <strong>{Math.round(livePowerPs)} PS</strong>
          <small>（峰值 {Math.round(vehicle.physics.peakPowerPs)}）</small>
        </span>
        <span className="dyno-legend">
          <span className="dyno-swatch dyno-torque-swatch" />扭力 <strong>{Math.round(netEngineTorqueNm)} Nm</strong>
          <small>（峰值 {Math.round(vehicle.physics.peakTorqueNm)}）</small>
        </span>
      </div>
      <svg className="dyno-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={`${vehicle.name} 馬力與扭力曲線圖`}>
        <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#141612" stroke="#3c3f35" strokeWidth="1" rx="4" />
        <line x1={PAD_L} y1={PAD_T + PLOT_H * 0.5} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H * 0.5} stroke="#2b2e26" strokeDasharray="3 3" />
        <line x1={redlineX} y1={PAD_T} x2={redlineX} y2={PAD_T + PLOT_H} stroke="#d95848" strokeDasharray="3 2" strokeWidth="1" />
        {curve.markers.map((marker) => {
          const mx = PAD_L + ((marker.rpm - idleRpm) / Math.max(100, maxChartRpm - idleRpm)) * PLOT_W;
          return (
            <g key={marker.label}>
              <line x1={mx} y1={PAD_T} x2={mx} y2={PAD_T + PLOT_H} stroke="#8ad9ef88" strokeDasharray="2 2" />
              <text x={mx + 3} y={PAD_T + 10} fill="#8ad9ef" fontSize="8.5">{marker.label}</text>
            </g>
          );
        })}
        <path d={curve.torquePath} fill="none" stroke="#64e6bc" strokeWidth="1.9" />
        <path d={curve.powerPath} fill="none" stroke="#f0b64d" strokeWidth="2.1" />
        {snapshot.engineOn && (
          <>
            <line x1={liveX} y1={PAD_T} x2={liveX} y2={PAD_T + PLOT_H} stroke="#ffffff55" strokeWidth="1" />
            <circle cx={liveX} cy={liveTorqueY} r="3.6" fill="#64e6bc" stroke="#111" strokeWidth="1" />
            <circle cx={liveX} cy={livePowerY} r="4.2" fill="#f0b64d" stroke="#111" strokeWidth="1" />
          </>
        )}
        <text x={PAD_L - 4} y={PAD_T + 8} textAnchor="end" fill="#f0b64d" fontSize="8.5">{Math.round(curve.maxPower)}PS</text>
        <text x={CHART_W - PAD_R + 4} y={PAD_T + 8} textAnchor="start" fill="#64e6bc" fontSize="8.5">{Math.round(curve.maxTorque)}Nm</text>
        <text x={PAD_L} y={CHART_H - 6} fill="#9ca292" fontSize="8.5">{Math.round(idleRpm / 100) / 10}k</text>
        <text x={redlineX} y={CHART_H - 6} textAnchor="middle" fill="#e8796b" fontSize="8.5">{Math.round(referenceRpm / 100) / 10}k</text>
      </svg>
    </div>
  );
}
