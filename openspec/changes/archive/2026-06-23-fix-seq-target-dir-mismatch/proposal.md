## Why

實際踩到的兩個症狀——**(1) 改了目標資料夾後仍寫到前一天的資料夾**、**(2) 兩次下載檔名流水號重複**——都不是操作失誤，而是程式碼缺陷。根因是「**建議流水號的來源資料夾**」與「**實際下載的目標資料夾**」脫鉤：

- `GET /download/next-seq`（[main.py:2486](backend/main.py#L2486)）**寫死掃描「伺服器當日」日期資料夾** `output_path/YYYYMMDD/`，完全不看實際 `target_dir`。前端把回傳的 `next_seq` 填進「起始號」欄、下載時又原值當 `start_seq` 送回，而後端收到明確 `start_seq` 就直接採用、不再掃實際資料夾（`_compute_seq_prefix`，[main.py:2328](backend/main.py#L2328)）。
- 前端 `fetchNextSeq` 只在 mount / 「選取 0→有」/ 「下載完成」時觸發，**`targetDirPath` 改變時不會重抓**（[SelectedVideos.vue:178-195](frontend/src/components/SelectedVideos.vue#L178)）。
- 結果：只要實際目標資料夾 ≠ 當日日期資料夾（改成自訂名稱、或 App 跨午夜開著導致 `targetDirPath` 凍結在昨天），起始號就是對著錯資料夾算的 → 連續兩批落入同資料夾時 **01_,02_… 整組重複**。

另一個獨立缺陷造成「寫到前一天」：`targetDirPath` 只在面板 mount 時算一次預設並翻新日期（rollover），**之後不再重算**（[SelectedVideos.vue:170](frontend/src/components/SelectedVideos.vue#L170)）。App 一直開著跨過午夜後，預設仍是昨天的資料夾名，下載就寫進昨天的資料夾（且與 next-seq 掃今天的結果撞號，兩症狀同時發生）。

## What Changes

- **C1 — `/download/next-seq` 改為掃描「實際目標資料夾」**：端點接受目標子資料夾參數（沿用 `download` 的 `target_dir` 解析與越界防護），掃描該資料夾而非寫死當日日期資料夾；未帶參數時維持回退當日（向後相容）。
- **C2 — 前端在 `targetDirPath` 變動時重抓 next-seq**：使用者改「下載到」資料夾後，起始號與衝突警告即時對齊新資料夾；送出下載時帶上目標資料夾呼叫 next-seq。
- **A — 目標資料夾預設值翻新不只在 mount**：除啟動外，於下載分頁重新啟用（keep-alive 重新 activate）、下載完成後、以及送出下載前，對**未經使用者手動修改**的預設資料夾名稱重新套用日期翻新（rollover）；使用者手動編輯過的值 MUST 保留不動，避免覆寫刻意指定的資料夾。
- **整體一致性**：修正後「掃描流水號的資料夾」恆等於「實際下載的資料夾」，徹底消除跨資料夾/跨午夜的重複與跳號。

## Capabilities

### Modified Capabilities
- `download-filename-prefix`: 「流水號預覽端點」改以實際目標資料夾為掃描基準；「流水號設定 UI」新增 `targetDirPath` 變動時的重抓觸發。
- `download-target-folder`: 「預設資料夾名稱翻新」由「僅啟動時」擴充為「啟動 + 分頁重新啟用 + 下載完成後 + 送出前」對未編輯的預設值翻新。

## Impact

- **後端**：`backend/main.py`——`download_next_seq()` 接受目標目錄參數並以 `_resolve_output_child` 解析後掃描；既有 `run_download` 的序號邏輯不變。
- **前端**：`frontend/src/components/SelectedVideos.vue`——`fetchNextSeq` 帶目標資料夾、`watch(targetDirPath)` 重抓、預設值翻新時機擴充、新增「使用者是否手動編輯過目標欄」的旗標；`frontend/src/stores/download.ts`（如需保存 dirty 旗標）。
- **測試**：`backend/tests/test_download.py`（next-seq 帶目錄參數掃對資料夾）、`frontend/src/tests/`（改目錄重抓、跨午夜/連續批次不重複、未編輯才翻新）；`frontend/e2e/verify-fix-seq-target-dir-mismatch.ts`（驗證者撰寫並執行）。

## Out of Scope（已評估，刻意不改）

- **Drive 上傳面板的預設資料夾（先前標記的「B」）**：經評估**非缺陷**。`drive-upload` spec 明訂上傳預設為「最後一次下載/正規化的工作資料夾」（語意＝「上傳我剛下載的那批」），與下載面板「準備今天的新資料夾」語意不同，本就不該 rollover 到今天。強行翻新反而會破壞「上傳昨天那批」的正確預設，故維持現狀不動。
- 下載過程中（背景執行緒已啟動後）跨午夜的目錄重算——批次一旦送出即固定目標資料夾，不在批次中途切換。
- `resilient-download-resume`（另一 change）涵蓋的選取持久化與失敗重試，與本 change 無重疊。
