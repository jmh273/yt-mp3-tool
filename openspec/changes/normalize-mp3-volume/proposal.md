## Why

下載完成的 MP3 來自不同 YouTube 來源，響度差異極大，使用者每播下一首就要手動調整音量。本工具已經提供「日期子目錄」的下載輸出結構（例如 `~/Music/YT-MP3/20260501/`），是套用音量正規化最自然的批次單位。在工具內直接提供「掃目錄 → 批次正規化 → 顯示進度」的流程，可以省去使用者另外開啟 ffmpeg / Audacity / MP3Gain 的步驟，並讓「下載」與「整理」串成一個閉環。

## What Changes

- 新增後端 API：列出指定目錄下的 MP3 檔案、掃描每首的當前響度、批次套用音量正規化、以 SSE 回報進度。
- 新增「目標增益」設定（`normalize_target_db`），預設 `-14 LUFS`（YouTube 響度標準），可調整範圍 `-30` 到 `0`。
- 主畫面右側改為分頁式（`下載` / `音量正規化`），預設「下載」。新增的「音量正規化」面板：選擇目錄（預設帶入「當日下載目錄」）、列出該目錄下所有 MP3、逐首處理、顯示進度條與目前響度→目標響度。兩個任務不會同時被使用，分頁讓當下使用的面板拿到右欄的全部高度。
- 設定頁新增對應的「目標響度（LUFS）」欄位。
- 正規化採用 ffmpeg `loudnorm` 兩階段（two-pass）做法，輸出檔覆蓋原檔（保留原副檔名與檔名），處理失敗的檔案保留原檔不變。
- 量到的響度若已在目標 ±tolerance（預設 0.5 LUFS）內，跳過第二階段、不覆寫檔案，並在 UI 以「已符合」狀態標示（與「完成」「失敗」做區分）。

## Capabilities

### New Capabilities
- `mp3-volume-normalization`: 批次掃描資料夾中的 MP3、依設定的目標 LUFS 進行音量正規化、回報每首的進度與結果。涵蓋後端 API、設定欄位、與右側面板 UI。

### Modified Capabilities
<!-- 無：不修改既有 sidebar-layout 或 latest-videos-feed 的 spec-level 行為。新面板是右欄內的新增區塊，不改變既有面板的需求。 -->

## Impact

- **後端**：`backend/main.py` 新增 `GET /normalize/list`、`POST /normalize/start`、`GET /normalize/progress/{task_id}` 路由；新增 `normalize_target_db` 至 `DEFAULT_SETTINGS` 與 `SettingsUpdate`。
- **前端**：
  - 新增 `frontend/src/components/VolumeNormalizer.vue`（右欄面板）、`frontend/src/stores/normalize.ts`。
  - `views/HomeView.vue` 右欄改成「下載進度」與「音量正規化」可切換或上下並列。
  - `views/SettingsView.vue` 新增「目標響度」欄位。
  - `frontend/src/api.ts` 沿用現有 `apiGet/apiPost`，新增 SSE 訂閱輔助（若尚無）。
- **依賴**：使用既有 ffmpeg（已是必要依賴），不引入新 Python/JS 套件。
- **設定檔**：`~/.yt-mp3-tool/settings.json` 多一個鍵 `normalize_target_db`；舊版設定檔讀取時用預設值補齊（`load_settings` 已用 spread 合併，無遷移成本）。
- **檔案安全**：正規化會覆寫使用者既有 MP3，需在 UI 明示「將覆寫原檔」，並逐首處理（避免一次失敗污染整批）。
