# engine_sim

手機騎乘控制台，提供 Yamaha、Kawasaki、Aprilia、Ducati、Suzuki、Honda、BMW 共 84 組現售、歷代及上市前預覽車型。品牌下方可從「全部車款」直接選車，標示年式與市場。各車支援多指油門、煞車、撥片換檔和虛擬 AT。合成聲浪與 3D 剖面共用物理狀態，包含收油排氣回火和 H2／H2R 機械增壓聲。H2、Hayabusa 可在儀表下方模擬解除車速限速。

[Vercel 正式站](https://enginesim-ten.vercel.app/) · [M7 HTTPS Preview](https://engine-bb88cxk6b-choco-7242.vercel.app/)

模型以指定版本的原廠規格為基礎。跨市場傳動、近似斷油點與實測缺項列在來源。後輪採純滾動，車速納入煞車、滾阻與風阻。3D 幾何、聲浪、完整動力曲線及故障閾值採近似。 [車款清單](data/MODEL_CATALOG.csv) · [來源與模擬車速](docs/SOURCES.md)

## 本機啟動

使用 Node.js 24。在 `engine_sim` 根目錄執行下列命令，然後開啟 [本機控制台](http://localhost:3000)。Windows PowerShell 停用 npm 指令碼時，可改用 `npm.cmd`。

```sh
npm ci
npm run dev
```

## 驗證

GitHub Actions 在推送 `main` 或對 `main` 開啟 PR 時執行安裝、型別檢查、測試及正式建置。本機可用相同命令重現。

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## Vercel 預覽與上線

1. 在 Vercel 以 **Add New → Project** 匯入 GitHub 的 `engine_sim`。選用 Next.js、保留根目錄設定與預設建置指令，並在 **Settings → Build and Deployment** 確認 Node.js 為 `24.x`。
2. 用分支提出 PR，從 Vercel 檢查或 PR 中開啟 HTTPS Preview。以 iOS Safari 與 Android Chrome 真機檢查直橫屏、多指與放手、音訊解鎖、背景恢復及 3D。 [手機驗收清單](docs/MOBILE_QA.md)
3. 確認 CI 與手機 QA 後合併至 `main`。當 `main` 設為 Production Branch 時，Vercel 會觸發正式部署。 [Vercel GitHub 整合文件](https://vercel.com/docs/git/vercel-for-github) · [Vercel Node.js 版本文件](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

本機、GitHub、Vercel 與真機的驗證結果見 [開發進度](docs/PROGRESS.md)。
