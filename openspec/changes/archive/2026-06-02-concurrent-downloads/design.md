## Context

[backend/main.py](backend/main.py) 的 `run_download()`（[L2263](backend/main.py#L2263)）目前是同步函式，由 `start_download()` 透過 `loop.run_in_executor(None, run_download, ...)` 丟到單一執行緒，內部以 `for idx, v in enumerate(videos)` 序列處理：每支影片呼叫 `yt_dlp.YoutubeDL(opts).download([url])`，此呼叫同時涵蓋「網路下載」與「ffmpeg 轉檔」（mp3 經 `FFmpegExtractAudio` postprocessor）。

實測痛點是轉檔（mp3）耗時長，序列模式下「下載完成的影片卡在轉檔，後續影片乾等」，且 YouTube 對單一連線限速使序列下載無法善用可並行連線。

進度以 `download_progress[task_id]["items"][vid]` 字典維護，由 `progress_hooks` 回呼更新，前端透過 SSE（[L2356](backend/main.py#L2356)）每 0.5s 拉取。序號前綴在迴圈前由 `_scan_next_seq()` 算出 `default_next`，再以 `_compute_seq_prefix(start_seq, default_next, idx)` 依 `idx` 產生（[L2296-2301](backend/main.py#L2296-L2301)）。

本 codebase 已有以 `asyncio.Semaphore` 控制並發的既有模式，見訂閱（[L724](backend/main.py#L724)）與最新影片（[L1946](backend/main.py#L1946)）。

## Goals / Non-Goals

**Goals:**
- 讓批次內多支影片的「下載 + 轉檔」並行進行，互相填補對方的空檔，縮短整批耗時。
- 並發上限可由設定調整，預設 3，安全夾限。
- 並行下序號編號維持正確；SSE 進度與完成語意對前端透明（前端零改動）。

**Non-Goals:**
- 不加速單一影片內部（不啟用 yt-dlp `concurrent_fragment_downloads`，留待後續）。
- 不在前端新增並發數調整 UI。
- 不更動 `DownloadRequest` payload、SSE 結構、序號計算邏輯。
- 不引入下載/轉檔分離的雙池（過度設計）。

## Decisions

### 決策 1：以 `asyncio.Semaphore` + `asyncio.to_thread` 並行（路線 B）
`start_download()` 改為 `await` 一個 async 協調器；協調器建立 `asyncio.Semaphore(N)`，為每支影片建立協程 `one(idx, v)`，於 `async with sem` 內 `await asyncio.to_thread(download_one, idx, v)`，最後 `asyncio.gather(*coros)` 收斂後設 `status="done"`。

`download_one(idx, v)` 即現有 for 迴圈體抽出：sanitize 標題、算 `seq_prefix`、`_build_ydl_opts`、`make_hook`、`YoutubeDL.download`、更新 item status。`default_next` 與 `_scan_next_seq` 仍在進入並行前計算一次。

- **為何選此**：貼合 codebase 既有併發寫法（L724 / L1946），semaphore 自然涵蓋整條「下載+轉檔」pipeline——正是瓶頸所在。
- **替代方案**：(a) `ThreadPoolExecutor` 包迴圈——可行但與專案 async 風格較不一致；(b) yt-dlp `concurrent_fragment_downloads`——只加速單部、解決不了排隊，列為非目標。

### 決策 2：`run_download` 維持 sync 介面，並行路徑內部跑 `asyncio.run`
（實作期修正）原案是把 `run_download` 改 async + `start_download` 用 `create_task`。但既有 15+ 測試直接同步呼叫 `main.run_download(...)`，且多筆斷言 `outtmpl` 的**順序**（`captured[0].endswith("01_")`）；改 async 會全數破壞且順序在並行下不確定。

改採：`run_download` 保持同步可呼叫，新增 `concurrency` 參數**預設 1**（既有測試走純序列 for 迴圈，行為與順序不變、零回歸）。`concurrency > 1` 時內部以 `asyncio.run(_coordinate())` 跑協調器，協調器用 `asyncio.Semaphore` + `asyncio.to_thread` 並行整條 pipeline。`start_download` 維持 `loop.run_in_executor(None, run_download, ...)`（run_download 在 worker thread 執行、無 running loop，`asyncio.run` 安全），僅多傳一個 `concurrency`。

- **為何選此**：仍是 route-B 機制（Semaphore + to_thread），但保住所有既有測試、`start_download` API 合約與「即時回 task_id、進度走 SSE」行為，回歸風險最低。

### 決策 3：並發數來源與夾限
新增 settings 欄位 `download_concurrency`（預設 3）。`start_download()` 讀取後以 `max(1, min(8, value))` 夾限，非整數/缺漏 fallback 3。`load_settings()` 的預設 settings 補上此鍵。不進 `DownloadRequest`、前端不顯示。

- **為何選此**：使用者明確要求「只放 settings、不接前端 UI」。上限 8 防止 ffmpeg 子程序過多拖垮 CPU。

## Risks / Trade-offs

- **N 個並發 ffmpeg 子程序佔 CPU** → 預設 3、硬上限 8；mp3 抽音相對輕、mp4 為 remux 非重編碼且使用少。
- **進度字典並發寫入** → 各執行緒只寫自己的 `items[vid]`（key 互斥），GIL 下對 dict 單鍵賦值安全；`status="done"` 僅由協調器在 `gather` 後寫一次，無競態。
- **頻寬本已跑滿時並行只是切分** → 但 YT 逐連線限速使多數情境屬「並行有賺」；並發數可調以因應。
- **部分影片失敗** → `download_one` 內 try/except 維持現有逐項錯誤捕捉，`gather` 不因單支例外中斷其他（各協程自行吞例外、不向上拋）。
- **事件迴圈取得方式** → 沿用既有 `asyncio` 用法；確認在 FastAPI async 端點內以 `create_task` 排程協調器即可，無需手動管理 loop。
