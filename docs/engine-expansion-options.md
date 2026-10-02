# 引擎架構擴充選項

討論日期：2026-10-02。下列是可實作方向，**不是已加入網站的引擎清單**。現有 20 款代表引擎涵蓋直列、V、現代 W16、七缸星型、Boxer 4／6、雙轉子及 Honda VTEC。

## 適合分批加入

| 批次 | 類型與候選原型 | 主要新增工作 |
|---|---|---|
| 第一批 | I5（Audi RS3）、V4（Aprilia RSV4）、Boxer 2（BMW R 系列） | 延伸現有往復式機械模型，依指定車型查曲軸銷、點火順序、扭力、質量及齒比，分別校準脈衝與銀行排氣。 |
| 第二批 | VR6（Golf R32）、W12（Bentley）、四轉子（Mazda 787B） | VR6 的狹角交錯與單缸蓋；現代 W12 的四列汽缸／兩組狹角銀行；四轉子的相位、流量與四腔組聲源。賽車傳動及怠速不能沿用 RX-8。 |
| 特殊模型 | I8、V16、180° V12、傳統三排 W、多排星型 14／18／28 缸 | 長曲軸、共銷與獨立銷幾何區分、三銀行／多排連桿及點火；不同用途另選負載模型。 |
| 獨立模型 | H16、對向活塞／Deltic | 多曲軸及齒輪耦合；同缸兩活塞的容積、相位與二行程換氣。不能把現有四行程單活塞動畫旋轉複製後就當完成。 |

全部可以建立可互動的網頁示意。接近實車的版本仍要各自有可信規格、曲軸與點火資料、傳動或螺旋槳負載，以及聲音參考；缺少資料時須標示估算。航空引擎接汽車變速箱只能叫地面負載示範。

## 原資料的三項校正

1. Boxer 的往復慣性合力可抵消，但氣缸軸線錯位可能留下搖擺力偶，不能將 Boxer 2／4／6 都稱為完全無振動。BMW 的 R1200GS 原廠資料明列此原因與平衡軸。[BMW 技術資料，p.5～6](https://www.press.bmwgroup.com/usa/article/attachment/T0018398EN_US/36273)
2. V 型夾角、曲柄銷、連桿排列及點火順序要一起考慮。`720° ÷ 缸數` 是四行程均勻點火的事件間隔，並不能單獨決定夾角。Audi R8 的 5.2 V10 使用 common-pin，54°／90° 交替點火；不能概括成全部 90° V10 都靠 split-pin 形成均勻 72°。[Audi 原廠 R8 技術資料](https://uploads.audi-mediacenter.com/system/production/uploaded_files/366/file/d9f72d4b92b263acccf5dcec5fce345deeb5295b/eBasisinformation_R8.pdf?1484227032=&disposition=attachment)
3. Hot-V 短管路可改善增壓反應，仍有轉子慣性及進氣充填。Lamborghini 的 Hot-V Temerario 仍用電機補足 turbo lag，不能把 Hot-V 設為零遲滯。[Lamborghini 原廠媒體資料](https://preview.thenewsmarket.com/Previews/lamb/DocumentAssets/674578.pdf)

聲音使用程序合成；數值連續與點火節奏正確，只是驗證的一部分，仍需比較實際聽感。新增型號應逐款驗證，再納入全油門、換檔、限轉、煞停、二次起步與手機操作的回歸。
