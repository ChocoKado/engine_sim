"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EngineView } from "../components/EngineView";
import { LiveDynoChart } from "../components/LiveDynoChart";
import { RecordingComparison } from "../components/RecordingComparison";
import { RidingControls, ShiftModeControls } from "../components/RidingControls";
import { cars } from "../data/cars";
import { enduranceCars } from "../data/endurance-cars";
import { formulaOneCars } from "../data/formula-one";
import { tuningProfiles } from "../data/tuning";
import type { TuningProfile } from "../data/tuning";
import { vehicles } from "../data/vehicles";
import type { Vehicle } from "../data/vehicles";
import { useEngineAudio } from "../hooks/useEngineAudio";
import { useSimulation } from "../hooks/useSimulation";
import { PIT_ENTRY_LENGTH_M, PIT_EXIT_LENGTH_M, PIT_SPEED_LIMIT_KMH, rpmFromRadiansPerSecond, targetLaunchRpm } from "../lib/simulation";
import { resolveTransmissionType, TRANSMISSION_LABELS } from "../lib/transmission";

const simulationModes = {
  motorcycle: { label: "機車", heading: "騎乘控制台" },
  car: { label: "汽車", heading: "駕駛控制台" },
  formula1: { label: "F1", heading: "F1 引擎控制台" },
  endurance: { label: "耐力賽", heading: "耐力賽引擎控制台" },
  aircraft: { label: "飛機", heading: "飛機引擎控制台" },
  space: { label: "航天", heading: "航天引擎控制台" },
} as const;
type SimulationMode = keyof typeof simulationModes;
type RoadMode = "motorcycle" | "car" | "formula1" | "endurance";
const modeOptions = Object.keys(simulationModes) as SimulationMode[];
const roadCatalogs: Record<RoadMode, readonly Vehicle[]> = {
  motorcycle: vehicles, car: cars, formula1: formulaOneCars, endurance: enduranceCars,
};
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
  const [showDyno, setShowDyno] = useState(false);
  const [tuning, setTuning] = useState<TuningProfile>(tuningProfiles[0]);
  const [turboFlutterEnabled, setTurboFlutterEnabled] = useState(false);
  const [rotaryPortEnabled, setRotaryPortEnabled] = useState(false);
  const [launchControlEnabled, setLaunchControlEnabled] = useState(false);
  const canToggleRotaryPort = Boolean(vehicle.geometry.rotary);
  const canToggleTurboFlutter = Boolean(vehicle.turbocharger && (vehicle.kind === "car" || vehicle.turbocharger.releaseStyle !== "subtle"));
  const txType = resolveTransmissionType(vehicle);
  const launchRpm = targetLaunchRpm(vehicle);

  useEffect(() => {
    if (!canToggleRotaryPort && rotaryPortEnabled) setRotaryPortEnabled(false);
    if (!canToggleTurboFlutter && turboFlutterEnabled) setTurboFlutterEnabled(false);
  }, [canToggleRotaryPort, canToggleTurboFlutter, rotaryPortEnabled, turboFlutterEnabled]);

  const effectiveTuning = useMemo<TuningProfile>(() => ({
    ...tuning,
    voicing: {
      ...tuning.voicing,
      turboFlutter: canToggleTurboFlutter && turboFlutterEnabled ? 1 : 0,
      rotaryPort: canToggleRotaryPort && rotaryPortEnabled ? 1 : 0,
    },
  }), [canToggleRotaryPort, canToggleTurboFlutter, rotaryPortEnabled, tuning, turboFlutterEnabled]);

  const {
    audioStatus, sendAudioState, toggleAudio, startIgnitionAudio, volume, changeVolume, readExhaustFlame,
  } = useEngineAudio(vehicle, effectiveTuning, showEngine);
  const {
    snapshot, readState, pedalReset, setPedal, shift, setShiftMode, setRoadSpeedLimitDisabled,
    toggleEngine, requestPitReturn, resetSimulation,
    replayStatus, activeRecordedRun, toggleRunRecording, toggleRunReplay,
  } = useSimulation(vehicle, sendAudioState, canToggleRotaryPort && rotaryPortEnabled, launchControlEnabled);
  const { engineAngularVelocity, vehicleSpeed, gear, powerOn, enginePhase, engineWarmth, shiftMode, shift: pendingShift, lastShift, engineFailed,
    roadSpeedLimitDisabled, hybridEnergyKj, hybridPowerKw, electricEnergyKj, electricPowerKw, turboBoostBar } = snapshot;
  const isRace = vehicle.kind === "formula1" || vehicle.kind === "endurance";
  const hybrid = vehicle.physics.hybridAssist;
  const electric = vehicle.physics.electricDrive;
  const speedKmh = vehicleSpeed * 3.6;
  const { pitZone, pitDistanceM, vtecEngagement, vvaEngagement, superchargerAngularVelocity, launchActive, perfTimer } = snapshot;
  const vva = vehicle.geometry.vva;
  const currentRpm = rpmFromRadiansPerSecond(engineAngularVelocity);
  const impellerRpm = Math.round(rpmFromRadiansPerSecond(superchargerAngularVelocity));

  const ignitionLabel = enginePhase === "electric" ? (vehicleSpeed > 0.3 ? "電力出站" : "電力待命")
    : enginePhase === "cranking" ? "啟動中"
    : launchActive ? (vehicle.turbocharger ? "偏時彈射待命" : "彈射起步待命")
    : enginePhase === "running" ? (engineWarmth < 0.9 && gear === 0 && snapshot.throttle === 0 ? "暖車中" : "引擎運轉")
    : "動力關閉";
  const gears = vehicle.kind ? Array.from({ length: vehicle.gears + 1 }, (_, index) => index)
    : [1, 0, ...Array.from({ length: Math.max(0, vehicle.gears - 1) }, (_, index) => index + 2)];

  function toggleIgnition() {
    if (!powerOn) void startIgnitionAudio();
    toggleEngine();
  }

  function toggleEngineView() {
    setShowEngine(!showEngine);
  }

  const hybridLabel = hybridPowerKw < -0.5
    ? (snapshot.brake > 0.02 ? "ERS 煞車回充" : "ERS 收油回充")
    : "ERS 輔助";
  const electricLabel = electricPowerKw < -0.5
    ? (snapshot.brake > 0.02 ? "電力煞車回充" : "電力收油回充")
    : "電力輸出";

  return (
    <div className="console-layout" onContextMenu={(event) => event.preventDefault()}>
      <section className="panel dashboard" aria-labelledby="dashboard-title">
        <div className="dashboard-heading">
          <h2 id="dashboard-title">{showEngine ? "引擎內構" : "儀表"}</h2>
          <div className="dashboard-actions">
            <ShiftModeControls mode={shiftMode} onModeChange={setShiftMode} />
            {!showEngine && (
              <button type="button" className="mode-button" aria-pressed={showDyno} onClick={() => setShowDyno((prev) => !prev)}>
                馬力圖
              </button>
            )}
            <button type="button" className="mode-button engine-view-toggle" onClick={toggleEngineView}>
              {showEngine ? "返回儀表" : "3D 內構"}
            </button>
          </div>
        </div>
        {showEngine ? <EngineView vehicle={vehicle} snapshot={snapshot} readState={readState} readExhaustFlame={readExhaustFlame} /> : (
          <>
            <div className="readouts">
              <Tachometer rpm={currentRpm} referenceRpm={vehicle.physics.referenceRpm}
                isCar={vehicle.kind === "car" || vehicle.kind === "endurance"} />
              <div className="speed-readout">
                <span className="readout-label">車速</span>
                <span className="readout-value">{Math.round(speedKmh)}</span>
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
            {showDyno && <LiveDynoChart vehicle={vehicle} snapshot={snapshot} />}
            <dl className="drive-readout">
              <div><dt>變速箱</dt><dd>{TRANSMISSION_LABELS[txType]}</dd></div>
              {vehicle.twoStroke && (
                <div><dt>膨脹室</dt><dd>{currentRpm >= vehicle.twoStroke.powerbandStartRpm ? "開閥共振區" : `${vehicle.twoStroke.powerbandStartRpm} RPM 起`}</dd></div>
              )}
              {vehicle.geometry.vtec && <div><dt>VTEC</dt><dd>{vtecEngagement >= 0.6 ? "高角度凸輪" : "低角度凸輪"}</dd></div>}
              {vva && <div><dt>VVA</dt><dd>{vva.switchRpm === null ? "待考" : vvaEngagement >= 0.5 ? "高揚程凸輪" : "低揚程凸輪"}</dd></div>}
              {vehicle.supercharger && (
                <div>
                  <dt>{vehicle.supercharger.whineStyle === "roots" ? "魯式增壓" : "增壓葉輪"}</dt>
                  <dd>{impellerRpm.toLocaleString("zh-TW")} RPM</dd>
                </div>
              )}
              {vehicle.turbocharger && <div><dt>渦輪增壓</dt><dd>{turboBoostBar.toFixed(2)} bar</dd></div>}
              {hybrid && <>
                <div><dt>ERS 電量</dt><dd>{Math.round(100 * hybridEnergyKj / hybrid.capacityKj)}%</dd></div>
                <div><dt>{hybridLabel}</dt><dd>{Math.round(Math.abs(hybridPowerKw))} kW</dd></div>
              </>}
              {electric && <>
                <div><dt>電量</dt><dd>{Math.round(100 * electricEnergyKj / (3600 * electric.batteryCapacityKwh))}%</dd></div>
                <div><dt>{electricLabel}</dt><dd>{Math.round(Math.abs(electricPowerKw))} kW</dd></div>
              </>}
              {(perfTimer.running || perfTimer.zeroTo100Seconds !== null || perfTimer.quarterMileSeconds !== null) && (
                <>
                  <div>
                    <dt>0–100 km/h</dt>
                    <dd>{perfTimer.zeroTo100Seconds !== null ? `${perfTimer.zeroTo100Seconds.toFixed(2)} s` : `${perfTimer.elapsedSeconds.toFixed(1)} s…`}</dd>
                  </div>
                  {(perfTimer.zeroTo200Seconds !== null || speedKmh >= 100) && (
                    <div>
                      <dt>0–200 km/h</dt>
                      <dd>{perfTimer.zeroTo200Seconds !== null ? `${perfTimer.zeroTo200Seconds.toFixed(2)} s` : `${perfTimer.elapsedSeconds.toFixed(1)} s…`}</dd>
                    </div>
                  )}
                  <div>
                    <dt>0–400 m</dt>
                    <dd>
                      {perfTimer.quarterMileSeconds !== null
                        ? `${perfTimer.quarterMileSeconds.toFixed(2)} s @ ${Math.round(perfTimer.quarterMileSpeedKmh ?? 0)} km/h`
                        : `${Math.round(perfTimer.distanceM)} m`}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <p className="dashboard-note">傳動採近似模型，{vehicle.kind ? "輪胎" : "後輪"}假定純滾動，計入滾阻與風阻。物理聲學合成示意。</p>
            {((canToggleTurboFlutter && turboFlutterEnabled) || (canToggleRotaryPort && rotaryPortEnabled)) && (
              <p className="dashboard-note audio-voicing-note">
                {canToggleRotaryPort && rotaryPortEnabled && canToggleTurboFlutter && turboFlutterEnabled
                  ? "已同時啟用橋式汽口怠速脈衝（Brap）與渦輪收油顫振（Stu-tu-tu）。"
                  : canToggleTurboFlutter && turboFlutterEnabled
                    ? "增壓收油的改裝進氣顫振音色（Stu-tu-tu）。"
                    : "改裝橋式汽口的斷續怠速脈衝音色（Brap）。"}
              </p>
            )}
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
        <p className="ignition-readout" data-phase={enginePhase}><span aria-hidden="true" />{ignitionLabel}</p>
        {pitZone && (
          <div className="pit-readout" data-zone={pitZone}>
            {pitZone === "box" && <p>維修區停車位</p>}
            {pitZone === "exit" && <p>出站限速 {PIT_SPEED_LIMIT_KMH} km/h・剩餘 {Math.ceil(PIT_EXIT_LENGTH_M - pitDistanceM)} m</p>}
            {pitZone === "entry" && <p>進站限速 {PIT_SPEED_LIMIT_KMH} km/h・{pitDistanceM < PIT_ENTRY_LENGTH_M
              ? `剩餘 ${Math.ceil(PIT_ENTRY_LENGTH_M - pitDistanceM)} m` : "請煞停入位"}</p>}
            {pitZone === "track" && <>
              <p>{speedKmh > PIT_SPEED_LIMIT_KMH ? `賽道・減速至 ${PIT_SPEED_LIMIT_KMH} km/h 可進站` : "賽道・限速解除"}</p>
              <button type="button" className="mode-button" disabled={speedKmh > PIT_SPEED_LIMIT_KMH} onClick={requestPitReturn}>進站</button>
            </>}
          </div>
        )}
        <div className="dashboard-feedback">
          {engineFailed && <p className="engine-fault-status" role="alert">引擎示意故障。按「重設」可重新操作。</p>}
          {!engineFailed && pendingShift && (
            <p className="shift-status">
              {pendingShift.fromGear === 0 ? "起步接合中 " : snapshot.revMatchThrottle > 0.05 ? "退檔補油 " : "換檔中 "}
              <strong>{pendingShift.targetGear || "N"}</strong>
              {pendingShift.fromGear > 0 && pendingShift.targetGear > 0 && `・預估接合 ${Math.round(pendingShift.targetRpm)} RPM`}
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
        title={isRace ? "賽車控制" : vehicle.kind === "car" ? "駕駛控制" : "騎乘控制"}
        powerOn={powerOn}
        pitControls={pitZone !== null}
        engineFailed={engineFailed}
        shiftMode={shiftMode}
        onToggleEngine={toggleIgnition}
        onReset={resetSimulation}
        audioStatus={audioStatus}
        onToggleAudio={toggleAudio}
        volume={volume}
        onVolumeChange={changeVolume}
        tuning={tuning}
        onTuningChange={setTuning}
        availableTunings={tuningProfiles}
        canToggleRotaryPort={canToggleRotaryPort}
        rotaryPortEnabled={rotaryPortEnabled}
        onToggleRotaryPort={() => setRotaryPortEnabled((prev) => !prev)}
        canToggleTurboFlutter={canToggleTurboFlutter}
        turboFlutterEnabled={turboFlutterEnabled}
        onToggleTurboFlutter={() => setTurboFlutterEnabled((prev) => !prev)}
        launchControlEnabled={launchControlEnabled}
        launchRpm={launchRpm}
        onToggleLaunchControl={() => setLaunchControlEnabled((prev) => !prev)}
        onShift={shift}
        onPedalChange={setPedal}
        resetKey={pedalReset}
        recordingComparison={<RecordingComparison
          vehicleId={vehicle.id}
          replayStatus={replayStatus}
          recordedRun={activeRecordedRun}
          onToggleRunRecording={toggleRunRecording}
          onToggleRunReplay={toggleRunReplay}
        />}
      />
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<SimulationMode>("motorcycle");
  const [brands, setBrands] = useState<Record<RoadMode, Vehicle["brand"]>>({
    motorcycle: vehicles[0].brand,
    car: cars[0].brand,
    formula1: formulaOneCars[0].brand,
    endurance: enduranceCars[0].brand,
  });
  const [selectedVehicles, setSelectedVehicles] = useState<Partial<Record<string, Vehicle>>>({});
  const roadMode = mode === "aircraft" || mode === "space" ? "motorcycle" : mode;
  const brand = brands[roadMode];
  const catalog = roadCatalogs[roadMode];
  const vehicleBrands = [...new Set(catalog.map((vehicle) => vehicle.brand))];
  const brandVehicles = catalog.filter((vehicle) => vehicle.brand === brand);
  const selectionKey = `${roadMode}/${brand}`;
  const activeVehicle = selectedVehicles[selectionKey] ?? brandVehicles[0];
  const optionList = useRef<HTMLDivElement>(null);

  function chooseVehicle(vehicle: Vehicle) {
    setSelectedVehicles((previous) => ({ ...previous, [`${roadMode}/${vehicle.brand}`]: vehicle }));
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
              <a href={activeVehicle.source} target="_blank" rel="noopener noreferrer">原廠資料</a>
            </div>
            {roadMode !== "motorcycle" || brandVehicles.length > 6 ? (
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
                  {brandVehicles.map(({ id, name }) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
            ) : null}
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

          <DrivingConsole vehicle={activeVehicle} />
        </>
      )}
    </main>
  );
}
