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
| honda_f20c | 1999 Honda S2000，日規 | 1,997 | 184 / 8,300 | 217.7 / 7,500 | NA、VTEC | [Honda 原廠規格](https://www.honda.co.jp/factbook/auto/s2000/199904/050.html) |
| honda_k20a | 2007 Civic Type R FD2，日規 | 1,998 | 165 / 8,000 | 215 / 6,100 | NA、i-VTEC | [Honda 引擎與 VTEC](https://www.honda.co.jp/factbook/auto/CIVIC_TYPE_R/200703/04.html) |
| boxer4 | 2016 Subaru WRX STI EJ257，美規 | 2,457 | 227.4 / 6,000 | 393.2 / 4,000 | Turbo | [Subaru 原廠規格](https://subarumedia.iconicweb.com/mediasite/specs/2016_Subaru_WRX_STI_specs.pdf) |
| boxer6 | 2025 911 GT3 992.2，歐規 6MT | 3,996 | 375 / 8,500 | 450 / 6,250 | NA | [Porsche 原廠 6MT 規格](https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr:46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf) |
| rotary_2 | 2004 Mazda RX-8 RENESIS，美規 6MT | 654 × 2 | 177.5 / 8,500 | 215.6 / 5,500 | NA | [Mazda 原廠規格](https://news.mazdausa.com/download/RX-8-Spec-Sheet-Final.pdf) |

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
| honda_f20c | 6 | 1.160 | 4.100 | 3.133, 2.045, 1.481, 1.161, 0.970, 0.810 | Honda 原廠規格，上表連結；包含獨立的一次減速 |
| honda_k20a | 6 | 1 | 5.062 | 3.266, 2.130, 1.517, 1.147, 0.921, 0.738 | [Honda FD2 重量及傳動規格](https://www.honda.co.jp/factbook/auto/CIVIC_TYPE_R/200703/07.html) |
| boxer4 | 6 | 1 | 3.900 | 3.636, 2.235, 1.521, 1.137, 0.971, 0.756 | Subaru 原廠規格，上表連結 |
| boxer6 | 6 | 1 | 4.300 | 3.75, 2.38, 1.72, 1.34, 1.08, 0.88 | Porsche 992.2 GT3 6MT 規格，上表連結；不混用 PDK 或前代 992.1 |
| rotary_2 | 6 | 1 | 4.440 | 3.76, 2.27, 1.65, 1.19, 1.00, 0.84 | Mazda 2004 美規 6MT 規格，上表連結 |

`VehicleProfiles.js` 以輪胎標示尺寸估算外半徑，再乘 0.98 作有效滾動半徑。輪胎實際載重、胎壓與高速膨脹未作逐款量測。Cd×A 亦為姿態及車身估算：有整流罩機車假設騎士趴低；裸車風阻較大。KTM 約 163 kg 運轉質量、Aventador 約 1,675 kg 為乾重加油水的估算。Ninja 400 採 168 kg 基準；原廠各地型錄有不同配備重量。所有車款另加 75 kg 駕駛。

新增車款的原廠整備質量：F20C 1,240 kg、FD2 1,270 kg、STI 3,386 lb、GT3 6MT 1,462 kg、RX-8 6MT 3,029 lb；均另加駕駛。GT3 的 Cd×A = 0.72 m² 來自該代原廠表，其餘新車的 Cd×A 是估算。STI 的原廠最大增壓 14.7 psi 用作校準工作點，6,700 RPM 限轉值則為模擬設定，不聲稱來自該規格表。

六檔 R1 的理論紅線輪速約 317 km/h，四檔約 251 km/h；這是**齒比容許的輪速**，不是保證實車在風阻下達到該速度。實際尾速由輪上功率與滾阻／風阻平衡決定。變速箱也不應為了強行達到某速度而調出假的齒比。

AT／AMT 按鈕是使用者的操控模式；預設原型仍保留 `transmissionKind` 區分單離合、雙離合及手排來源。它不代表上述每一台實車原廠都提供液力 AT。機車與星型地面示範沒有原廠倒檔。

Chiron 的倒檔採第一檔等效減速幅值作示範，未取得原廠倒檔齒數；等效前進檔速及倒檔估算不可混作原廠齒輪資料。功率與扭力各自以單調插值約束，使中間推估曲線不憑空超過已公布峰值。

RX-8 的 2004 原廠表未列倒檔。R = 3.564 參考 [Mazda 2008 同代美規 6MT 表](https://news.mazdausa.com/download/2008-RX-8-Spec.pdf)；其前進齒比與 2004 表的取整數值一致，但倒檔仍標示為同代參考，沒有聲稱是 2004 表直接公布。2003 日規技術論文的第三／六檔不同，不套用到美規基準。

## 增壓、聲音與星型架構的邊界

Supra、GT-R、Chiron 及 STI 的 `torquePoints` **已包含原廠增壓輸出**。模型先還原等效未增壓輸出，再由當前增壓與進氣狀態重建，因此不能把 1,500 PS 的 Chiron 再當成 NA 乘一次增壓倍率。`calibrationBoost` 的 0.75／1.0／1.8 bar 是本模型的校準工作點，不聲稱為全轉速域的 OEM ECU 壓力目標。STI 校準值約 1.0135 bar，來自規格表的最大增壓。小／大渦輪是等效容量與慣性模式，並非完整模擬 Supra 序列雙渦輪或 Bugatti 雙階段四渦輪閥路。

Roots／TVS 是可選改裝配置。它靠曲軸驅動，有旁通與驅動耗功；音高跟實際轉子轉速及傳動比，不跟「RPM / 紅線」改變。Turbo 則由排氣能量推動，有轉子慣性、流量能力與進氣容積形成的壓力遲滯。小／大渦輪的起壓門檻以代表引擎固定的額定功率轉速為基準，不會因使用者調高紅線就憑空延後。壓縮升溫與中冷後溫度會影響進氣密度；效率、熱損與轉子慣量仍是等效估算，未使用各款原廠壓縮機效率圖。發聲仍為連續程序合成音，尚無各代表車實錄樣本校準。

Coyote 第 1～3 代點火順序為 1-5-4-8-6-3-7-2，廠商資料列於 [Ford Performance 技術參考文件鏡像](https://device.report/m/b4699239da8adfa83c6773ce6111bf64ad0d487f9bf9ff17c99abf8238742ce9)。依該順序建立各銀行的非等距脈衝，避免十字曲軸 V8 被合成成左右銀行均勻交替的平面曲軸聲。整體曲軸點火仍每 90° 一次。

七缸選用 **Rotec R2800**。R3600 實際為九缸，不能拿其 3,600 cc、150 hp 數據套進七缸動畫。R2800 額定約 110 hp／3,700 曲軸 RPM，螺旋槳經 3:2 PSRU 後約 2,450 RPM；此處所有轉速顯示是曲軸轉速。原廠未發布完整扭力曲線，220 Nm 峰值與中間曲線是由額定功率估算。主／副連桿動畫保留定長連桿、旋轉關節及每缸 TDC 差異，仍是理想化運動學示意，沒有原廠幾何尺寸或螺旋槳氣動負載；網站車速及變速箱為地面負載示範。

壓縮升溫及耗功參考 [NASA Glenn](https://www.grc.nasa.gov/www/k-12/airplane/compth.html)；BOV 收油後由歧管真空保持洩壓的作動參考 [Garrett](https://www.garrettmotion.com/knowledge-center-category/racing-and-performance/what-is-the-difference-between-a-wastegate-and-a-blow-off-valve/)。Roots／TVS 四葉轉子與低轉供氣特性參考 [Eaton TVS](https://www.eaton.com/gb/en-gb/catalog/engine-solutions/tvs-r2300.html)。音效和簡化流量模型的係數是推估，不是這些廠商產品的實測重建。

## VTEC、ECU、水平對臥與轉子

VTEC 參考 [Honda 的低／高凸輪作動說明](https://global.honda/en/tech/engine/car/B16A_integra_vtec/)；不將該 B16A 的切換轉速套用到其他引擎。FD2 K20A 原廠文件明列 5,800 RPM 切換、8,400 RPM 上限。F20C 的 9,000 RPM 上限有原廠依據，6,000 RPM 切換點是估算。模型假設暖機完成、油壓足夠，以 RPM、負載和回落遲滯切換，約 45 ms 混合升程／作用角；沒有油溫、油壓或完整 VTC 相位控制圖。

原廠扭力錨點已包含高凸輪。啟用 VTEC 後，高轉恢復原廠曲線；停用時才降低高轉充氣，不能在原廠峰值上再乘一次 VTEC 馬力加成。氣門模型使用估算的高凸輪升程及較長作用角／重疊，動畫與物理共用；進氣共鳴與燃燒前緣跟隨接合比例。這些不是原廠凸輪尺寸與逐缸缸壓測量。

ECU 限轉參考 [MaxxECU 限轉控制範圍、切斷種類及逐缸說明](https://www.maxxecu.com/webhelp/settings-limits-rev_limit.html)。柔和、硬切與逐缸模式在窄轉速範圍控制平均燃燒比例；硬切集中切斷，逐缸依事件交錯切斷。可調 8～32 Hz 及聲浪深度，沒有模擬特定 ECU 的完整 PI 控制或各代表車原廠切點聲。

Boxer 對向活塞使用分離的相反曲柄銷，不與 180° V 型引擎共用曲柄銷。EJ257 與 GT3 的點火、銀行與管路延遲分開配置；EJ257 的不等長路徑與 GT3 短路徑為音色估算，並非量測排氣歧管。

RENESIS 參考 [Mazda 2003 技術論文](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2003/2003_no003.pdf)。標示 1,308 cc 為 654 cc × 2 的名目排氣量；每轉子每輸出軸一轉燃燒一次，雙轉子每轉有兩次燃燒，進氣流量不能沿用四行程的每兩轉一次。轉子為輸出軸轉速的 1/3，每個面完整週期對應輸出軸 1,080°。使用獨立殼體、偏心軸、三腔與側面進排氣埠示意，沒有往復活塞或氣門。頂點軌跡符合理想外旋輪線，轉子仍以三角形示意；埠時序、燃燒壓力、摩擦與慣量是簡化估算，未重建原廠曲面或 CFD。
