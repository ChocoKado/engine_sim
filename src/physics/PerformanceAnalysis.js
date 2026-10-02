// Explanations use the current physical state; they do not alter performance.
export function gearingSummary(engine, drive) {
  return Array.from({ length: drive.maxGear }, (_, index) => {
    const gear = index + 1;
    return { gear, ratio: drive.gearRatios[gear], redlineSpeed: drive.calcSpeedFromRPM(gear, engine.redlineRPM),
      nextRPM: gear < drive.maxGear ? engine.redlineRPM * drive.gearRatios[gear + 1] / drive.gearRatios[gear] : null };
  });
}

export function performanceAssessment(engine, drive) {
  const theoreticalTop = drive.calcSpeedFromRPM(drive.maxGear, engine.redlineRPM);
  const shaftPowerKW = Math.max(0, engine.induction?.shaftTorque || 0) * engine.rpm * Math.PI / 30000;
  let reason = 'ready', text = '可用 100–200 比較增大排氣量的效果；低速抓地與最高檔紅線會限制收益。';
  if (engine.isStalled) { reason = 'stalled'; text = '引擎已失速，請重新發動。'; }
  else if (!engine.isIgnitionOn) { reason = 'off'; text = '啟動引擎後可查看當前性能限制。'; }
  else if (drive.brakeInput > 0.1) { reason = 'braking'; text = '煞車負載中。'; }
  else if (drive.shiftState === 'shifting') { reason = 'shift'; text = '換檔接合中，輸出暫時降低。'; }
  else if ((drive.tractionReduction || 0) > 0.025) {
    reason = 'traction'; text = '抓地控制限制輪上扭力；增加馬力不一定縮短此段加速。';
  } else if (drive.currentGear > 0 && engine.rpm > engine.redlineRPM - engine.revLimitControlRange * 1.3) {
    if (drive.currentGear === drive.maxGear) {
      reason = 'gearing'; text = '最高檔接近限轉；增加 CC 不會改變齒比與紅線速度，可試較長終傳。';
    } else {
      reason = 'limiter'; text = drive.mode === 'amt'
        ? '目前檔位接近限轉；AMT 需主動升檔，持續油門會保持斷油。'
        : '目前檔位接近限轉；AT 等待接合完成後自動升檔。';
    }
  } else if (drive.currentGear > 0 && engine.throttle > 0.85 && Math.abs(drive.speedKmh) > 80) {
    const wheelPower = Math.max(0, engine.netTorque) * engine.rpm * Math.PI / 30 * drive.driveEfficiency;
    const roadPower = drive.roadResistance() * Math.abs(drive.speedKmh) / 3.6;
    if (roadPower >= wheelPower * 0.96) { reason = 'power'; text = '輪上功率接近阻力需求；更長齒比也可能拉不動。'; }
    else { reason = 'accelerating'; text = '仍有功率餘量，車輛持續加速。'; }
  }
  return { reason, text, theoreticalTop, shaftPowerKW };
}
