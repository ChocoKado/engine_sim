# HYPERENGINE

桌面引擎、傳動與排氣聲浪模擬器。物理與音效皆為簡化合成模型，規格名稱不代表實車測量或錄音。

## 執行與檢查

```sh
npm ci
npm run dev
npm test
npm run build
```

需要符合 Vite 8 要求的 Node.js 版本（請參閱安裝時的 engines 檢查）。
開啟開發伺服器的 `/tests/audio-browser.html` 可執行真正 Web Audio 離線渲染測試，不會播放聲音。

## 操作

- X 啟動／熄火、W 油門、S 煞車、E 升檔、Q 降檔，可從「自訂鍵位」修改。
- AT 的 D 檔會自動換檔；AMT 由使用者選擇檔位，自動處理離合器。
- 車速未歸零前不能切 P 或反向檔，會超轉的降檔會被拒絕並顯示原因。
- 熄火切斷燃燒與動力，曲軸逐步停止，車輛保留滑行慣性。
- 機械慢動作只影響剖面動畫，物理與聲音維持正常速度。
- 車輛總重滑桿可調整 180～3,000 kg；切換引擎會套用對應的車輛與駕駛負載預設。
- OEM 不噴火；蠍管為短促回火、SC 為較密集強烈的回火、直通管為最長且最強的火焰。高轉收油、大負載換檔及斷油會觸發不同程度的回火。

## 模擬實作

- 240 Hz 固定物理步進，渲染可以使用不同 FPS。
- AT 起步使用隨泵輪／渦輪速比變化的液力變矩器，再漸進鎖定；AMT 使用漸進摩擦離合器與防熄火控制。
- 引擎與車輪各自有慣量，離合器傳遞的扭力同時作用於兩端。換檔經過卸載、同步／補油與恢復扭力，轉速由這些力算出，不用固定時間曲線直接改寫 RPM。
- 接合前逐步收斂轉速差，避免鎖定瞬間加速度跳變。入檔收油保留引擎煞車，空檔則由摩擦與泵氣阻力降轉。
- 車重依引擎類別區分，輪胎抓地力限制過大的推力。這些是可調的示意參數，不是特定市售車款的加速保證。
- 紅線限制會切斷實際燃燒扭力；18 Hz 聲音脈衝由音訊時鐘驅動。
- 點火相位建立 720 度週期波形，搭配排氣共鳴、低通、進氣噪音及負載飽和。
- 回火音效與火焰使用同一組事件；音量設定與引擎開關分開管理。

本次修正保留原有桌面布局，未調整手機寬度。

## 參考與驗證

模型結構參考 [MathWorks Torque Converter](https://www.mathworks.com/help/autoblks/ref/torqueconverter.html)、[Clutch engagement](https://www.mathworks.com/help/sdl/ug/engage-and-disengage-gears-with-clutches.html) 與 [Catenaro et al., 2024，半自動變速箱扭力／離合器同步研究](https://arxiv.org/abs/2412.03989)。參考的是物理原理；車重、控制器與音效參數為此模擬器自行調校。

`npm test` 包含所有 14 種引擎 × AT／AMT 的早期起步、部分油門、鎖定連續性、升降檔同步，以及能量、抓地力、幀率獨立性與回火差異檢查。

`node scripts/measure-dynamics.js` 會輸出逐款測量至 `reports/dynamics-current.json`。`reports/dynamics-before.json` 保留本次修正前的基準；AMT 測量固定一檔，未達 100 km/h 的 `null` 表示一檔齒比／紅線限制，並非測試失敗。
