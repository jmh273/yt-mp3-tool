## 1. 翻新邏輯

- [x] 1.1 在 [SelectedVideos.vue](frontend/src/components/SelectedVideos.vue) 新增 helper `rolloverDatePrefix(name: string): string`,規則 `^(\d{8})(.*)$`,前綴非當日時以 `todayYyyymmdd()` 取代第 1 群組並串回其餘字元,匹配等值或不匹配則原樣回傳
- [x] 1.2 在 `loadSettings()` 組 `targetDirPath` 時,把 `download.lastWorkDirName` 經 `rolloverDatePrefix()` 後再 `joinPath`;`lastWorkDirName` 為空維持走 `todayYyyymmdd()` 分支

## 2. 測試

- [x] 2.1 在 `frontend/src/tests/SelectedVideos.test.ts` 補單元測試,涵蓋 5 個 scenario:純日期翻新、帶標籤翻新保留標籤、已是當日不變、無日期前綴不變、寬鬆判斷(非法日期仍翻新)
- [x] 2.2 執行 `frontend` 既有測試確認無回歸

## 3. 驗證

- [x] 3.1 撰寫 `frontend/e2e/verify-download-date-prefix-rollover.ts`,模擬上次資料夾名為昨日日期前綴,啟動後確認對話框預設帶入當日前綴
- [x] 3.2 跑過 verify 腳本,通過後再建議 verify/archive
