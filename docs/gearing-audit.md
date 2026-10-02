# 20 款傳動資料查核

查核日期：2026-10-03。車型以 `EngineConfigurations.js` 的代表車／市場／年份為準，傳動以 `VehicleProfiles.js` 為準。AMT／AT 是網站的操作模式，不表示每台代表實車都有液力自排；原型的手排、單離合 AMT、DCT 分類仍保留。

## 查核結果與本次修正

多數前進檔、一次減速與終傳可以對上廠商資料，不應整批調成同樣的起步速度或升檔掉轉量。

- **Mustang 選配混搭已統一**：原先 2019 GT 6MT 齒比搭配 275/40R19 Performance Package 後胎，卻選 3.55 終傳。改為明確的 **2019 美規 GT Performance Package 6MT、3.73 TORSEN**。3.55 本身是合法選配，問題是沒有標示選配／輪胎來源的混搭。Ford 2019 表列 6MT 基礎整備質量 3,743 lb，故換成約 1,697.8 kg；Performance Package 額外配備重量未公開，本模型不聲稱其質量逐項重建。[Ford 2019 原廠技術表 p.2、p.4，廠商文件鏡像](https://www.mustang6g.com/forums/attachments/2019-mustang-techspecs-pdf.576698/)
- **Supra 的來源年份已修正**：原 `New Car Features.pdf` 鏡像內容其實是 1997 更新資料；V160 前進檔和 3.133 終傳仍吻合，但不能當作 1993 原始文件。改引用 1993 美規原廠型錄的規格頁，齒比和輪胎數字不變。[Toyota 1993 美規型錄，廠商文件鏡像，PDF 第 16 頁](https://xr793.com/wp-content/uploads/2024/12/1993-Toyota-Supra.pdf)
- **S2000 沒有漏算或多算一次減速**：Honda 明列一次／二次減速 1.160／4.100，不能只留下常見資料庫的 4.100。[Honda 1999 日規資料](https://www.honda.co.jp/factbook/auto/s2000/199904/050.html)
- **STI 的二檔 2.235 保留**：這是 2016 美國版的官方數據；不能混入其他年份或日本版的 2.375。來源換成可讀取的 Subaru 官方儲存鏡像。[Subaru 2016 美規資料](https://s3.amazonaws.com/subarumedia.iconicweb.com/mediasite/specs/2016_Subaru_WRX_STI_specs.pdf)
- **Chiron 仍屬等效總減速**：官方公布的是 6,700 RPM 各檔 90／150／200／260／320／390／420 km/h，由它們和模型輪胎半徑反推總減速；`finalDrive = 1` 是正規化，不是原廠差速器 1:1。倒檔使用一檔等效幅值，已加獨立估算標記。[Bugatti 技術表](https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf)
- **未直接證實的倒檔分開標示**：RX-8 倒檔引用同代 2008 表；Mustang 3.32 倒檔保留為未重新取得該年 D4 原廠表的參考值。它們不影響以下前進檔查核。

Ninja 400 的 Czech 2019 網頁同時出現舊式 37 mm 前叉、290 mm 前碟和 172／174 kg，與同代原廠 EU 型錄不一致。前進齒比能與廠商手冊相互核對；質量保留 EU 同代型錄的 168 kg，並增加獨立重量來源。[Kawasaki 2018 EU 型錄](https://storage.kawasaki.eu/repository/Global%20Repository/Brochures/MY18/18MY_Ninja_supersport-_sport_brochure.pdf)、[Kawasaki 2020 法國型錄](https://storage.kawasaki.eu/repository/fr/fr-FR/Brochures_2020_/Full_Line-2020-FR-FR_PDF2.pdf)

## 車型、傳動與輪胎對照

輪胎欄是驅動後胎；四驅車使用後軸等效減速。輪胎外徑依標示尺寸計算，有效滾動半徑另乘 **0.98**，這個修正係數是模擬估算，沒有逐款載重半徑、胎壓或高速膨脹量測。表列的廠商車主手冊／型錄即使由鏡像保存，內容仍是製造商原始文件；不把鏡像站的自動摘要當作技術依據。

| ID | 實車基準與變速箱 | 一次／前段減速 × 終傳 | 後胎 | 前進檔審核與來源 |
|---|---|---|---|---|
| i1 | 2016 KTM 690 Duke，6 檔常嚙合手排 | 79/36 × 40/16 | 160/60R17 | 6 檔齒數比吻合 [KTM 原廠手冊，鏡像 p.174–175、181–182](https://manualzz.com/doc/59289224/ktm-690-duke-2016-owner-manual)；163 kg 為含燃油估算 |
| i2_180 | 2019 Kawasaki Ninja 400 EU，6 檔手排 | 71/32 × 41/14 | 150/60R17 | 6 檔、一次與終傳吻合 [Kawasaki 規格](https://www.kawasaki.cz/cs/products/Supersport___Sport/2019/Ninja_400/specifications?Uid=08AEXlgLWV5bDA0LWlFeXA1RXVBQXQoLUQ0LUApdX1xQClA)；重量另見上文 |
| i2_270 | 2022 Yamaha YZF-R7 EU，6 檔手排 | 77/40 × 42/16 | 180/55R17 | 6 檔比值與後胎吻合 [Yamaha 同代原廠型錄，PDF p.2](https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_yzf-r7_WGP60th_2021.pdf) |
| v2_90 | 2020 Ducati Panigale V2 955，6 檔 DQS 手排 | 1.77 × 43/15 | 180/60R17 | 全部吻合 [Ducati 2020 原廠規格](https://www.ducati.com/th/th/bikes/panigale-v2-2020)；不混用新版 890 cc V2 |
| i3 | 2021 Yamaha MT-09 EU，6 檔手排 | 79/47 × 45/16 | 180/55R17 | 同代日本版傳動與後胎吻合 [Yamaha 2021 原廠發表](https://global.yamaha-motor.com/jp/news/2021/0622/mt-09.html)；動力仍用 EU 基準 |
| i4_flat | 2017 Honda CBR1000RR SC77，6 檔手排 | 1.717 × 43/16 | 190/50R17 | 6 檔／一次／終傳吻合 [Honda 2017 原廠規格](https://global.honda/jp/news/2017/2170316-cbr1000rr.html) |
| i4_cross | 2020 Yamaha YZF-R1 EU，6 檔手排 | 67/41 × 41/16 | 190/55R17 | 同代齒數比與後胎吻合 [Yamaha 原廠型錄，PDF p.2](https://www.yamaha-motor.co.jp/mc/lineup/pdf/Catalog_YZF-R1_WGP60th_2021.pdf) |
| i6 | 1993 Toyota Supra Turbo US，Getrag V160 6MT | 1 × 3.133 | 255/40R17 | 6 檔／終傳／後胎吻合 [Toyota 1993 原廠型錄鏡像，PDF p.16](https://xr793.com/wp-content/uploads/2024/12/1993-Toyota-Supra.pdf)；不能套 4AT 或日本後期 V161 |
| v6 | 2017 Nissan GT-R Premium US，6 檔 DCT | 1 × 3.700，後軸 | 285/35R20 | 6 檔、後終傳與後胎吻合 [Nissan 2017 原廠規格](https://usa.nissannews.com/en-US/releases/us-2017-nissan-gt-r-press-kit)；前軸 2.937 不另乘進後軸 |
| v8_cross | 2019 Mustang GT US Performance Package，MT82-D4 6MT | 1 × **3.73** | 275/40R19 | 修正為一致選配；6 檔比值不變 [Ford 2019 原廠表鏡像，PDF p.2、p.4](https://www.mustang6g.com/forums/attachments/2019-mustang-techspecs-pdf.576698/) |
| v8_flat | 2010 Ferrari 458 Italia，7 檔 DCT | 1 × 5.143 | 295/35R20 | 7 檔／終傳吻合 [Ferrari 車主手冊鏡像 p.27](https://www.manualslib.com/manual/900232/Ferrari-458-Italia.html?page=27)、[後胎 p.28](https://www.manualslib.com/manual/900232/Ferrari-458-Italia.html?page=28) |
| v10 | 2012 Lexus LFA，6 檔單離合 ASG／AMT | **1.259** × 3.417 | 305/30R20 | 6 檔與 counter reduction 吻合 [Lexus 原廠資料](https://media.lexus.co.uk/lexus-lfa/)；1.259 不能遺漏 |
| v12 | 2012 Aventador LP700-4，7 檔單離合 ISR／AMT | **47/38** × 43/15 | 335/30R20 | 7 檔與 drop gear 吻合 [Dana／Graziano 原廠供應商規格](https://www.dana.com/globalassets/resource-library/light-vehicle/spec-sheets/dana-specsheet-longitudinaltransmission.pdf)；後胎及原廠乾重 1,575 kg 見 [Lamborghini 首發技術表鏡像，PDF p.2、p.4](https://www.autoblog.gr/wp-content/uploads/2011/02/lamborghini_aventador_lp_700-4_-_technical_data.pdf)；1,675 kg 運轉質量是估算 |
| w16 | 2016 Bugatti Chiron，7 檔 DCT | 等效總減速，前段／終傳正規化為 1 | 355/25R21 | 由官方各檔速度換算 [Bugatti 原廠資料](https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf)，不是已取得齒數比 |
| radial_7 | Rotec R2800，**實驗地面負載** | 1 × 2.4 示範 | 半徑 0.35 m 示範 | 6 檔沒有實車／航空齒比依據；[Rotec](https://www.rotecaerosport.com/r2800) 真正傳動為 3:2 PSRU 至螺旋槳 |
| honda_f20c | 1999 Honda S2000 AP1 JDM，6MT | **1.160** × 4.100 | 225/50R16 | 6 檔、一次／二次減速與後胎全吻合 [Honda 原廠資料](https://www.honda.co.jp/factbook/auto/s2000/199904/050.html) |
| honda_k20a | 2007 Civic Type R FD2 JDM，6MT | 1 × 5.062 | 225/40R18 | 6 檔／終傳／後胎吻合 [Honda FD2 原廠規格](https://www.honda.co.jp/factbook/auto/CIVIC_TYPE_R/200703/07.html) |
| boxer4 | 2016 Subaru WRX STI US，6MT | 1 × 3.900 | 245/40R18 | 6 檔、終傳、後胎吻合 [Subaru 官方規格](https://s3.amazonaws.com/subarumedia.iconicweb.com/mediasite/specs/2016_Subaru_WRX_STI_specs.pdf) |
| boxer6 | 2025 Porsche 911 GT3 992.2 EU，6MT | 1 × 4.300 | 315/30R21 | 6 檔、終傳、後胎吻合 [Porsche 992.2 手排表](https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr:46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf)；不能套 992.1 或 PDK 終傳 |
| rotary_2 | 2004 Mazda RX-8 US 高功率 RENESIS，6MT | 1 × 4.440 | 225/45R18 | 6 檔、終傳、後胎吻合 [Mazda 2004 原廠表](https://news.mazdausa.com/download/RX-8-Spec-Sheet-Final.pdf)；不是 4AT 或後期 R3 |

## 每檔理論輪速與一升二轉速

計算使用網站的預設曲軸紅線。部分紅線仍是模擬設定，不能把下表 RPM 全部稱作 OEM 斷油點。公式為：

`速度 km/h = RPM × 2π × 有效滾動半徑 m × 3.6 ÷ (60 × 一次減速 × 終傳 × 該檔齒比)`

`換檔接合後 RPM = 換檔前 RPM × 下一檔齒比 ÷ 原檔齒比`

第二式假設接合前後車速不變、離合器接合完成、輪胎不打滑。換檔期間的短暫卸載轉速／同步過程另外由物理模型控制，不能拿它改寫最終齒比關係。

以下速度單位均為 **km/h**；末欄為該車一檔到預設紅線後，接合二檔的理論 RPM 和下降比例。

| ID | 預設紅線 RPM | 1 檔 | 2 檔 | 3 檔 | 4 檔 | 5 檔 | 6 檔 | 7 檔 | 1→2 RPM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| i1 | 9000 | 75.6 | 108.0 | 141.8 | 172.6 | 197.6 | 217.4 | — | 6300（−30.0%） |
| i2_180 | 12000 | 71.3 | 101.5 | 128.9 | 156.5 | 180.9 | 201.3 | — | 8423（−29.8%） |
| i2_270 | 10000 | 80.9 | 108.3 | 141.2 | 177.1 | 211.2 | 238.8 | — | 7467（−25.3%） |
| v2_90 | 11500 | 110.0 | 144.6 | 180.8 | 217.0 | 248.6 | 283.0 | — | 8742（−24.0%） |
| i3 | 11000 | 105.3 | 139.0 | 167.2 | 196.2 | 227.5 | 261.0 | — | 8330（−24.3%） |
| i4_flat | 14000 | 152.5 | 196.1 | 232.3 | 261.4 | 287.1 | 306.5 | — | 10888（−22.2%） |
| i4_cross | 14000 | 152.2 | 181.8 | 214.8 | 250.6 | 286.6 | 316.6 | — | 11719（−16.3%） |
| i6 | 6800 | 66.6 | 108.0 | 151.3 | 194.3 | 254.9 | 321.5 | — | 4193（−38.3%） |
| v6 | 7100 | 61.8 | 109.0 | 157.2 | 201.0 | 250.5 | 315.1 | — | 4028（−43.3%） |
| v8_cross | 7500 | 80.6 | 124.0 | 183.5 | 261.0 | 320.6 | 419.6 | — | 4875（−35.0%） |
| v8_flat | 9000 | 75.1 | 105.7 | 142.0 | 179.6 | 224.7 | 275.3 | 333.3 | 6391（−29.0%） |
| v10 | 9000 | 82.6 | 122.0 | 166.0 | 216.6 | 275.3 | 335.9 | — | 6095（−32.3%） |
| v12 | 8500 | 80.3 | 128.8 | 173.5 | 215.3 | 264.9 | 324.8 | 372.1 | 5300（−37.6%） |
| w16 | 7100 | 95.4 | 159.0 | 211.9 | 275.5 | 339.1 | 413.3 | 445.1 | 4260（−40.0%） |
| radial_7 | 3700 | 84.8 | 110.0 | 140.3 | 176.9 | 214.1 | 271.2 | — | 2852（−22.9%） |
| honda_f20c | 9000 | 70.4 | 107.9 | 149.0 | 190.1 | 227.5 | 272.5 | — | 5875（−34.7%） |
| honda_k20a | 8400 | 59.8 | 91.7 | 128.8 | 170.3 | 212.1 | 264.7 | — | 5478（−34.8%） |
| boxer4 | 6700 | 57.0 | 92.7 | 136.3 | 182.3 | 213.5 | 274.2 | — | 4118（−38.5%） |
| boxer6 | 9000 | 74.5 | 117.4 | 162.4 | 208.4 | 258.6 | 317.4 | — | 5712（−36.5%） |
| rotary_2 | 9000 | 65.7 | 108.8 | 149.7 | 207.6 | 247.0 | 294.1 | — | 5434（−39.6%） |

**這些數字不是可達尾速。** 例如 Mustang 六檔是高超比檔，原廠功率不足以在六檔紅線推到 419.6 km/h；GT3 的理論 317.4 也不等於原廠公布的 313。尾速必須另外解輪上功率與風阻／滾阻平衡，且要區分實車的電子車速限制。Chiron 官方道路限制 420 km/h，不能把模型 7,100 RPM 推導的 445.1 當原廠尾速。[Ford 原廠限速](https://www.mustang6g.com/forums/attachments/2019-mustang-techspecs-pdf.576698/)、[Porsche 原廠性能表](https://pnr-prd2-pub2.newsroom.porsche.com/dam/jcr:46cb0e24-ad5a-489c-a404-52c678071d03/pag-911-gt3-mt-en.pdf)、[Bugatti 原廠限速](https://bugatti-newsroom.imgix.net/66703700d9bf8f4b7ce9211c/211122_BU_Chiron%20ENG.pdf)

R1 原廠一／二檔為 2.600／2.176，10,000 RPM 升二檔應接到約 **8,371 RPM**；Supra V160 則約 **6,167 RPM**。先前 10,000→約 6,140 不能當成所有車或 R1 的共同驗收值。

## 排氣量改裝與自動換檔審核建議

查核當下，引擎模型的扭力確實依 `displacement / defaultDisplacement` 改變，慣量也會變。**排氣量提高但紅線、輪胎與齒比不變，各檔的紅線車速不會改變**；改裝應首先表現在負載加速、同轉速的扭力與功率，以及風阻下的可達速度。無負載拉轉可能因增大的慣量而不是等比例變快。

查核起點的 AT 全油門升檔門檻是 `idleRPM + (redlineRPM − idleRPM) × 0.96`，沒有使用實際改裝後曲線。合理的整合方向是比較當前檔與下一檔在**相同車速**的可用輪上牽引力；下一檔轉速按齒比計算，再納入增壓狀態、換檔耗時與接合負載。加上最短持檔時間和升降檔遲滯，並以紅線作最終上限。低油門仍應使用舒適／經濟換檔策略。

不能為了放大 CC 改裝感受擅改 OEM 齒比、強行提高紅線或取消抓地上限。驗證需比較同車、同排氣管／增壓／車重的原廠和增排氣量設定：功率／扭力、已接合中間檔的加速時間、AMT 齒比接合 RPM、AT 各檔換檔點，以及長時間尾速。起步若已受輪胎抓地限制，CC 增加對 0–100 的收益會較小，應另比較中段加速。

本文件的資料測試與物理整合測試分開：`tests/reference-data.test.js` 鎖定代表車的齒比、選配與物理換算；最終 AT／AMT 動態結果由主整合任務測試，這裡不填未完成的性能驗證數字。
