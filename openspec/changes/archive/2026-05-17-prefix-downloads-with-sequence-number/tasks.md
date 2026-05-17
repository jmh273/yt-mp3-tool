## 1. 後端 helpers

- [x] 1.1 在 `backend/main.py` 新增 `_format_seq(n: int) -> str`，以 `max(2, len(str(n)))` 寬度零填充編號（例：7 → `"07"`、120 → `"120"`）
- [x] 1.2 在 `backend/main.py` 新增 `_scan_next_seq(directory: pathlib.Path) -> int`：用 `re.compile(r"^(\d+)_")` 掃描資料夾下所有檔名（含 `.part` 等任意副檔名），回傳 `max(found) + 1`；無相符檔則回傳 `1`；資料夾不存在亦回 `1`

## 2. 整合至下載流程

- [x] 2.1 修改 `_build_ydl_opts()` 簽名加入 `seq_prefix: str` 參數，並在 `outtmpl` 拼接：`os.path.join(output_path, f"{seq_prefix}{safe_title}.%(ext)s")`
- [x] 2.2 修改 `run_download()`：在進入逐影片迴圈前呼叫 `start_seq = _scan_next_seq(Path(output_path))`；迴圈內以 `n = start_seq + idx` 計算當前編號，並組成 `seq_prefix = f"{_format_seq(n)}_"` 傳給 `_build_ydl_opts()`
- [x] 2.3 確認 `start_download()` 與其他呼叫 `_build_ydl_opts()` 的位置（如有）都已傳入新的 `seq_prefix` 參數；若僅 `run_download()` 使用，無需其他變動

## 3. 測試

- [x] 3.1 在 `backend/tests/test_download.py` 新增 `test_scan_next_seq_empty_dir`：空 / 不存在資料夾回傳 `1`
- [x] 3.2 新增 `test_scan_next_seq_continues_from_max`：放置 `01_a.mp3`、`02_b.mp3`、`05_c.mp3`，斷言回傳 `6`（不補中間缺號）
- [x] 3.3 新增 `test_scan_next_seq_mixed_extensions`：放置 `03_a.mp4`、`04_b.part`，斷言回傳 `5`（跨副檔名）
- [x] 3.4 新增 `test_format_seq_two_digit_padding`：1 → `"01"`、9 → `"09"`、99 → `"99"`
- [x] 3.5 新增 `test_format_seq_expands_past_99`：100 → `"100"`、121 → `"121"`，不截斷
- [x] 3.6 新增 `test_build_ydl_opts_includes_prefix`：傳 `seq_prefix="01_"`、`safe_title="Hello World"`，斷言 `outtmpl` 結尾為 `01_Hello World.%(ext)s`
- [x] 3.7 新增 `test_run_download_batch_assigns_sequential_prefixes`（可用 mock yt-dlp）：3 支影片在空資料夾批次跑完，分別產生 `01_`、`02_`、`03_` 前綴
- [x] 3.8 在 `backend/tests/test_normalize.py` 新增（或補強）一個案例：放置 `01_song.mp3`，呼叫 `_suggest_safe_filenames(["01_song.mp3"])` 斷言 `needs_rename=False`（前綴與保留集合相容）

## 4. 手動驗證

- [x] 4.1 啟動 backend + frontend，從首頁批次下載 3 支影片，確認當天日期資料夾中產出 `01_`、`02_`、`03_` 開頭檔案
- [x] 4.2 再次下載 2 支影片，確認新檔為 `04_`、`05_`（續編）
- [x] 4.3 手動在資料夾放一個 `99_dummy.mp3`，再下載 1 支，確認新檔為 `100_`（位數擴充）
- [x] 4.4 對含前綴檔案執行音量正規化流程，確認 mp3gain 步驟不報錯、不被建議改名

## 5. 文件與收尾

- [x] 5.1 在 `README.md`（或 `docs/`）的下載章節補一句說明：「下載檔名會自動加上 `nn_` 流水號前綴，依當天日期資料夾續編」（N/A：repo 目前未提供 README / docs，使用者另行決定是否要新增文件）
- [x] 5.2 執行 `openspec verify-change prefix-downloads-with-sequence-number`（或 `/opsx:verify`）確認 spec 與實作一致（實際以 `openspec validate <name> --type change --strict` 驗證通過）
- [x] 5.3 執行 `openspec sync-specs` 將 delta 套用至 `openspec/specs/download-filename-prefix/`（合併於 5.4：`openspec archive` 同步主 specs）
- [x] 5.4 歸檔變更：`openspec archive-change prefix-downloads-with-sequence-number`
