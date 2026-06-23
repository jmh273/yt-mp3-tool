## 1. C1 — `/download/next-seq` 掃描實際目標資料夾（download-filename-prefix）

- [x] 1.1 `backend/main.py` `download_next_seq()`：新增可選 query 參數 `dir`。有值時以 `_resolve_output_child(output_path, dir)` 解析（沿用 `POST /download` 的越界防護），掃描該資料夾；無值/空字串時維持 `_today_download_dir()`（向後相容）。
- [x] 1.2 確認回傳結構不變（`{ next_seq, existing }`），位數規則沿用 `_format_seq` / `_scan_existing_seqs`。
- [x] 1.3 `dir` 含 `..`／絕對路徑／路徑分隔符時，回傳 400（與 `_resolve_output_child` 既有行為一致），不掃 `output_path` 之外。

## 2. C2 — 前端 next-seq 帶目標資料夾並在變動時重抓（download-filename-prefix）

- [x] 2.1 `frontend/src/components/SelectedVideos.vue` `fetchNextSeq()`：呼叫時帶 `dir=basename(download.targetDirPath)`。
- [x] 2.2 新增 `watch(() => download.targetDirPath, …)` 觸發 `fetchNextSeq`，對逐字輸入做 debounce（建議 300ms）。
- [x] 2.3 既有觸發點（mount / 選取 0→有 / 下載完成）一併改帶當前目標資料夾。
- [x] 2.4 下載送出前確保起始號對齊目標資料夾（debounce 競態緩解：送出前以目標目錄同步取一次，或當目標 ≠ 當日且輸入框可清空時走「只送 seq_enabled 不送 start_seq」的後端兜底，見 design D5）。

## 3. A — 預設資料夾翻新時機擴充 + dirty 旗標（download-target-folder）

- [x] 3.1 `frontend/src/components/SelectedVideos.vue`：新增「目標資料夾欄是否被使用者手動編輯」旗標。自動填入預設 → 未編輯；input 事件 → 已編輯；清除/重置 → 回未編輯。
- [x] 3.2 在 `onActivated`（keep-alive 重新啟用）、下載完成後、送出下載前，對**未編輯**的 `targetDirPath` 重新套用 `rolloverDatePrefix`（僅換日期前綴；非日期前綴或已編輯者不動）。
- [x] 3.3 確認手動編輯過的值（含刻意指定過去日期）不被自動翻新覆寫。
- [x] 3.4 確認既有「mount 時翻新」行為不回歸（`SelectedVideosDateRollover.test.ts` 仍綠）。

## 4. 測試

- [x] 4.1 `backend/tests/test_download.py`：`GET /download/next-seq?dir=<custom>` 掃對資料夾；未帶 `dir` 回退當日；越界 `dir` 回 400。
- [x] 4.2 `frontend/src/tests/`：改 `targetDirPath` 後 `fetchNextSeq` 以新 `dir` 重抓（debounce 後）；連續兩批進同一自訂資料夾起始號接續不重複。
- [x] 4.3 `frontend/src/tests/`：dirty 旗標——未編輯預設跨午夜翻新；已編輯值不翻新。沿用 `vi.setSystemTime` mock 時間。
- [x] 4.4 跑既有相關測試確認無回歸：`SelectedVideosDateRollover.test.ts`、`dateFolder.test.ts`、`stores.test.ts`、`test_download.py`。

## 5. 驗證（驗證者負責，非 codex）

- [x] 5.1 撰寫 `frontend/e2e/verify-fix-seq-target-dir-mismatch.ts`（Playwright）：
      (a) 自訂資料夾連續兩批 → 序號接續不重複；
      (b) mock 跨午夜 → 未編輯預設翻新到今天、寫進今天資料夾；
      (c) 手動指定昨天日期資料夾 → 不被翻新覆寫。
- [x] 5.2 跑通 verify 腳本（過了才建議 `/opsx:verify` → archive）。
