## Context

[run_drive_upload_batch](backend/main.py#L2757) 目前在 `loop.run_in_executor(None, ...)` 丟到單一執行緒,內部:① ensure root folder → ② ensure leaf folder → ③ list existing names → ④ `for file: create().execute()` 逐檔阻塞上傳。瓶頸在 ④,網路 I/O bound。

專案已有並行範式(route-B):下載與正規化用 `asyncio.Semaphore + asyncio.gather`,並發數來自 `download_concurrency`,以 `_resolve_concurrency` 夾限。`download_concurrency` 在 `DEFAULT_SETTINGS` 但**刻意不在** `_SETTINGS_RANGES`,改由 `SettingsUpdate` 的 Pydantic 欄位(`ge=1, le=8`)驗證 + resolve-clamp,以免「reset 成預設」與「clamp」雙重行為衝突。

## Goals / Non-Goals

**Goals:**
- 並行上傳同批多檔,縮短 wall time。
- 新增獨立 `drive_upload_concurrency` 設定,行為/驗證完全比照 `download_concurrency`。
- 正確處理 Google API client 的 thread-safety。
- 保留逐檔進度、失敗隔離、可重試語意。

**Non-Goals:**
- 不改 Drive 鏡像結構、防重複上傳、根目錄設定、授權流程等既有需求。
- 不跨「批次」並行(仍一次處理一個上傳任務);只在單批內並行多檔。
- 不引入 resumable 分塊上傳。

## Decisions

**1. 並行骨架:Semaphore + run_in_executor(對齊 route-B)**
- 前置 ①②③ 單執行緒先跑完拿到 `leaf_id` 與 `existing`。
- 之後 `sem = asyncio.Semaphore(N)`,對每檔 `async with sem: await loop.run_in_executor(pool, upload_one, ...)`,`gather` 全部。
- `concurrency <= 1` 或檔數 <= 1 時走原序列路徑(同既有 `run_download`/`run_normalize_batch` 的短路判斷)。
- 替代:`concurrent.futures.ThreadPoolExecutor` 直接管理 → 也可,但用 asyncio 與既有兩處並行程式碼風格一致,優先。

**2. Thread-safety:每 worker 各建 service**
- `googleapiclient` 底層 `httplib2` 非 thread-safe,多執行緒共用單一 service 同時 `.execute()` 不安全。
- 解法:`upload_one` 內(或每 worker 起始)以 `_build_drive_service()` 建立屬於該執行緒的 service;credentials 由 `require_drive_credentials()` 取得可共用。
- 共用前置(①②③)仍用主 service 跑一次即可。
- 替代:共用 service + Lock → 等於序列化,否決。

**3. `drive_upload_concurrency` 比照 `download_concurrency`**
- 加進 `DEFAULT_SETTINGS`(=3);`SettingsUpdate` 加 `drive_upload_concurrency: int | None = Field(default=None, ge=1, le=8)` 並於 update 寫回;新增 `_resolve_drive_upload_concurrency(settings)`(clamp 1..8、fallback 3)。
- **不**加進 `_SETTINGS_RANGES`,理由同 `download_concurrency`(避免 reset/clamp 衝突)。
- 替代:沿用 `download_concurrency` → 已由使用者否決(網路 vs 本機並發性質不同)。

**4. 進度狀態執行緒安全**
- 各檔只更新 `state["items"][自己的檔名]`(distinct key,GIL 下安全),沿用現狀。
- `state["status"] = "done"` 與錯誤匯整移到 `gather` 全部結束後設一次,避免中途被某 worker 提前標記。

## Risks / Trade-offs

- [Drive API 配額 / rate limit] → 並發預設 3、上限 8,在預設 per-user quota 內;若遇 429 由既有逐檔 try/except 標 error 並可重試。
- [每 worker 建 service 的開銷] → service 建立成本遠小於上傳網路時間,且僅 N 個;可接受。必要時可改 thread-local 快取,非首版必要。
- [前置步驟失敗(如資料夾建立)] → 維持現狀:在 fan-out 前丟出,整批標記 error,不啟動並行。
- [批次完成狀態時機] → 須確保 `done` 只在所有 worker 結束後設,否則 SSE 端可能提早收尾。已於決策 4 處理。

## Open Questions

- 設定頁欄位的中文標籤與說明文字(實作時對齊既有 `download_concurrency` 欄位風格即可,非阻塞)。
