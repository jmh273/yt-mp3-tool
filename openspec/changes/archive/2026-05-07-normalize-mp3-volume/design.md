## Context

工具目前的下載流程：使用者勾選影片 → `POST /download` → 後端用 `yt-dlp` 抓 bestaudio 並交給 ffmpeg 轉 MP3（`preferredquality: "192"`）→ 輸出到 `~/Music/YT-MP3/<YYYYMMDD>/`。下載進度透過全域 `download_progress: dict[str, dict]` + SSE (`/download/progress/{task_id}`) 推送到前端 `SelectedVideos.vue`。

YouTube 各頻道母帶響度差距 6–10 LUFS 並不少見，使用者必須在播放器逐首手動調整。本次新增的「批次音量正規化」要解決這個體驗痛點，並沿用既有的：

- ffmpeg 已是必要依賴（`lifespan` 內檢查並警告）。
- 全域 dict + SSE 的進度模型。
- `~/.yt-mp3-tool/settings.json` + `load_settings()` 的設定機制。
- `HomeView.vue` 三欄式 grid (`240px 1fr 300px`)。

## Goals / Non-Goals

**Goals:**
- 一個按鈕內可完成「掃目錄 → 量響度 → 套增益 → 覆寫原檔」的批次流程。
- 預設帶入「當日下載目錄」（`<output_path>/<YYYYMMDD>`），使用者也能挑其他目錄。
- 進度即時、逐首回報（pending / measuring / normalizing / done / error）。
- 失敗的檔案不污染其他檔案、不損壞原檔。
- 重用現有的 SSE / settings / ffmpeg 模式，不引入新依賴。

**Non-Goals:**
- 不做即時播放或波形預覽。
- 不做下載完自動正規化（保留為未來迭代；本次保持「下載」與「正規化」是兩個獨立動作）。
- 不支援 MP3 以外格式（目錄掃描只挑 `*.mp3`）。
- 不做 ReplayGain tag-only 模式（要的是真的改檔案響度，不是 tag）。
- 不支援暫停／中途取消（v1 先做完整批次，可在迭代中加 cancel token）。

## Decisions

### Decision 0 (engine pivot, 後加): mp3gain 取代 ffmpeg `loudnorm` 作為正規化引擎

**選擇**：放棄 loudnorm two-pass，改用 `mp3gain.exe` 直接修改 MP3 frame header 的 global gain 欄位。

**為什麼**：實機跑下來，loudnorm two-pass 一首 30–60 MB 的 MP3 約 30–60 秒；mp3gain 同檔 <1 秒。差距一個數量級。對使用者「下載完整批一次整平」的真實用法，loudnorm 速度不可接受。mp3gain 額外好處：完全無損（不解碼/編碼，只動 frame 增益欄位）、可以 `-u` 還原、是業界 batch MP3 整平的標準工具。

**換引擎連帶改變**：
- 設定鍵 `normalize_target_db` 單位 LUFS → **dB SPL**（mp3gain 用 ReplayGain 89 dB SPL 為基準）。預設 `-14` LUFS → `89` dB SPL；範圍 `-30..0` → `80..100`。
- mp3gain 增益是 1.5 dB 整數倍；「已符合」門檻從 `0.5 LUFS` 改為 `< 0.75 dB`（半個 step，再小 mp3gain 自己也會 round to zero）。
- SSE 進度欄位 `measured_lufs / target_lufs` → `measured_db / target_db`，多一個 `recommended_db_change`（mp3gain analyze 直接給）。
- 不再需要 `-progress pipe:2` 解析 `out_time_ms` — mp3gain 太快，per-file percent 沒意義，僅用 status transition 表達。
- ffmpeg 仍保留為下載用依賴；正規化路徑只查 `mp3gain` 是否在 PATH。

**為什麼 mp3gain 預設 89 dB**：ReplayGain 標準參考點。比 YouTube 的 -14 LUFS 安靜（≈ 93 dB SPL），但較少觸發 clipping。要追近 YouTube 響度可在設定改 92–93。提供 per-batch 覆寫（見 Decision 9）讓單次微調不必動全域設定。

**保留下文的舊決策（Decision 1–8）**：作為這個 change 內部演進的歷史紀錄，封存後的 spec 為 mp3gain 路線。

### Decision 1: ffmpeg `loudnorm` two-pass，而非 `volumedetect` + `volume` 單純加減（已被 Decision 0 取代）

**選擇**：兩階段 loudnorm。第一階段 `ffmpeg -i in.mp3 -af loudnorm=I=<target>:TP=-1.5:LRA=11:print_format=json -f null -`，從 stderr 解析 `input_i / input_tp / input_lra / input_thresh / target_offset`；第二階段以 `loudnorm=I=<target>:TP=-1.5:LRA=11:measured_I=...:measured_TP=...:measured_LRA=...:measured_thresh=...:offset=...:linear=true:print_format=summary` 重新編碼輸出。

**為什麼不選 `volumedetect` + `volume`**：`volumedetect` 給的是 mean/max 峰值（dBFS），不是感知響度（LUFS）。對「不同來源混播聽起來一樣大聲」這個目標，LUFS 才是正確的度量；YouTube 自己的目標也是 -14 LUFS。

**為什麼不選單階段 `loudnorm`（dynamic）**：單階段會做動態壓縮，會改變動態範圍，對音樂類內容容易聽起來變扁。Two-pass linear 模式只做線性增益，音色保留度高。

### Decision 2: 直接覆寫原檔（atomic rename）

**選擇**：每首檔案處理流程：
1. 在同目錄寫 `<name>.normalizing.mp3`（暫存檔）。
2. ffmpeg 成功後 `os.replace(tmp, original)` 原子替換。
3. 失敗則刪除暫存檔，原檔不動。

**為什麼不另存到 `_normalized/` 子目錄**：使用者目錄結構已經分日期，再多一層會破壞既有「日期＝一批」的心智模型，且使用者後續還要再搬檔。覆寫加上原子 rename 是 ffmpeg 社群常見作法，安全性足夠。

**為什麼不備份原檔**：使用者已經能從 YouTube 重新下載；備份會吃掉雙倍硬碟。UI 會明示「將覆寫原檔」。

### Decision 3: 後端逐首處理（單執行緒）而非並發

**選擇**：用 `loop.run_in_executor` 開一個 worker thread，內部 `for file in files:` 逐首跑。

**為什麼不並發**：ffmpeg 是 CPU 密集（loudnorm 編碼），同時跑兩三個只會互搶 CPU、整體時間幾乎不變。逐首處理也讓進度回報更直覺、錯誤定位更容易。

### Decision 4: 進度模型沿用 `download_progress` 的 dict + SSE pattern

**選擇**：新增 `normalize_progress: dict[str, dict]`，結構：
```python
{
  "task_id": {
    "status": "running" | "done",
    "items": {
      "<filename>": {
        "filename": "...",
        "status": "pending" | "measuring" | "normalizing" | "done" | "error",
        "percent": 0-100,           # 第二階段 ffmpeg 的進度
        "measured_lufs": -23.4,     # 第一階段量到的響度（done 後填入）
        "target_lufs": -14.0,
        "error": "..."              # 僅 error 時填
      }
    }
  }
}
```
SSE 端點 `GET /normalize/progress/{task_id}` 與 `/download/progress/{task_id}` 同一格式（每 0.5s 推一次完整 state，`status==done` 時收尾）。

**為什麼不換成 WebSocket**：既有 download 已用 SSE 順順跑了，前端 `EventSource` 也是內建。一致性比微小的延遲改善重要。

### Decision 5: 預設目錄帶入「當日下載目錄」

**選擇**：前端面板開啟時先打 `GET /settings` 取 `output_path`，再用前端 JS 算當日 `YYYYMMDD`，組成 `<output_path>/<today>` 預填到目錄輸入框。後端 `GET /normalize/list?dir=...` 接收絕對路徑、回傳該目錄下所有 `*.mp3`。若目錄不存在或非目錄則回 400。

**為什麼不寫死後端「今日目錄」端點**：使用者可能想重新處理舊批次（例如挑 `20260428`），把目錄當參數傳更彈性。預設值是 UI 行為，不是 API 行為。

### Decision 6: 設定鍵命名與範圍

- 鍵名：`normalize_target_db`（型別 `float`，單位 LUFS）。
- 預設值：`-14.0`（YouTube/Spotify/TIDAL 的常見目標）。
- 允許範圍：`-30.0` 到 `0.0`，超出回 422。
- 雖然單位是 LUFS，但鍵名用 `_db` 是因為對使用者最直覺的「dB」描述；UI 標籤寫「目標響度（LUFS）」。

### Decision 7: 右欄以分頁切換「下載」與「音量正規化」，而非並列

**選擇**：右欄頂端放一組分頁標籤（`下載` / `音量正規化`），同一時間只顯示一個面板。預設停在「下載」；正規化任務啟動時不自動切走（避免打斷使用者觀察下載），但分頁標籤上會顯示小圓點提示有任務在跑。

**為什麼不上下並列**：兩個面板實務上不會同時被使用 — 使用者要嘛在下載、要嘛在整理已下載檔案。並列會把每個面板的可視高度砍半，使檔案列表（可能 30+ 首）一次只能看到 4–5 行，需要大量捲動。分頁切換把整個右欄高度（~600px+）讓給當下在用的那個面板。

**為什麼不自動依「哪個有 running task」切換**：自動切換會在使用者剛開好下載分頁、轉頭去做別的事時被拉走，也讓「為什麼畫面跳了」變難解釋。手動切 + 圓點提示更可預期。

**為什麼不放在左欄當頂層導覽**：左欄已被頻道清單佔滿，且兩個面板都是「對著選中的右側內容做事」的工具型面板，本來就屬於右欄領域。

### Decision 8: 已符合目標的檔案跳過第二階段（skipped 狀態）

**選擇**：第一階段量出 `measured_i`（input integrated loudness）後，若 `abs(measured_i - target_db) <= tolerance`（預設 `0.5` LUFS，hard-coded 常數 `NORMALIZE_TOLERANCE_DB`）則：

1. 不執行第二階段、不寫暫存檔、不覆寫原檔。
2. 進度欄位設為 `status: "skipped"`、`percent: 100`、`measured_lufs: <值>`。
3. 整批繼續處理下一首。

UI 在檔案列上呈現「已符合」徽章（不同色，與 `done` 區分），並顯示量到的 LUFS 值。

**為什麼是 0.5 LUFS**：人耳對響度差異的可分辨閾（JND）大約是 1 dB，0.5 LUFS 在這之下，使用者不會聽得出差別。Spotify、TIDAL 等串流的內部容忍也落在 0.5–1 dB 區間。

**為什麼不做成可調設定**：再多一個欄位 UI 太複雜，且這個值對「批次體驗」幾乎沒有差別 — 0.5 跟 1.0 在實務上跳過的檔案集合幾乎相同。先用 hard-coded 常數，未來若有使用者反映再開放。

**為什麼不選「以 `target_offset` 是否近 0 判斷」**：`loudnorm` 的 `target_offset` 是要加的增益值，理論上等價，但第一階段失敗時也會輸出 0；用 `measured_i` 判斷比較不易誤判（量測本身失敗時會 raise，不會悄悄變成 skip）。

### Decision 9: 下載時 sanitize 檔名（解決 mp3gain 中文特殊字元失敗）

**選擇**：在 `run_download` 把 yt-dlp 的 `outtmpl` 從 `%(title)s.%(ext)s` 改成預先 sanitize 過的 title。Sanitizer：保留 ASCII 英數、空白、`-_().`、CJK Unified Ideographs（含 Extension A），其餘字元（全形標點 `｜「」『』【】，。？！：；（）│⧸＊…`、emoji、雜項符號）一律換 `_`，連續 `_` 合併、首尾 `.` `空白` 截掉、總長截 120。

**為什麼不用 yt-dlp 的 `restrictfilenames: True`**：那是 ASCII-only，會把所有 CJK 也拿掉。使用者要保留中文檔名識別性。

**為什麼還要在 `/normalize/list` 標 `needs_rename`**：使用者目錄裡會有「sanitize 之前下載的舊檔」（如 `C:\YT-MP3\20260501` 那 21 個），這些舊檔對 mp3gain 仍會失敗。`needs_rename` + `POST /normalize/rename` + `_rename_log.json` 提供一個 atomic 的補救路徑，不強迫使用者一個一個手動改。

**為什麼還要 codepage filter 第二關**：實機跑下來，第一版只用 Unicode block 過濾不夠 — `U+7287`（犇 的稀有變體）位在 CJK Unified Ideographs 區段內，被第一關放行；但它不在 CP950 codepage 中，所以 Python `subprocess` 把路徑傳給 `mp3gain.exe` 時 Windows Wide→ANSI 轉換失敗。加第二關 `c.encode(locale.getpreferredencoding(False))` 把這類「Unicode 合法但 ANSI codepage 不認得」的字元也濾掉，才真的安全。

**為什麼不在 `/normalize/start` 自動偷偷 rename**：rename 是有副作用的動作（影響使用者其他工具的引用、檔案清單外觀）。設計成「按下另一個按鈕才動」，使用者保留決定權。

### Decision 10: 設定 + per-batch 兩層目標 dB

**選擇**：`normalize_target_db` 是設定（持久化、跨 session 預設值）；`POST /normalize/start` 接受可選 `target_db`（單次覆寫、不持久化）。前端面板上加「本次目標 (dB)」輸入框，預填當前設定值，使用者要微調這次跑的響度時直接改框就好。

**為什麼兩層**：
- 設定層解決 80% 場景：使用者想固定一個全域目標。
- per-batch 層解決 20% 場景：「這批 podcast 想再大聲一點」「這批音樂太吵想壓 2 dB」這種臨時微調。每次都跳設定頁太煩，但又不該每次都改全域。

**驗證**：兩層走同一個 `validate_target_db(value)` 檢查（80–100），超出 422。

## Risks / Trade-offs

- **覆寫原檔可能造成資料遺失** → 每首用暫存檔 + `os.replace` 原子替換；ffmpeg 失敗時保留原檔；UI 明示「將覆寫原檔」並要求使用者按下「開始正規化」確認。
- **ffmpeg 不在 PATH 上時整個流程失敗** → 既有 `lifespan` 已會在啟動時警告；本流程在啟動時若 `shutil.which("ffmpeg") is None`，`/normalize/start` 直接回 503 並訊息提示安裝 ffmpeg。
- **大目錄（>100 首）UI 一次渲染全部可能卡頓** → v1 先列全部（YouTube 訂閱量級下不太會超過 50 首/天）；若實測卡頓再加虛擬滾動。
- **同目錄被同時開兩個正規化任務** → 後端用 `(dir, set of currently-normalizing filenames)` 全域鎖，第二個請求若目標檔在處理中則回 409；v1 簡化為「同目錄同時只能一個 task」，已存在 running task 時回 409。
- **loudnorm 第一階段解析失敗（ffmpeg 版本差異）** → 解析改成「找到 `{` 開始的 JSON 區塊就 try parse」的寬鬆解析；解析失敗該檔標 error 並回原始 stderr 摘要。
- **前端 SSE 在 tab 背景時會暫停** → 既有 download SSE 已有同樣行為；切回前台會重連並讀到 server 的最新 state（state 是累積的不是事件流），因此不會丟資料。
