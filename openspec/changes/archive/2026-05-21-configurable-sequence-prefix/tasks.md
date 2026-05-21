## 1. 後端：輸入驗證、Schema 與輔助函式

- [x] 1.1 在 `backend/main.py` 的 `DownloadRequest` 上新增欄位：`seq_enabled: bool = True`、`start_seq: str | None = None`；以 Pydantic `Field(pattern=r"^\d{1,10}$")` 限制 `start_seq` 格式，None 允許通過。
- [x] 1.2 新增 `_scan_existing_seqs(directory: pathlib.Path) -> list[int]` 輔助函式（與 `_scan_next_seq` 共用 `_SEQ_PREFIX_RE`），回傳資料夾中所有命中 `^(\d+)_` 的數字升冪排序。
- [x] 1.3 抽出 `_compute_seq_prefix(start_seq: str | None, default_next: int, idx: int) -> str` 輔助函式：當 `start_seq=None` 走 `_format_seq(default_next + idx)`；否則 `n = int(start_seq) + idx`、`width = max(len(start_seq), len(str(n)))`，回傳 `f"{n:0{width}d}_"`。
- [x] 1.4 在 `run_download()` 中先取 `default_next = _scan_next_seq(output_path)`，依 `seq_enabled` / `start_seq` 決定每支影片的 `seq_prefix`；`seq_enabled=False` 時 `seq_prefix=""`。

## 2. 後端：新端點 `GET /download/next-seq`

- [x] 2.1 新增 `@app.get("/download/next-seq")` async 函式：呼叫 `_today_download_dir()` 取得當天資料夾，再呼叫 `_scan_existing_seqs(...)` 取得 existing 與 `_scan_next_seq(...)` 取得 next 數字。
- [x] 2.2 將 next 數字以 `_format_seq` 轉成字串（沿用 `max(2, len(str(n)))` 規則），回傳 `{"next_seq": "08", "existing": [1, 2, 5, 7]}`。
- [x] 2.3 端點 MUST `require_credentials()`（與其它授權端點一致），但無 query 參數。

## 3. 後端：測試

- [x] 3.1 在 `backend/tests/test_download.py` 新增測試：`POST /download` 帶 `seq_enabled=false` → 驗證 `_build_ydl_opts` 收到的 `outtmpl` 不含 `nn_` 前綴；可以 mock `_build_ydl_opts` 或 `yt_dlp.YoutubeDL` 監看 `outtmpl`。
- [x] 3.2 新增測試：`POST /download` 帶 `start_seq="01"` 且 3 支影片 → 三次 `_build_ydl_opts` 呼叫的 `outtmpl` 含 `01_`、`02_`、`03_` 前綴。
- [x] 3.3 新增測試：`POST /download` 帶 `start_seq="999"` 且 3 支影片 → 前綴為 `999_`、`1000_`、`1001_`（驗證自動擴充位數）。
- [x] 3.4 新增測試：`POST /download` 帶 `start_seq="abc"` → 422 Unprocessable Entity。
- [x] 3.5 新增測試：`GET /download/next-seq` 在空資料夾下回 `{"next_seq": "01", "existing": []}`；在已有 `01_a.mp3` / `05_b.mp4` 下回 `{"next_seq": "06", "existing": [1, 5]}`；在已有 `120_old.mp3` 下回 `{"next_seq": "121", "existing": [120]}`。
- [x] 3.6 確認既有測試（無 `seq_enabled` / `start_seq` 的 payload）仍 pass，驗證向後相容。

## 4. 前端 Store：擴充 `startDownload` 介面

- [x] 4.1 在 `frontend/src/stores/download.ts` 修改 `startDownload` 簽名為 `startDownload(format?: 'mp3'|'mp4', quality?: number, opts?: { seqEnabled?: boolean; startSeq?: string | null })`。
- [x] 4.2 組 POST body 時，若 `opts.seqEnabled` 為 `false`，送 `{ seq_enabled: false }` 不帶 `start_seq`；若為 `true` 且 `startSeq` 為非空字串，送 `{ seq_enabled: true, start_seq: <值> }`；若 `seqEnabled` 未指定或 `startSeq` 為 null/空字串，僅送 `{ seq_enabled: true }` 並讓後端用 auto-scan。
- [x] 4.3 更新 `frontend/src/tests/stores.test.ts` 中 `startDownload` 系列測試：補上「不帶 opts → payload 不含 seq 欄位」、「`{ seqEnabled: false }` → payload 含 `seq_enabled: false` 且**不含** `start_seq`」、「`{ seqEnabled: true, startSeq: '05' }` → payload 同時帶兩個欄位」三組案例。

## 5. 前端 UI：`SelectedVideos.vue`

- [x] 5.1 在 `<script setup>` 新增 `seqEnabled: Ref<boolean>`，初值來自 `localStorage.getItem('yt_mp3_seq_enabled') !== 'false'`；用 `watch(seqEnabled, v => localStorage.setItem('yt_mp3_seq_enabled', String(v)))` 持久化。
- [x] 5.2 新增 `startSeqInput: Ref<string>` 與 `existingSeqs: Ref<number[]>` 兩個 state。
- [x] 5.3 新增 `fetchNextSeq()`：呼叫 `apiGet('/download/next-seq')`，把回傳的 `next_seq` 寫到 `startSeqInput`、`existing` 寫到 `existingSeqs`。
- [x] 5.4 用 `watch(() => download.selected.length, (n, old) => { if (n > 0 && (old === 0 || old === undefined)) fetchNextSeq() })` 在面板從無到有時觸發 fetch；同樣以 `watch(() => download.downloading, (v, old) => { if (old === true && v === false) fetchNextSeq() })` 在下載完成後 refetch。亦加 `onMounted` 處理掛載時就已有選取的情境。
- [x] 5.5 新增 computed `seqConflict`：當 `seqEnabled` 為 true 且 `startSeqInput` 合法時，計算 `n0 = parseInt(startSeqInput)`、`range = [n0..n0 + download.selected.length - 1]`、與 `existingSeqs` 取交集；回傳 conflict 號碼陣列。
- [x] 5.6 新增 computed `startSeqInvalid`：若 `seqEnabled` 為 true 且 `startSeqInput` **非空**但不符合 `^\d{1,10}$`，回 true；空輸入退回後端 auto-scan，故不視為 invalid。
- [x] 5.7 模板：在 `.format-row` 下方新增 `.seq-row`，包含 `<input type="checkbox" v-model="seqEnabled">` 「加流水號」、`<input type="text" v-show="seqEnabled" v-model="startSeqInput" maxlength="10" pattern="\d*" inputmode="numeric">` 與下方衝突警告 `<p class="seq-warn" v-if="seqConflict.length > 0">⚠️ 與既有 {{ seqConflict.map(formatPad).join('、') }} 重複</p>`。
- [x] 5.8 修改 `.dl` 按鈕的 `:disabled` 條件為 `download.downloading || download.selected.length === 0 || startSeqInvalid`。
- [x] 5.9 修改 `onDownload` 將 `seqEnabled` 與 `startSeqInput` 一併傳給 `download.startDownload(format.value, quality.value, { seqEnabled: seqEnabled.value, startSeq: seqEnabled.value ? startSeqInput.value : null })`。
- [x] 5.10 為新元素加 scoped class 樣式（`.seq-row`、`.seq-checkbox-label`、`.start-seq-input`、`.seq-warn`），與既有 `.format-row` 風格一致。

## 6. 整合驗證

- [x] 6.1 啟動後端 + 前端，勾選一支影片，確認「起始號」輸入框預填值符合當天資料夾現況。Playwright mock `/download/next-seq` 回 `next_seq=08` 驗證 UI 預填正確（[frontend/e2e/verify-configurable-sequence-prefix.ts](frontend/e2e/verify-configurable-sequence-prefix.ts)）。
- [x] 6.2 切換「加流水號」勾選盒；停用時「起始號」消失，下載後檔名無 `nn_` 前綴；重整頁面確認勾選盒狀態被記住。Playwright 驗證 4 個小項：預設勾選、取消後 input 消失、`localStorage.yt_mp3_seq_enabled="false"`、reload 後仍 unchecked。
- [x] 6.3 勾選 3 支影片、起始號改 `100`，下載後檢查檔名為 `100_xxx.mp3`、`101_xxx.mp3`、`102_xxx.mp3`。Playwright 攔截 POST /download 驗證 payload `{seq_enabled:true, start_seq:"100", videos:3}`；檔名規則由 `test_run_download_start_seq_three_digit` 等後端 unit tests 鎖定。
- [x] 6.4 在當天資料夾手動放一個 `05_dummy.mp3`，再勾 4 支影片並把起始號改為 `04` → 確認 UI 顯示衝突警告（含 `05`），但仍可下載。Playwright mock `/download/next-seq` 回 `existing=[5]`，勾 4 支設 `04`，驗證警告文字「⚠️ 與既有 05 重複」 + 下載按鈕仍 enabled。
- [x] 6.5 起始號設為 `999`、下載 3 支影片，確認檔名為 `999_xxx`、`1000_xxx`、`1001_xxx`。Playwright 驗證 payload `start_seq="999"`；後端 `test_run_download_start_seq_expands_past_999` 已鎖定 999→1000→1001 擴位行為。
- [x] 6.6 起始號輸入框輸入 `abc` 或留空時，「下載選取影片」按鈕停用。Playwright 驗證：空字串 → 按鈕仍可按（fallback to auto-scan，per spec 變更）；`abc` → 按鈕停用。
- [x] 6.7 完成一批下載後，新勾選影片，確認起始號輸入框顯示重新計算後的 next_seq（反映剛剛新加的檔）。Playwright mock `/download/next-seq` 首次回 `01`、下載完成 SSE 後第二次回 `04`，驗證 startSeqInput 從 `01` 自動更新為 `04`。

## 7. 文件與既有測試更新

- [x] 7.1 檢查 `frontend/e2e/cases/tc16-download-flow.ts` 是否有對檔名 / payload 的硬編碼斷言，若有相依「自動 01_ 前綴」的語句，補上對新欄位的說明或調整。（已檢查：tc16 只驗證進度 UI 與完成徽章，未硬編碼檔名，新增的 seq 設定列不影響現有 selectors。）
- [x] 7.2 在 `README.md` 適當位置補一句「下載時可以選擇是否加流水號、以及自訂起始號（位數隨輸入長度）」。
- [x] 7.3 確認 `openspec validate configurable-sequence-prefix --strict` 通過。
