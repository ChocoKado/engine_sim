"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Vehicle } from "../data/vehicles";
import { STROKE_COLORS } from "../lib/kinematics";
import type { EngineStroke } from "../lib/kinematics";
import { rpmFromRadiansPerSecond } from "../lib/simulation";
import type { SimulationState } from "../lib/simulation";
import styles from "./EngineView.module.css";

const EngineScene = dynamic(() => import("./EngineScene"), {
  ssr: false,
  loading: () => <div className="engine-scene engine-scene-fallback" role="status">載入 3D 內構</div>,
});

const visualSpeeds = [
  { value: 1, label: "1× 即時" },
  { value: 1 / 10, label: "1/10×" },
  { value: 1 / 30, label: "1/30×" },
  { value: 1 / 60, label: "1/60×" },
  { value: 1 / 120, label: "1/120×" },
  { value: 1 / 240, label: "1/240×" },
] as const;

const strokeNames: Record<EngineStroke, string> = {
  intake: "進氣", compression: "壓縮", power: "作功", exhaust: "排氣",
};
const strokeOrder: readonly EngineStroke[] = ["intake", "compression", "power", "exhaust"];

export function EngineView({ vehicle, snapshot, readState, readExhaustFlame }: {
  vehicle: Vehicle;
  snapshot: SimulationState;
  readState: () => SimulationState;
  readExhaustFlame: () => number;
}) {
  const [cutaway, setCutaway] = useState(true);
  const [paused, setPaused] = useState(false);
  const [visualSpeed, setVisualSpeed] = useState(1);
  const [strokes, setStrokes] = useState<readonly EngineStroke[]>([]);
  const rpm = Math.round(rpmFromRadiansPerSecond(snapshot.engineAngularVelocity));
  const impellerRpm = Math.round(rpmFromRadiansPerSecond(snapshot.superchargerAngularVelocity));

  return (
    <div className="engine-view">
      <EngineScene vehicle={vehicle} readState={readState} readExhaustFlame={readExhaustFlame}
        cutaway={cutaway} paused={paused} visualSpeed={visualSpeed} onStrokesChange={setStrokes} />
      <div className="engine-view-tools">
        <div>
          <span className="engine-rpm">{rpm} RPM</span>
          {vehicle.supercharger && (
            <div>增壓葉輪 <span className="impeller-rpm">{impellerRpm.toLocaleString("zh-TW")} RPM</span></div>
          )}
          {vehicle.turbocharger && <div>渦輪增壓 <span className="impeller-rpm">{snapshot.turboBoostBar.toFixed(2)} bar</span></div>}
          {vehicle.geometry.vtec && <div>VTEC <span className="impeller-rpm">{snapshot.vtecEngagement > 0.5 ? "高揚程" : "低揚程"}</span></div>}
        </div>
        <div className="engine-view-actions">
          <button type="button" className="mode-button cutaway-toggle" aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}>
            剖面
          </button>
          <button type="button" className="mode-button pause-view" onClick={() => setPaused(!paused)}>
            {paused ? "繼續畫面" : "暫停畫面"}
          </button>
        </div>
      </div>
      <label className={styles.speedControl}>動畫速度
        <select value={visualSpeed} onChange={(event) => setVisualSpeed(Number(event.currentTarget.value))}>
          {visualSpeeds.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {cutaway && (vehicle.geometry.rotary ? (
        <ul className={styles.legend} aria-label="轉子引擎色標">
          <li style={{ "--phase-color": STROKE_COLORS.intake } as CSSProperties}>進氣口</li>
          <li style={{ "--phase-color": STROKE_COLORS.power } as CSSProperties}>火星塞</li>
          <li style={{ "--phase-color": STROKE_COLORS.exhaust } as CSSProperties}>排氣口</li>
        </ul>
      ) : (
        <ul className={styles.legend} aria-label="各缸四行程">
          {strokeOrder.map((stroke) => (
            <li key={stroke} style={{ "--phase-color": STROKE_COLORS[stroke] } as CSSProperties}>
              {strokeNames[stroke]}
              <span className={styles.cylinders}>
                {strokes.flatMap((phase, index) => phase === stroke ? [index + 1] : []).join("、") || "－"}
              </span>
            </li>
          ))}
        </ul>
      ))}
      <p className="dashboard-note">
        拖曳旋轉，雙指或滾輪縮放。慢速只調整畫面。
        {vehicle.geometry.rotary ? "轉子、偏心軸與氣口位置為示意。" : "白光顯示點火。缸號依模型排序，汽門正時與管路為示意。"}
        {vehicle.geometry.vva && " VVA 切換點待驗。"}
        {vehicle.supercharger && " 增壓葉輪與殼體為示意。"}
        {" 回火時可在尾管看到火焰。"}
      </p>
    </div>
  );
}
