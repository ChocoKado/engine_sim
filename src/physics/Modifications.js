// These are conservative tuning estimates, not measured branded parts or a
// promise of bolt-on power. OEM selections leave the existing calibration intact.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = n => n * n * (3 - 2 * n);

export const MODIFICATION_CATALOG = Object.freeze([
  { id: 'intake', name: '進氣系統', mount: '節氣門前方的空濾與進氣管',
    purpose: '降低高流量進氣限制，改善油門充填反應，增加進氣聲。',
    tradeoff: '低轉收益小；模擬密閉冷進氣，開放式熱進氣不保證更快。',
    options: [{ value: 'stock', label: '原廠密閉空濾' }, { value: 'sport', label: '高流量冷進氣' }] },
  { id: 'headers', name: '排氣頭段', mount: '汽缸頭排氣側至集管',
    purpose: '調整掃氣與扭力曲線，偏重中高轉；與排氣尾段分開。',
    tradeoff: '低轉有少量取捨，不能把同一支管套成全轉速加馬力。',
    options: [{ value: 'stock', label: '原廠集管' }, { value: 'tuned', label: '調諧長管集管' }] },
  { id: 'camshaft', name: '運動凸輪', mount: '汽缸頭內部，觀察時掀開汽門蓋',
    purpose: '將充氣能力偏向高轉，改變氣門作動與高轉輸出。',
    tradeoff: '低轉扭力略減；轉子沒有凸輪，星型本輪不提供此套件。',
    options: [{ value: 'stock', label: '原廠凸輪' }, { value: 'sport', label: '街道運動凸輪' }] },
  { id: 'flywheel', name: '飛輪', mount: '曲軸後端／離合器側',
    purpose: '降低飛輪轉動慣量，空檔升降轉與同步反應更快。',
    tradeoff: '不增加穩態馬力；儲存動能較少，低速負載反應更敏感。',
    options: [{ value: 'stock', label: '原廠慣量' }, { value: 'light', label: '輕量飛輪' }] },
  { id: 'intercooler', name: '增壓冷卻', mount: '壓縮機出口至進氣歧管之間',
    purpose: '降低增壓後進氣溫度，在同樣壓力下增加空氣密度。',
    tradeoff: '只適用增壓；較大的充氣容積會稍慢建立壓力。',
    options: [{ value: 'stock', label: '基準冷卻器' }, { value: 'upgraded', label: '高效率冷卻核心' }] },
  { id: 'pulley', name: '機械增壓皮帶輪', mount: '機械增壓器前端皮帶傳動',
    purpose: '提高機械增壓器轉子傳動比，增加供氣、增壓與尖叫聲階次。',
    tradeoff: '同步增加曲軸耗功與壓縮熱；不適用排氣驅動的 Turbo。',
    options: [{ value: 'stock', label: '基準傳動比' }, { value: 'overdrive', label: '轉子增速 ×1.10' }] },
]);

export function createStockModifications() {
  return Object.fromEntries(MODIFICATION_CATALOG.map(part => [part.id, 'stock']));
}

export function isModificationSupported(config, induction, kind) {
  if (!MODIFICATION_CATALOG.some(part => part.id === kind)) return false;
  if (kind === 'camshaft') return !['rotary', 'radial'].includes(config.layout);
  if (kind === 'intercooler') return induction !== 'na';
  if (kind === 'pulley') return induction === 'supercharger';
  return true;
}

export function sanitizeModifications(config, induction, values = {}) {
  const result = createStockModifications();
  for (const part of MODIFICATION_CATALOG) {
    if (isModificationSupported(config, induction, part.id)
      && part.options.some(option => option.value === values[part.id])) result[part.id] = values[part.id];
  }
  return result;
}

export function modificationEffects(config, mods = {}, rpm = 0, displacement = config.defaultDisplacement) {
  // Absolute factory powerband keeps a changed rev limiter from moving the
  // same part's torque curve at a fixed physical RPM.
  const reference = config.ratedPowerRPM || config.defaultRedlineRPM * 0.92;
  const band = smooth(clamp((rpm / reference - 0.25) / 0.65, 0, 1));
  let torqueFactor = 1;
  if (mods.intake === 'sport') torqueFactor *= 1 + 0.025 * band;
  if (mods.headers === 'tuned') torqueFactor *= 0.99 + 0.045 * band;
  if (mods.camshaft === 'sport' && !['radial', 'rotary'].includes(config.layout)) torqueFactor *= 0.96 + 0.105 * band;
  return { torqueFactor,
    inertiaFactor: mods.flywheel === 'light' ? 0.70 : 1,
    fillRateFactor: mods.intake === 'sport' ? 1.15 : 1,
    intakeGain: mods.intake === 'sport' ? 1.20 : 1,
    intercoolerEffectiveness: mods.intercooler === 'upgraded' ? 0.88 : 0.72,
    chargeVolumeFactor: mods.intercooler === 'upgraded' ? 1.12 : 1,
    pulleyRatio: mods.pulley === 'overdrive' ? 1.10 : 1,
    displacement,
  };
}
