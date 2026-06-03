## Why

「下載到」對話框的預設資料夾名稱會記住上次使用的值(`yt_mp3_last_work_dir`),其優先級高於今日日期。導致隔天啟動程式時,若上次用的是 `20260601_運動`,預設仍帶入舊日期前綴 `20260601_運動`,而非當日的 `20260602_運動`,使用者每天都得手動改日期,純日期 `20260601` 也同樣不會自動翻新。

## What Changes

- 啟動載入預設資料夾名稱時,若名稱以 8 碼數字(YYYYMMDD)開頭且該日期非當日,SHALL 將前 8 碼換成當日日期,並保留其後的標籤字串。
- 採**寬鬆判斷**:前 8 碼為數字即視為日期前綴,不驗證是否為合法日曆日期。
- 無日期前綴(前 8 碼非純數字)的資料夾名稱維持原樣,不做更動。
- 已是當日日期前綴者不變。
- 純前端變更,不動後端下載 API 與既有的 `target_dir` 安全處理。

## Capabilities

### New Capabilities
<!-- 無新增 capability -->

### Modified Capabilities
- `download-target-folder`: 新增「預設資料夾名稱於啟動時依當日日期翻新日期前綴」的需求,調整既有「下載前可選擇目標資料夾」中關於預設值帶入的行為。

## Impact

- `frontend/src/components/SelectedVideos.vue`:`loadSettings()` 組 `targetDirPath` 前套用日期前綴翻新邏輯;新增 helper(如 `rolloverDatePrefix`)。
- 可能涉及 `frontend/src/stores/download.ts`(`lastWorkDirName` 的讀取點),視 helper 落點而定。
- 測試:`frontend/src/tests/SelectedVideos.test.ts`。
- 不影響後端、不影響 localStorage 既存值(僅在顯示/帶入時翻新)。
