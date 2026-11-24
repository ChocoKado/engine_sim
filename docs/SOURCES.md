# engine_sim — 官方來源與待蒐集資料

R15 與 R3 於 2026-11-23 進行 M6 查核，後續車型列於各階段。引用時按 `modelYear / market / trim` 核對，圖片、音檔與 3D 資產須另外確認授權。

## 1. 官方來源索引

| ID | 對象 | 官方連結 | 核對資訊／用途 |
|---|---|---|---|
| S01 | Yamaha R15 2026 台灣 | https://www.yamaha-motor.com.tw/news/news-202605-r15 | 155 cc、VVA、A&S、峰值輸出及裝備重量。Quick Shifter 列於 R15M |
| S02 | Yamaha R15 台灣產品 | https://www.yamaha-motor.com.tw/motor/motor_R15 | 指定年份台灣車型的產品和規格入口 |
| S03 | Yamaha R3 2026 台灣 | https://www.yamaha-motor.com.tw/motor/motor_R3 | 321 cc、YZF-R3 ABS、2026 車色與手冊入口 |
| S04 | Yamaha R3 2026 美國 | https://www.yamahamotorsports.com/models/26-yzf-r3/features | 321cc、180° 曲軸、六速；特定年式 A&S 等；跨市場資訊須確認適用性 |
| S05 | Yamaha R3 原廠資料（2017 歐洲） | https://cdn2.yamaha-motor.eu/prod/product-assets/2017/YZF/Factsheets/2017-YZF-R320_en.pdf | 歷史對照資料，M0 的 180° 曲軸採 S04 |
| S06 | Yamaha R6 RACE | https://www.yamaha-motor.eu/mk/mk/motorcycles/supersport/pdp/r6-race/ | 599cc 直列四缸，偏賽道版本；需依選定市場年式補資料 |
| S07 | Yamaha R7 2026 | https://www.yamaha-motor.eu/ie/en/motorcycles/supersport/pdp/r7-2026/ | 689cc CP2 雙缸 |
| S08 | Yamaha R7 曲軸原理 | https://global.yamaha-motor.com/business/mc/lineup/yzf-r/ | 270° CP2 特徵、R 家族歷史及分級 |
| S09 | Yamaha R9 2026 | https://www.yamaha-motor.eu/al/en/motorcycles/supersport/pdp/r9-2026/ | 890cc CP3 三缸 |
| S10 | Yamaha R1 RACE | https://www.yamaha-motor.eu/ie/en/motorcycles/supersport/pdp/r1-race/ | 998cc crossplane 直列四缸；注意道路/賽道版差異 |
| S11 | Kawasaki ZX-25R 日本 | https://faq.kawasaki-motors.com/faq/show/4203?category_id=2&site_domain=default | 249cc 並列四缸，來源為日本官方 FAQ |
| S12 | Kawasaki ZX-4R | https://www.kawasaki.com/en-us/motorcycle/ninja/supersport/ninja-zx-4r | 399cc 直列四缸；不同 SE/RR 配置需分開 |
| S13 | Kawasaki ZX-6R 599/636 歷史 | https://global.kawasaki.com/en/corp/newsroom/news/detail/20121003_1e.html | 2012 發布 636，文內說明從 599 增大至 636；不能以此替代特定 599 年式全套規格 |
| S14 | Kawasaki ZX-6R 636 | https://www.kawasaki.com/en-us/motorcycle/ninja/supersport/ninja-zx-6r | 當代 636cc 直列四缸，市場年式需確認 |
| S15 | Kawasaki ZX-10R | https://www.kawasaki.com/en-us/motorcycle/ninja/supersport/ninja-zx-10r | 998cc 直列四缸，官方產品資訊 |
| S16 | Kawasaki ZX-14R | https://www.kawasaki.com/en-us/motorcycle/ninja/supersport/ninja-zx-14r | 1441cc 直列四缸 |
| S17 | Kawasaki H2（2026） | https://www.kawasaki.com/en-us/motorcycle/ninja/hypersport/ninja-h2/2026-ninja-h2-abs | 998cc 機械增壓直列四缸，公路車型 |
| S18 | Kawasaki H2R | https://www.kawasaki.com/en-us/motorcycle/ninja/hypersport/ninja-h2r | 998cc 機械增壓直列四缸，封閉賽道取向 |
| S19 | Kawasaki 原廠增壓原理 | https://origin.global.kawasaki.com/en/corp/rd/technologies/leisurea.html | Kawasaki 機械離心增壓設計與引擎配合的技術背景 |
| S20 | Kawasaki 增壓聲道的公開描述 | https://www.kawasaki.com/en-US/motorcycle/z/z-hypernaked/z-h2 | Z H2 官方說明進氣管強調增壓器作動聲；**僅證明原理重要，不能替代 H2/H2R 的實錄** |
| S21 | Web Audio 啟動限制（MDN） | https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices | 使用者互動解鎖 AudioContext；手機音訊控制 |
| S22 | Autoplay 政策（MDN） | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay | 音訊自動播放限制及權限行為 |
| S23 | Yamaha R15 2026 台灣標準版手冊 | https://www.yamaha-motor.com.tw/assets/images/motor/YZF-R15-2026/D95-F8199-T0.pdf | `D95-F8199-T0`，第 5-4、10-1～10-2 頁 |
| S24 | Yamaha R3 2026 台灣手冊 | https://www.yamaha-motor.com.tw/assets/images/motor/YZF-R3-2026/BRA-F8199-T0.pdf | `BRA-F8199-T0`，第 5-8、10-1～10-3 頁 |
| S25 | Yamaha R3 2026 台灣發表 | https://www.yamaha-motor.com.tw/news/news-202603-70-anniversary-edition | 一般版規格表列有 A&S、峰值輸出與裝備重量 |
| S26 | Yamaha R15 ABS 2023 日本 | https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r125_2023.pdf | R15 ABS 欄的初級與終傳齒數，台版暫用參考 |
| S27 | Yamaha R3 ABS 2026 日本 | https://www.yamaha-motor.co.jp/mc/spec-data/secret/yzf-r3-2026.html | 初級與終傳齒數，台版暫用參考 |
| S28 | Web Audio AudioWorklet | https://www.w3.org/TR/webaudio/#AudioWorkletGlobalScope | 音訊時基與處理介面 |
| S29 | 台灣山葉原廠零件查詢 | https://www.yamaha-motor.com.tw/accerssie/partsSearch | 查詢對應台灣車型零件需引擎號碼或車身號碼 |
| S30 | Yamaha 2026 歐規 R6 RACE 型錄 | [歐洲型錄](https://www.yamaha-motor.eu/content/dam/yme/language-masters/en/eicma-2025/digital-brochures/2026_EICMA_MC_BROCHURE_EN.pdf) | 峰值、排氣量、缸徑與行程、裝備重量與輪胎 |
| S31 | 2026 台規 R7 車主手冊 | [D42-28199-T0](https://www.yamaha-motor.com.tw/assets/images/motor/YZF-R7-2026/D42-28199-T0.pdf) | 六檔齒比、儀表紅區 |
| S32 | 2026 歐規 R9 型錄、台規手冊 | [型錄](https://cdn2.yamaha-motor.eu/prod/product-assets/2026/YZF900R9/Factsheets/2026-YZF900R9_en.pdf) · [BKN-28199-T1](https://www.yamaha-motor.com.tw/assets/images/motor/YZF-R9-2025/BKN-28199-T1.pdf) | 歐規全功率峰值、台規六檔傳動與儀表紅區參考 |
| S33 | 2020 日規 R1 ABS 與 Yamaha 十字曲軸技報 | [規格](https://global.yamaha-motor.com/jp/news/2020/0528/yzf-r1.html) · [原廠技報圖 5](https://global.yamaha-motor.com/jp/design_technology/technical/product/pdf/browse/45ss01.pdf) | 日規車身、引擎與傳動資料，十字曲軸點火順序 |
| S34 | 2025 日規 ZX-25R SE | [原廠 FAQ 附件「主要諸元」](https://faq.kawasaki-motors.com/faq/show/4203?category_id=2&site_domain=default) | 48 PS／15,500 RPM、22 Nm／12,500 RPM、184 kg、齒比與缸徑行程 |
| S35 | 2026 美規 ZX-4R ABS | [規格](https://www.kawasaki.com/en-us/products/ProductSpecSheetPDF/2026-ninja-zx-4r-abs) · [變速箱](https://www.kawasaki.com/en-us/owner-center/parts/363318/2026/ZX400PTFNL) · [後齒盤](https://www.kawasaki.com/en-us/OwnerCenter/DownloadDiagramPdf/363348?modelcode=ZX400PTFNL&modelyear=2026) · [全球型號初級比](https://global.kawasaki.com/news_230202-1e.pdf) | 56 hp／11,500 RPM、26.5 lb-ft／11,000 RPM、414.5 lb，美規一檔 41/13 與終傳 48/14。初級引用 2023 全球資料（C 級） |
| S36 | 2012 歐規 ZX‑6R 599 | [原廠維修手冊（存檔）](https://www.aservicemanualpdf.com/Samplepages/SM-2009-2012%20KAWASAKI%20ZX600R%20NINJA%20ZX-6R%20Service%20Repair%20Manual.pdf) · [原廠零件圖](https://www.kawasaki.com/en-us/ownercenter/downloaddiagrampdf/8096?modelcode=zx600rcf&modelyear=2012) | 128 PS／14,000 RPM、66.7 Nm／11,800 RPM，ZX600R 六檔與 1→2→4→3 |
| S37 | 2026 美規 ZX-6R 636 ABS | [規格](https://www.kawasaki.com/en-us/products/ProductSpecSheetPDF/2026-ninja-zx-6r) · [ABS 變速箱](https://www.kawasaki.com/en-us/ownercenter/downloaddiagrampdf/367266?modelcode=ZX636JTFAN&modelyear=2026) · [ABS 後齒盤](https://www.kawasaki.com/en-us/ownercenter/downloaddiagrampdf/367295?modelcode=ZX636JTFAN&modelyear=2026) · [同代英規](https://www.kawasaki.co.uk/en/Motorcycles/Supersport_Sport/Ninja_zx-6r_2026.html/ZX636JTFAN/ZX636JTFAN/MetallicMatteGrapheneSteelGrayMetallicSparkBlackLimeGreen) | 127 hp／13,000 RPM、52.1 lb-ft／10,800 RPM、美規六檔與 43 齒後齒盤，初級仍跨市場參考（C 級） |
| S38 | 2026 歐規 ZX-10R | [規格與齒比](https://www.kawasaki.eu/en/Motorcycles/Supersport_Sport/Ninja_ZX-10R_2026.html/ZX1003ATFAN/ZX1003ATFAN) | 196 PS／13,000 RPM、110 Nm／11,400 RPM、209 kg、全部減速比 |
| S39 | 2025 美規 ZX-14R ABS | [規格](https://www.kawasaki.com/en-us/products/ProductSpecSheetPDF/2025-ninja-zx-14r-abs) · [變速箱零件圖](https://www.kawasaki.com/en-us/owner-center/parts/348647/2025/ZX1400JSFNL) · [齒盤](https://www.kawasaki.com/en-us/ownercenter/downloaddiagrampdf/348677?modelcode=ZX1400JSFNN&modelyear=2025) · [原廠維修手冊（存檔）](https://manuzoid.com/manuals/BD6Bj-Kawasaki%20Ninja%20ZX-14R%20ABS%20Service%20manual) | 197 hp／10,000 RPM、116.5 lb-ft／7,500 RPM、593.1 lb。初級比引用同平台手冊（C 級） |
| S40 | 2019 歐規 Ninja H2 道路版 | [原廠規格](https://www.kawasaki.cz/cs/products/Supersport___Sport/2019/Ninja_H2/specifications?Uid=0842WFwLDlkOXFtdUFFZXF0KWQpeUQ5QDg5QUFpaCV1QWV4) | 170 kW／11,500 RPM、141.7 Nm／11,000 RPM、238 kg、終傳 44/18 |
| S41 | 2026 歐規 Ninja H2R 封閉賽道版 | [原廠規格](https://www.kawasaki.eu/en/Motorcycles/Hypersport/Ninja_H2R_2026.html/ZX1000YTFNN/ZX1000YTFNN) | 228 kW／14,000 RPM、165 Nm／12,500 RPM、216 kg、終傳 42/18 |
| S42 | Kawasaki 機械增壓器 | [原廠技報第 20 頁](https://global.kawasaki.com/en/corp/rd/magazine/180/pdf/n180en.pdf) · [H2 發表資料](https://content2.kawasaki.com/ContentStorage/KMC/NewsArticles/Media/7ddece22-802a-489a-b943-777f1d7109e8.pdf) | 曲軸經鏈條與行星齒輪總增速 9.18 倍，歷史 H2 葉輪外徑 69 mm |

### M0 核對的台灣規格（A 級）

| 2026 台灣車型 | 缸徑 × 行程 | 1 至 6 檔齒比（無因次） | 裝備重量／後胎標稱尺寸 | 來源 |
|---|---|---|---|---|
| YZF-R15 標準版 | 58.0 × 58.7 mm | 34/12、30/16、30/22、24/21、22/23、21/25 | 141 kg／140/70R-17 M/C 66H | S01、S23 |
| YZF-R3 ABS 一般版 | 68.0 × 44.1 mm | 35/14、31/17、31/23、25/23、23/25、24/30 | 170 kg／140/70R17 M/C 66H | S24、S25 |

## 2. 重要的證據邊界

1. **R3 點火**。S04 明示 2026 美規採 180° 曲軸與偏置汽缸。以四行程 720° 與 180° 曲軸推導出 180°／540° 燃燒間隔，台規的汽缸編號順序、點火提前角與幾何尺寸仍標 `unknown`。S25 確認 2026 台灣一般版配有 A&S，滑差特性仍待量測。
2. **R15 VVA**。S01 與 S23 支持標準版配有 VVA，切換 RPM、遲滯與揚程曲線仍標 `unknown`。S23 第 5-4 頁的 11,500 r/min 是儀表高轉區起點。ECU 斷油點及機械損壞門檻各自待驗證。
3. **R6/R1**：不同國家可能僅有賽道版、年份又不同；不能宣稱所有版本都 2026 年道路合法販售。
4. **ZX-6R 599 與 636**：S36、S37 分別記錄 2012 年 599 與 2026 年 636 的規格，兩車用不同扭力錨點與齒比。
5. **H2/H2R**：S42 確認行星齒輪增速後的總速比為 9.18。齒輪嚙合聲壓、旁通、流量圖譜與各版本錄音仍待驗，模擬使用獨立的機械增壓音層。
6. **所有音檔**：本包未包含任何可直接商用的實錄。YouTube 影片可作人工比較參考，但沒有授權就不能擷取、重發布或作為網站音效資產。

## 3. 機械與音訊資料最少需要補什麼？

| 資料 | 最低要求 | 缺少時的處理 |
|---|---|---|
| 各檔傳動比、初級減速、終傳動 | 來源、年份/市場、單位、零件版本 | 不可宣稱真實車速對 RPM；用清楚標示的暫定資料或延後該驗收 |
| 輪胎滾動半徑、整車質量 | 具體配胎、負重/胎壓條件 | 簡化模型明示近似 |
| 扭矩 vs RPM、節氣門/負載 | 多點曲線、測試條件及可信度 | 合成合理曲線並標 C 級，勿標實測馬力 |
| 引擎慣量、傳動/滑差 | 官方、量測或可解釋推導 | 調校參數記錄版本，勿稱原廠精準 |
| 怠速、限轉與機械安全極限 | 區分 ECU 限轉與機械破壞門檻 | ECU 規格若不明示近似；損壞門檻僅示意 |
| 曲軸相位、點火序列 | 兩者皆需明確，四行程 720° | 不可依缸數自動猜測音色 |
| 排氣/進氣音檔 | RPM × 油門 × 負載 × 排氣版本 × 授權 | 使用合成示意且標示，不可偽稱實錄 |
| H2/H2R 增壓器特性 | 軸速比、壓力/流量、音訊實錄及測試條件 | 獨立合成音層標示「示意」，保留資料接口 |

R15／R3 的初級與終傳比、後輪有效滾動半徑、完整扭矩曲線、怠速與 ECU 斷油點、慣量、離合器滑差、連桿長度、實際汽門正時和合法多工況錄音仍待補。峰值扭力與後胎標稱尺寸可作為後續核對的參考。

## M2 模擬取值

- A 級用 2026 台灣版的裝備重量、六檔齒比、峰值扭矩與最大馬力。R15 為 1.4 kgf·m／7,500 rpm、18.4 PS／10,000 rpm（S01、S23），R3 為 3.0 kgf·m／9,000 rpm、41 PS／10,750 rpm（S24、S25）。使用 `1 kgf·m = 9.80665 N·m` 與 `T = P/ω` 換算曲線錨點。
- C 級的初級／終傳比暫用日規齒數，R15 為 `73/24`、`48/14`（S26），R3 為 `70/23`、`43/14`（S27）。台規初級／終傳比仍標 `unknown`。
- C 級的曲線形狀、高轉燃燒扭矩衰減、怠速、摩擦及泵氣損、慣量、虛擬離合器、空阻、制動、75 kg 騎士與 0.305 m 後輪有效半徑皆為可替換的近似值。假設平路與純滾動，制動以單一合成力表示。高轉衰減影響燃燒扭矩，無 RPM 硬上限。實車斷油點、抓地、ABS 與 A&S 離合器作動曲線待校驗。

## M3 傳動參考

- A 級儀表高轉區起點為 R15 11,500 rpm（S23 第 5-4 頁），R3 12,000 rpm（S24 第 5-8 頁）。網站以此觸發反拖超轉提示，AT 另採 94% 預測上限。實車 ECU 斷油及損壞門檻各自維持 `unknown`。
- C 級燃燒斷油近似為 R15 11,900 rpm、R3 12,750 rpm。只限制燃燒扭矩。兩車 A&S 配備已確認，反拖離合扭矩上限、虛擬換檔時間與補油均為模擬調校值。

## M4 聲浪來源

- R15 每 720° 一次燃燒，R3 以 180° 曲軸推導出交替 180°／540°，相位原點取示意第一缸的燃燒上止點（S04、S23、S24）。
- 排氣、進氣與機械層的頻率及衰減屬 D 級合成參數。音訊無真車採樣，尚無合法錄音比對結果。輸出設數位限幅，實際聽音音量依裝置而異。

## M5 3D 內構

- 缸徑與活塞行程取 S23／S24，曲柄半徑取行程的一半。活塞與連桿採同軸曲柄連桿方程，曲軸每 720° 配合凸輪軸一圈。R3 使用 S04 的 180° 相位作為兩缸的相對角度。
- 連桿中心距、汽缸間距、汽門揚程和正時、殼體、曲柄配重與凸輪外觀皆為示意。偏置汽缸的尺寸缺證據，R3 暫用同軸模型。R15 保留 VVA 的兩組示意揚程，切換 RPM 設為 `unknown`，目前畫面採低揚程輪廓。

## M6 台灣車型查核與聲浪比對

| 2026 台灣車型 | 原廠手冊所列配胎（A 級） | 峰值扭力與功率（A 級） |
|---|---|---|
| YZF-R15 標準版（D95 手冊） | 前 MRF NYLOGRIP ZAPPER-FX1 `100/80-17M/C 52P`，後 MRF REVZ-S `140/70R-17M/C 66H`（S23 第 8-10、10-1～10-2 頁） | 1.4 kgf·m／7,500 rpm，18.4 PS／10,000 rpm（S01） |
| YZF-R3 ABS 一般版（BRA 手冊） | 前 Dunlop GPR-300F `110/70R17 M/C 54H`，後 Dunlop GPR-300 `140/70R17 M/C 66H`（S24 第 10-2～10-3 頁） | 3.0 kgf·m／9,000 rpm，41 PS／10,750 rpm（S25 一般版規格表） |

- 兩具後胎的標稱幾何半徑為 `(17 × 25.4 / 2 + 140 × 0.70) mm = 313.9 mm`。負載下的有效滾動半徑和胎面縱向摩擦曲線仍為 `unknown`，模擬使用 C 級參數。原廠發表的峰值可供擬合，完整扭矩與功率曲線仍缺實測。
- 台規初級與終傳比仍為 `unknown`，六檔齒比已由手冊核對。台灣山葉的零件查詢需對應的車身號碼或引擎號碼（S29），台規齒數尚未取得。R15 手冊證實 VVA 進入高速範圍時指示器會亮起（S23 第 5-4 頁），切換 RPM、遲滯與揚程曲線仍待驗。
- 實錄比對需有錄音權利及對應車型資訊。以合法來源或獲授權的專業測功機錄音，記錄年式、版本、排氣配置、檔位、RPM、油門與負載，同步保存原始音訊與時間軸，註明麥克風位置、增益與環境。先於相同轉速及負載對齊比較脈衝間隔與正規化頻譜，再比較正常收油及換檔的過渡。絕對音量另須校準。現階段無符合條件的實錄，聲浪維持 D 級合成示意。

### M6 滑移與故障取值

- M6 曾分開積分後輪與車身速度，以近似的摩擦力上限模擬滑移。2026-11-24 起，車速由輪速與有效半徑直接得到。車重與 75 kg 騎士一起折算為後輪負載慣量，保留離合器、單一合成煞車力、滾阻與風阻。
- 故障為 D 級示意。只有反拖超過儀表紅區起點的 110% 才累積嚴重度，達門檻後暫停燃燒與接合並允許使用者重設。百分比、累積係數與門檻皆為模擬設定，實車故障門檻維持 `unknown`。

## M7 聲浪修訂參考

- 參考程序合成如何將汽缸事件、進排氣和機械聲分開，以及如何讓排氣共鳴跟隨燃燒脈衝與斷油狀態。[Baldan 等人的程序合成論文](https://air.iuav.it/retrieve/de164c2a-5461-60ee-e053-3a05fe0a7787/SIVE15_submission_4.pdf) · [Doerfler 與 Wyse 的脈衝與共鳴器研究](https://arxiv.org/abs/2603.09391) · [Ange Yaghi 的 Engine Simulator](https://github.com/ange-yaghi/engine-sim#how-do-i-use-it)
- `engine_sim` 自行合成跟著曲軸轉動的泵氣脈衝、帶負載的燃燒與進氣層，以及隨轉速加重的短高頻排氣共鳴。R15 與 R3 沿用各自的燃燒間隔。這些是 D 級音色參數，尚未以兩車的授權實錄校準。

## M7 拉轉與換檔對照

- 印度 R15 V4 道路測試從靜止到 60 km/h 約 4 秒。印度 R3 的同項測試為 2.61 秒，二檔 20–50 km/h 為 2.09 秒。兩份跨市場道路資料只用於對照帶負載反應。台版空檔拉轉時間與等效慣量未取得實測，慣量調整屬 C 級。[91Wheels R15 實測](https://www.91wheels.com/news/2021-yamaha-r15-v4-0-acceleration-braking-test) · [Autocar India R3 實測](https://www.autocarindia.com/auto-features-amp/yamaha-r3-performance-tested-435751)
- 由台規齒比可推導，相同輪速且完全接合時，三升四的引擎轉速比為 R15 `0.8381`、R3 `0.8065`（S23、S24）。模擬另考慮輪速變動與接合滑差，顯示換檔前及再接合結束的實際模擬 RPM。
- 參考 Yamaha Y-AMT 的卸載／接合次序及快排製造商的短暫卸載臨界時間。網站約 67 ms 離合分離、約 300 ms 完成再接合的設定為 C 級虛擬換檔。[Yamaha 原廠換檔原理](https://global.yamaha-motor.com/news/2024/0726/y-amt.html) · [HealTech 快排技術文件](https://www.healtech-electronics.com/app/iqse/faq_en/)
- 參考 BeamNG 的引擎／排氣分層，以及 Engine Simulator 用不同排氣響應塑造音色的方式。新增示意排氣閥開啟相位、短壓力波與合成管路反射。Cycle World 的 R3 動力機影片是歷史美規參考，音檔未用作網站素材。[BeamNG 調音文件](https://documentation.beamng.com/modding/vehicle/sections/sounds/engine_audio/) · [Engine Simulator 排氣響應](https://github.com/ange-yaghi/engine-sim/blob/master/es/sound-library/impulse_responses.mr) · [Cycle World R3 實錄](https://www.cycleworld.com/2015/05/27/2015-yamaha-yzf-r3-entry-level-sportbike-motorcycle-dyno-run-video-and-performance-chart/)

## M8 Yamaha 四款車規格與聲音（2026-11-23）

| 車型 | 原廠同款數據（A 級） | 點火與跨版本取值 |
|---|---|---|
| 2026 歐規 R6 RACE | 599 cc、185 kg、67 × 42.5 mm、61.7 Nm／10,500 RPM、118.4 PS／14,500 RPM（S30） | 等距 180° 為平面曲軸示意（B 級推定），各缸點火順序 `unknown`。初級 `85/41`、終傳 `45/16`、紅區 `16,500 RPM` 與六檔引用歷年原廠資料（C 級）。[一般 R6 車主手冊](https://www.yamaha-motor.com.ar/modelo/descargar-manual-de-servicio/yzf-r6) · [GYTR 六檔 STD 對照](https://www.yamaha-motor.eu/content/dam/yme/ch/hostettler-ag/pdfs-brochures/2023/2023_YAM_GYTR_ACC_SUPERSPORT.pdf) |
| 2026 台規 R7 | 689 cc、189 kg、80 × 68.6 mm、6.9 kgf·m／6,500 RPM、73.4 PS／8,750 RPM、六檔、紅區 10,500 RPM（S25、S31） | CP2 曲軸 270°，推導間隔 270°／450°（S08，B 級）。初級 `77/40` 與終傳 `42/16` 引用日本規格（C 級）。[Yamaha 日本型錄](https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r7_2023.pdf) |
| 2026 歐規 R9 全功率版 | 890 cc、195 kg、78 × 62.1 mm、93 Nm／7,000 RPM、119 PS／10,000 RPM（S32） | CP3 採 240° 等距點火（B 級），各缸點火順序 `unknown`。同年歐規手冊確認 10,500 RPM 紅區。台規六檔、MT-09 家族初級 `79/47` 與海外 R9 零件終傳 `43/16` 暫用（C 級）。[2026 歐規車主手冊](https://www.notice-facile.com/en/manual/3032192/yamaha%2Br9-2026) · [MT-09 初級](https://global.yamaha-motor.com/jp/news/2021/0622/mt-09.html) · [R9 同件號離合器](https://shop.yamahacity.com.au/part/yamaha/B7N1615000) · [R9 原廠齒盤零件圖](https://www.tenkateracingproducts.com/yzf-r9-oem-rear-wheel-parts) |
| 2020 日規 R1 ABS | 997 cc、201 kg、79 × 50.9 mm、113 Nm／11,500 RPM、200 PS／13,500 RPM、六檔、初級 `67/41`、終傳 `41/16`（S33） | 十字曲軸 `1→3→2→4`，間隔 270°／180°／90°／180°（S33）。同年日規手冊確認紅區 14,000 RPM。[2020 日規原廠手冊](https://www2.yamaha-motor.co.jp/jp/manual/pdf/mc/2020B3LA.pdf) |

四款模型的斷油點、慣量、離合係數與完整動力曲線都採近似。音色依點火間隔、轉速、負載及原創管路反射分開設定，3D 尺寸與聲浪為 D 級。錄音式模擬器可用轉速／負載匹配的實車錄音，這也是實錄可校準的方向。本站未使用外部錄音。[Crankcase Audio REV](https://www.crankcaseaudio.com/) · [BeamNG 調音文件](https://documentation.beamng.com/modding/vehicle/sections/sounds/engine_audio/)

2026-11-24 調整峰值扭力前的低至中轉扭力曲線，R6 RACE 與 R1 分別使用自己的低轉形狀參數。曲線形狀與拉轉時間為 C 級模擬，原廠公布的峰值扭力與馬力仍作為錨點（S30、S33）。[Yamaha R6 技術資料](https://cdn2.yamaha-motor.eu/prod/product-assets/2020/YZF600R6/Factsheets/2020-YZF600R6_en.pdf) · [Yamaha R1 日規規格](https://global.yamaha-motor.com/jp/news/2020/0528/yzf-r1.html)

空檔收油回轉使用 C 級近似，以既有泵氣損失為基礎加上空檔、油門關閉且高於怠速時的阻力。油門全開時附加阻力消失，接近怠速時逐步減弱。原廠空檔回轉時間為 `unknown`，掛檔另維持傳動反拖與既有引擎煞車模型。

## M9 Kawasaki 自然進氣車款（2026-11-24）

- S34–S39 記錄年式、市場、峰值與傳動比。美規 ZX-4R 使用 56 hp 與美規一檔齒數。ZX-6R 分別採 2012 歐規 599 與 2026 美規 636。ZX-10R 採完整歐規數據，ZX-14R 採有原廠資料的 2025 美規 ABS。
- 四行程平面曲軸採 180° 等距脈衝。ZX600R 手冊可核對各缸順序，其他車款的缸號安排為 B／D 級示意。各車的斷油、等效慣量、曲線、車體阻力與聲學設定為 C／D 級近似，聲浪待同車實錄校準。

## M10 Ninja H2／H2R（2026-11-24）

- 兩款採非 RAM Air 的原廠峰值，使用各自的終傳比與車重。2019 歐規道路 H2 提供相容的馬力與扭力錨點，2026 歐規 H2R 按封閉賽道版資料。供氣與機械損失已反映在曲線近似，未額外乘算增壓馬力（S40、S41）。
- 14,000 引擎 RPM 對應 128,520 葉輪 RPM。音層以葉輪軸頻為合成基礎，隨轉速與負載混入高頻及氣流，並以短暫諧波描述高轉急收油。軸頻可計算，音色、收油幅度和 3D 是 D 級示意。[Kawasaki 對 Ninja H2 收油聲的說明](https://www.kawasaki.com/en-us/side-x-side/teryx/teryx-2-5-passenger-supercharged/teryx-h2)

## 車速、轉速與齒比複核

下表為 14 款既定年式與市場的同一場景，平路、無風、75 kg 騎士、虛擬 AT 從靜止全油門至穩態。極速與斷油以模擬值列示。齒比和峰值來源見 S01–S42 的相關車型。紅區、斷油、六檔齒比所容許的速度以及在風阻下能達到的速度是不同資料。

| 車款 | 紅區／斷油設定 RPM | 平路模擬 km/h／引擎 RPM | 參考與缺項 |
|---|---:|---:|---|
| R15 | 11,500／11,900 | 137／10,459 | 台規紅區 S23，精確尾速、斷油 `unknown` |
| R3 | 12,000／12,750 | 176／11,452 | 台規紅區 S24。[跨市場實測約 181](https://motostatz.com/yamaha-yzf-r3-acceleration/) |
| R6 RACE | 16,500／17,100 | 265／15,228 | [日規 RaceBase 紅區](https://www2.yamaha-motor.co.jp/Manual/pdf/mc/2024D511.pdf) · [原廠賽車套件齒比表](https://www.yamaha-racing.com/content/dam/yme-racing/shared/gytr/kit-manuals/pdf/KIT_MANUAL_2024_YZF-R6.pdf) · [道路版實測約 260](https://motostatz.com/yamaha-yzf-r6-acceleration/) |
| R7 | 10,500／10,900 | 216／9,004 | 台規紅區 S31。[早期版本測試約 224](https://motostatz.com/yamaha-yzf-r7-top-speed-acceleration/) |
| R9 | 10,500／11,000 | 251／10,046 | 同年歐規手冊紅區。[同世代德國測試列 248](https://www.motorradundreisen.de/motorraeder/test-telegramm-yamaha-r9-cp3-renner-road-race/8846/) |
| R1 | 14,000／14,500 | 300／13,197 | 同年日規紅區，約 299 數據僅作跨市場風阻參考。[R1 測試者](https://motostatz.com/how-to-hit-200-mph-on-a-yamaha-yzf-r1/) |
| ZX-25R | 17,000／17,500 | 182／17,294 | [2020 日規原始 GPS 約 176](https://young-machine.com/2020/10/23/135876/)，2025 精確尾速與斷油 `unknown` |
| ZX-4R | 15,000／15,800 | 205／12,795 | 2026 美規動力及傳動 S35。[2023 美規 4RR 原始測功機參考](https://www.cycleworld.com/bikes/kawasaki-ninja-zx-4rr-dyno-test-2023/) |
| ZX-6R 599 | 16,000／16,500 | 258／14,673 | 同代 2009 美規原始測試約 254、報導 16,600 限轉。[尾速](https://magazine.cycleworld.com/article/2014/8/1/best-used-bikes-kawasakizx-6r) · [限轉](https://magazine.cycleworld.com/article/2009/2/1/2009-kawasaki-zx-6r) |
| ZX-6R 636 | 14,000／14,500 | 237／14,331 | [2026 澳洲試駕紅區](https://twowheeladdicts.com.au/2026-kawasaki-ninja-zx-6r-track-test/) · [2024 年後美規測功機限轉參考](https://mrpmotorsports.com/ecu-flash-2024-kawasaki-zx6r-fm0203/)。2026 德國型錄 234 為歐規參考 |
| ZX-10R | 14,000／14,500 | 298／13,263 | [Kawasaki 德國 2026 型錄列 298](https://www.kawasaki.de/content/dam/europe/countries/de/pdf-dokumente/260416_KW_LG_26-2_Ansicht-Komplett.pdf)，調整風阻近似 |
| ZX-14R | 11,000／11,400 | 300／10,347 | [2012 同世代美規雷達測得 185 mph](https://www.cycleworld.com/2012/06/27/kawasaki-zx-14r-long-term-test-update/)。2025 ECU 與極速 `unknown` |
| H2 | 13,000／13,500 | 299／12,849 | 2019 齒比／動力 S40。[試駕規格列 299 限速](https://amcn.com.au/editorial/road-test-kawasaki-ninja-h2/)，作為 C 級車速調節參考 |
| H2R | 14,500／15,000 | 361／14,698 | 2026 S41、德國型錄只列超過 300。2016 特殊場地紀錄不可視為現款原廠極速 |

收油與換檔使用同一曲軸相位和時間軸。Brul 的公開資料以逐缸合成與排氣脈衝響應作為音色參考。本站本次校正時間軸與燃燒／排氣混音，車款實錄及量測排氣響應待校準。[Brul 音訊說明](https://brul.app/engines/v8)

RevLab 以 Web Audio 實時計算點火脈衝，並把排氣音色設為可獨立選擇的預設。本站各車音色使用獨立參數和相同共鳴器結構。升檔的完全分離約 55 ms，燃燒在接近新檔對應的引擎轉速時快速恢復。時序與混音皆為 C／D 級近似。[RevLab 音訊說明](https://build-your-engine.vercel.app/) · [HealTech 卸載原理](https://www.healtech-electronics.com/app/iqse/faq_en/)

排氣加厚參考汽缸脈衝、集管與消音器可形成不同共鳴的聲學模型。`exhaustBody` 設定兩個寬頻共鳴的中心頻率、阻尼與強度。多缸的排氣支管給予小幅固定差異，由現有點火脈衝驅動。所有新係數是 D 級原創合成，無對應原廠排氣管量測或實錄。 [排氣管與消音器聲學模型](https://doi.org/10.1186/s13636-024-00372-4) · [Yamaha 引擎聲合成技報](https://global.yamaha-motor.com/jp/design_technology/technical/pdf/chapters/YMC-TR32_TechPaper_04.pdf)

## M12 七品牌仿賽與歷史代表（2026-11-24）

`data/MODEL_CATALOG.csv` 列出 84 組設定的版本、點火間隔與逐車註記。新增車在 `data/` 按品牌存放。介面「原廠資料」連到該車的主要來源。車名後標示賽道、輸出近似及歷史版本；同動力與傳動的具名版共用引擎設定。

| 索引 | 核對及近似項目 |
|---|---|
| M12-Y | R125 歐規動力、車重與 VVA，變速採較早手冊，VVA 切換點 `unknown`。R25 採日規整車表。初代 R1 的 150 PS／10,000 RPM、108.3 Nm／8,500 RPM 取自原廠，裝備重量由 177 kg 乾重推估。 [R125](https://www.yamaha-motor.eu/gb/en/motorcycles/supersport/pdp/r125/) · [R125 手冊](https://www.manualslib.com/manual/1161348/Yamaha-Yzf-R125.html?page=90) · [R25](https://www.yamaha-motor.co.jp/mc/spec-data/secret/yzf-r25-2026.html) · [R1 原廠收藏](https://global.yamaha-motor.com/jp/showroom/cp/collection/yzf-r1/) · [R1 維修手冊](https://www.manualslib.com/manual/804954/Yamaha-Yzf-R1-1998.html) |
| M12-K | Ninja 125／250／400／500／650、ZX-4RR 和 ZX-10RR 採指定市場諸元，峰值用常壓。ZX-7R 採原廠 1996 P1 機件圖及同代手冊，輸出與裝備重量採近似。 [Ninja 250](https://www.kawasaki-motors.com/ja-jp/motorcycle/ninja/sport/ninja-250/2026-ninja-250) · [Ninja 400](https://www.kawasaki-motors.com/ja-jp/motorcycle/ninja/sport/ninja-400/2026-ninja-400) · [ZX-4RR](https://www.kawasaki.eu/en/Motorcycles/A2_Bikes/Ninja_ZX-4RR_2027.dispdir.dispdir.html.html) · [ZX-10RR](https://www.kawasaki.com.au/en-au/motorcycle/ninja/supersport/ninja-zx-10r/2026-ninja-zx-10rr) · [ZX-7R 機件圖](https://www.kawasaki.com/en-us/owner-center/parts/1996/ZX750-P1) · [同代維修手冊存檔](https://www.scribd.com/document/611584777/manual-de-servico-KAWASAKI-ZX7R-NINJA-1996-03) |
| M12-A | RS 125 引擎與六速齒比已核對，跨版減速比見備註。RS 457 用日規輸出與美規手冊總減速，RS 660 採對應歐規 EU5+ 手冊。RSV4 的 0°／180°／425°／605° 延用原廠 RR/RF 維修資料，按 1–3／2–4 分列。Mille 採同代維修手冊齒比，1998 出口動力與裝備重量為近似。 [Aprilia 車系](https://www.aprilia.com/wlassets/EICMA/EICMA-2025/Aprilia/brochure/EN-DIGITAL-Aprilia-Range-11-2025/original/EN-DIGITAL-Aprilia-Range-11-2025.pdf) · [RS 457 手冊存檔](https://www.scribd.com/document/786767320/rs-457-owners-manual-e5-usa-2024) · [RS 660 EU5+ 手冊](https://www.aprilia.com/wlassets/aprilia/pl/mauals/RS-660-RS-660-Factory/RS-660-660-FACTORY-E5-_PL/original/RS%2B660-660%2BFACTORY%2BE5%252B_PL.pdf) · [RSV4 點火順序手冊存檔](https://it.scribd.com/document/483521712/aprilia-rsv4-pdf) · [Mille 維修手冊存檔](https://www.scribd.com/document/774638682/Aprilia-RSV-Mille-Workshop-Manual) |
| M12-D | Panigale 各檔齒比採指定版本。Twin Pulse 為 0°／90°／290°／380°。2027 V4 二至五檔 15,000 RPM，其餘檔斷油近似；V4 R 六檔 16,500 RPM、其餘 16,000 RPM，保留道路版 218 PS。三款裝備重量以原廠無燃油重量加估計油量。916 歷史諸元與近似裝備重量、傳動分列。 [Panigale V2](https://www.ducati.com/in/en/bikes/panigale/panigale-v2-2025/insights?tab=Electronics) · [Panigale V4](https://www.ducati.com/gb/en/bikes/panigale/panigale-v4-2027/insights) · [Panigale V4 R](https://www.ducati.com/gb/en/bikes/panigale/panigale-v4-r/insights) · [Ducati 916 收藏](https://www.ducati.com/us/en/heritage/bikes/916) |
| M12-S | Hayabusa 模擬日本第三代 188 PS、149 Nm、262 kg 版本。GSX-8R 日規為 80 PS，GSX-R1000R 日規為 190 PS。GSX-R600／750 的現售美規未列峰值，採早期 Suzuki 資料估計。R125 照日本同系手冊，R150 與 1985 R750 的減速比為暫定。 [Hayabusa](https://www1.suzuki.co.jp/motor/lineup/gsx1300rrqm6/) · [GSX-8R](https://www1.suzuki.co.jp/motor/lineup/gsx800frqm6/) · [GSX-R1000R](https://www1.suzuki.co.jp/motor/lineup/gsxr1000rrrm7/?page=style&type=gsxr1000rrrm7) · [GSX-R600 原廠歷史諸元](https://motorrad.suzuki.de/cms/api/delivery/file/portal_1/page_687/widget_2259/de/GSX-R600_L6_DE.original.pdf) · [2019 GSX-R750 原廠表](https://suzuki-adplanner-assets.s3.amazonaws.com/assets/features/_2019/sportbike/fbs-gsx-r750l9.pdf) · [GSX-R750 歷代原廠資料](https://www.suzuki.co.jp/suzuki_digital_library/2_moto/sports_081.html) |
| M12-H | MC22 249 cc 四缸與 MC51 雙缸分開。CBR400R／500R 雙缸與 FOUR 分開。英規 500 FOUR 功率、扭矩採當期官方資料，其裝備重量與齒比暫參考 400 FOUR。美規 CBR1000RR 峰值採跨市場近似，Fireblade SP 用 2024 日規完整規格。CBR900RR 齒比和裝備重量近似。RC30 點火從 360° 曲軸及 90° 缸角推導。 [MC22](https://www.honda.co.jp/factbook/motor/CBR250RR/19900300/011.html) · [MC51 早期手冊](https://www.honda.co.jp/ownersmanual/pdf/motor/cbr250rr/30K646000_web.pdf?genpo=HondaMotor) · [CBR400R FOUR](https://www.honda.co.jp/content/dam/site/www/CBR400RF/cq_img/pdf/CBR400RF_SPEC_SP.pdf) · [CBR500R FOUR](https://www.honda.co.uk/motorcycles/range/super-sport/cbr500r-four/specifications.html) · [Fireblade SP](https://www.honda.co.jp/content/dam/site/www/CBR1000RRR/cq_img/pdf/CBR1000RRR_SPEC_SP.pdf) · [CBR900RR](https://global.honda/en/CBR/history/stories/1992/) · [VFR750R](https://www.honda.co.jp/motorcycle-refresh-plan/pdf/VFR750R-RC30.pdf) |
| M12-B | G 310 RR 用印度 Sport／Track 資料，齒比跨用 G 310 R 手冊。M／S 1000 RR 按原廠 2025 規格採不同動力與相同總齒比；初代採 2009 原廠發布。 [G 310 RR](https://www.bmw-motorrad.in/en/models/sport/g310rr/technicaldata.html) · [G 310 R 手冊](https://ownersmanuals2.com/bmw/g-310-r-2016-owners-manual-71743/page-119) · [現款 M／S 1000 RR](https://www.press.bmwgroup.com/switzerland/article/attachment/T0446040DE/624096) · [初代 S 1000 RR](https://www.press.bmwgroup.com/canada/article/attachment/T0036542EN/56488) |

尚無完整動力曲線、原車輪上測功、每檔 ECU 限速和音色量測。各車音色、有效輪徑、風阻與轉動慣量屬 C／D 級。3D 剖面呈現缸列、曲軸相位、活塞及正時概念。ShiftCam、SR-VVT、IVT、V4 R 的實車檔位排列及 Honda E-Clutch 電控採本站共用的近似模型。後續樣本包括已發表待完整諸元的 2027 Fireblade，以及需二行程核心的歷史仿賽。

RS 125 採原廠 EU5 手冊的 58／13 終傳，初傳確值 `unknown`，以瑞士型式認證的 120 km/h 校正。Hayabusa 道路限速採同代試駕資料的約 186 mph（299 km/h）作為跨市場設定。 [RS 125 手冊](https://www.aprilia.com/wlassets/aprilia/pl/mauals/2022/APRILIA-RS125-E5-PL/original/APRILIA%2BRS125%2BE5%2BPL.pdf) · [瑞士型式 6AA349](https://www.dauto.ch/en/typenscheine/6aa349-aprilia-rs-125) · [第三代 Hayabusa 試駕](https://ridermagazine.com/2022-suzuki-hayabusa-road-test-review/)

### M12 新增車款轉速與模擬車速

取固定平路條件、AT 全油門 75 秒的車速。個別市場的實車速度限制與騎士風阻資料缺失，表內數字用於比較模擬輸出。

| 車型 | 儀表紅區 RPM | 模擬斷油 RPM | 模擬 km/h |
|---|---:|---:|---:|
| Yamaha YZF-R125 | 10900 | 11400 | 128.4 |
| Yamaha YZF-R25 | 14000 | 14300 | 171.8 |
| Yamaha YZF-R1 ’98 | 11750 | 12000 | 276.1 |
| Kawasaki Ninja 125 | 11200 | 11600 | 123.4 |
| Kawasaki Ninja 250 | 13200 | 13800 | 171.5 |
| Kawasaki Ninja 400 | 12000 | 12500 | 189.6 |
| Kawasaki Ninja 500 | 10500 | 11000 | 182.5 |
| Kawasaki Ninja 650 | 10000 | 10400 | 207.0 |
| Kawasaki ZX-4RR | 15500 | 16100 | 227.1 |
| Kawasaki ZX-10RR | 14500 | 15000 | 310.5 |
| Kawasaki ZX-7R ’96 | 12500 | 13000 | 251.9 |
| Aprilia RS 125 | 11000 | 11600 | 119.4 |
| Aprilia RS 457 | 10000 | 10700 | 189.0 |
| Aprilia RS 660 | 11500 | 11800 | 246.0 |
| Aprilia RSV4 | 13600 | 13900 | 317.1 |
| Aprilia RSV Mille | 10200 | 10500 | 256.4 |
| Ducati Panigale V2 | 11300 | 11800 | 256.7 |
| Ducati Panigale V4 | 14500 | 14600 ／ 15000（2–5 檔） | 318.1 |
| Ducati Panigale V4 R | 16000 | 16000 ／ 16500（6 檔） | 318.5 |
| Ducati 916 | 10000 | 10400 | 253.1 |
| Suzuki GSX-R125 | 11200 | 11700 | 128.0 |
| Suzuki GSX-R150 | 11600 | 12200 | 136.8 |
| Suzuki GSX250R | 10000 | 10700 | 140.9 |
| Suzuki GSX-8R | 9800 | 10400 | 221.0 |
| Suzuki GSX-R600 | 15100 | 15700 | 267.7 |
| Suzuki GSX-R750 | 14500 | 15000 | 283.8 |
| Suzuki GSX-R1000R | 14300 | 14700 | 302.3 |
| Suzuki Hayabusa | 11000 | 11300 | 298.6 |
| Suzuki GSX-R750 ’85 | 10900 | 11400 | 219.5 |
| Honda CBR150R | 10500 | 11000 | 130.6 |
| Honda CBR250RR | 14100 | 14600 | 184.0 |
| Honda CBR400R | 9900 | 10400 | 182.6 |
| Honda CBR500R | 9000 | 9500 | 185.2 |
| Honda CBR400R FOUR | 12700 | 13200 | 200.7 |
| Honda CBR500R FOUR | 12300 | 12800 | 199.9 |
| Honda CBR600RR | 15200 | 15700 | 264.1 |
| Honda CBR650R | 12600 | 13100 | 236.7 |
| Honda CBR1000RR | 13700 | 14200 | 303.4 |
| Honda CBR1000RR-R SP | 14500 | 15000 | 320.4 |
| Honda CBR250RR ’90 | 19000 | 19500 | 189.1 |
| Honda VFR750R ’87 | 11500 | 12000 | 217.9 |
| Honda CBR900RR ’92 | 11500 | 12000 | 254.3 |
| BMW G 310 RR | 10500 | 10900 | 156.0 |
| BMW S 1000 RR | 14600 | 15000 | 303.0 |
| BMW M 1000 RR | 15100 | 15400 | 314.1 |
| BMW S 1000 RR ’09 | 14000 | 14200 | 301.1 |

### 收油回火、尾速與補充車型

排氣回火是獨立的合成壓力聲。工況使用同一份油門、RPM、燃燒和負載資料，中高轉收油時依近期負載估算出現機會，聲響數量、延遲及力度隨機。此為音色近似，實車的過量燃料、二次進氣、排氣溫度及 ECU 控制因車而異。[減速斷油與排氣燃燒的原始專利資料](https://patents.google.com/patent/EP1437499A1/en)

帶油升檔另依物理傳入的正向升檔事件與燃燒扭矩切斷量觸發。中高轉且近期有燃燒負載時，每次在斷扭段內可能出現一聲合成短響，機率、延遲與力度為示意。 [快排卸載原理](https://www.healtech-electronics.com/app/iqse/faq_en/) · [Ducati Quick Shift](https://www.ducati.com/us/en/bikes/streetfighter/streetfighter-v4-my24/electronics)

以下採平路 AT 全油門 75 秒。道路車速限速和 RPM 斷油分開計算。解除模式保留動力、風阻與齒比。不同版本的實測、原廠列值與模擬估計分開列。

| 車型 | 模擬 km/h | 核對基準 |
|---|---:|---|
| H2 | 298.6 → 309.0 | 道路限速參考 299。同一引擎的解除模式為模型推算。[H2 試駕](https://amcn.com.au/editorial/road-test-kawasaki-ninja-h2/) |
| Hayabusa | 298.6 → 310.0 | Suzuki 英國公布第三代 299 km/h 限速，跨用於日規。MOTORRAD 第二代測得 298，解除後 312 為其風洞推算。[Suzuki 第三代新聞稿](https://www.suzukipress.co.uk/release/busas-back-suzuki-reveals-new-hayabusa-for-2021/) · [MOTORRAD 高速比較測試](https://www.motorradonline.de/tourer/vergleichstest-sport-gegen-speedbikes-die-schnellsten-motorraeder-im-test/) |
| ZX-10R | 297.9 | 同年 2026 歐規 GPS 測得 298 km/h。[10 Hz GPS 實測](https://www.crazywheels.it/27680-kawasaki-zx10r-2026-top-speed-acceleration-braking-test/amp) |
| BMW S 1000 RR／M 1000 RR | 303.0／314.1 | BMW 德規分別列 303、314 km/h。以此微調有效風阻。[S 1000 RR](https://www.bmw-motorrad.de/de/models/sport/s1000rr/technicaldata.html) · [M 1000 RR](https://www.bmw-motorrad.de/de/models/m/m1000rr/technicaldata.html) |
| Panigale V4 R | 318.5 | Ducati 列道路配置 318.4 km/h，超過 330 km/h 使用賽道排氣配置。[Ducati V4 R](https://www.ducati.com/gb/en/news/new-panigale-v4-r-the-maximum-expression-of-ducati-racing-technology) |
| Fireblade SP／RSV4 | 320.4／317.1 | 日規 2024 SP 及歐規 2025 RSV4 的同版本 GPS 尾速 `unknown`。英規 Fireblade 原廠列 299，較早 RSV4 原廠公布超過 305。[Honda 英規](https://www.honda.co.uk/motorcycles/range/super-sport/cbr1000rr-r-fireblade/specifications-and-price.html) · [Aprilia 早期 RSV4](https://press.piaggiogroup.com/en_en/post/show/205020/aprilia-rsv4.html) |

補充車型的資料用各車規格連結與 CSV 逐款註記。Suzuki GIXXER SF 155 按五速，採前期同系減速比。SF 250 日規採原廠齒比，FFV 以印度 E85 輸出搭配同系近似傳動。GSX-R1000 非 R 的美規車體採原廠值，峰值與傳動用跨市場近似。 [GIXXER SF](https://www.suzukimotorcycle.co.in/product-details/gixxer-sf) · [GIXXER SF 250](https://www1.suzuki.co.jp/motor/lineup/gsx250frlm6/?page=style) · [E85 原廠規格](https://www.suzukimotorcycle.co.in/brochure/Gixxer-SF250-FFV-leafle.pdf) · [GSX-R1000](https://suzukicycles.com/sportbike/2027/gsx-r1000)

GSX-10R 與 F 450 RR 標為上市前預覽。使用已公布的引擎、輸出和重量，未公布的齒比分別借用 GSX-S1000 與 F 450 GS。F 450 RR 終傳以 BMW RR 規格為準。Suzuki 的 SV-7S 屬街車，GSX-S1000GT／GX 屬旅行車與跨界車。 [Suzuki 發售規劃](https://www.globalsuzuki.com/ir/library/financialresults/pdf/2026/financial_presentation_2q.pdf) · [GSX-10R](https://www.suzuki.nl/motoren/nieuws/suzuki-introduceert-gsx-10r-nieuwe-generatie-sportmotor/) · [GSX-S1000 傳動](https://www1.suzuki.co.jp/motor/lineup/gsxs1000rqm7/?page=style) · [F 450 RR](https://www.bmw-motorrad.de/de/models/sport/f450rr/technicaldata.html) · [F 450 GS 齒比](https://www.press.bmwgroup.com/austria/article/attachment/T0453692DE/639941)

R1／R6 GYTR 的可調傳動與 ECU 曲線 `unknown`，以對應平台的基準動力模擬。Ninja 7 Hybrid 只模擬原廠公布的 59 PS 燃油引擎。Panigale V2 SP 的 120 PS 和 V4 限量款的 218.5 PS 取自對應道路版本，車重用原廠無油重量加估計燃油量。 [Yamaha R 系列](https://www.yamaha-motor.eu/content/dam/yme/language-masters/en/eicma-2025/digital-brochures/2026_EICMA_MC_BROCHURE_EN.pdf) · [Ninja 7 引擎規格](https://www.kawasaki.eu/content/dam/europe/master/pdf-files/brochures/Kawasaki_Brochure_FullLine_2024.pdf) · [Panigale V2 SP](https://www.ducati.com/ww/en/bikes/panigale/panigale-v2-sp/insights)

### 本次 24 款補充車型

| 車型 | 儀表紅區 RPM | 模擬 km/h |
|---|---:|---:|
| Yamaha YZF-R15M | 11500 | 137.2 |
| Yamaha YZF-R6 GYTR | 16500 | 265.4 |
| Yamaha YZF-R1M | 14000 | 299.3 |
| Yamaha YZF-R1 RACE | 14000 | 300.4 |
| Yamaha YZF-R1 GYTR | 14000 | 300.4 |
| Kawasaki Ninja 7 Hybrid | 11000 | 193.5 |
| Kawasaki ZX-25RR | 17000 | 182.0 |
| Aprilia RS 457 GP Replica | 10000 | 189.0 |
| Aprilia RS 660 Factory | 11500 | 246.0 |
| Aprilia RSV4 Factory | 13600 | 317.1 |
| Ducati Panigale V2 S | 11300 | 256.7 |
| Ducati Panigale V2 SP | 11300 | 256.7 |
| Ducati Panigale V2 MM93 | 11300 | 256.7 |
| Ducati Panigale V2 FB63 | 11300 | 256.7 |
| Ducati Panigale V4 S | 14500 | 318.1 |
| Ducati Panigale V4 Lamborghini | 14400 | 314.3 |
| Ducati Panigale V4 Márquez | 14400 | 314.3 |
| Suzuki GIXXER SF | 9000 | 119.8 |
| Suzuki GIXXER SF 250 | 10000 | 147.9 |
| Suzuki GIXXER SF 250 FFV | 10000 | 148.0 |
| Suzuki GSX-10R | 11700 | 272.3 |
| Suzuki GSX-R1000 | 14300 | 302.2 |
| Honda CBR1000RR-R | 14500 | 320.5 |
| BMW F 450 RR | 9850 | 178.1 |

## M13 汽車、航空與航天

六款汽車採手排規格作基準，以虛擬撥片操作。引擎功率、扭矩錨點、齒比、重量及主要幾何按指定版本；未量測的轉動慣量、傳動效率、抓地扭矩上限、風阻與排氣響應為 C／D 級近似。下表為 75 秒平路全油門虛擬 AT 跑出的車速。

| 汽車 | 模擬 km/h | 核對來源與版本 |
|---|---:|---|
| GR86・Boxer 四缸 | 229.0 | 日規 2025 RZ 6MT。有效道路阻力以英規 140 mph 作跨市場校準，日規電子限速 `unknown`。[Toyota 日本規格](https://toyota.jp/pages/contents/request/webcatalog/86/gr86_main_202507.pdf) · [Toyota 英規](https://media.toyota.co.uk/toyota-presents-the-new-gr86/) |
| Civic Type R・直列四缸 | 269.6 | Honda 2027 美規 FL5 6MT，採原廠扭矩平台。[Honda 規格](https://automobiles.honda.com/civic-type-r/specs-features-trim-comparison) |
| GR Supra・直列六缸 | 248.7 | 北美 2025 3.0 6MT 動力和約 249 km/h 限速。內部齒比取同代英規。[Toyota 北美手冊](https://www.toyota.com/content/dam/toyota/brochures/pdf/2025/grsupra_ebrochure.pdf) · [英規齒比](https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/220607M-GR-Supra-Tech-Spec.pdf) |
| Nissan Z・V6 | 285.7 | 2024 澳規 6MT，有效風阻及斷油近似，原車限速 `unknown`。[Nissan 澳洲規格](https://www.nissan.com.au/content/dam/Nissan/AU/Files/Brochures/Models/Specsheet/Nissan_Z_Key-Visual_Collateral_SpecSheet_eSpec_v2.pdf) |
| Mustang GT・V8 | 248.7 | 2025 美規 6MT 主動排氣版，限速採同代 2024 實測約 155 mph。左右排氣脈衝按 Coyote 原廠點火順序拆分。[Ford 2025 規格](https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2025/specs/2025_Mustang_Technical_Specs.pdf) · [Ford Coyote 資料](https://performanceparts.ford.com/download/PDFS/Coyote%20Technical%20Reference2.pdf) · [Car and Driver 實測](https://www.caranddriver.com/reviews/a44892132/2024-ford-mustang-gt-test/) |
| RX-8・Wankel 雙轉子 | 234.9 | 2009 美規 6MT。偏心軸每圈兩次排氣脈衝，轉子角速度為偏心軸三分之一。英規 234 km/h 用於道路阻力近似。[Mazda 美國規格](https://news.mazdausa.com/download/2009-RX-8-Spec.pdf) · [Mazda 技報](https://www2.mazda.com/ja/technology/gihou/2023/wbbook/pageindices/index68.html) · [Mazda 英規型錄存檔](https://autocatalogarchive.com/wp-content/uploads/2025/03/Mazda-RX-8-2009-UK.pdf) |

航空和航天使用固定步長的靜態引擎台架。額定動力、額定推力及參考環境有據。接轉時間、螺旋槳負載曲線、引擎剖面與音訊為近似，飛行軌跡與裝置程序在台架模型範圍之外。

| 引擎 | 額定基準 |
|---|---|
| Lycoming IO-360-L2A | 2,700 RPM、180 hp，參考負載下約 134.2 kW。[Lycoming 操作手冊](https://www.lycoming.com/sites/default/files/file/2025-11/60297-12%20-%20O-360%2C%20HO-360%2C%20IO-360%2C%20AIO-360%2C%20HIO-360%20Series.pdf) |
| CFM56-7B27 | 渦扇靜態起飛推力 121.43 kN，雙轉子接轉僅顯示相對轉速。[EASA 認證資料](https://www.easa.europa.eu/en/downloads/7795/en) |
| Olympus 593 Mk 610 | 純渦噴海平面無加力 31,350 lbf，約 139.45 kN。[FAA E20EU 認證資料存檔](https://www.scribd.com/document/724007832/E20eu) · [Rolls-Royce 引擎歷史](https://www.rolls-royce.com/media/our-stories/discover/2020/intelligentengine-exploring-sustainable-supersonic-flight.aspx) |
| RS-25 | SLS 109% 額定點，海平面 418,000 lbf、真空 512,300 lbf。[NASA 規格](https://www.nasa.gov/wp-content/uploads/2025/04/sls-4963-sls-rs-25-engine-fact-sheet-508.pdf) |

回火音色改用陡峭壓力前緣、短反向回彈、耗散噪聲與排氣管初次反射。升檔的前緣較銳利，收油的氣流尾聲稍重。係數屬 D 級原創合成，對比方向取自排氣有限振幅壓力波研究。 [SAE 異常排氣噪聲研究](https://saemobilus.sae.org/papers/study-generation-mechanism-abnormal-exhaust-noise-871924) · [排氣聲輻射實驗](https://www.sciencedirect.com/science/article/pii/S0022460X7080044X)

## 4. 開發者引用習慣

每新增或修改一筆真實規格，請保存來源 URL、核對日、年式/地區/型號、原始值、單位、證據等級（A/B/C/D），以及對應的設定檔/測試；找不到資料就填 `unknown` 而不是猜。
