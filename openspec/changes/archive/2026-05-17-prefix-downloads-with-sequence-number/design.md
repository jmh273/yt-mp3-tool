## Context

下載路徑目前集中在 `backend/main.py`：

- `start_download()`（`backend/main.py:1162`）為 `/download` 入口，建立 `<output_root>/YYYYMMDD/` 子資料夾後丟到 executor 跑 `run_download()`。
- `run_download()`（`backend/main.py:1122`）逐支影片呼叫 `_sanitize_filename()` 取得安全標題，並把結果交給 `_build_ydl_opts()`（`backend/main.py:1094`）組成 yt-dlp 的 `outtmpl`：`os.path.join(output_path, f"{safe_title}.%(ext)s")`。
- yt-dlp 完成下載後寫入的實體檔名直接由 `outtmpl` 決定；前端只透過 SSE 拿到進度，不關心檔名。

下游消費者：

- `run_normalize_batch()`（`backend/main.py:1277`）以實體檔名為 key 對 mp3 做 ReplayGain 分析；其 `_suggest_safe_filenames()` 已支援數字與底線。
- 檔案列表 API（`_suggest_safe_filenames()` 之上）回傳 `filename`、`suggested_name`，同樣不挑前綴。

目前痛點：同一個日期資料夾內多次下載產出的檔名只反映影片標題，在檔案總管按字母排序時看不出下載順序，使用者整理音樂、後續批次操作（正規化、上傳）都得手動補編號。

## Goals / Non-Goals

**Goals:**

- 在 `run_download()` 注入流水號計算邏輯，輸出檔名變成 `nn_<safe_title>.<ext>`。
- 編號依「目標日期資料夾」續編：掃描 `^\d+_` 既有檔案的最大值 + 1 起算，同批次內遞增。
- 預設 2 位數零填充；達 100 以上自動擴充位數，不截斷。
- 與 `_sanitize_filename`、yt-dlp 的 `outtmpl`、`run_normalize_batch()` 等既有路徑相容。
- 不變動 `/download` 的 request / response schema 與前端。

**Non-Goals:**

- 不提供「關閉前綴」的開關（保持 v0 簡單；若日後有需求再開設定）。
- 不追溯改名既有檔案（既有 `xxx.mp3` 維持原名，只有新下載的才加前綴）。
- 不跨日期資料夾共用編號（用戶選擇 *per day-folder* 策略）。
- 不解決並發批次的競態（單一使用者本地工具，假設不會兩個批次同時對同一日期資料夾下載；見「Risks」）。

## Decisions

### Decision 1: 在 `run_download()` 開頭一次性計算起始編號

掃描 `Path(output_path).iterdir()`，以 regex `^(\d+)_` 取出所有既有檔案的數字編號，取 `max()`（沒有就 `0`），起始編號 = `max + 1`。批次內以 enumerate index 遞增。

**為什麼不在 `_build_ydl_opts()` 內逐檔重新掃描**：每支影片都重新 `iterdir()` 會多做 N 次 I/O 且仍有同批次內計數不一致的風險。一次性算 + 在 Python 端遞增最直接。

**Alternative considered**：用 SQLite 維護 per-folder counter — 過度設計；資料夾本身即是事實來源，掃 regex 已足夠且不需要新狀態。

### Decision 2: 編號格式以 `max(2, len(str(n)))` 寬度零填充

```python
def _format_seq(n: int) -> str:
    width = max(2, len(str(n)))
    return f"{n:0{width}d}"
```

`n=7 → "07"`、`n=99 → "99"`、`n=100 → "100"`、`n=120 → "120"`。

**為什麼不固定 3 位**：99% 使用情境一天不會超過 99 首，固定 3 位的 `001_` 視覺噪音較重；只在真的超過時擴充即可（使用者已選此策略）。

**為什麼不純用 `f"{n:02d}"`**：當 `n ≥ 100` 時 `02d` 仍會輸出 `100`，看似沒問題，但語意不清楚——明確以 `max(2, len(str(n)))` 表達「至少 2 位、必要時擴充」的意圖。

### Decision 3: 掃描範圍涵蓋所有副檔名

`^\d+_` regex 直接 match 檔名字首，不挑副檔名。`.mp3`、`.mp4`、甚至 yt-dlp 中途產生的 `.part` 都會被讀到。這樣 mp3 + mp4 混批時序號連貫，也避免 yt-dlp 中斷重試時舊有 `.part` 占位導致跳號。

**Alternative considered**：只掃 `.mp3` / `.mp4`——批次混格式時會撞號；複雜度沒省到。

### Decision 4: 注入點選擇 — 修改 `_build_ydl_opts()` 簽名

`_build_ydl_opts()` 多收一個 `seq_prefix: str`（例如 `"01_"`），組 `outtmpl` 時：

```python
"outtmpl": os.path.join(output_path, f"{seq_prefix}{safe_title}.%(ext)s")
```

`run_download()` 端：

```python
start_seq = _scan_next_seq(output_path)  # 掃描得到的下一個編號
for idx, v in enumerate(videos):
    n = start_seq + idx
    seq_prefix = f"{_format_seq(n)}_"
    safe_title = _sanitize_filename(v.get("title", ""))
    ydl_opts = _build_ydl_opts(output_path, safe_title, make_hook(vid), fmt, quality, seq_prefix)
```

**為什麼改簽名而不在 `safe_title` 裡塞前綴**：`_sanitize_filename` 的單元測試與其他呼叫端（如 `_suggest_safe_filenames()`）期待輸入是「人類可讀標題」，把流水號塞進去會污染語意；前綴是檔名拼接層的關注點。

## Risks / Trade-offs

- **並發批次競態**：若兩個 `/download` 請求幾乎同時對同一日期資料夾啟動，兩批都會掃到一樣的最大值，產生編號碰撞 → yt-dlp 後到的會被覆寫或失敗。**Mitigation**：本工具為單機桌面用途，UI 一次只觸發一個批次；接受此風險，文件中註記不支援並發。若日後出問題，再加 per-folder 檔案鎖。
- **`.part` 殘留扭曲計數**：上一次中斷遺留 `01_xxx.mp3.part` 仍會被掃到，正常情境下新批次就跳過 `01`（不會覆寫，符合預期）。**Mitigation**：可接受；使用者可手動清理。
- **舊資料夾無前綴檔案**：若日期資料夾裡有未加前綴的歷史檔案（例如此 feature 上線前產出），不影響新批次（regex 不 match → 視為 0）；但新檔會跟舊檔混排。**Mitigation**：文件說明此 feature 不追溯改名，使用者若要統一可手動處理。
- **正規化 `_suggest_safe_filenames()` 衝突**：`01_song.mp3` 包含底線與數字，皆在保留集合內，預期不會建議改名；補一個測試固定此行為，避免回歸。

## Migration Plan

純新增邏輯，無資料遷移：

1. 後端改 `_build_ydl_opts()` 簽名 + `run_download()` 計算起始編號。
2. 新增 helper `_scan_next_seq(directory: Path) -> int` 與 `_format_seq(n: int) -> str`。
3. 增補單元測試（空資料夾、續編、達 100、與 `_sanitize_filename` 疊加）。
4. 回歸測 `run_normalize_batch()` 對帶前綴檔名仍正常。
5. 部署 — 既有檔案不動，新下載即套用。
6. **回退**：直接 revert 上述 commit；既有帶前綴檔案保留檔名不影響使用（檔名前帶數字仍可正常播放 / 處理）。

## Open Questions

- 是否需要在 SettingsView 提供「啟用 / 關閉前綴」開關？目前提案為「永遠啟用」；待使用者試用一段時間後決定。
