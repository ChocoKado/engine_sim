# engine_sim

手機騎乘控制台，提供台灣 2026 年式 Yamaha YZF-R15 與 YZF-R3。兩款車使用固定步長物理核心，支援多指油門、煞車、撥片換檔、虛擬 AT、合成聲浪和互動 3D 剖面。首次播放聲音需點按「啟用聲音」。

模型採用已核對的原廠六檔齒比與動力錨點。台規初級與終傳比、完整動力曲線、實際斷油點和 VVA 切換條件仍待核對。輪胎滑移與故障參數是近似值，3D 外觀與合成聲浪為示意。 [來源與資料等級](docs/SOURCES.md)

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
