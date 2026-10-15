import { ENGINE_CONFIGS } from '../physics/EngineConfigurations.js';

export const SESSION_KEY = 'hyperengine-lab-v1';
export const CHANNELS = {
  rpm: ['輸出軸轉速', 'RPM'], speed: ['時速', 'km/h'], core: ['N1', '%'],
  thrust: ['推力', 'kN'], power: ['軸功率', 'kW'], coolant: ['冷卻液', '°C'], oil: ['機油', '°C'],
  egt: ['排氣溫度', '°C'], n2: ['N2 自由動力渦輪', '%'],
  throttle: ['油門開度', '%'], afterburner: ['後燃器', '%'], fan: ['散熱風扇', '0/1'],
};
const CSV_HEADERS = ['rpm', 'speed_kmh', 'n1_percent', 'thrust_kn', 'power_kw', 'coolant_c', 'oil_c',
  'egt_c', 'n2_percent', 'throttle_percent', 'afterburner_percent', 'fan_on'];
const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => Number.isFinite(value) ? value : null;
// These are operator actions during a run, not a new engine calibration.
const setupSignature = setup => JSON.stringify(Object.fromEntries(Object.entries(setup).filter(([key]) =>
  !['fan', 'afterburner', 'listeningPosition', 'soundProfile', 'rotaryIdleMode', 'toneWarmth'].includes(key))));

export function captureSetup(engine, drive, sound) {
  return clone({ configId: engine.config.id, displacement: engine.displacement, redline: engine.redlineRPM,
    exhaustId: engine.exhaust.id, induction: engine.forcedInduction, boost: engine.maxBoost,
    turboSize: engine.turboSize, bovType: engine.bovType, modifications: engine.modifications,
    ecuMode: engine.limiter.mode, limiterHz: engine.limiter.hz, limiterDepth: engine.limiter.depth,
    vtecEnabled: engine.cam.enabled, vtecRPM: engine.cam.engageRPM, mass: drive.vehicleMass,
    finalDriveScale: drive.finalDriveScale, mode: drive.mode, thermalMode: engine.thermal?.thermalMode || 'warm',
    fan: engine.thermal?.coolingFanEnabled ?? true, afterburner: Boolean(engine.afterburnerEnabled),
    listeningPosition: sound.listeningPosition, soundProfile: sound.soundProfile,
    rotaryIdleMode: sound.rotaryIdleMode, toneWarmth: sound.toneWarmth, startScenario: engine.jet?.startScenario || 'normal' });
}

export function validSetup(setup) {
  return Boolean(setup && typeof setup.configId === 'string' && Object.hasOwn(ENGINE_CONFIGS, setup.configId)
    && ['displacement', 'redline', 'boost', 'mass', 'finalDriveScale', 'limiterHz', 'limiterDepth']
      .every(key => Number.isFinite(setup[key])));
}

export function applySetupToModels(setup, engine, drive, sound, selectEngine) {
  if (!validSetup(setup)) return { ok: false, message: '設定資料無效。' };
  if (engine.isIgnitionOn || Math.abs(drive.speedKmh) > 0.5 || (engine.corePercent || 0) > 1)
    return { ok: false, message: '請停車、熄火，並等待轉子停止後套用。' };
  selectEngine(setup.configId);
  engine.setDisplacement(setup.displacement);
  engine.setRedlineRPM(setup.redline);
  engine.setForcedInduction(setup.induction);
  engine.setTurboSize(setup.turboSize);
  engine.setMaxBoost(setup.boost);
  engine.setBovType(setup.bovType);
  engine.setExhaust(setup.exhaustId);
  for (const [kind, value] of Object.entries(setup.modifications || {})) engine.setModification(kind, value);
  engine.setECUMode(setup.ecuMode);
  engine.setLimiterHz(setup.limiterHz);
  engine.setLimiterDepth(setup.limiterDepth);
  engine.setVtecEnabled(Boolean(setup.vtecEnabled));
  if (Number.isFinite(setup.vtecRPM)) engine.setVtecRPM(setup.vtecRPM);
  drive.setVehicleMass(setup.mass);
  drive.setFinalDriveScale(setup.finalDriveScale);
  drive.setMode(setup.mode);
  engine.setThermalMode(setup.thermalMode);
  engine.setCoolingFan(Boolean(setup.fan));
  engine.setAfterburnerEnabled(Boolean(setup.afterburner));
  engine.setStartScenario(setup.startScenario);
  sound.setEngineConfig(engine.config);
  sound.setExhaustModel(engine.exhaust);
  sound.setListeningPosition(setup.listeningPosition);
  sound.setSoundProfile(setup.soundProfile);
  sound.setRotaryIdleMode(setup.rotaryIdleMode);
  if (Number.isFinite(setup.toneWarmth)) sound.setToneWarmth(setup.toneWarmth);
  return { ok: true, message: '已套用設定；請啟動引擎測試。' };
}

export function runCSV(run) {
  // Labels and setup stay in JSON; CSV is strictly numeric telemetry.
  return [['time_s', ...CSV_HEADERS].join(','),
    ...run.samples.map(sample => [sample.t, ...Object.keys(CHANNELS).map(key => sample[key])]
      .map(value => value == null ? '' : String(value)).join(','))].join('\r\n');
}

export class SimulationSession {
  constructor(storage, now = () => performance.now() / 1000) {
    this.now = now; this.runs = []; this.setups = []; this.active = null; this.error = '';
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      const saved = JSON.parse(this.storage?.getItem(SESSION_KEY) || '{}') || {};
      this.setups = (Array.isArray(saved.setups) ? saved.setups : []).filter(item =>
        item && typeof item.id === 'string' && typeof item.name === 'string' && validSetup(item.setup)).slice(0, 12);
      this.runs = (Array.isArray(saved.runs) ? saved.runs : []).filter(run =>
        run && typeof run.id === 'string' && typeof run.name === 'string' && validSetup(run.setup)
        && Array.isArray(run.samples) && run.samples.length <= 1202 && run.samples.every(sample =>
          sample && Number.isFinite(sample.t) && sample.t >= 0 && sample.t <= 120
          && Object.keys(CHANNELS).every(key => sample[key] == null || Number.isFinite(sample[key])))).slice(0, 8);
    } catch { this.error = '無法讀取舊紀錄，仍可開始新的測試。'; }
  }
  id() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  persist() {
    try {
      if (!this.storage?.setItem) throw Error('storage unavailable');
      this.storage.setItem(SESSION_KEY, JSON.stringify({ version: 1, runs: this.runs, setups: this.setups })); this.error = '';
    }
    catch { this.error = '瀏覽器儲存空間不足；本次仍可匯出。'; }
  }
  saveSetup(name, setup) {
    if (!validSetup(setup)) return null;
    const item = { id: this.id(), name: String(name || '未命名設定').slice(0, 60), setup: clone(setup) };
    this.setups = [item, ...this.setups].slice(0, 12); this.persist(); return item;
  }
  start(name, setup, simTime) {
    if (this.active || !validSetup(setup)) return false;
    this.active = { id: this.id(), name: String(name || '測試').slice(0, 60), createdAt: new Date().toISOString(), setup: clone(setup), samples: [] };
    this.started = this.now(); this.startedSimTime = finite(simTime); this.lastSample = -Infinity; this.activeSignature = setupSignature(setup); return true;
  }
  update(state, speed, setup) {
    if (!this.active) return;
    if (setup && setupSignature(setup) !== this.activeSignature) { this.stop('設定已變更'); return; }
    const elapsed = this.startedSimTime !== null && Number.isFinite(state.simTime)
      ? state.simTime - this.startedSimTime : this.now() - this.started;
    const t = Math.min(120, Math.max(0, elapsed));
    if (t - this.lastSample >= 0.099 || t === 120) {
      const jet = state.propulsionKind === 'turbojet';
      this.active.samples.push({ t: +t.toFixed(3), rpm: jet ? null : finite(state.rpm), speed: jet ? null : finite(speed),
        core: finite(state.corePercent), thrust: finite(state.thrustN / 1000),
        power: jet ? null : finite(state.shaftPowerKW ?? state.dyno?.hp * 0.745699872),
        coolant: finite(state.coolantTemperatureC), oil: finite(state.oilTemperatureC),
        egt: finite(state.exhaustTemperatureC), n2: finite(state.powerTurbinePercent),
        throttle: finite(state.throttle * 100), afterburner: jet ? finite(state.afterburnerAmount * 100) : null,
        fan: state.coolantTemperatureC == null ? null : Number(Boolean(state.radiatorFanOn)) });
      this.lastSample = t;
    }
    if (t >= 120) this.stop('已達 120 秒');
  }
  stop(reason = '手動停止') {
    if (!this.active) return null;
    const run = this.active; this.active = null; run.stopReason = reason;
    if (!run.samples.length) return null;
    this.runs = [run, ...this.runs].slice(0, 8); this.persist(); return run;
  }
  remove(kind, id) {
    if (!['runs', 'setups'].includes(kind)) return;
    this[kind] = this[kind].filter(item => item.id !== id); this.persist();
  }
}
