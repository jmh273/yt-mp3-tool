## Why

使用者目前把下載好的 MP3 用隨身碟接 PC、再接手機,以「整個目錄」搬移,流程繁瑣且要插拔兩次。手機端已有 `com.marc.files` 可從 Google 雲端硬碟把整個目錄搬進播放目錄,因此只要 app 能把「當批正規化後的資料夾」鏡像上傳到 Drive,就能完全取代隨身碟。同時使用者一天會分多批下載,現行寫死的 `YYYYMMDD` 單一日期資料夾會讓多批互相混在一起,需要可區分的命名與可改路徑。

## What Changes

- 下載前新增「下載到」對話框,預設為今日 `YYYYMMDD`;使用者可加標籤形成 `YYYYMMDD_<標籤>`(方案 C),不調整就沿用預設日期資料夾(**向後相容**,現行行為不變)。
- `/download` API 接受 `target_dir`(或子資料夾)覆寫,取代後端寫死的 `output_path/YYYYMMDD/`。
- 下載區新增「⬆ 上傳今天到 Drive」按鈕,手動觸發,把指定的「工作資料夾」(預設=最後一次下載/正規化的那批,彈窗可改選)鏡像上傳到 Drive。
- Drive 上維持與本機相同的結構:`<根目錄>/<同名葉資料夾>/`,根目錄預設 `YT-MP3`。上傳前以名稱比對避免重複上傳。
- 新增 Google `drive.file` scope;由於 scope 變更,現有帳號需**重新授權一次**,UI 需說明此一次性流程。
- 上傳目標綁定「正規化過的同一個資料夾」(mp3gain 為原地處理,下載夾即正規化夾)。

非目標(本次不做):自動上傳(維持手動)、Drive 舊檔自動清理、跨網段/區網直傳。

## Capabilities

### New Capabilities
- `download-target-folder`: 下載目標資料夾的覆寫與「日期+標籤」命名(方案 C),支援一日多批分夾,預設沿用今日日期。
- `drive-upload`: 手動把指定工作資料夾鏡像上傳至 Google Drive(find-or-create 資料夾、防重複、`drive.file` 授權與重新同意流程)。

### Modified Capabilities
<!-- 無既有 capability 的需求變更;下載路徑改動以新 capability 表達,既有 download-* 規格不變 -->

## Impact

- **後端** `backend/main.py`:`/download`(加 `target_dir` 覆寫,取代 `_today_download_dir` 寫死路徑,main.py:1940/2121-2127)、新增 `/drive/upload` 與進度、Google OAuth 加 `drive.file` scope 與重新授權處理、Drive 資料夾 find-or-create 與防重複上傳。
- **前端** `frontend/src/stores/download.ts`(下載帶 target_dir)、新增 Drive 上傳 store、下載區 UI(路徑對話框 + 上傳按鈕 + 進度/授權提示);可複用既有 SSE 進度模式。
- **依賴**:新增 Google Drive API 用戶端(google-api-python-client 既有於 OAuth 流程)、`drive.file` scope。
- **設定** `~/.yt-mp3-tool`:新增 Drive 根目錄名等設定欄位。
- **授權**:scope 變更導致現有 token 失效,所有帳號需重新同意一次。
