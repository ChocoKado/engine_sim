# HYPERENGINE

可在電腦與手機操作的引擎、傳動及排氣聲浪模擬器。15 種架構各選一款代表引擎，使用原廠公布的排氣量、功率／扭力峰值與傳動資料建立基準，再提供排氣量、紅線、車重、排氣管與增壓調整。

扭力曲線中間點、風阻、慣量及改裝效果仍是估算；聲浪是程序合成，並非代表車錄音。資料來源與邊界見 [實車基準](docs/engine-reference.md)，使用者 1～20 項需求的實作及驗證狀態見 [修復對照](docs/repair-status.md)。

## 執行與檢查

```sh
npm ci
npm run dev
npm test
npm run build
```

使用符合專案 Vite 版本要求的 Node.js。建置結果位於 `dist/`；可用 `npm run preview` 預覽正式建置。

`npm test` 執行原廠資料、引擎／傳動物理、程序音效、輸入、介面狀態及機械動畫的回歸測試。本次 187 項通過，另完成 150 組動態組合檢查。開啟開發伺服器的 `/tests/audio-browser.html`，可執行真正 Web Audio 離線渲染檢查，不會播放聲音；27 項已通過。最後結果及驗證邊界記錄於修復對照文件。

Vercel 部署已由專案使用者完成，綁定 GitHub 的 `main` 分支。推送修正後，請確認 Vercel 對應提交的部署成功，再以手機開啟既有正式網址；本機建置成功不等於線上部署已完成。

## 操作

- `X` 啟動／熄火、`W` 油門、`S` 煞車、`E` 升檔、`Q` 降檔。鍵位可在畫面內自訂，也可按住油門／煞車按鈕，或使用持續油門滑桿。
- **AT**：選 `D` 後依油門與轉速自動換檔，起步包含液力扭力轉換器及鎖定接合。**AMT**：使用者決定換檔時機，由系統控制離合器；不需要離合器踏板。
- 前進檔數依代表車決定。Ferrari 458、Aventador、Chiron 有 7 檔，其餘代表車為 6 檔。機車與星型示範不提供倒檔。高速切換 P／倒檔及降檔超轉會受到保護。
- 換檔有明確的扭力／點火切斷，再依齒比、輪速及轉動慣量同步接合。AT 與 AMT 的切斷及接合不同；低油門也不會每次都產生全油門式爆鳴。
- **Turbo** 可切換小／大渦輪；小渦輪較早建立增壓，大渦輪較晚起壓。先在負載下建立增壓，再收油門，才會出現所選 BOV 放氣或無洩壓閥 Flutter 反串流聲。
- **Roots／TVS Supercharger** 由曲軸驅動，低轉即可增壓，旁通控制部分負載，並扣除驅動耗功。尖叫音隨實際轉子轉速升降；不使用 Turbo 的 BOV／Flutter。
- 換引擎時會套用該代表車的排氣量、紅線、車重、檔位與原廠進氣型式。Supra、GT-R、Chiron 的原廠功率已包含增壓，模型不會再重複加一次原廠增壓倍率。
- 排氣管同時影響估算輸出、音色及回火／火焰強度。OEM 預設不噴火，改裝排氣依管型產生不同的收油、換檔與斷油事件；音量滑桿只改聲音，不改事件與動畫。
- 0.05×～1.0× 慢動作只調整機械動畫，轉速、車速及聲音持續以即時速度運作。
- 手機把精簡引擎動畫及 RPM／時速／檔位 HUD 放在踏板前方，使操作時可同屏閱讀；橫向短螢幕把動畫與踏板排在同一列。聚焦油門時保留動畫所需的捲動空間。數位時速不會被轉速指針遮住。

AT／AMT 是網站的操作模式，不表示每款代表實車都有原廠液力 AT。七缸星型採 **Rotec R2800**；網站上的車速與 6 檔是實驗地面負載，並非螺旋槳或飛行模型。

## 模擬方式

物理使用固定 240 Hz 步進。引擎依扭力曲線、節氣門／進氣充填及曲軸慣量升降轉；傳動以容量受限的離合器扭力耦合曲軸與車輪。齒比包含一次減速與終傳，車重包含 75 kg 駕駛。輪胎抓地限制、滾阻、風阻與反向負載共同決定加速及尾速。

Turbo 使用排氣能量、轉子能量及有限進氣容積建立增壓遲滯；BOV／Flutter 的事件依收油前壓力與轉子狀態產生。Roots／TVS 使用曲軸傳動、旁通及壓縮耗功。壓縮空氣的升溫與冷卻會影響密度；此模型不是完整壓縮機效率圖或 ECU 控制器。

聲音由 AudioWorklet 逐取樣產生連續的 720° 各缸燃燒壓力脈衝，加上排氣反射、進氣氣流、機械階次及負載飽和。十字曲軸 V8 依點火順序分配左右銀行，與平面曲軸聲音區分。換檔時削弱燃燒脈衝，機械運轉、泵氣及排氣尾音持續，不把整個輸出歸零。紅線斷油使用約 18 Hz 節奏。Web Audio 環境不支援 Worklet 時保留合成備援。

## 動態量測與參考

```sh
node scripts/measure-dynamics.js
```

量測腳本將日期、條件及結果寫入 `reports/dynamics-current.json`：15 引擎 × 2 傳動 × 5 配置（原廠、NA、小 Turbo、大 Turbo、Roots／TVS），共 150 組。使用 OEM 排氣，全油門 20 秒後煞車 20 秒；改裝增壓統一 1.0 bar，AT 自動換檔，AMT 由測試駕駛在 94% 紅線主動升檔。腳本檢查有限數值、抓地限制、齒比鎖定、起步及煞停回怠速。AMT 模式本身仍不會自動換檔。

這些是模型量測，沒有模擬原廠 launch control 或每台 ECU。舊 `reports/dynamics-before.json` 使用不同基準與測量條件，不能直接當作同條件性能提升，亦不能當成實車成績。

實車規格來源集中於 [引擎參考資料](docs/engine-reference.md)。模型原理另參考 [NASA Glenn 壓縮機熱力學](https://www.grc.nasa.gov/www/k-12/airplane/compth.html)、[MathWorks Torque Converter](https://www.mathworks.com/help/autoblks/ref/torqueconverter.html)、[MathWorks Clutch engagement](https://www.mathworks.com/help/sdl/ug/engage-and-disengage-gears-with-clutches.html)、[Garrett BOV 作動原理](https://www.garrettmotion.com/knowledge-center-category/racing-and-performance/what-is-the-difference-between-a-wastegate-and-a-blow-off-valve/) 及 [Eaton TVS R2300](https://www.eaton.com/gb/en-gb/catalog/engine-solutions/tvs-r2300.html)。
