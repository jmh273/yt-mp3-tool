## Context

三個既有流程各自獨立、各有端點 + SSE 進度 + 右欄分頁 + Pinia store：
- **下載** `POST /download`（[main.py:2345](backend/main.py#L2345)）→ `run_download` 寫入 resolved 目錄（`_resolve_output_child`：日期子目錄或 target_dir）；回應目前僅 `task_id`。store [download.ts](frontend/src/stores/download.ts) 以 SSE 偵測 `status=done`。
- **正規化** `POST /normalize/start`（需 `directory` + `filenames`）；store [normalize.ts](frontend/src/stores/normalize.ts) 有 `loadDirectory(dir)` + `startBatch()`，SSE 偵測 done。mp3gain 僅支援 mp3。
- **Drive 上傳** `POST /drive/upload`（需 `directory`）；`run_drive_upload_batch` 以 `_local_mp3_files(dir)` 取檔（**目前僅 .mp3**），SSE 偵測 done。需 `drive.file` 授權與 Drive API 啟用。

三流程都以「資料夾」為單位。下載後的資料夾即正規化與上傳的對象。

## Goals / Non-Goals

**Goals:**
- 下載面板一個勾選框（預設關、持久化），勾選後下載完自動串接正規化（mp3）→ 上傳。
- 重用既有端點 / store / 進度面板，後端改動最小。
- mp4 跳過正規化但仍上傳；best-effort 續行。

**Non-Goals:**
- 不在後端新增單一巨集 pipeline 任務 / 新端點（協調在前端）。
- 不改變三個既有端點各自的行為與 SSE 結構（除 `/download` 加回傳 `directory`）。
- 不做跨批佇列 / 排程；一次只串一批。

## Decisions

### 決策 1：前端協調，不做後端 orchestration
下載完成（SSE done）後由前端依序呼叫既有端點：mp3 → `normalize` → `drive`；mp4 → `drive`。

- **為何選此**：三階段已各有端點 + 進度 UI + store，前端串接重用率最高、後端幾乎不動；每階段進度沿用既有面板，使用者體驗連續。後端單任務 orchestration 要新建跨階段進度模型與端點，成本高且重複。
- **替代方案**：後端單一 pipeline 任務（一個 task_id 串三段）——否決：重造進度/SSE、與既有面板割裂。

### 決策 2：協調器位置 — 獨立 coordinator 而非 store 互相呼叫
新增一個輕量協調器（`usePipeline` composable 或 `HomeView` 層的 watcher），監看 download / normalize / drive 三個 store 的 `status` 轉換來推進，並切換 `activeRightTab`。下載 store **不**直接 import 另兩個 store（避免相互耦合與循環依賴）。

- **為何選此**：保持各 store 單一職責；協調邏輯集中一處易測試與關閉（未勾選時協調器不啟動）。

### 決策 3：`POST /download` 回傳 resolved `directory`
`start_download` 已算出 `final_output_path`，回應加 `directory: str(final_output_path)`（additive）。前端把它存到 download store（如 `lastDownloadDir`），作為正規化/上傳的精確目標，而非前端自行推算日期子目錄。

- **為何選此**：日期子目錄 / target_dir 解析在後端，前端推算易與後端不一致；直接回傳最可靠且非破壞。

### 決策 4：上傳泛化為 .mp3 + .mp4（共用一條路徑）
`_local_mp3_files` → `_local_media_files`（含 `.mp3`/`.mp4`），mimetype 依副檔名（`audio/mpeg` / `video/mp4`）。`run_drive_upload_batch` 與 `/drive/upload` 共用，手動上傳面板亦因此可傳 mp4。

- **為何選此**：mp4 自動上傳需要它；單一檔案列舉路徑避免兩套邏輯。重複上傳防護是檔名比對、與類型無關，沿用即可。

### 決策 5：mp3 才正規化的判斷依據
以該批下載的 `format`（mp3/mp4）決定是否插入正規化階段；正規化階段針對下載資料夾內的 mp3（`/normalize/list` 取檔名）。mp4 批次直接進上傳。

## Risks / Trade-offs

- **前端跨 store 協調的時序/競態** → 集中在單一 coordinator、以各 store 的 `status` 轉換為唯一觸發源；未勾選時完全不啟動，零行為改變。
- **`directory` 不一致** → 一律以 `/download` 回傳值為準，不前端推算。
- **Drive API 未啟用 / 授權不足** → best-effort：上傳階段顯示既有 `_drive_error_detail` 403 訊息，下載+正規化結果不受影響（見 [[project-drive-api-must-be-enabled]]）。
- **手動上傳面板開始上傳 mp4（行為擴大）** → 視為合理改進並於 spec 明列；重複上傳防護仍有效。
- **同目錄正規化互斥（`_active_normalize_dirs`）** → 自動串接一次一批、且在下載完成後才起正規化，不會與自身衝突；若使用者同時手動對同目錄正規化，沿用既有 409 行為。
- **大批次上傳耗時** → 沿用既有逐檔進度與重試；本變更不改上傳引擎。
