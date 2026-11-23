# Codex 工作規範 — engine_sim

> 本檔內容只針對此 GitHub 儲存庫。若原專案已有 AGENTS.md，請人工合併，不要覆蓋。保持精簡，以減少每次讀取成本。

1. **專案名稱永遠使用 `engine_sim`**，勿自行改成 engine-atlas、engine_sim 等。
2. 核心產品是**手機網頁上的互動式真實摩托車引擎／換檔／聲浪模擬**。先做 Yamaha R15 + R3；其餘 Yamaha 與 Kawasaki 是未來路線圖。
3. **一次只執行一個里程碑**（`docs/ROADMAP.md`），只閱讀直接相關的檔案，不主動展開後續工作；除非明確要求，不進行專案重構或長篇規劃。
4. **音訊、3D、儀表都讀取同一物理狀態**。任何機械／聲音真實性宣稱必須有來源；未知標示 `unknown`、近似或示意。
5. 手動：六速 `1-N-2-3-4-5-6` + `+/-` 撥片，不設實體離合 UI，內部需模擬傳動耦合及離合滑差。MT 的危險退檔**可機械超轉**；AT 需預測並保護。
6. 煞車、油門、負載、齒比、輪速、RPM 與換檔聲音必須相互一致。限轉器可斷油，但**不能物理上攔截後輪反拖的 RPM**。
7. R15 單缸 VVA；R3 180° 並列雙缸；後期 R7 270°、R1 crossplane、H2/H2R **機械增壓音**等個別邏輯必須保留。
8. 手機優先：真機 iOS Safari、Android Chrome 為驗收目標，支援多點觸控、放手即回彈、音訊首次點擊啟動，音量須安全。
9. 先查現有專案再修改。優先局部更動、少用子代理、少重複讀檔、只跑當前必要測試；最後**不超過 12 行**摘要及更新 `docs/PROGRESS.md`。
10. 開發期間維護測試、來源資料、工作紀錄與 `README`；無 GitHub/Vercel 權限不得宣稱已推送／已部署。無授權素材不可使用。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
