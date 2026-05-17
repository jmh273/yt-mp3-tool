## Why

目前下載的檔案直接以影片標題命名（例如 `My Awesome Song.mp3`），同一個日期資料夾內的多次下載無法依照下載順序排序，使用者在檔案總管中也難以一眼分辨抓取的先後。加上前綴流水號（`01_`、`02_`、…）可在檔案總管的字母排序下天然反映下載順序，方便整理與後續批次處理（例如音量正規化、上傳）。

## What Changes

- 下載產出的檔名 SHALL 在影片標題前加上 `nn_` 形式的流水號前綴，例如 `01_My Awesome Song.mp3`。
- 流水號 SHALL **依當天日期資料夾（`YYYYMMDD/`）續編**：在批次開始前掃描該資料夾既有的 `^\d+_` 開頭檔案，取出最大編號 + 1 作為起點，跨多次下載批次延續。
- 預設使用 **2 位數零填充**（`01`、`02`、…、`99`），但當實際編號達到或超過 100 時 **自動擴充位數**（`100_`、`101_`、…），避免截斷或回繞。
- 既有的 `_sanitize_filename` 標題清洗流程 MUST 維持，前綴只是疊加在乾淨標題之前。
- 變更僅作用於後端 `run_download()` / `_build_ydl_opts()` 路徑；前端 UI 與 `/download` payload **不需要**變動。

## Capabilities

### New Capabilities
- `download-filename-prefix`：定義下載輸出檔名的流水號前綴規則（範圍、位數、續編策略、與既有清洗邏輯的疊加順序）。

### Modified Capabilities
（無：流水號前綴是新加入的命名規則，與 `download-format-quality` 的格式 / 品質選擇彼此正交，後者的 spec 不需修改。）

## Impact

- **後端**：`backend/main.py` 中的 `run_download()`、`_build_ydl_opts()` 需新增「依日期資料夾掃描既有編號 → 計算下一個編號 → 注入前綴」的邏輯。
- **測試**：`backend/tests/test_download.py` 需補強：空資料夾起始為 `01_`、續編延續最大值 + 1、達 100 後位數擴充、與 `_sanitize_filename` 疊加順序。
- **前端**：無變動。`SelectedVideos.vue`、`UrlDownloadFeed.vue`、`download.ts` 等不需要感知前綴。
- **檔名相依工具**：`run_normalize_batch()` 以實體檔名運作，前綴後仍能正常處理；但需確認 `_sanitize_filename` 不會把開頭的 `01_` 視為要清掉的字元（底線、數字皆在保留集合內，預期相容）。
