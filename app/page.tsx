"use client";

import { useState } from "react";
import { EngineView } from "../components/EngineView";
import { RidingControls, ShiftModeControls } from "../components/RidingControls";
import { vehicles } from "../data/vehicles";
import type { Vehicle } from "../data/vehicles";
import { useEngineAudio } from "../hooks/useEngineAudio";
import { useSimulation } from "../hooks/useSimulation";
import { rpmFromRadiansPerSecond } from "../lib/simulation";

const gearSequence = [1, 0, 2, 3, 4, 5, 6];

function DrivingConsole({ vehicle }: { vehicle: Vehicle }) {
  const [showEngine, setShowEngine] = useState(false);
  const { audioStatus, sendAudioState, toggleAudio } = useEngineAudio(vehicle);
  const { snapshot, readState, pedalReset, setPedal, shift, setShiftMode, toggleEngine, resetSimulation } = useSimulation(vehicle, sendAudioState);
  const { engineAngularVelocity, vehicleSpeed, gear, engineOn, shiftMode, mechanicalOverRev, peakOverRevRpm, overRevSeconds, tireSlipRatio, engineFailed } = snapshot;

  return (
    <div className="console-layout">
      <section className="panel dashboard" aria-labelledby="dashboard-title">
        <div className="dashboard-heading">
          <h2 id="dashboard-title">{showEngine ? "引擎內構" : "儀表"}</h2>
          <div className="dashboard-actions">
            {!showEngine && <ShiftModeControls mode={shiftMode} onModeChange={setShiftMode} />}
            <button type="button" className="mode-button engine-view-toggle" onClick={() => setShowEngine(!showEngine)}>
              {showEngine ? "返回儀表" : "3D 內構"}
            </button>
          </div>
        </div>
        {showEngine ? <EngineView vehicle={vehicle} snapshot={snapshot} readState={readState} /> : (
          <>
            <div className="readouts">
              <div className="rpm-readout">
                <div className="rpm-arc" aria-hidden="true" />
                <span className="readout-value">{Math.round(rpmFromRadiansPerSecond(engineAngularVelocity))}</span>
                <span className="readout-label">轉速 <span>RPM</span></span>
              </div>
              <div className="speed-readout">
                <span className="readout-value">{Math.round(vehicleSpeed * 3.6)}</span>
                <span className="readout-label">車速 <span>km/h</span></span>
              </div>
              <div className="gear-readout">
                <output className="readout-value" aria-label="目前檔位">{gear || "N"}</output>
                <span className="readout-label">檔位</span>
              </div>
            </div>
            <ol className="gear-sequence" aria-label="六速檔位排列">
              {gearSequence.map((position) => (
                <li key={position} aria-current={position === gear ? "true" : undefined}>
                  {position || "N"}
                </li>
              ))}
            </ol>
            <p className="dashboard-note">傳動與輪胎為近似。聲浪為合成示意。</p>
          </>
        )}
        {snapshot.shift && (
          <p className="shift-status">
            換檔中 <strong>{snapshot.shift.targetGear || "N"}</strong>
            {snapshot.shift.targetGear > 0 && `・預估接合 ${Math.round(snapshot.shift.targetRpm)} RPM`}
          </p>
        )}
        {(mechanicalOverRev || peakOverRevRpm > 0) && (
          <p className="over-rev-status">
            {mechanicalOverRev
              ? <strong role="alert">機械反拖超出模擬紅區</strong>
              : <strong>上次機械超轉</strong>}
            <span>峰值 {Math.round(peakOverRevRpm)} RPM・{overRevSeconds.toFixed(2)} 秒</span>
          </p>
        )}
        {Math.abs(tireSlipRatio) >= 0.06 && (
          <p className="over-rev-status">後輪滑移約 {Math.round(Math.abs(tireSlipRatio) * 100)}%</p>
        )}
        {engineFailed && <p className="over-rev-status" role="alert">引擎示意故障。按「重設」可重新操作。</p>}
      </section>

      <RidingControls
        engineOn={engineOn}
        engineFailed={engineFailed}
        shiftMode={shiftMode}
        onToggleEngine={toggleEngine}
        onReset={resetSimulation}
        audioStatus={audioStatus}
        onToggleAudio={toggleAudio}
        onShift={shift}
        onPedalChange={setPedal}
        resetKey={pedalReset}
      />
    </div>
  );
}

export default function Home() {
  const [activeVehicle, setActiveVehicle] = useState<Vehicle>(vehicles[0]);

  return (
    <main className="console-shell">
      <header className="site-header">
        <div className="site-header-bar">
          <strong className="wordmark">engine_sim</strong>
          <span className="preview-status">近似模型</span>
        </div>
        <h1>騎乘控制台</h1>
      </header>

      <section className="vehicle-section" aria-labelledby="vehicle-title">
        <div className="section-heading">
          <h2 id="vehicle-title">選擇車型 <small>2026 台灣版</small></h2>
          <a href={activeVehicle.source}>原廠資料</a>
        </div>
        <div className="vehicle-options" role="radiogroup" aria-labelledby="vehicle-title">
          {vehicles.map((vehicle) => (
            <label className="vehicle-option" key={vehicle.id}>
              <input
                type="radio"
                name="vehicle"
                value={vehicle.id}
                checked={activeVehicle.id === vehicle.id}
                onChange={() => setActiveVehicle(vehicle)}
              />
              <span className="vehicle-card">
                <strong>{vehicle.name}</strong>
                <span className="vehicle-spec">{vehicle.displacementCc} cc <span aria-hidden="true">/</span> {vehicle.engine}</span>
                <span className="radio-indicator" aria-hidden="true" />
              </span>
            </label>
          ))}
        </div>
      </section>

      <DrivingConsole key={activeVehicle.id} vehicle={activeVehicle} />
    </main>
  );
}
