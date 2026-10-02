# 代表引擎與傳動校準資料

查核日期：2026-10-02。預設值選定一款代表車；改裝滑桿是相對該基準的實驗設定。功率儲存為 **kW**，不是把 PS 和 SAE hp 混用。`1 PS = 0.73549875 kW`、`1 hp = 0.745699872 kW`。扭力是曲軸端 Nm，車輛質量包含 75 kg 駕駛。

本文件記錄資料來源及校準假設，不取代整合測試。功能與待驗證項目見 [1～20 修復對照](repair-status.md)。

## 引擎基準

| ID | 代表車／引擎 | 排氣量 cc | 額定功率 kW / RPM | 額定扭力 Nm / RPM | 原廠進氣 | 主要資料 |
|---|---|---:|---:|---:|---|---|
| i1 | 2016 KTM 690 Duke | 692.7 | 54 / 8,000 | 74 / 6,500 | NA | [KTM 原廠發表](https://press.ktm.com/news-ktm-heads-to-school-ktm-sportmotorcycle-uk?id=57880&l=uk&menueid=5904)、[KTM 2016 手冊，廠商文件鏡像](https://manualzz.com/doc/59289224/ktm-690-duke-2016-owner-manual) |
| i2_180 | 2019 Ninja 400，歐規 | 399 | 33.4 / 10,000 | 38 / 8,000 | NA | [Kawasaki 原廠規格](https://www.kawasaki.cz/cs/products/Supersport___Sport/2019/Ninja_400/specifications?Uid=08AEXlgLWV5bDA0LWlFeXA1RXVBQXQoLUQ0LUApdX1xQClA) |
| i2_270 | 2022 Yamaha R7，歐規 | 689 | 54 / 8,750 | 67 / 6,500 | NA | [Yamaha 歐規型錄](https://cdn2.yamaha-motor.eu/prod/product-assets/2022/YZF700R7/Factsheets/2022-YZF700R7_en.pdf) |
| v2_90 | 2020 Panigale V2 955 | 955 | 114 / 10,750 | 104 / 9,000 | NA | [Ducati 2020 規格](https://www.ducati.com/th/th/bikes/panigale-v2-2020) |
| i3 | 2021 Yamaha MT-09，歐規 | 890 | 87.5 / 10,000 | 93 / 7,000 | NA | [Yamaha 歐規型錄](https://cdn2.yamaha-motor.eu/prod/product-assets/2021/MT09DX/Factsheets/2021-MT09DX_sl-SI.pdf) |
| i4_flat | 2017 CBR1000RR SC77 | 999 | 141 / 13,000 | 114 / 11,000 | NA | [Honda 原廠規格](https://global.honda/jp/news/2017/2170316-cbr1000rr.html) |
| i4_cross | 2020 YZF-R1，歐規 | 998 | 147.1 / 13,500 | 113.3 / 11,500 | NA | [Yamaha 歐規型錄](https://cdn2.yamaha-motor.eu/prod/product-assets/2020/YZF1000R1/Factsheets/2020-YZF1000R1_en.pdf) |
| i6 | 1993 Supra Turbo，美規 6MT | 2,997 | 239 / 5,600 | 427 / 4,000 | 序列雙 Turbo | [Toyota 發表](https://pressroom.toyota.com/toyota-supra-icon-half-century-in-making/)、[Toyota New Car Features，廠商文件鏡像](https://supra.vanderwaal.eu/manual/New%20Car%20Features.pdf) |
| v6 | 2017 GT-R Premium，美規 | 3,799 | 421.3 / 6,800 | 633.2 / 3,300～5,800 | 雙 Turbo | [Nissan 完整原廠規格](https://usa.nissannews.com/en-US/releases/us-2017-nissan-gt-r-press-kit) |
| v8_cross | 2019 Mustang GT，第 3 代 Coyote，6MT | 5,038 | 343.0 / 7,000 | 569.4 / 4,600 | NA | [Ford Performance 2020 型錄](https://www.trackey.ford.com/download/PDFS/2020FPPcatalog.pdf) |
| v8_flat | 2010 Ferrari 458 Italia | 4,499 | 419 / 9,000 | 540 / 6,000 | NA | [Ferrari 型錄，廠商文件鏡像](https://brochureshub.com/wp-content/uploads/2020/04/Ferrari_int-458Italia.pdf) |
| v10 | 2012 Lexus LFA | 4,805 | 412 / 8,700 | 480 / 6,800 | NA | [Lexus 原廠規格](https://media.lexus.co.uk/lexus-lfa/) |
| v12 | 2012 Aventador LP700-4 | 6,498 | 515 / 8,250 | 690 / 5,500 | NA | [Dana／Graziano 原廠供應商資料](https://www.dana.com/globalassets/resource-library/light-vehicle/spec-sheets/dana-specsheet-longitudinaltransmission.pdf) |
| w16 | 2016 Chiron | 7,993 | 1,103 / 6,700 | 1,600 / 2,000～6,000 | 四 Turbo，雙階段 | [Bugatti 原廠規格](https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf) |
| radial_7 | Rotec R2800 | 2,800 | 82.0 / 3,700 | 約 220 / 3,200，估算 | NA | [Rotec 技術資料](https://www.rotecaerosport.com/_files/ugd/ef523b_cad71e078ddf483195daf43a05a0b5f2.pdf) |

額定功率點依 `T = P × 60,000 / (2π × RPM)` 轉為扭力錨點，因此 45 PS 的 Ninja 400 不再被同一個「每公升扭力」公式推算成 60 hp。曲線中的其餘點是保守插值，**不是原廠逐轉速測試數據**。LFA 3,700 RPM 的 90% 最大扭力、GT-R 與 Chiron 的扭力平台另依原廠描述建立。

怠速、部分 ECU 限轉值及改裝紅線上下限是操作模擬參數；原廠文件若只刊登最大馬力轉速，不能把該轉速直接當成斷油轉速。提高紅線也不等於無限提高馬力；既有扭力曲線須在高轉衰減。

歐／日規有差異：MT-09 歐規為 890 cc、87.5 kW，日規型錄為 888 cc、88 kW；R7 歐規為 689 cc、日規為 688 cc。此處動力選歐規，該代變速箱齒比相同。Mustang 2019 基準採 Ford Performance 明列的 460 hp／7,000 RPM；部分 2020 技術表將功率轉速寫為 7,500，故不將它混作本基準。

## 齒比與車輛負載

輪上總減速 = `primaryRatio × gearRatios[gear] × finalDrive`。機車不能漏掉一次減速；LFA 的前段 counter reduction、Aventador 的 drop gear 也必須算進去。車重是運轉質量加駕駛，不能直接使用沒有油水的乾重。

| ID | 檔數 | 一次／前段減速 | 終傳 | 各前進檔齒比 | 資料 |
|---|---:|---:|---:|---|---|
| i1 | 6 | 79/36 | 40/16 | 35/14, 28/16, 28/21, 23/21, 22/23, 20/23 | KTM 2016 手冊，上表連結 |
| i2_180 | 6 | 71/32 | 41/14 | 41/14, 37/18, 34/21, 32/24, 30/26, 28/27 | Kawasaki 原廠規格，上表連結 |
| i2_270 | 6 | 77/40 | 42/16 | 2.846, 2.125, 1.631, 1.300, 1.090, 0.964 | [Yamaha R7 原廠型錄](https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r7_WGP60th_2021.pdf) |
| v2_90 | 6 | 1.77 | 43/15 | 37/15, 30/16, 27/18, 25/20, 24/22, 23/24 | Ducati 原廠規格，上表連結 |
| i3 | 6 | 79/47 | 45/16 | 2.571, 1.947, 1.619, 1.380, 1.190, 1.037 | [Yamaha 2021 原廠發表](https://global.yamaha-motor.com/jp/news/2021/0622/mt-09.html) |
| i4_flat | 6 | 1.717 | 43/16 | 2.285, 1.777, 1.500, 1.333, 1.214, 1.137 | Honda 原廠規格，上表連結 |
| i4_cross | 6 | 67/41 | 41/16 | 39/15, 37/17, 35/19, 30/19, 29/21, 30/24 | [Yamaha R1 原廠型錄](https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_YZF-R1_WGP60th_2021.pdf) |
| i6 | 6 | 1 | 3.133 | 3.827, 2.360, 1.685, 1.312, 1, 0.793 | Toyota New Car Features，上表連結 |
| v6 | 6 | 1 | 3.700 | 4.056, 2.301, 1.595, 1.248, 1.001, 0.796 | Nissan 原廠規格，上表連結；採後軸等效總減速 |
| v8_cross | 6 | 1 | 3.55 | 3.237, 2.104, 1.422, 1, 0.814, 0.622 | [Ford 同代 MT82-D4 技術表](https://media.ford.com/content/dam/fordmedia/North%20America/US/product/2020/mustang/2020-Mustang-Tech_Specs.pdf)；選 3.55 選配終傳 |
| v8_flat | 7 | 1 | 5.143 | 3.077, 2.185, 1.626, 1.286, 1.028, 0.839, 0.693 | [Ferrari 458 車主手冊 p.27，廠商文件鏡像](https://www.manualslib.com/manual/900232/Ferrari-458-Italia.html?page=27) |
| v10 | 6 | 1.259 | 3.417 | 3.231, 2.188, 1.609, 1.233, 0.970, 0.795 | Lexus 原廠規格，上表連結 |
| v12 | 7 | 47/38 | 43/15 | 43/11, 39/16, 38/21, 35/24, 32/27, 29/30, 27/32 | Dana 原廠供應商資料，上表連結 |
| w16 | 7 | 1，正規化 | 1，正規化 | 由 6,700 RPM 各檔速度 90/150/200/260/320/390/420 km/h 反推總減速 | Bugatti 原廠規格，上表連結；不聲稱是齒輪齒數比 |
| radial_7 | 6 示範 | 1 | 2.4 示範 | 2.40, 1.85, 1.45, 1.15, 0.95, 0.75 | 實驗地面負載，非航空傳動資料 |

`VehicleProfiles.js` 以輪胎標示尺寸估算外半徑，再乘 0.98 作有效滾動半徑。輪胎實際載重、胎壓與高速膨脹未作逐款量測。Cd×A 亦為姿態及車身估算：有整流罩機車假設騎士趴低；裸車風阻較大。KTM 約 163 kg 運轉質量、Aventador 約 1,675 kg 為乾重加油水的估算。Ninja 400 採 168 kg 基準；原廠各地型錄有不同配備重量。所有車款另加 75 kg 駕駛。

六檔 R1 的理論紅線輪速約 317 km/h，四檔約 251 km/h；這是**齒比容許的輪速**，不是保證實車在風阻下達到該速度。實際尾速由輪上功率與滾阻／風阻平衡決定。變速箱也不應為了強行達到某速度而調出假的齒比。

AT／AMT 按鈕是使用者的操控模式；預設原型仍保留 `transmissionKind` 區分單離合、雙離合及手排來源。它不代表上述每一台實車原廠都提供液力 AT。機車與星型地面示範沒有原廠倒檔。

Chiron 的倒檔採第一檔等效減速幅值作示範，未取得原廠倒檔齒數；等效前進檔速及倒檔估算不可混作原廠齒輪資料。功率與扭力各自以單調插值約束，使中間推估曲線不憑空超過已公布峰值。

## 增壓、聲音與星型架構的邊界

Supra、GT-R、Chiron 的 `torquePoints` **已包含原廠增壓輸出**。模型先還原等效未增壓輸出，再由當前增壓與進氣狀態重建，因此不能把 1,500 PS 的 Chiron 再當成 NA 乘一次增壓倍率。`calibrationBoost` 的 0.75／1.0／1.8 bar 是本模型的校準工作點，不聲稱為全轉速域的 OEM ECU 壓力目標。小／大渦輪是等效容量與慣性模式，並非完整模擬 Supra 序列雙渦輪或 Bugatti 雙階段四渦輪閥路。

Roots／TVS 是可選改裝配置。它靠曲軸驅動，有旁通與驅動耗功；音高跟實際轉子轉速及傳動比，不跟「RPM / 紅線」改變。Turbo 則由排氣能量推動，有轉子慣性、流量能力與進氣容積形成的壓力遲滯。小／大渦輪的起壓門檻以代表引擎固定的額定功率轉速為基準，不會因使用者調高紅線就憑空延後。壓縮升溫與中冷後溫度會影響進氣密度；效率、熱損與轉子慣量仍是等效估算，未使用各款原廠壓縮機效率圖。發聲仍為連續程序合成音，尚無各代表車實錄樣本校準。

Coyote 第 1～3 代點火順序為 1-5-4-8-6-3-7-2，廠商資料列於 [Ford Performance 技術參考文件鏡像](https://device.report/m/b4699239da8adfa83c6773ce6111bf64ad0d487f9bf9ff17c99abf8238742ce9)。依該順序建立各銀行的非等距脈衝，避免十字曲軸 V8 被合成成左右銀行均勻交替的平面曲軸聲。整體曲軸點火仍每 90° 一次。

七缸選用 **Rotec R2800**。R3600 實際為九缸，不能拿其 3,600 cc、150 hp 數據套進七缸動畫。R2800 額定約 110 hp／3,700 曲軸 RPM，螺旋槳經 3:2 PSRU 後約 2,450 RPM；此處所有轉速顯示是曲軸轉速。原廠未發布完整扭力曲線，220 Nm 峰值與中間曲線是由額定功率估算。主／副連桿動畫保留定長連桿、旋轉關節及每缸 TDC 差異，仍是理想化運動學示意，沒有原廠幾何尺寸或螺旋槳氣動負載；網站車速及變速箱為地面負載示範。

壓縮升溫及耗功參考 [NASA Glenn](https://www.grc.nasa.gov/www/k-12/airplane/compth.html)；BOV 收油後由歧管真空保持洩壓的作動參考 [Garrett](https://www.garrettmotion.com/knowledge-center-category/racing-and-performance/what-is-the-difference-between-a-wastegate-and-a-blow-off-valve/)。Roots／TVS 四葉轉子與低轉供氣特性參考 [Eaton TVS](https://www.eaton.com/gb/en-gb/catalog/engine-solutions/tvs-r2300.html)。音效和簡化流量模型的係數是推估，不是這些廠商產品的實測重建。
