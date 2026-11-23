# engine_sim

手機騎乘控制台，提供 Yamaha R15、R3、R6 RACE、R7、R9 和 R1。車型選擇區標示年式與市場。六款車共用固定步長物理核心，支援多指油門、煞車、撥片換檔、虛擬 AT、合成聲浪和互動 3D 剖面。儀表會顯示上次進退檔前後的 RPM。點按「啟用聲音」後可調整音量，瀏覽器會記住設定。

[Vercel 正式站](https://enginesim-ten.vercel.app/) · [M7 HTTPS Preview](https://engine-bb88cxk6b-choco-7242.vercel.app/)

模型以原廠齒比與動力錨點為基礎，部分傳動比與紅區引用其他市場或年式。完整動力曲線、實際斷油點和 VVA 切換條件仍待核對。輪胎滑移與故障參數是近似值，3D 外觀與合成聲浪為示意。 [來源與資料等級](docs/SOURCES.md)

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
