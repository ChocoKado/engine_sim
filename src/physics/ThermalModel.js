const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => v * v * (3 - 2 * v);

// Lumped heat capacities and cooling coefficients are engineering estimates.
// Energy input, thermostat opening, oil/coolant exchange and airflow cooling
// share one state; the upgraded radiator changes rejection/capacity, not power.
export class ThermalModel {
  constructor(config) {
    this.config = config;
    this.aviation = ['turbine', 'turbojet'].includes(config.layout);
    this.liquidCooled = !this.aviation && config.layout !== 'radial' && config.coolingKind !== 'air';
    this.coolingFanEnabled = true;
    this.ambientTemperatureC = 25;
    this.setMode('warm');
  }

  setMode(mode) {
    if (!['warm', 'cold'].includes(mode)) return false;
    this.thermalMode = mode;
    this.bodyTemperatureC = mode === 'warm' ? 88 : this.ambientTemperatureC;
    this.oilTemperatureC = mode === 'warm' ? 92 : this.ambientTemperatureC;
    this.chargeTemperatureC = this.ambientTemperatureC;
    this.thermalPowerFactor = mode === 'warm' ? 1 : 0.92;
    this.thermalDragFactor = mode === 'warm' ? 1 : 1.3;
    this.thermalState = mode === 'warm' ? 'normal' : 'cold';
    this.radiatorFanOn = this.liquidCooled && this.coolingFanEnabled;
    return true;
  }

  setCoolingFan(enabled) {
    this.coolingFanEnabled = Boolean(enabled);
    this.radiatorFanOn = this.liquidCooled && this.coolingFanEnabled;
  }

  update(dt, { running = false, shaftPowerKW = 0, ratedPowerKW = 100,
    displacementCC = this.config.defaultDisplacement, speedKmh = 0,
    chargeTemperatureC = 25, corePercent = 0, radiator = 'stock' } = {}) {
    if (!(dt > 0) || !Number.isFinite(dt)) return this.snapshot();
    const ambient = this.ambientTemperatureC;
    const rated = Math.max(10, Number(ratedPowerKW) || 100);
    const liters = Math.max(0.3, (Number(displacementCC) || 1000) / 1000);
    this.radiatorFanOn = this.liquidCooled && this.coolingFanEnabled;
    if (this.aviation) {
      // Aviation turbines have oil/air cooling, no invented coolant loop. EGT
      // and hot-start protection belong to the gas-path model, not this casing.
      const oilTarget = running ? 50 + clamp(corePercent / 100, 0, 1) * 48 : ambient;
      this.oilTemperatureC += (oilTarget - this.oilTemperatureC) * (1 - Math.exp(-dt / 75));
      this.bodyTemperatureC += ((running ? oilTarget + 10 : ambient) - this.bodyTemperatureC)
        * (1 - Math.exp(-dt / 100));
    } else {
      const upgrade = this.liquidCooled && radiator === 'upgraded';
      const airflow = 0.15 + clamp(Math.abs(speedKmh) / 95, 0, 1.35) + (this.radiatorFanOn ? 0.45 : 0);
      const thermostat = this.liquidCooled ? 0.035 + 0.965 * smooth(clamp((this.bodyTemperatureC - 80) / 14, 0, 1)) : 1;
      const ua = rated * (this.liquidCooled ? 0.018 : 0.008) * (upgrade ? 1.38 : 1);
      const bodyHeat = running ? Math.max(0, shaftPowerKW) * 0.55 + liters * 2.0 : 0;
      const oilHeat = running ? Math.max(0, shaftPowerKW) * 0.10 + liters * 0.6 : 0;
      const exchange = (this.oilTemperatureC - this.bodyTemperatureC) * Math.max(0.1, rated * 0.002);
      const bodyCooling = Math.max(0, this.bodyTemperatureC - ambient) * ua * airflow * thermostat;
      const oilThermostat = 0.05 + 0.95 * smooth(clamp((this.oilTemperatureC - 75) / 20, 0, 1));
      const oilCooling = Math.max(0, this.oilTemperatureC - ambient) * rated * 0.0004 * airflow * oilThermostat;
      const bodyCapacity = (35 + 20 * liters) * (upgrade ? 1.15 : 1);
      const oilCapacity = 18 + 10 * liters;
      this.bodyTemperatureC = Math.max(ambient, this.bodyTemperatureC + (bodyHeat + exchange - bodyCooling) / bodyCapacity * dt);
      this.oilTemperatureC = Math.max(ambient, this.oilTemperatureC + (oilHeat - exchange - oilCooling) / oilCapacity * dt);
    }
    const inlet = Number.isFinite(chargeTemperatureC) ? chargeTemperatureC : ambient;
    const soak = running ? Math.max(0, this.bodyTemperatureC - 100) * 0.18
      + Math.max(0, this.oilTemperatureC - 115) * 0.08 : 0;
    this.chargeTemperatureC += (inlet + soak - this.chargeTemperatureC) * (1 - Math.exp(-dt / 4));
    const warm = clamp((this.oilTemperatureC - 25) / 55, 0, 1);
    const bodyFade = this.liquidCooled ? clamp((this.bodyTemperatureC - 112) / 38, 0, 1) : 0;
    const oilFade = clamp((this.oilTemperatureC - 140) / 45, 0, 1);
    const soakDensity = (inlet + 273.15) / (inlet + soak + 273.15);
    this.thermalPowerFactor = clamp((0.92 + 0.08 * warm) * (1 - 0.35 * bodyFade - 0.20 * oilFade)
      * Math.min(1, soakDensity), 0.45, 1);
    this.thermalDragFactor = 1 + (1 - warm) * 0.30;
    this.thermalState = bodyFade > 0 || oilFade > 0 ? 'overheating' : warm < 0.95 ? 'cold' : 'normal';
    return this.snapshot();
  }

  snapshot() {
    return { thermalMode: this.thermalMode, coolantTemperatureC: this.liquidCooled ? this.bodyTemperatureC : null,
      oilTemperatureC: this.oilTemperatureC, chargeTemperatureC: this.chargeTemperatureC,
      thermalPowerFactor: this.thermalPowerFactor, thermalDragFactor: this.thermalDragFactor,
      thermalState: this.thermalState, radiatorFanOn: this.radiatorFanOn,
      coolingFanEnabled: this.coolingFanEnabled, coolingKind: this.liquidCooled ? 'liquid' : 'air-oil' };
  }
}
