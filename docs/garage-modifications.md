# 車庫、可見改裝與動力模型

更新：2026-10-08。

車庫把完整引擎觀察、改裝選擇與駕駛操作放在同一畫面。中央保留即時檔位、時速、RPM 與引擎；下方保留原油門、煞車、AT／AMT 控制。桌面兩側的資料獨立捲動，手機在下方面板切換「車庫／設定／聲浪／性能」，不以長頁面把踏板與引擎分開。

所有既有控制項由 `GaragePanel` 移動原 DOM 節點，保留 ID 與事件。完整 3D 和既有機械剖面可以切換；3D 初始化失敗時保留可操作的剖面。硬體改裝需先停車且熄火，運轉中仍可觀察零件與位置。切換實車基準時恢復原廠零件；改變增壓類型時清除不相容的配件，避免不可見的改裝仍暗中影響數值。

手機的完整 3D 模式把空間留給模型，慢動作控制在「機械剖面」中操作，選定速度仍會同步給 3D 動畫；RPM、動力與聲音維持即時。慢動作不是改引擎實際運轉速度。

## 六項改裝

| 零件與配置 | 安裝位置／外觀 | 模型應改變的量 | 使用取捨與限制 |
| --- | --- | --- | --- |
| 高流量冷進氣 `intake: sport` | 空濾、進氣管、節氣門上游；Turbo 在壓縮機入口之前 | 高流量時的進氣限制、充填反應與進氣聲。低轉效果小，避免全轉速固定加馬力 | 本輪為密閉冷進氣估算；未模擬髒濾芯、熱車艙進氣或逐車實測壓降。來源：[K&N 測試程序](https://www.knfilters.com/efficiency_testing_procedure.htm)、[指定車款的動力測試方法](https://www.knfilters.com/powertesting.htm)。 |
| 調諧排氣集管 `headers: tuned` | 排氣口到集管，與既有尾段設定分開；Turbo 顯示「低阻渦輪集管」 | 轉速相關的流動／掃氣效果與扭力分布；Turbo 不沿用自然進氣長管的安裝描述 | 長度、直徑、集管與氣門重疊共同決定波動調諧，不能用「越粗、背壓越低就全域更強」。本輪以曲線修正近似，未解一維非定常氣流。來源：[Burns Stainless 頭段調諧](https://burnsstainless.com/blogs/articles-1/exhaust-header-theory)。 |
| 街道運動凸輪 `camshaft: sport` | 活塞引擎配氣機構；觀察時打開氣門蓋 | 高轉充氣能力、低轉扭力取捨、氣門運動。原廠 VTEC 高低凸輪效果不能再重複加成 | 轉子沒有活塞式氣門凸輪；星型使用不同機構，本輪不提供此套件。取捨不能只靠改怠速音效冒充配氣變更。來源：[COMP Cams 正時／LSA](https://www.compcams.com/cam-timing-lobe-separation-angle/)、[Honda VTEC 原理](https://global.honda/en/tech/engine/car/B16A_integra_vtec/)。 |
| 輕量飛輪 `flywheel: light` | 曲軸輸出端、離合器側；實車通常在外殼內，觀察需打開罩殼 | 可替換旋轉元件的慣量，透過 `α = 淨扭力 / 慣量` 影響空檔拉轉、收油回落與換檔同步；不增加穩態引擎功率 | 減少儲能，低速負載變化更敏感。機車與星型示意的是該架構的有效旋轉負載，並非可直接購買的通用汽車飛輪。來源：[Tilton 元件 MOI](https://tiltonracing.com/product/flywheels/)、[Fidanza 設計取捨](https://fidanzaperformance.com/pages/aluminum-flywheels)。 |
| 高效率增壓冷卻 `intercooler: upgraded` | 壓縮機出口與進氣歧管之間，含核心與管路 | 增壓後進氣溫度、密度與充氣容積；輸出與建壓反應一起變化 | 只適用 Turbo／Supercharger。本輪未建立實車散熱器尺寸、車速冷卻、壓降及熱浸完整模型；較大核心不能無條件視為更快。來源：[Garrett 熱交換與壓降](https://www.garrettmotion.com/news/newsroom/article/garrett-intercooler-core-technology/)、[系統氣流路徑](https://www.garrettmotion.com/news/newsroom/article/garrett-performance-intercoolers-heat-transfer-and-selecting-the-correct-core/)。 |
| 機械增壓增速輪 `pulley: overdrive` | 曲軸至 Roots／TVS 的皮帶、增壓器輸入皮帶輪 | 真實傳動倍率；轉子供氣、轉速同步尖叫、壓縮熱與曲軸耗功必須一起改變 | 本輪增速倍率 ×1.10 為示意套件，未宣稱任何 Hellcat 車款可直接安裝。Turbo 由排氣驅動，不適用皮帶輪。轉子速限需匹配指定增壓器，不能把所有 TVS 當同一型號。來源：[Eaton R2650 公開特性與轉速／效率圖](https://www.eaton.com/gb/en-gb/catalog/engine-solutions/tvs-r2650.html)。 |

上述原始資料支持作用方向、配置與取捨，不是此網站六件虛擬套件的逐車馬力實測。進氣、頭段與凸輪先以保守、隨 RPM 改變的曲線近似；冷卻與皮帶輪使用增壓模型的參數；飛輪使用慣量參數。全部原廠選項應維持既有實車基準中性，不額外加成。加速成績還受整車質量、抓地力、齒比、空氣阻力與操作者換檔影響，不能承諾每個零件都縮短所有測試。

Tilton 公開表中的 K20／K24 賽車飛輪 MOI 為 102 lb·in²，換算約 0.02985 kg·m²；這是特定 7.25 吋離合器搭配的零件數據，不是 FD2 原廠整顆引擎慣量。質量或整機慣量不能直接當作零件慣量。未取得指定車款完整元件數據前，網站的慣量數字仍屬校準估算。[Tilton 規格表](https://tiltonracing.com/product/flywheels/)

## 完整引擎的可見範圍與架構差異

3D 裝配的範圍是引擎本體與必要的可見周邊：缸體／曲軸箱、缸頭、氣門蓋或轉子殼、油底殼／潤滑系統、正時與前端罩殼、進氣空濾／管路／歧管、排氣頭段／集管、點火、起動機／發電機、曲軸皮帶輪，以及所選增壓系統。內部件用開罩觀察，不把通常藏在外殼內的飛輪或凸輪放在引擎外面。這是依架構程序建立的教學裝配，與具有精確車款外形、螺栓位置及管線的原廠 CAD 不同。

直列、V、水平對臥與 W 的汽缸頭和進排氣連接位置不同；不能只在同一裸露活塞模型上改缸數。增壓改裝需增加可追蹤的進氣管路、渦輪熱端／冷端或曲軸皮帶驅動。冷卻器在 Turbo 和水冷 Roots 套件上可能有不同封裝，本輪外觀以系統裝配示意為主，不宣稱是各代表車款的量產原廠配置。

RENESIS 的外形應保留轉子殼、側殼、長歧管、進排氣口、前端附件與薄油底殼，不套用活塞缸頭和凸輪。Mazda 的原廠 S-DAIS 會隨 RPM 改變通路、進氣口開放與有效管長，說明進氣歧管不能簡化成全域固定馬力加成；本輪冷進氣配件沒有新增可調管長或完整 S-DAIS 動態模型。[Mazda 2003 RENESIS 技術文，Fig.2、10、13、20–22](https://www.mazda.com/content/dam/mazda/corporate/mazda-com/en/pdf/innovation/monozukuri/technology/tech-review/2003/2003_no002.pdf)

Rotec R2800 需呈現徑向缸體、散熱鰭片、推桿配氣、集氣／排氣環、起動與發電附件、油路，以及螺旋槳減速輸出；不能配一個通用汽車水箱冒充空冷。原廠資料列出兩個推桿式頂置氣門、雙火星塞與 3:2 減速器；安裝手冊說明空冷與排氣集管環。本網站的星型行駛性能仍是地面展示負載，沒有模擬實際航空器與螺旋槳氣動。[Rotec R2800 規格](https://www.rotecaerosport.com/r2800)、[原廠安裝手冊](https://www.rotecaerosport.com/_files/ugd/ef523b_cad71e078ddf483195daf43a05a0b5f2.pdf)、[外形與尺寸圖入口](https://www.rotecaerosport.com/radial-documentation)

## 資料接口與驗證

`src/physics/Modifications.js` 是零件選項與相容性的單一來源，`GaragePanel` 不另外儲存馬力加成，也不自行改引擎數值。

```js
// MODIFICATION_CATALOG：六項 category，options 使用 value/label。
{ id, name, mount, purpose, tradeoff, options: [{ value, label }] }

// EngineModel 狀態，原廠皆為 stock。
engine.modifications = {
  intake: 'stock', headers: 'stock', camshaft: 'stock',
  flywheel: 'stock', intercooler: 'stock', pulley: 'stock'
};

isModificationSupported(engine.config, engine.forcedInduction, kind);
engine.setModification(kind, value);

// App 執行物理更新，再同步 dyno/聲音/renderer/性能測試設定。
new GaragePanel({
  engine, drive,
  onModificationChange(kind, value) { /* 安裝／拒絕：實際狀態為準 */ },
  onViewChange({ mode, focus, reset }) { /* 3d 或 cutaway、零件位置 */ }
}).init();
```

`GaragePanel.init()` 會建立 `#engine-3d-canvas`；App 在這之後建立 3D renderer。`update()` 同步零件狀態與安裝鎖定；`set3DAvailable(false, message)` 回到剖面。設定與測試成績應包含六項零件狀態，避免改裝後與原廠紀錄無法辨認，或在測試中途混合兩套物理設定。

`node --test tests/garage-ui.test.js` 的 6 項檢查已通過：原頁所有控制 ID 與事件保留、鍵盤分頁、停車熄火要求、等待／拒絕安裝、架構相容性、Turbo 集管描述及 2D fallback。這是 DOM 行為回歸，不能替代真實瀏覽器 3D、尺寸、觸控與聲音驗證；整合後的完整測試與視窗量測另外紀錄。

後續若要升級為指定實車配件資料，catalog 可增加 `fitment`、元件 `inertiaKgM2`、流量／壓降曲線、管長／截面、凸輪正時／揚程、冷卻核心效率／壓降／熱容量、皮帶輪實際直徑與轉子速限，以及 `sourceURL`／`dataKind`。同一組 resolved 參數需同時交給即時物理、dyno、聲音與 3D，避免零件只變顏色，或圖表與實際行駛使用不同效果。

## 3D 資產來源

本輪以專案自己的程序幾何建立裝配，研究時未下載或匯入外部引擎模型。原廠技術圖與照片作結構參考，不因此視為可自由再分發的 3D 模型或貼圖。

未來可補 CC0 或明確允許所需用途的 CC BY 資產，逐個保存作者、原始模型 URL、授權版本、修改紀錄與授權檔。CC BY 4.0 要求適當署名、授權連結與修改標示；素材有免費下載按鈕並不等於無署名、無限制。[Creative Commons BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Poly Haven 的模型、材質與 HDRI 採 CC0，可用於商業作品並再分發；其網站標誌、示例渲染和其他網站內容不包含在同一授權。可作環境與金屬材質來源，不能預先假設其庫中有符合所有二十款引擎的完整模型。[Poly Haven 素材授權](https://polyhaven.com/license)

若使用付費或 Editorial 模型，先確認其對 WebGL 交付與模型檔再分發的具體條款；未取得授權的模型不放進公開 repo 或部署。瀏覽器需要交付幾何資料，不能以「使用者只看到畫面」省略授權檢查。
