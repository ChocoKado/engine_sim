"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { EngineView } from "../components/EngineView";
import { RidingControls, ShiftModeControls } from "../components/RidingControls";
import { vehicles } from "../data/vehicles";
import type { Vehicle } from "../data/vehicles";
import { useEngineAudio } from "../hooks/useEngineAudio";
import { useSimulation } from "../hooks/useSimulation";
import { rpmFromRadiansPerSecond } from "../lib/simulation";

const gearSequence = [1, 0, 2, 3, 4, 5, 6];
const rpmPerTick = 3_000;
const vehicleBrands = ["Yamaha", "Kawasaki"] as const;

function Tachometer({ rpm, referenceRpm }: { rpm: number; referenceRpm: number }) {
  const maxRpm = Math.max(15_000, (Math.floor(referenceRpm / rpmPerTick) + 1) * rpmPerTick);
  const tachometerTicks = Array.from({ length: maxRpm / rpmPerTick + 1 }, (_, index) => index * rpmPerTick);
  const scale = {
    "--rpm-position": `${Math.min(rpm / maxRpm, 1) * 100}%`,
    "--redline-position": `${referenceRpm / maxRpm * 100}%`,
  } as CSSProperties;

  return (
    <div className="rpm-readout" style={scale} data-redline={rpm >= referenceRpm}>
      <div className="rpm-heading">
        <span className="readout-label">轉速 <span>RPM</span></span>
        <span className="readout-value">{Math.round(rpm)}</span>
      </div>
      <div className="rpm-arc rpm-track" aria-hidden="true" />
      <div className="rpm-scale" aria-hidden="true">
        {tachometerTicks.map((tick) => (
          <span key={tick} data-redline={tick >= referenceRpm}>{tick / 1_000}</span>
        ))}
      </div>
      <p className="rpm-scale-unit" aria-hidden="true">×1000 RPM</p>
    </div>
  );
}

function DrivingConsole({ vehicle }: { vehicle: Vehicle }) {
  const [showEngine, setShowEngine] = useState(false);
  const { audioStatus, sendAudioState, toggleAudio, volume, changeVolume } = useEngineAudio(vehicle);
  const { snapshot, readState, pedalReset, setPedal, shift, setShiftMode, toggleEngine, resetSimulation } = useSimulation(vehicle, sendAudioState);
  const { engineAngularVelocity, vehicleSpeed, gear, engineOn, shiftMode, shift: pendingShift, lastShift, engineFailed } = snapshot;

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
              <Tachometer rpm={rpmFromRadiansPerSecond(engineAngularVelocity)} referenceRpm={vehicle.physics.referenceRpm} />
              <div className="speed-readout">
                <span className="readout-label">車速</span>
                <span className="readout-value">{Math.round(vehicleSpeed * 3.6)}</span>
                <span className="speed-unit">km/h</span>
              </div>
              <div className="gear-readout" data-neutral={gear === 0}>
                <span className="readout-label">檔位</span>
                <output className="readout-value" aria-label="目前檔位">{gear || "N"}</output>
              </div>
            </div>
            <ol className="gear-sequence" aria-label="六速檔位排列">
              {gearSequence.map((position) => (
                <li key={position} aria-current={position === gear ? "true" : undefined}>
                  {position || "N"}
                </li>
              ))}
            </ol>
            <p className="dashboard-note">傳動採近似模型，後輪假定純滾動，計入滾阻與風阻。聲浪為合成示意。</p>
          </>
        )}
        <div className="dashboard-feedback">
          {engineFailed && <p className="engine-fault-status" role="alert">引擎示意故障。按「重設」可重新操作。</p>}
          {!engineFailed && pendingShift && (
            <p className="shift-status">
              換檔中 <strong>{pendingShift.targetGear || "N"}</strong>
              {pendingShift.targetGear > 0 && `・預估接合 ${Math.round(pendingShift.targetRpm)} RPM`}
            </p>
          )}
          {!engineFailed && !pendingShift && lastShift && (
            <p className="shift-result">
              上次換檔 {lastShift.fromGear}→{lastShift.targetGear}・
              {Math.round(lastShift.startRpm)} → {Math.round(lastShift.endRpm)} RPM
            </p>
          )}
        </div>
      </section>

      <RidingControls
        engineOn={engineOn}
        engineFailed={engineFailed}
        shiftMode={shiftMode}
        onToggleEngine={toggleEngine}
        onReset={resetSimulation}
        audioStatus={audioStatus}
        onToggleAudio={toggleAudio}
        volume={volume}
        onVolumeChange={changeVolume}
        onShift={shift}
        onPedalChange={setPedal}
        resetKey={pedalReset}
      />
    </div>
  );
}

export default function Home() {
  const [brand, setBrand] = useState<Vehicle["brand"]>(vehicles[0].brand);
  const [selectedVehicles, setSelectedVehicles] = useState<Partial<Record<Vehicle["brand"], Vehicle>>>({});
  const brandVehicles = vehicles.filter((vehicle) => vehicle.brand === brand);
  const activeVehicle = selectedVehicles[brand] ?? brandVehicles[0];

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
          <div className="vehicle-heading">
            <h2 id="vehicle-title">選擇車型</h2>
            <small>{activeVehicle.version}</small>
          </div>
          <div className="vehicle-brands" role="group" aria-label="車款品牌">
            {vehicleBrands.map((option) => (
              <button
                key={option}
                className="brand-button"
                type="button"
                aria-pressed={brand === option}
                onClick={() => setBrand(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <a href={activeVehicle.source}>原廠資料</a>
        </div>
        <div
          className={brandVehicles.length > 6 ? "vehicle-options vehicle-options-scroll" : "vehicle-options"}
          role="radiogroup"
          aria-labelledby="vehicle-title"
        >
          {brandVehicles.map((vehicle) => (
            <label className="vehicle-option" key={vehicle.id}>
              <input
                type="radio"
                name="vehicle"
                value={vehicle.id}
                checked={activeVehicle.id === vehicle.id}
                onChange={() => setSelectedVehicles((previous) => ({ ...previous, [brand]: vehicle }))}
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
