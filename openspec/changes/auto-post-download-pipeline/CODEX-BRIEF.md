# Codex 實作指示：auto-post-download-pipeline

> 自足實作說明。完成後由審查者對照 `tasks.md` / `specs/` 驗收。所有路徑為 `c:\vue\YT_to_MP3\` 下相對路徑。
> **核心**：下載面板加一個勾選框（預設關），勾選後下載完自動串接「正規化（僅 mp3）→ 上傳 Drive」。**前端協調**、重用既有端點/store/面板，後端只做兩處小改。
> **不要做 e2e**（`frontend/e2e/verify-*.ts`）——審查者負責。

---

## 0. 必讀參考（既有、照抄樣式）

- 勾選框持久化樣式：[SelectedVideos.vue:110-114](frontend/src/components/SelectedVideos.vue#L110)（`seqEnabled` 的 localStorage + watch 寫法）。新勾選框照抄。
- 下載 store：[download.ts](frontend/src/stores/download.ts)（`startDownload` 內 `const { task_id } = await apiPost(...)`，SSE done 時 `downloading=false`）。
- 正規化 store：[normalize.ts](frontend/src/stores/normalize.ts)：`loadDirectory(dir)`(async) + `startBatch()`，`status: 'idle'|'loading'|'running'|'done'`。
- Drive store：[driveUpload.ts](frontend/src/stores/driveUpload.ts)：`startUpload(directory)`，`status: 'idle'|'loading'|'running'|'done'`。
- 右欄協調點：[HomeView.vue](frontend/src/views/HomeView.vue) 已 import 三個 store 且有 `activeRightTab = ref<'download'|'normalize'|'upload'>`。**協調器就放這裡**。

---

## 1. 後端：`/download` 回傳 resolved 目錄

**檔案** [backend/main.py](backend/main.py)，`start_download()`（結尾在 [main.py:2376](backend/main.py#L2376) 附近）。
`final_output_path` 已算好，把回應從 `{"task_id": task_id}` 改為：
```python
    return {"task_id": task_id, "directory": str(final_output_path)}
```
**測試** [backend/tests/test_download.py](backend/tests/test_download.py)：既有 `test_post_download_uses_target_dir_under_output_path` 已知道 resolved 路徑，新增/擴充一個斷言 `r.json()["directory"]` 等於該 resolved 目錄。

---

## 2. 後端：Drive 上傳支援 .mp4

**檔案** [backend/main.py](backend/main.py)。目前 `_local_mp3_files`（[main.py:2746](backend/main.py#L2746)）只收 `.mp3`，且 `run_drive_upload_batch` 寫死 `mimetype="audio/mpeg"`（[main.py:2770](backend/main.py#L2770)）。

### 2a. 列舉泛化
把 `_local_mp3_files` 改為同時收 `.mp3` 與 `.mp4`（建議改名 `_local_media_files` 並更新呼叫處；或保留原名但擴充內容）：
```python
_UPLOAD_EXTS = (".mp3", ".mp4")

def _local_media_files(directory: pathlib.Path) -> list[pathlib.Path]:
    return sorted(p for p in directory.iterdir()
                  if p.is_file() and p.suffix.lower() in _UPLOAD_EXTS)
```
更新所有呼叫處：`run_drive_upload_batch`（[main.py:2756](backend/main.py#L2756) 與 [main.py:2763](backend/main.py#L2763)）、`drive_upload_start`（[main.py:2812](backend/main.py#L2812)）、`_collect_upload_folders`（[main.py:2853](backend/main.py#L2853) 的「已上傳」標記）。

### 2b. mimetype 依副檔名
新增小工具並在 `run_drive_upload_batch` 的 `MediaFileUpload` 使用：
```python
def _media_mimetype(path: pathlib.Path) -> str:
    return "video/mp4" if path.suffix.lower() == ".mp4" else "audio/mpeg"
```
```python
media = MediaFileUpload(str(file_path), mimetype=_media_mimetype(file_path), resumable=False)
```

### 2c. 測試
[backend/tests/test_drive_upload.py](backend/tests/test_drive_upload.py)：新增「資料夾含 .mp4 → 會被列入並上傳、mimetype 為 video/mp4」；確認重複上傳防護（檔名比對）對 mp4 同樣有效；既有 mp3 測試仍綠。

---

## 3. 前端：下載面板勾選框 + 下載 store 擴充

### 3a. download store [download.ts](frontend/src/stores/download.ts)
新增三個狀態（持久化 autoPipeline、記錄目錄與格式供協調器讀）：
```ts
const autoPipeline = ref<boolean>(localStorage.getItem('yt_mp3_auto_pipeline') === 'true')
watch(autoPipeline, (v) => localStorage.setItem('yt_mp3_auto_pipeline', String(v)))
const lastDownloadDir = ref('')
const lastFormat = ref<'mp3' | 'mp4'>('mp3')
```
（記得 `import { watch } from 'vue'`。）在 `startDownload(format, quality, opts)` 內：
- 設 `lastFormat.value = format`
- 取回 directory：把 `const { task_id } = await apiPost<{ task_id: string }>(...)` 改為
  `const { task_id, directory } = await apiPost<{ task_id: string; directory: string }>('/download', payload)`，並 `lastDownloadDir.value = directory`
- 在 return 物件導出 `autoPipeline, lastDownloadDir, lastFormat`

### 3b. SelectedVideos.vue [SelectedVideos.vue](frontend/src/components/SelectedVideos.vue)
在 `seq-row` 區塊附近（[SelectedVideos.vue:41](frontend/src/components/SelectedVideos.vue#L41) 之後）新增勾選框，綁到 download store：
```html
<label class="auto-pipeline-label">
  <input type="checkbox" v-model="download.autoPipeline" :disabled="download.downloading" />
  <span>下載後自動正規化並上傳雲端</span>
</label>
<small v-if="format === 'mp4'" class="hint">mp4 會跳過音量正規化，但仍會自動上傳</small>
```
（`download` 已是 `useDownloadStore()`；`format` 已是現有 ref。）

---

## 4. 前端：pipeline 協調器（放 HomeView）

在 [HomeView.vue](frontend/src/views/HomeView.vue) `<script setup>`（三個 store 已 import）新增一個小狀態機。**只在勾選時啟動，未勾選零行為改變**。

```ts
import { watch } from 'vue'  // 若尚未 import
type Stage = 'idle' | 'normalizing' | 'uploading'
const pipelineStage = ref<Stage>('idle')
const pipelineDir = ref('')

// 下載完成（downloading true→false）
watch(() => downloadStore.downloading, (now, prev) => {
  if (!(prev === true && now === false)) return
  if (!downloadStore.autoPipeline) return
  const dir = downloadStore.lastDownloadDir
  if (!dir) return
  pipelineDir.value = dir
  if (downloadStore.lastFormat === 'mp3') {
    pipelineStage.value = 'normalizing'
    activeRightTab.value = 'normalize'
    normalizeStore.loadDirectory(dir).then(() => normalizeStore.startBatch())
  } else {
    pipelineStage.value = 'uploading'
    activeRightTab.value = 'upload'
    driveUploadStore.startUpload(dir)
  }
})

// 正規化完成 → 上傳（僅 pipeline 啟動時，避免手動正規化也觸發上傳）
watch(() => normalizeStore.status, (s) => {
  if (pipelineStage.value !== 'normalizing' || s !== 'done') return
  pipelineStage.value = 'uploading'
  activeRightTab.value = 'upload'
  driveUploadStore.startUpload(pipelineDir.value)
})

// 上傳完成 → 結束 pipeline
watch(() => driveUploadStore.status, (s) => {
  if (pipelineStage.value === 'uploading' && s === 'done') pipelineStage.value = 'idle'
})
```

**best-effort 說明**：`normalize` / `drive` store 不論個別檔成功與否、甚至 SSE onerror，最終 `status` 都會變 `done` → 自動推進天然就是 best-effort，**不要**自行加「全成功才推進」的判斷。

**注意**：`pipelineStage` 的 guard 是避免「使用者手動正規化」也誤觸發自動上傳的關鍵，務必保留。

---

## 5. 測試（前端 unit + 後端，**不含 e2e**）

- 後端：§1.2、§2c。
- 前端 [download store 測試](frontend/src/tests/stores.test.ts)：`startDownload` 後 `lastDownloadDir` / `lastFormat` 正確；`autoPipeline` 持久化（寫 localStorage）。mock `apiPost` 回 `{ task_id, directory }`。
- 前端 [SelectedVideos.test.ts](frontend/src/tests/SelectedVideos.test.ts)：勾選框預設未勾、勾選寫入 localStorage。
- 協調器分支邏輯：若能把狀態機抽成純函式 / composable 最好做單元測試（mp3→normalize→upload、mp4→直接 upload、未勾選不動）；若留在 HomeView watcher 則以 e2e 覆蓋（審查者負責），此處至少確保 store 與 store 串接的單元層面可測。
- 回歸：`cd backend && python -m pytest -q`；`cd frontend && npm test`；`cd frontend && npm run type-check`。全綠。

---

## 6. 驗收（審查者會跑）

```bash
cd backend && python -m pytest -q          # 全綠
cd frontend && npm test                    # 全綠
cd frontend && npm run type-check          # 乾淨
```
完成後**不要** archive、**不要**寫/跑 e2e。回報：改了哪些檔、新增哪些測試、上述三條結果貼上。

---

## 不要碰

- 下載/正規化/上傳的 SSE 進度結構與既有端點行為（除 `/download` 加回 `directory` 欄位）。
- `run_download` / `run_normalize_batch` 的並行邏輯與 `download_concurrency`（與本變更無關）。
- 正規化的取檔仍走 `/normalize/list`（mp3 only），**不要**讓正規化處理 mp4。
- 不新增後端 orchestration 端點 / 不做後端單一 pipeline 任務（協調一律在前端）。
- 重複上傳防護（檔名比對）邏輯不動。
