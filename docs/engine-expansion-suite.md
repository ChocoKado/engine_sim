# 引擎擴充與測試工具（2026-10-15）

本次實作 A～G，以及使用者另外選擇的四轉子、V16、雙排星型。總計 29 個預設。額定資料不等於整車實測，未公開的慣量、部分齒比、扭力曲線中段與聲學參數均為估算。

## 操作

- **引擎選單**新增 RZ350 二行程雙缸、Ducati V4、Golf R32 VR6、Bentley W12、787B R26B 四轉子、Tourbillon V16、R-2800 雙排十八缸。完整 3D 可旋轉，也能切機械剖面與慢動作。
- **M250 雙軸渦輪軸**：N1 氣體產生器、N2 自由動力渦輪與減速輸出分開。左錶是減速輸出 RPM，另列 N1／N2，右錶仍是道路速度。兩速道路車體是示範負載。
- **設定 → 暖機與散熱**：停車熄火後選冷車／已暖機；風扇可切換。水溫、油溫、進氣溫度隨操作更新。冷油增加阻力，長時間高負載引起熱累積、進氣熱浸與過熱降功率。航空引擎無虛構冷卻液。
- **改裝 → 散熱水箱**：適用液冷道路引擎。升級改變熱容量與散熱率，3D 有對應水箱、水管與風扇；不直接贈送馬力。二行程無凸輪套件、航空原廠離心增壓不套用 TVS 改裝。
- **聲浪 → 聆聽位置**：均衡／進氣／排氣／機械，改變各來源比例及濾波；主音量與靜音保持獨立。
- **J85 設定 → 啟動情境**：正常、未點火、熱啟動。共同流程為起動馬達吹除、供油點火、穩定怠速。異常切燃油後乾轉吹除。停止且 N1 低於 1%、EGT 低於 200°C 後可清除故障，再選正常重啟。這些時序與門檻是教學估算，不可作飛行操作程序。
- **性能／推力 → 測試紀錄簿**：開始錄製後操作，手動停止或 120 秒結束，每秒約 10 筆。選已保存紀錄、基準與同單位曲線（RPM／速度／N1／推力／功率／水溫／油溫）疊圖。CSV 匯出純數值，JSON 含設定與完整記錄。設定改變會結束本次錄製，防止一條曲線混入不同改裝。
- **保存目前設定**：紀錄引擎、CC、紅線、排氣、增壓、硬體、ECU、VTEC、車重、終傳、傳動模式、冷／暖狀態與聲音設定。停車、熄火、轉子停止後套用。設定最多 12 組、紀錄最近 8 次，資料僅保存在當前瀏覽器。

## 來源與模型範圍

| 預設 | 可查核基準 | 模型處理 |
|---|---|---|
| Yamaha RZ350 1981 JDM | [Yamaha 原始型錄](https://global.yamaha-motor.com/jp/stories/history/products/img/mc/AP000202531.pdf)：347 cc、45 PS@8500、3.8 kgf·m@8000、六速 2.571/1.777/1.318/1.083/.961/.888、一次2.869、二次2.437 | 每轉兩次燃燒、簧片／曲軸箱泵氣、活塞氣埠；氣埠角與膨脹室效應估算。143 kg 是乾重，含油水燃油車重以157 kg估算。不是後期YPVS。 |
| Ducati Panigale V4 EU | [Ducati 引擎介紹](https://www.ducati.com/ww/en/bikes/panigale/panigale-v4/engine)、[原廠MY25型錄](https://www.ducatidanmark.dk/globalassets/ducati-nye-billeder/1-2025/brochurer-25/panigale_v4_7g_my25_brochure_eng_72-dpi_uc744883.pdf)：1103 cc、158.9 kW@13500、120.9 Nm@11250；90°、Twin Pulse 0/90/290/380° | 四缸獨立相位、兩個缸頭；道路齒比與車重為估算。EU 數值不與美規209 hp混用。 |
| Golf IV R32 VR6 | [Volkswagen](https://www.volkswagen-newsroom.com/en/motor-versions-golf-4-profile-19479)：3189 cc、177 kW@6250、320 Nm@2800–3200 | 15°交錯兩列、單頭雙凸輪、120°點火；齒比／車重、排氣管長差為估算。 |
| Bentley Continental GT W12 | [Bentley 2019資料](https://www.bentleymedia.com/es/heritage-collection/2019-pikes-peak-continental-gt-da17uvs)：467 kW@6000、900 Nm@1350–4500；[原廠規格表鏡像](https://www.autointernational.com.my/WebNews/Overseas/Year%202018/BENTLEY%20CONTINENTAL%20GT%20HAS%20ARRIVED%20-%201%20Oct%2018/Bentley%20Continental%20GT%20spec%20sheet.pdf)八速；[VW SSP248](https://blog-assets.solidworks.com/uploads/2025/12/w_engines.pdf)W型結構 | 兩組15°VR6以72°共軸、四列兩缸頭；原廠雙渦輪等效為單一動態增壓系統，缸號／管路示意。 |
| Mazda 787B R26B | [Mazda R26B 技術介紹](https://www.mazda.com/en/experience/mspr/motorsports/lemans/r26b/)：654cc×4、700 PS@9000、62 kgf·m@6500、周邊進氣、每轉子3火星塞、可變長號角 | 四殼、12火星塞、獨立轉子相位，每輸出軸轉4次燃燒；火星塞數不乘成12次。道路五速負載估算，非原廠787B整車性能。 |
| Bugatti Tourbillon V16 | [Bugatti 原廠規格](https://bugatti-newsroom.imgix.net/6675179393f6515cdb966608/technical-specifications-bugatti-TB-en.pdf)：90°、8.3 L、內燃機1000 PS、900 Nm、最高9000 RPM、八速DCT | 不含800 PS電動馬達；未公布峰值轉速、缸序、齒比採估算。不是1800 PS混動整車模擬。 |
| R-2800-43 Double Wasp | [Smithsonian](https://www.si.edu/object/pratt-whitney-double-wasp-r-2800-43-2-row-radial-18-engine%3Anasm_A19660391000)：氣冷18缸兩排、45.9 L、1491 kW@2700 | 9+9汽缸、兩組主副連桿、前後排交錯。原廠齒輪離心增壓已含於額定曲線，額外Turbo/TVS鎖定。連桿精確尺寸／點火缸序為示意，地面車體與傳動估算，無飛行／螺旋槳模型。 |
| M250-C20B | [Rolls-Royce FIRST目錄](https://www.rolls-royce.com/~/media/Files/R/Rolls-Royce/documents/civil-aerospace-downloads/helicopters/2022-m250-rr300-first-network-directory.pdf)：313 kW、N1 50970、N2 33290、減速輸出6016 RPM；[架構](https://www.rolls-royce.com/products-and-services/defence/aerospace/uavs/m250-turboshaft) | N1與輸出負載分離、N2到輸出固定減速、能量與軸扭力一致；啟動及調速器動態估算。兩速比未公布，採示範值。 |

噴射啟動異常依照 [FAA Aviation Maintenance Technician Handbook—Powerplant](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/amt_powerplant_handbook) 的啟動、點火與熱啟動原則設計；本程式並非J85維修手冊。所有3D是程序生成的機構示意，非原廠CAD。聆聽位置是聲源混音，不是已測量的三維聲壓場；渦輪、二行程、轉子聲均為合成，未宣稱逐頻匹配實機錄音。

## 本次驗證

- `npm test`：**1,099／1,099**，涵蓋額定錨點、各車起步／換檔／煞停、462組SC高增壓矩陣、雙軸功率預算、二行程360°氣埠、雙排星型、R26B各轉子相位、冷車／熱衰退與兩種噴射啟動異常。
- 實際 Chrome 離線 Web Audio：**86／86**，包含主 Worklet 與備援、N1／N2獨立頻率、七個新架構及聆聽位置。Node音訊套件48項通過。驗證的是訊號與狀態一致性，不是實機錄音逐頻對比。
- 設定／紀錄測試驗證不可變初始設定、阻擋運轉中套用、儲存遭封鎖時不中斷App、120秒上限、CSV欄位、噴射不產生虛構車速／軸馬力；錄製以物理時間軸對齊，避免背景頁暫停扭曲比較。後燃器、風扇與油門變化另存為曲線。
- 實際瀏覽器檢查390×844、320×568與1280×720：手機儀表、正高度動畫、油門與啟動鈕共同可見，無橫向溢出；四轉子保存設定、錄製兩次、套用、雙曲線與CSV下載已操作；J85熱啟動保護後可清故障正常重啟；新3D外觀及二行程慢動作已顯示，無瀏覽器JavaScript錯誤。手機實體揚聲器、觸控手勢與效能仍需實機測試。
- 正式建置通過；仍有Three.js主套件大小提示，未新增外部模型下載或付費資產。
