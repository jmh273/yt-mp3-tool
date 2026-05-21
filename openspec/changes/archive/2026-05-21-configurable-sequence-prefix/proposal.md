## Why

目前 `download-filename-prefix` 規格規定**每一個**下載檔名都會被疊上 `nn_` 流水號前綴，且編號完全由後端 `_scan_next_seq()` 掃描日期資料夾後決定（`max + 1`，最少 2 位數）。這在「整個播放清單分梯次下載」的場景遇到兩個問題：

- 使用者沒有開關可以「這次不加流水號」，例如想單獨重抓一支影片。
- 當使用者主動把播放清單拆成多批下載（搭配新的 `paginate-playlist-preview`），如果某一批中途失敗或需要重做、跳過幾號，現有 auto-scan 仍是用 `max+1` 接續，無法手動指定起始號；想取得「01–25、26–50、51–75」這種乾淨的整批分段，沒有干預手段。

我們要讓使用者在 `SelectedVideos` 面板上自己決定是否加流水號、以及這一批要從哪個號開始；位數則由輸入字串本身決定（`01` → 2 位、`001` → 3 位），超過該位數能表示的最大值時自動擴充，避免循環回到 `00`。

## What Changes

- **API (`POST /download`)**：`DownloadRequest` 新增兩個可選欄位：
  - `seq_enabled: bool = True`——是否加流水號前綴；`false` 時檔名不加任何 `nn_` 前綴。
  - `start_seq: str | None = None`——使用者輸入的起始流水號字串（保留前導零以表達位數）。`None` 維持現有 auto-scan 行為。
- **新端點 `GET /download/next-seq`**：回傳目前 `YYYYMMDD/` 資料夾的下一個 auto-scan 號 (`{"next_seq": "08", "existing": [1, 2, 5, 7]}`)；給前端用來預填輸入框與做即時衝突警告。
- **檔名規則**：當 `seq_enabled=true` 且 `start_seq` 有值時：
  - 起始號 `n0 = int(start_seq)`，預設位數 `width0 = len(start_seq)`。
  - 第 `idx` 支影片的編號 `n = n0 + idx`，實際位數 `width = max(width0, len(str(n)))`，前綴為 `f"{n:0{width}d}_"`。
  - 例：`start_seq="01"` 下載 3 支 → `01_`、`02_`、`03_`；下載到第 99 支變 `99_`，第 100 支自動擴充為 `100_`。
  - 例：`start_seq="999"`，下載 3 支 → `999_`、`1000_`、`1001_`。
- **檔名規則（不加前綴）**：當 `seq_enabled=false` 時，輸出檔名完全沒有 `nn_` 前綴，等同 `<safe_title>.<ext>`，並沿用既有 `-2`、`-3` 去重邏輯。
- **UI (`SelectedVideos.vue`)**：在格式 / 品質列下方新增一條「流水號」設定列：
  - `<input type="checkbox" v-model="seqEnabled">` 「加流水號」，預設勾選；勾選狀態存 `localStorage` (`yt_mp3_seq_enabled`)。
  - `<input type="text" v-model="startSeqInput">`「起始號」，當 checkbox 勾選時顯示。`startSeqInput` 不持久化，每次「下載」面板出現時透過 `GET /download/next-seq` 預填當下的 auto-scan 值（如 `08`），仍可由使用者改寫。
  - 即時衝突警告：解析 `startSeqInput` 為 `n0`，與目前選取影片數量 `count` 結合，檢查 `[n0, n0+count-1]` 是否與 `existing` 重疊；有重疊則在輸入框下方顯示「⚠️ 與既有 0X 重複」，但仍允許按下載。
- **既有 `download-filename-prefix` 規格**：所有 4 條 requirements 都需修訂以反映新行為（前綴是否加由 `seq_enabled` 控制；起始號可由 `start_seq` 覆寫；位數規則改為「跟隨輸入字串長度，超過時自動擴充」；API payload 增加兩個可選欄位）。

## Capabilities

### New Capabilities
<!-- 本次無新 capability。新 UI 設定列與 next-seq 端點都收歸到既有 download-filename-prefix 規格中 -->

### Modified Capabilities
- `download-filename-prefix`: 把「永遠加上流水號 + auto-scan + 預設 2 位數」鬆綁為「由使用者透過 `seq_enabled` / `start_seq` 控制；位數跟隨輸入字串長度；超過該位數時擴充」；並新增 `GET /download/next-seq` 端點與前端設定 UI 的需求。

## Impact

- **後端 (`backend/main.py`)**：
  - `DownloadRequest` 新增 `seq_enabled`、`start_seq` 欄位與輸入驗證（`start_seq` 只能是 1~10 位數字字串）。
  - `run_download()` 改寫流水號決定邏輯：依 `seq_enabled` 決定是否疊前綴；`start_seq` 有值時改用其位數與起始號，否則沿用 `_scan_next_seq` + `_format_seq`。
  - 新增 `GET /download/next-seq` 端點與 `_scan_existing_seqs()` 輔助函式（回傳 `existing` 陣列）。
- **前端**：
  - [frontend/src/components/SelectedVideos.vue](frontend/src/components/SelectedVideos.vue) 新增「流水號」設定列、衝突檢查 computed、`localStorage` 讀寫；
  - [frontend/src/stores/download.ts](frontend/src/stores/download.ts) 的 `startDownload(format, quality)` 介面延伸為 `startDownload(format, quality, opts: { seqEnabled?: boolean; startSeq?: string })`，並把這兩個值加進 POST payload。
  - 新增 `apiGet` 呼叫到 `/download/next-seq`。
- **既有測試**：
  - `backend/tests/test_download.py` 的 `POST /download` 測試需補上 `seq_enabled` / `start_seq` 行為；新增 `/download/next-seq` 測試。
  - `frontend/src/tests/stores.test.ts` 對 `startDownload` 的 assertion 需擴充新欄位。
- **向後相容**：未送 `seq_enabled` / `start_seq` 的舊呼叫等於 `seq_enabled=true`、`start_seq=None`，行為與目前完全一致，故 API 屬於相容性新增。
