## Context

右側三個面板各自實作目錄選擇,長出三套不一致的做法:

| 面板 | 標籤 | 選資料夾方式 | 狀態/同步 |
|------|------|------|------|
| 下載 SelectedVideos | 「下載到」 | 只能手打 | store `download.targetDirPath` |
| 正規化 VolumeNormalizer | placeholder「MP3 目錄路徑」 | 只能手打 | local `dirInput` + `dirEdited` + `defaultDir()` |
| 上傳 DriveUploadPanel | 「本地端目錄」 | 「選擇資料夾」按鈕 → 彈窗 | local `dirInput` + `dirEdited` + `defaultDir()` |

正規化與上傳各自複製了一份「未手動編輯則同步預設值」邏輯,且略有差異(正規化多一道 `!store.directory` guard),是潛在 bug 溫床。只有上傳有 folder picker,但在桌面自架工具手打路徑很痛。

picker 的清單目前由 `GET /drive/upload/folders`(`_collect_upload_folders`)提供,它**同時**做兩件事:列出 `output_path` 下的日期子資料夾(通用),以及逐資料夾查 Drive 判斷「是否已上傳」(Drive 專屬、需授權、慢)。正規化若直接共用這支,會為了列本地資料夾而打 Drive API。

icon 與 tooltip 兩項是純展示微調,不需架構決策。

## Goals / Non-Goals

**Goals:**
- 左側五個功能按鈕皆有不重複的 emoji 前綴。
- 訂閱與觀察名單頻道名稱 hover 可見完整名稱(瀏覽器原生 tooltip)。
- 正規化與上傳共用單一目錄選擇元件,消除重複的 `dirEdited`/`defaultDir` 邏輯。
- 統一互動模型:**picker 只填路徑,動作鈕(載入/上傳)才執行**。

**Non-Goals:**
- 不修改下載面板(SelectedVideos)的目錄輸入。
- 不做 custom tooltip 元件(原生 `title` 即可,接受其延遲與不可控樣式)。
- 不改變上傳/正規化既有的後端行為與資料結構。
- 不引入原生作業系統檔案對話框(維持「列出 output_path 下子資料夾」模式)。

## Decisions

### D1. `DirectoryPicker` 為純展示元件,資料由 parent 餵入
元件只擁有 UI(輸入欄 + 尾端 📁 icon + 彈窗)與「填路徑」互動;**不自行抓資料**。
- Props:`modelValue`(路徑)、`folders`(`{ name, directory, badge? }[]`)、`disabled`。
- Emits:`update:modelValue`(雙向綁定路徑)、`pick`(選定某資料夾,供 parent 需要時反應)。
- Rationale:Drive 的清單帶「已上傳」badge,正規化的清單沒有;若元件自行抓資料就得綁死某個端點。讓 parent 決定資料來源與是否顯示 badge,才能同時服務兩種消費者。
- Alternative(否決):元件內建 fetch + 端點可設定 → 把資料來源耦進展示元件,Drive 的 badge 也難以表達。

### D2. 新增通用端點列出工作資料夾,與 Drive 查詢解耦
新增輕量端點(暫名 `GET /folders`)只做 `output_path` 下日期子資料夾的 `iterdir`,回傳 `{ name, directory }`,**不碰 Drive API、不需授權**。
- Drive 面板維持用既有 `GET /drive/upload/folders`(含「已上傳」判定),把 `uploaded` 映成 `badge` 餵給 picker。
- 正規化面板用新端點,`badge` 留空。
- Rationale:「列資料夾」是通用能力,「查是否已上傳」是 Drive 專屬;混在一起會逼正規化付 Drive 授權與 API 成本。
- Alternative(否決):正規化共用 `/drive/upload/folders` → 需 Drive 授權且慢,語意錯誤。

### D3. 互動模型 — picker 只填路徑,動作鈕負責執行(方向 a)
從彈窗選資料夾**只**更新路徑欄位,不自動觸發載入(正規化)或上傳(Drive)。
- Rationale:兩個面板心智模型才真正一致 —「picker 填路徑、動作鈕執行」。Drive 既有行為本就是「選完仍要按上傳」,正規化對齊到同一模型即可。
- Trade-off:正規化從彈窗選資料夾後仍要再按「載入」,多一步;換取兩面板一致與可預期性。Alternative(否決):選完自動載入 → 與 Drive 不一致,且把「選擇」與「執行」兩個概念糊在一起。

### D4. `dirEdited`/`defaultDir` 同步邏輯收進共用元件或共用 composable
目前正規化與上傳各有一份「未手動編輯則跟隨 `defaultDir()`」邏輯。改為集中一處(元件內或一個小 composable),消除重複與既有的細微差異。
- Rationale:重複邏輯是 bug 溫床(正規化多一道 guard)。集中後行為單一可測。

## Risks / Trade-offs

- [正規化原本「打路徑→載入」的使用者多一步從彈窗選] → 仍保留手打路徑路徑;彈窗只是額外便利,不移除輸入欄。
- [新端點與 `/drive/upload/folders` 對「資料夾清單」定義須一致(同為 `output_path` 下日期子資料夾)] → 兩者共用 `output.iterdir()` 排序邏輯,抽共用 helper 避免漂移。
- [共用元件改動 Drive 與正規化兩處 UI,既有元件測試(`DriveUploadPanel.test.ts`、`VolumeNormalizer.test.ts`)會破] → 隨改更新測試,並新增 `DirectoryPicker` 元件測試覆蓋「選擇只填路徑、不執行」。
- [原生 `title` tooltip 在行動裝置無效、有延遲] → 已於 Non-Goals 接受;此工具以桌面自架為主。
