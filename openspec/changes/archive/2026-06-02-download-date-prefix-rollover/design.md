## Context

「下載到」對話框的預設資料夾名稱在 [SelectedVideos.vue](frontend/src/components/SelectedVideos.vue#L183) 的 `loadSettings()` 決定:

```
targetDirPath = joinPath(outputPath, lastWorkDirName || todayYyyymmdd())
```

`lastWorkDirName` 來自 localStorage(`yt_mp3_last_work_dir`),優先級高於今日日期,因此隔天啟動仍帶入舊日期前綴。本變更僅調整此預設值的計算,純前端。

## Goals / Non-Goals

**Goals:**
- 啟動帶入預設資料夾名稱時,自動把開頭的 `YYYYMMDD` 日期前綴翻新為當日,保留後面的標籤。
- 對「無日期前綴」與「已是當日」的名稱維持原樣(零意外更動)。

**Non-Goals:**
- 不變更 localStorage 內既存值的儲存格式(僅在帶入顯示時翻新)。
- 不動後端下載 API 與 `target_dir` 安全處理。
- 不驗證日期是否為合法日曆日期(寬鬆判斷)。

## Decisions

**1. 翻新邏輯落在前端 helper `rolloverDatePrefix(name)`**
- 規則:`^(\d{8})(.*)$` 比對。匹配時,以 `todayYyyymmdd()` 取代第 1 群組,串回第 2 群組;只有當原前綴 ≠ 今日才替換(等值時直接回傳原字串)。不匹配則原樣回傳。
- 落點:在 `loadSettings()` 組 `targetDirPath` 時,把 `download.lastWorkDirName` 經 `rolloverDatePrefix()` 後再 `joinPath`;`lastWorkDirName` 為空時走原本的 `todayYyyymmdd()` 分支。
- 替代方案:在 store 讀取 `lastWorkDirName` 時就翻新 → 否決,會把翻新副作用散到 store,且 store 不應依賴「今日」這種時間概念;集中在元件的預設值計算更內聚。

**2. 寬鬆判斷(前 8 碼數字即視為日期)**
- 由使用者決定;實務上資料夾日期前綴都由本程式產生,不會撞到「剛好 8 碼數字但非日期」的情境,簡化邏輯、免日曆驗證。

## Risks / Trade-offs

- [使用者刻意保留舊日期資料夾名] → 影響極小:這只改「預設帶入值」,使用者隨時可在對話框改回任何名稱;且僅在前綴為日期格式時才翻新。
- [前 8 碼恰為數字但非日期的非典型名稱(如 `12345678_x`)會被當日期翻新] → 寬鬆判斷的已知取捨,使用者已確認接受。
