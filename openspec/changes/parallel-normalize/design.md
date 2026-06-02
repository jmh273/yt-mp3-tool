## Context

[backend/main.py](backend/main.py) 的 `run_normalize_batch()`（[L2479](backend/main.py#L2479)）為同步函式，由 `normalize_start()` 透過 `loop.run_in_executor(None, run_normalize_batch, ...)` 丟到單一執行緒，內部以 `for filename in filenames` 序列處理：每檔呼叫 `_run_mp3gain_analyze()`（量測，掃整檔）後，若建議調整量 `>= 0.75 dB` 再呼叫 `_run_mp3gain_apply()`（就地改 frame gain header）。兩者皆為 `subprocess.run(["mp3gain", ...])`，屬本機 CPU + 磁碟 I/O，無網路。

前次 `concurrent-downloads`（已 archive）已引入 `_resolve_concurrency(settings)`（讀 `download_concurrency`、夾 1–8、fallback 3）與 route-B 並行協調器，並把 `download_concurrency` 放進 `DEFAULT_SETTINGS`，但**未**接進 `SettingsUpdate` / `PUT /settings` / `SettingsView.vue`，因此目前只能手改 settings.json。

前端 [VolumeNormalizer.vue](frontend/src/components/VolumeNormalizer.vue) 的進度面板已是 per-file 渲染（`v-for="f in store.files"`，逐檔讀 `store.progress[f.filename]` 顯示量測中/套用中/完成/跳過/失敗 badge），天然支援多檔同時顯示。

## Goals / Non-Goals

**Goals:**
- 正規化批次內多檔「量測+套用」並行，吃滿多核縮短整批耗時。
- 並發數與下載**共用** `download_concurrency`，並讓它經設定頁可調。
- 並行對前端進度透明；完成/跳過/錯誤逐檔獨立。

**Non-Goals:**
- 不新增 normalize 專屬的並發設定（明確共用一顆）。
- 不改 `VolumeNormalizer.vue` 進度渲染（已支援多檔）。
- 不合併 mp3gain 的「量測」與「套用」為單次 `-r -k`（雙掃是為了 `<0.75dB` 跳過判斷，屬獨立優化）。
- 不更動 `_active_normalize_dirs` 同目錄互斥語意。

## Decisions

### 決策 1：沿用下載的 route-B 並行模式
比照 `concurrent-downloads`：把現有迴圈體抽成 `normalize_one(filename)`（量測 → 跳過/套用 → 狀態更新，含逐項 try/except）。`run_normalize_batch` 維持 sync 介面、新增 `concurrency` 參數**預設 1**（序列、零回歸）；`concurrency > 1` 時內部 `asyncio.run(_coordinate())`，協調器以 `asyncio.Semaphore(concurrency)` + `asyncio.to_thread(normalize_one, fn)` + `asyncio.gather` 並行，收斂後設 `status="done"`。`normalize_start` 維持 `run_in_executor`，多傳 `_resolve_concurrency(settings)`。

- **為何選此**：與下載一致、可直接複用 `_resolve_concurrency`；sync 介面保住既有 normalize 測試與 API 合約；正規化無排序需求，比下載更單純（不需 idx 計算）。

### 決策 2：共用 `download_concurrency`，不新增 normalize 專屬鍵
正規化讀同一個 `download_concurrency`。

- **為何選此**：使用者明確要求並發數可相同；單一旋鈕心智負擔最低。鍵名雖偏「download」，但 UI 標籤用中性的「並發數」，避免動到剛 archive 的設定鍵（零 migration）。
- **替代方案**：改名 `concurrency`（中性）需 migration 與動既有鍵，收益不足以抵成本，否決。

### 決策 3：UI 寫入嚴格驗證、runtime 讀取寬容夾限
`SettingsUpdate` 新增 `download_concurrency: int | None = Field(default=None, ge=1, le=8)`，`PUT /settings` 越界回 422（Pydantic 驗證）。但 runtime 端 `_resolve_concurrency` 維持「夾限 + fallback」的寬容讀取，以容忍手改 settings.json 的舊/壞值。

- **為何選此**：UI 入口嚴格、給使用者明確回饋；runtime 不因壞設定崩潰。兩者語意不同但各司其職。

### 決策 4：前端僅加設定欄，不動進度面板
`SettingsView.vue` 新增「並發數」number input（min=1 max=8），onMounted 載入、save 時納入 `PUT /settings` payload。`VolumeNormalizer.vue` 不改。

## Risks / Trade-offs

- **N 個並發 mp3gain 行程佔滿 CPU** → 收益上限 ≈ min(N, 核心數)；夾上限 8。SSD 環境（使用者確認）無 HDD 隨機讀互搶問題。
- **進度字典並發寫入** → 各執行緒只寫自己的 `items[filename]`（key 互斥），GIL 下安全；`status="done"` 由協調器於 gather 後寫一次。
- **mp3gain 就地改檔 + 暫存** → mp3gain `-r` 各檔寫各自暫存再替換，不同檔不衝突；同目錄互斥由 `_active_normalize_dirs` 維持。
- **共用鍵名語意** → `download_concurrency` 偏下載語意，UI 以「並發數」標籤淡化；未來若要分離再議。
- **PUT 驗證與 runtime 夾限不一致** → 刻意設計（入口嚴格 / runtime 寬容），於 design 與測試明確記錄避免誤解。
