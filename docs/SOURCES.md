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

## 4. 開發者引用習慣

每新增或修改一筆真實規格，請保存來源 URL、核對日、年式/地區/型號、原始值、單位、證據等級（A/B/C/D），以及對應的設定檔/測試；找不到資料就填 `unknown` 而不是猜。
