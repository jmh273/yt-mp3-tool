## Why

「待下載選取清單」（前端 `useDownloadStore().selected`）目前**只活在記憶體裡**，沒有持久化（對照 `downloadedIds` 有寫 localStorage）。這造成兩個實際痛點：

- **情境 A — 選好還沒下載就重整/重啟 → 選取全沒**：使用者挑了數十支影片準備下載，這時瀏覽器重整、不小心關分頁、或後端重啟，`selected[]` 整個消失，必須重挑。與網路無關，最常踩。
- **情境 B — 下載到一半網路斷、部分失敗 → 想重試卻不知道在重試什麼**：每支影片獨立 try/except，失敗的會**留在 `selected[]`**（這已是隱性重試機制：再按一次下載即只重試失敗那幾支）。但 (1) 下載結束後進度清單被 `v-if="download.downloading"` 藏起來，使用者只看到「Y 支失敗」的數字、**看不出是哪幾支**；(2) 因為 `selected[]` 不落地，一旦重整這條重試路徑就斷了。

本 change 只做「最小、最高 CP」的一層（Level 1）：**讓選取清單與失敗可見性在中斷後仍存活**，把既有的隱性重試變成可靠、看得懂的重試。**不**碰後端任務狀態落地、SSE 重連、續傳 `.part` 或序號續編——那些屬於 Level 2/3，明確排除在外。

## What Changes

- **前端持久化 `selected[]`**：`useDownloadStore` 初始化時從 localStorage（鍵 `yt_mp3_selected`）載入；之後選取的任何變動（`toggle` / `push` / `clearAll` / `markAsDownloaded` 的移除）都同步寫回。載入失敗（JSON 損毀）時無聲忽略，與 `downloadedIds` 的處理一致。
- **下載結束後保留進度清單並標示失敗**：`SelectedVideos.vue` 的進度清單不再於 `download.downloading` 轉 false 時消失；任務結束後仍顯示，失敗項以紅字/error 樣式標出，讓使用者一眼看出哪幾支要重試。重試方式沿用既有路徑——失敗項仍在 `selected[]`，再按「下載選取影片」即只重試它們（不新增後端 API）。
- **清除時一併清掉殘留進度顯示**：`clearAll()` 除了清空 `selected[]`，也清空 `progress` 顯示，避免上一輪的紅字殘留誤導。
- **還原的選取要看得到、管得到**：`SelectedVideos.vue` 在「已選取 N 支」之外，逐列列出每支已選影片標題並提供逐筆 ✕ 移除（下載中停用）；`HomeView.vue` 進入時一律把主畫面預設開在「最新影片」頁並自動載入，讓使用者一進來就有內容、還原的選取也不再「只剩數字、看不到影片」。

## Capabilities

### New Capabilities
- `download-resume`: 讓「待下載選取」與「下載失敗狀態」在頁面重整/重啟後仍可續——選取清單持久化於 localStorage、下載結束後失敗項仍可見並可沿用既有流程一鍵重試。

### Modified Capabilities
<!-- 不修改既有主 specs。concurrent-downloads 的「部分失敗不阻擋其他影片 / 全部結束才 done」語意維持不變，本 change 僅在其之上補前端持久化與失敗可見性。 -->

## Impact

- **前端 store**：`frontend/src/stores/download.ts`（`selected` 載入 + 持久化 watch；`clearAll` 一併清 `progress`）。
- **前端 UI**：`frontend/src/components/SelectedVideos.vue`（進度清單顯示條件由 `download.downloading` 改為「下載中或有進度資料」；失敗項樣式；結束後可見；新增已選影片標題清單＋逐筆移除）、`frontend/src/views/HomeView.vue`（`activeView` 進入時一律預設為 `latest`）。
- **測試**：`frontend/src/tests/`（store 持久化 round-trip、SelectedVideos 結束後失敗可見）；`frontend/e2e/verify-resilient-download-resume.ts`（Playwright 驗證腳本，由驗證者撰寫並執行）。
- **不影響**：`backend/main.py`（無後端改動）、`POST /download` payload、SSE 結構、序號邏輯、auto-pipeline。

## Out of Scope（明確排除，屬 Level 2/3）

- 後端 `download_progress` 落地 / 後端重啟後可重新 attach 任務（情境 C）。
- SSE 斷線自動重連、`task not found` 後的 UI 復原。
- 重試時沿用原序號、清理上一輪殘留的 `.part` 孤兒檔。
- 持久化「下載進度」本身（progress 仍為 session 內暫態；跨重整以 `selected[]` 作為「還要下載什麼」的唯一可靠來源）。
