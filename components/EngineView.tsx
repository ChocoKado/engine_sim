"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Vehicle } from "../data/vehicles";
import { rpmFromRadiansPerSecond } from "../lib/simulation";
import type { SimulationState } from "../lib/simulation";

const EngineScene = dynamic(() => import("./EngineScene"), {
  ssr: false,
  loading: () => <div className="engine-scene engine-scene-fallback" role="status">載入 3D 內構</div>,
});

export function EngineView({ vehicle, snapshot, readState }: {
  vehicle: Vehicle;
  snapshot: SimulationState;
  readState: () => SimulationState;
}) {
  const [cutaway, setCutaway] = useState(true);
  const [paused, setPaused] = useState(false);
  const rpm = Math.round(rpmFromRadiansPerSecond(snapshot.engineAngularVelocity));
  const impellerRpm = Math.round(rpmFromRadiansPerSecond(snapshot.superchargerAngularVelocity));

  return (
    <div className="engine-view">
      <EngineScene vehicle={vehicle} readState={readState} cutaway={cutaway} paused={paused} />
      <div className="engine-view-tools">
        <div>
          <span className="engine-rpm">{rpm} RPM</span>
          {vehicle.supercharger && (
            <div>增壓葉輪 <span className="impeller-rpm">{impellerRpm.toLocaleString("zh-TW")} RPM</span></div>
          )}
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
      <p className="dashboard-note">
        拖曳旋轉，雙指或滾輪縮放。
        {vehicle.geometry.rotary ? "轉子、偏心軸與殼體為示意。" : "連桿尺寸、外殼與汽門正時為示意。"}
        {vehicle.geometry.vva && " VVA 切換點待驗。"}
        {vehicle.supercharger && " 增壓葉輪與殼體為示意。"}
      </p>
    </div>
  );
}
