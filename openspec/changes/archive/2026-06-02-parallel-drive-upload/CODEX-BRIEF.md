# Codex 實作指示：parallel-drive-upload

> 自足實作說明。完成後由審查者對照 `tasks.md` / `specs/` 驗收。所有路徑為 `c:\vue\YT_to_MP3\` 下相對路徑。
> **核心**:Drive 上傳改並行——共用前置(ensure root/leaf 資料夾、列既有檔名)單執行緒跑一次,之後 fan-out 並行傳檔;新增**獨立**設定 `drive_upload_concurrency`(預設 3、1..8),**比照 `download_concurrency` 的處理方式**。
> **關鍵地雷**:Google API client(httplib2)**非 thread-safe**,**每個並行上傳各建自己的 service**,**禁止**多執行緒共用同一 `service` 物件。
> **不要做 e2e**(`frontend/e2e/verify-*.ts`)——審查者負責。

---

## 0. 必讀參考(既有、照抄樣式)

- **並行範式(照抄)**:`run_download` 的 sem + `asyncio.run` 寫法 [main.py:2328-2345](backend/main.py#L2328):
  ```python
  if concurrency <= 1 or len(videos) <= 1:
      for ...: download_one(...)
  else:
      async def _coordinate():
          sem = asyncio.Semaphore(concurrency)
          async def _one(...):
              async with sem:
                  await asyncio.to_thread(download_one, ...)
          await asyncio.gather(*(_one(...) for ...))
      asyncio.run(_coordinate())   # 本函式在 executor thread,無 running loop,asyncio.run 安全
  ```
- **`download_concurrency` 既有處理(完全比照)**:`DEFAULT_SETTINGS` [main.py:98](backend/main.py#L98)、`SettingsUpdate` 欄位 [main.py:925](backend/main.py#L925)、update 寫回 [main.py:956-957](backend/main.py#L956)、`_resolve_concurrency` clamp/fallback [main.py:2267-2273](backend/main.py#L2267)。**`download_concurrency` 刻意不在 `_SETTINGS_RANGES`**([main.py:275](backend/main.py#L275));新設定同樣**不要**加進去(避免 load_settings 的 reset 與 resolve 的 clamp 雙重行為衝突)。
- **要改的上傳批次**:`run_drive_upload_batch` [main.py:2757-2796](backend/main.py#L2757);呼叫端 `drive_upload_start` [main.py:2815-2831](backend/main.py#L2815);建 service 工具 `_build_drive_service()` [main.py:2810](backend/main.py#L2810);列檔 `_local_media_files`、mimetype `_media_mimetype`、防重複 `_drive_file_names` 已存在。

---

## 1. 設定:`drive_upload_concurrency`(比照 download_concurrency)

1a. `DEFAULT_SETTINGS`([main.py:89-101](backend/main.py#L89))新增一行:
```python
    "drive_upload_concurrency": 3,
```
1b. `SettingsUpdate`([main.py:925](backend/main.py#L925) 旁)新增欄位:
```python
    drive_upload_concurrency: int | None = Field(default=None, ge=1, le=8)
```
1c. `update_settings`([main.py:928](backend/main.py#L928) 起,於 `download_concurrency` 寫回 [main.py:956-957](backend/main.py#L956) 旁)新增:
```python
    if body.drive_upload_concurrency is not None:
        settings["drive_upload_concurrency"] = body.drive_upload_concurrency
```
1d. 新增 resolve helper(放 `_resolve_concurrency` [main.py:2267](backend/main.py#L2267) 旁):
```python
def _resolve_drive_upload_concurrency(settings: dict) -> int:
    """Read drive_upload_concurrency from settings, clamp to 1..8, fallback 3 on missing/invalid."""
    raw = settings.get("drive_upload_concurrency", 3)
    try:
        return max(1, min(8, int(raw)))
    except (TypeError, ValueError):
        return 3
```
**不要**動 `_SETTINGS_RANGES`。

---

## 2. 後端:`run_drive_upload_batch` 並行化

**檔案** [main.py:2757](backend/main.py#L2757)。改成:前置單次 → fan-out 並行。簽名加 `concurrency: int = 1`。

要點:
- **共用前置只跑一次**(用傳入的 `service`):`root_id = _ensure_drive_folder(...)`、`leaf_id = _ensure_drive_folder(...)`、`existing = _drive_file_names(service, leaf_id)`。維持現有 try/except 包住前置:前置失敗 → 整批標 error(現狀邏輯保留)。
- **抽出單檔上傳** `upload_one(file_path)`:
  - 已存在(`file_path.name in existing`)→ 標 `skipped`、return。
  - 否則標 `uploading`,**在函式內 `svc = _build_drive_service()` 建立此執行緒專屬 service**(thread-safety 關鍵,禁用外層共用 `service` 做 `.execute()`),`MediaFileUpload(..., _media_mimetype(file_path), resumable=False)` → `svc.files().create(body={"name":..., "parents":[leaf_id]}, media_body=..., fields="id").execute()` → 標 `done`。
  - 單檔 try/except:失敗標 `error` + `_drive_error_detail(e)`,**不得**拋出中止其他檔。
- **並行驅動**(照抄 §0 範式):
  ```python
  files = _local_media_files(directory)
  if concurrency <= 1 or len(files) <= 1:
      for f in files: upload_one(f)
  else:
      async def _coordinate():
          sem = asyncio.Semaphore(concurrency)
          async def _one(f):
              async with sem:
                  await asyncio.to_thread(upload_one, f)
          await asyncio.gather(*(_one(f) for f in files))
      asyncio.run(_coordinate())
  ```
- **進度寫入**:各檔只更新 `state["items"][自己的檔名]`(distinct key,GIL 下安全,維持現狀)。
- **批次完成時機**:`state["status"] = "done"` 移到上述序列/並行**全部結束後**才設一次(勿在迴圈內提前設)。

## 3. 後端:`drive_upload_start` 傳入並發數

**檔案** [main.py:2815-2831](backend/main.py#L2815)。在 `run_in_executor` 前算 `concurrency = _resolve_drive_upload_concurrency(settings)`,並把它傳進 `run_drive_upload_batch`:
```python
    concurrency = _resolve_drive_upload_concurrency(settings)
    loop.run_in_executor(None, run_drive_upload_batch, task_id, directory, service, root_folder, concurrency)
```
(傳入的 `service` 仍供 §2 前置使用;逐檔上傳一律用 worker 內自建的 service。)

---

## 4. 前端:設定頁

設定頁(找 `download_concurrency` 的數字欄位,照抄其樣式)新增 `drive_upload_concurrency` 欄位,範圍 1..8、整數,送 `PUT /settings`。標籤建議「雲端上傳並行數」。`DriveUploadPanel` 不需改。

---

## 5. 測試(後端 + 前端 unit,**不含 e2e**)

- **後端 settings** [backend/tests/test_settings.py](backend/tests/test_settings.py):`drive_upload_concurrency` 預設 3;`PUT /settings` 可設 1..8;`_resolve_drive_upload_concurrency` 對缺失/非整數/超界(0、9、"x")回正確 clamp/fallback;確認改 `drive_upload_concurrency` **不影響** `download_concurrency`(反之亦然)。
- **後端上傳**(既有 drive 上傳測試檔,如 `backend/tests/test_drive_upload.py`):N>1 並行 → 全部檔被處理、不漏不重複;單檔失敗其餘仍完成且批次最終 `done`;前置只執行一次。**驗證每檔上傳用自建 service**:可 mock `_build_drive_service` 計數被呼叫次數 ≥ 檔數(或斷言上傳未共用前置 service)。
- 回歸:`cd backend && python -m pytest -q`;`cd frontend && npm test`;`cd frontend && npm run type-check`。全綠。

---

## 6. 驗收(審查者會跑)

```bash
cd backend && python -m pytest -q
cd frontend && npm test
cd frontend && npm run type-check
```
完成後**不要** archive、**不要**寫/跑 e2e。回報:改了哪些檔、新增哪些測試、上述三條結果貼上。

---

## 不要碰

- Drive 鏡像結構、防重複上傳(檔名比對)、根目錄設定、`drive.file` 授權流程等既有需求邏輯。
- `download_concurrency` / `run_download` / `run_normalize_batch` 與 `_SETTINGS_RANGES`。
- 不跨「批次」並行(仍一次一個上傳任務);只在單批內並行多檔。
- 不引入 resumable 分塊上傳;`resumable=False` 維持。
- SSE 進度結構與 `/drive/upload/progress` 端點行為。
