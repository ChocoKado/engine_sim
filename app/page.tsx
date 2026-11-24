"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EngineView } from "../components/EngineView";
import { RidingControls, ShiftModeControls } from "../components/RidingControls";
import { cars } from "../data/cars";
import { tuningProfiles } from "../data/tuning";
import type { TuningProfile } from "../data/tuning";
import { vehicles } from "../data/vehicles";
import type { Vehicle } from "../data/vehicles";
import { useEngineAudio } from "../hooks/useEngineAudio";
import { useSimulation } from "../hooks/useSimulation";
import { rpmFromRadiansPerSecond } from "../lib/simulation";

const motorcycleGearSequence = [1, 0, 2, 3, 4, 5, 6];
const simulationModes = {
  motorcycle: { label: "機車", heading: "騎乘控制台" },
  car: { label: "汽車", heading: "駕駛控制台" },
  aircraft: { label: "飛機", heading: "飛機引擎控制台" },
  space: { label: "航天", heading: "航天引擎控制台" },
} as const;
type SimulationMode = keyof typeof simulationModes;
type RoadMode = "motorcycle" | "car";
const modeOptions = Object.keys(simulationModes) as SimulationMode[];
const roadCatalogs: Record<RoadMode, readonly Vehicle[]> = { motorcycle: vehicles, car: cars };
const AerospaceConsole = dynamic(() => import("../components/AerospaceConsole").then((module) => module.AerospaceConsole), {
  loading: () => <p className="panel" role="status">載入引擎控制台</p>,
});

function Tachometer({ rpm, referenceRpm, isCar }: { rpm: number; referenceRpm: number; isCar: boolean }) {
  const rpmPerTick = isCar ? 2_000 : 3_000;
  const maxRpm = Math.max(isCar ? 8_000 : 15_000, (Math.floor(referenceRpm / rpmPerTick) + 1) * rpmPerTick);
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
  const [tuning, setTuning] = useState<TuningProfile>(tuningProfiles[0]);
  const { audioStatus, sendAudioState, toggleAudio, volume, changeVolume } = useEngineAudio(vehicle, tuning);
  const { snapshot, readState, pedalReset, setPedal, shift, setShiftMode, setRoadSpeedLimitDisabled, toggleEngine, resetSimulation } = useSimulation(vehicle, sendAudioState);
  const { engineAngularVelocity, vehicleSpeed, gear, engineOn, shiftMode, shift: pendingShift, lastShift, engineFailed, roadSpeedLimitDisabled } = snapshot;
  const isCar = vehicle.kind === "car";
  const gears = isCar ? Array.from({ length: vehicle.gears + 1 }, (_, index) => index)
    : motorcycleGearSequence.filter((position) => position <= vehicle.gears);

  return (
    <div className="console-layout" onContextMenu={(event) => event.preventDefault()}>
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
              <Tachometer rpm={rpmFromRadiansPerSecond(engineAngularVelocity)} referenceRpm={vehicle.physics.referenceRpm} isCar={isCar} />
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
            <ol className="gear-sequence" aria-label={`${vehicle.gears} 速檔位排列`}>
              {gears.map((position) => (
                <li key={position} aria-current={position === gear ? "true" : undefined}>
                  {position || "N"}
                </li>
              ))}
            </ol>
            <p className="dashboard-note">傳動採近似模型，{isCar ? "輪胎" : "後輪"}假定純滾動，計入滾阻與風阻。聲浪為合成示意。</p>
            {vehicle.physics.speedLimitKmh !== undefined && (
              <label className="road-limiter">
                <input
                  type="checkbox"
                  checked={roadSpeedLimitDisabled}
                  onChange={(event) => setRoadSpeedLimitDisabled(event.currentTarget.checked)}
                />
                模擬解除 {vehicle.physics.speedLimitKmh} km/h 限速
              </label>
            )}
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
        title={isCar ? "駕駛控制" : "騎乘控制"}
        engineOn={engineOn}
        engineFailed={engineFailed}
        shiftMode={shiftMode}
        onToggleEngine={toggleEngine}
        onReset={resetSimulation}
        audioStatus={audioStatus}
        onToggleAudio={toggleAudio}
        volume={volume}
        onVolumeChange={changeVolume}
        tuning={tuning}
        onTuningChange={setTuning}
        onShift={shift}
        onPedalChange={setPedal}
        resetKey={pedalReset}
      />
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<SimulationMode>("motorcycle");
  const [brands, setBrands] = useState<Record<RoadMode, Vehicle["brand"]>>({ motorcycle: vehicles[0].brand, car: cars[0].brand });
  const [selectedVehicles, setSelectedVehicles] = useState<Partial<Record<string, Vehicle>>>({});
  const roadMode = mode === "car" ? "car" : "motorcycle";
  const brand = brands[roadMode];
  const catalog = roadCatalogs[roadMode];
  const vehicleBrands = [...new Set(catalog.map((vehicle) => vehicle.brand))];
  const brandVehicles = catalog.filter((vehicle) => vehicle.brand === brand);
  const selectionKey = `${roadMode}/${brand}`;
  const activeVehicle = selectedVehicles[selectionKey] ?? brandVehicles[0];
  const optionList = useRef<HTMLDivElement>(null);

  function chooseVehicle(vehicle: Vehicle) {
    setSelectedVehicles((previous) => ({ ...previous, [selectionKey]: vehicle }));
  }

  useEffect(() => {
    const list = optionList.current;
    const card = list?.querySelector("input:checked")?.closest(".vehicle-option");
    if (!list || !card) return;
    const viewport = list.getBoundingClientRect();
    const { left, right } = card.getBoundingClientRect();
    if (left < viewport.left) list.scrollLeft += left - viewport.left;
    else if (right > viewport.right) list.scrollLeft += right - viewport.right;
  }, [activeVehicle.id, mode]);

  return (
    <main className="console-shell">
      <header className="site-header">
        <div className="site-header-bar">
          <strong className="wordmark">engine_sim</strong>
          <span className="preview-status">近似模型</span>
        </div>
        <h1>{simulationModes[mode].heading}</h1>
      </header>
      <nav className="simulation-modes" aria-label="模擬類型">
        {modeOptions.map((option) => (
          <button key={option} type="button" className="mode-button" aria-pressed={mode === option} onClick={() => setMode(option)}>
            {simulationModes[option].label}
          </button>
        ))}
      </nav>
      {mode === "aircraft" || mode === "space" ? (
        <AerospaceConsole key={mode} category={mode} />
      ) : (
        <>
          <section className="vehicle-section" aria-labelledby="vehicle-title">
            <div className="section-heading">
              <div className="vehicle-heading">
                <h2 id="vehicle-title">選擇車型</h2>
                <small>{activeVehicle.version}</small>
              </div>
              <select
                className="brand-select"
                aria-label="車款品牌"
                value={brand}
                onChange={(event) => {
                  const selectedBrand = vehicleBrands.find((option) => option === event.currentTarget.value);
                  if (selectedBrand) setBrands((previous) => ({ ...previous, [roadMode]: selectedBrand }));
                }}
              >
                {vehicleBrands.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <a href={activeVehicle.source}>原廠資料</a>
            </div>
            {brandVehicles.length > 6 && (
              <label className="vehicle-model-picker">
                全部車款
                <select
                  className="model-select"
                  value={activeVehicle.id}
                  onChange={(event) => {
                    const vehicle = brandVehicles.find(({ id }) => id === event.currentTarget.value);
                    if (vehicle) chooseVehicle(vehicle);
                  }}
                >
                  {brandVehicles.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            )}
            <div
              key={selectionKey}
              ref={optionList}
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
                    onChange={() => chooseVehicle(vehicle)}
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
        </>
      )}
    </main>
  );
}
