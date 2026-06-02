# Codex 實作指示：parallel-normalize

> 自足實作說明。請嚴格照此實作；完成後由審查者對照 `tasks.md` / `specs/` 驗收。
> **核心原則**：完全比照已合併的 `concurrent-downloads`（下載並行）寫法，只是套到音量正規化 + 把並發旋鈕接進設定頁。所有路徑為 `c:\vue\YT_to_MP3\` 下相對路徑。

---

## 0. 必讀參考（已存在、不要改）

實作前先讀 [backend/main.py](backend/main.py) 這兩段，**你要照抄它的結構**：

- `_resolve_concurrency(settings)` — [main.py:2264](backend/main.py#L2264)。**直接重用，不要新增類似函式。**
  ```python
  def _resolve_concurrency(settings: dict) -> int:
      raw = settings.get("download_concurrency", 3)
      try:
          return max(1, min(8, int(raw)))
      except (TypeError, ValueError):
          return 3
  ```
- `run_download(...)` 的並行段 — [main.py:2273-2342](backend/main.py#L2273)。這是要 mirror 的模板：抽出 `download_one` → `concurrency<=1` 走 for 迴圈 → 否則內部 `asyncio.run` 跑 `Semaphore + to_thread + gather`，最後設 `status="done"`。

---

## 1. 後端：正規化並行化

**檔案**：[backend/main.py](backend/main.py)
**目標函式**：`run_normalize_batch()` — 目前在 [main.py:2479-2504](backend/main.py#L2479)。

### 現狀（序列）
```python
def run_normalize_batch(task_id: str, directory: str, filenames: list[str], target_db: float) -> None:
    state = normalize_progress[task_id]
    dir_path = pathlib.Path(directory)
    try:
        for filename in filenames:
            item = state["items"][filename]
            file_path = dir_path / filename
            try:
                item["status"] = "measuring"
                analyzed = _run_mp3gain_analyze(file_path, target_db)
                item["measured_db"] = analyzed["measured_db"]
                item["recommended_db_change"] = analyzed["recommended_db_change"]
                if abs(analyzed["recommended_db_change"]) < MP3GAIN_TOLERANCE_DB:
                    item["status"] = "skipped"
                    continue
                item["status"] = "normalizing"
                _run_mp3gain_apply(file_path, target_db)
                item["status"] = "done"
            except Exception as e:
                item["status"] = "error"
                item["error"] = str(e)
    finally:
        state["status"] = "done"
        _active_normalize_dirs.discard(directory)
```

### 改成（並行，比照 run_download）
```python
def run_normalize_batch(
    task_id: str,
    directory: str,
    filenames: list[str],
    target_db: float,
    concurrency: int = 1,
) -> None:
    state = normalize_progress[task_id]
    dir_path = pathlib.Path(directory)

    def normalize_one(filename: str):
        """量測 → 跳過/套用單一檔案。錯誤逐檔捕捉，不向上拋，
        確保並行時單檔失敗不中斷其他檔案。"""
        item = state["items"][filename]
        file_path = dir_path / filename
        try:
            item["status"] = "measuring"
            analyzed = _run_mp3gain_analyze(file_path, target_db)
            item["measured_db"] = analyzed["measured_db"]
            item["recommended_db_change"] = analyzed["recommended_db_change"]
            if abs(analyzed["recommended_db_change"]) < MP3GAIN_TOLERANCE_DB:
                item["status"] = "skipped"
                return
            item["status"] = "normalizing"
            _run_mp3gain_apply(file_path, target_db)
            item["status"] = "done"
        except Exception as e:
            item["status"] = "error"
            item["error"] = str(e)

    try:
        if concurrency <= 1 or len(filenames) <= 1:
            for filename in filenames:
                normalize_one(filename)
        else:
            async def _coordinate():
                sem = asyncio.Semaphore(concurrency)

                async def _one(fn: str):
                    async with sem:
                        await asyncio.to_thread(normalize_one, fn)

                await asyncio.gather(*(_one(fn) for fn in filenames))

            # run_normalize_batch 在 worker thread (run_in_executor) 執行，
            # 無 running loop，asyncio.run 安全，保住 sync 介面。
            asyncio.run(_coordinate())
    finally:
        state["status"] = "done"
        _active_normalize_dirs.discard(directory)
```
**重點**：`concurrency` 預設 1（既有測試走序列、零回歸）；`continue` 改 `return`；`finally` 的 `status="done"` + `discard` 必須保留。

### dispatch
**函式**：`normalize_start()` — [main.py:2521](backend/main.py#L2521)，目前已在 [main.py:2553](backend/main.py#L2553) 呼叫 `load_settings()` 取 target_db。重用那個 settings，在 [main.py:2574-2575](backend/main.py#L2574) 的 `run_in_executor` 多傳並發數：
```python
settings = load_settings()
target_db = float(body.target_db if body.target_db is not None else settings.get("normalize_target_db", 89.0))
concurrency = _resolve_concurrency(settings)   # ← 新增
...
loop.run_in_executor(
    None, run_normalize_batch, task_id, dir_key, body.filenames, target_db, concurrency  # ← 多傳 concurrency
)
```

---

## 2. 後端：並發設定可經 API 修改

**檔案**：[backend/main.py](backend/main.py)

### 2a. `SettingsUpdate` 模型 — [main.py:916-924](backend/main.py#L916)
新增一欄（用 Field 驗證 1–8，越界自動 422）：
```python
class SettingsUpdate(BaseModel):
    ...
    drive_root_folder: str | None = None
    download_concurrency: int | None = Field(default=None, ge=1, le=8)   # ← 新增
```

### 2b. `update_settings()` — [main.py:927-956](backend/main.py#L927)
在 `save_settings(settings)` 之前加：
```python
    if body.download_concurrency is not None:
        settings["download_concurrency"] = body.download_concurrency
```
> 註：runtime 讀取仍由 `_resolve_concurrency` 寬容夾限；此處的 422 是 UI 入口的嚴格驗證，兩者刻意不同，勿改 `_resolve_concurrency`。

---

## 3. 前端：設定頁並發數欄位

**檔案**：[frontend/src/views/SettingsView.vue](frontend/src/views/SettingsView.vue)

1. `<script setup>` 新增 ref：`const concurrency = ref(3)`
2. `onMounted` 的 GET `/settings` 型別補上 `download_concurrency: number`，並 `concurrency.value = data.download_concurrency ?? 3`
3. template 在「Drive 根目錄」label 後新增一個 label：
   ```html
   <label>
     並發數（下載與正規化共用）
     <input v-model.number="concurrency" type="number" min="1" max="8" />
     <small class="hint">同時處理的檔案/影片數；1–8，預設 3。SSD 建議設為 CPU 核心數左右。</small>
   </label>
   ```
4. `save()` 的 `apiPut('/settings', {...})` payload 加上 `download_concurrency: concurrency.value`

---

## 4. 測試

### 4a. 後端正規化並行 — [backend/tests/test_normalize.py](backend/tests/test_normalize.py)
比照既有 `test_run_normalize_batch_*`（[test_normalize.py:226-328](backend/tests/test_normalize.py#L226)）：用 `patch("main._run_mp3gain_analyze", ...)` / `patch("main._run_mp3gain_apply", ...)`，呼叫 `main.run_normalize_batch(task_id, dir, filenames, target_db, concurrency=3)`，斷言 `main.normalize_progress[task_id]`。`_seed_task` helper 在 [test_normalize.py:227](backend/tests/test_normalize.py#L227)。

新增測試：
- **並發上限生效**：用 `threading.Event` + 計數做「同時進行數不超過 N」的 gating 測試（參考 `backend/tests/test_download.py` 的 `test_concurrent_respects_max_in_flight`，照抄結構改成 patch mp3gain）。
- **完成判定**：多檔 `concurrency=3` 全部 `done`、`status=="done"`、`_active_normalize_dirs` 已 discard。
- **跳過不阻擋**：一檔 `<0.75dB` → `skipped`，其餘 `done`。
- **部分失敗不阻擋**：一檔 `_run_mp3gain_apply` 拋例外 → `error`，其餘 `done`，`status=="done"`。
- **`concurrency=1` 回歸**：序列行為與現況一致（既有測試本就不傳 concurrency，確認仍綠即可）。

### 4b. 後端 PUT /settings — [backend/tests/test_normalize.py](backend/tests/test_normalize.py) 或既有 settings 測試檔
- `PUT /settings` 帶 `download_concurrency: 4` → 200 且回傳/持久化為 4。
- 帶 `0` 或 `99` → 422。
（用既有 `client` fixture，參考 `test_normalize_start_*` 的 async client 寫法。）

### 4c. 前端 — [frontend/src/tests/SettingsView.test.ts](frontend/src/tests/SettingsView.test.ts)
- mock GET `/settings` 回含 `download_concurrency` → 載入後輸入框顯示該值。
- 改值並 save → `apiPut` payload 含 `download_concurrency`。

### 4d. 回歸
跑全套確認無破壞。

---

## 5. 驗收指令（審查者會跑）

```bash
# 後端
cd backend && python -m pytest -q            # 期望全綠（含新測試）
# 前端
cd frontend && npm run test:unit             # 期望全綠
cd frontend && npx vue-tsc --noEmit          # 型別檢查（若專案有此 script 則用對應指令）
```

完成後**不要** archive，也**不要**跑 e2e（審查者處理）。回報：改了哪些檔、新增哪些測試、pytest / 前端測試結果貼上。

---

## 不要碰

- `_resolve_concurrency`（重用，勿改）
- `VolumeNormalizer.vue` 進度面板（已是 per-file 渲染，免改）
- `_active_normalize_dirs` 互斥語意、`POST /normalize/start` 既有驗證（檔名 traversal / 409 / 503 / target_db 範圍）
- `download_concurrency` 的鍵名（共用，勿改名）
- mp3gain 量測/套用的雙次呼叫（勿合併為單次 `-r -k`）
