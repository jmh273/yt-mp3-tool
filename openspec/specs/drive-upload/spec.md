# drive-upload Specification

## Purpose

提供「手動把工作資料夾鏡像上傳到 Google Drive」的能力:使用者於下載區手動觸發,系統以最小權限 (`drive.file`) 把指定批次資料夾的內容上傳到 Drive 上對應的根目錄/葉資料夾結構,過程中防止重複上傳、回報逐檔進度與失敗,並支援失敗重試與一次性重新授權。

## Requirements

### Requirement: 手動上傳工作資料夾到 Google Drive

下載區 SHALL 提供「⬆ 上傳今天到 Drive」按鈕,讓使用者手動把指定的工作資料夾鏡像上傳到 Google Drive。系統 SHALL **預設**不在下載完成時自動上傳;唯當使用者於下載面板勾選「下載後自動正規化並上傳雲端」(預設關)時,系統 MAY 於下載(及 mp3 的正規化)完成後自動上傳該批資料夾。按鈕的預設目標 SHALL 為最後一次下載/正規化的工作資料夾;當同日存在多批時,系統 SHALL 允許使用者在上傳前改選要上傳的資料夾。

#### Scenario: 預設上傳最後一批

- **WHEN** 使用者下載並正規化 `20260601_運動` 後按下「上傳今天到 Drive」且未改選
- **THEN** 系統 SHALL 上傳 `20260601_運動` 資料夾的內容到 Drive

#### Scenario: 一日多批時改選資料夾

- **WHEN** 同日有多個批次資料夾,使用者按上傳並改選 `20260601_晚`
- **THEN** 系統 SHALL 上傳所選的 `20260601_晚` 資料夾,而非預設那一批

#### Scenario: 改選彈窗標示已上傳過的資料夾

- **WHEN** 使用者開啟改選資料夾彈窗,其中某些資料夾先前已上傳過(Drive 對應資料夾已存在且其檔案皆已存在)
- **THEN** 系統 SHALL 在彈窗中以「已上傳」標記標示這些資料夾,使用者得據以判斷要重傳或選別批

#### Scenario: 預設不自動上傳

- **WHEN** 下載任務完成,且使用者未勾選自動串接
- **THEN** 系統 SHALL NOT 自動上傳任何檔案,需由使用者手動觸發

#### Scenario: 勾選自動串接時於下載後自動上傳

- **WHEN** 使用者勾選「下載後自動正規化並上傳雲端」並完成一批下載
- **THEN** 系統 SHALL 於該批(mp3 經正規化、mp4 直接)完成後自動上傳,無需手動按上傳鈕

### Requirement: Drive 上鏡像本機資料夾結構

上傳時系統 SHALL 在 Drive 上維持與本機相同的結構:於根目錄(預設名稱 `YT-MP3`)下,以本機工作資料夾的葉名建立同名子資料夾,並把檔案放入其中。系統 SHALL 以「find-or-create」方式取得資料夾(存在則重用,不存在則建立),避免重複建立同名資料夾。上傳的檔案範圍 SHALL 涵蓋資料夾內的 `.mp3` 與 `.mp4` 檔(mimetype 依副檔名:`audio/mpeg` / `video/mp4`)。

#### Scenario: 鏡像葉資料夾名

- **WHEN** 上傳本機 `<output_path>/20260601_運動/`
- **THEN** 系統 SHALL 確保 Drive 上存在 `YT-MP3/20260601_運動/` 並把該批 `.mp3`/`.mp4` 檔上傳至此

#### Scenario: 重用既有資料夾

- **WHEN** Drive 上 `YT-MP3/20260601_運動/` 已存在
- **THEN** 系統 SHALL 重用既有資料夾,不另建同名資料夾

#### Scenario: 上傳 mp4 檔

- **WHEN** 工作資料夾內含 `.mp4` 檔(mp4 下載批次)
- **THEN** 系統 SHALL 以 `video/mp4` mimetype 將其上傳,不因僅限 mp3 而略過

### Requirement: 防止重複上傳

上傳前系統 SHALL 以檔名在目標 Drive 資料夾內比對,已存在同名檔案者 SHALL 跳過,避免在 Drive 產生重複檔。

#### Scenario: 跳過已存在的檔案

- **WHEN** 使用者重複上傳同一批,且某檔已存在於對應 Drive 資料夾
- **THEN** 系統 SHALL 跳過該檔,不在 Drive 建立第二份同名檔

### Requirement: Drive 根目錄名可於設定頁修改

系統 SHALL 在設定頁提供 Drive 根目錄名稱欄位,預設 `YT-MP3`,使用者可修改。上傳時系統 SHALL 以該設定值作為 Drive 上鏡像的根目錄名。

#### Scenario: 修改根目錄名後上傳

- **WHEN** 使用者在設定頁把 Drive 根目錄名改為 `音樂庫` 並上傳 `20260601_運動`
- **THEN** 系統 SHALL 在 Drive 建立/重用 `音樂庫/20260601_運動/` 並上傳該批檔案

#### Scenario: 未修改時用預設

- **WHEN** 使用者未變更設定即上傳
- **THEN** 系統 SHALL 使用預設根目錄 `YT-MP3`

### Requirement: Drive 上傳採 drive.file 權限與重新授權

系統 SHALL 使用 Google `drive.file` scope 進行上傳(僅能存取 app 自建的檔案,最小權限)。因 scope 由原本僅 YouTube 變更,現有帳號的既有授權 SHALL 失效並需重新同意一次;系統 SHALL 在使用者首次使用上傳功能而授權不足時,引導完成一次性重新授權,並於 UI 說明此為正常的一次性流程。

#### Scenario: 首次上傳觸發重新授權

- **WHEN** 既有帳號(僅有 YouTube 授權)首次按下上傳
- **THEN** 系統 SHALL 引導使用者完成包含 `drive.file` 的重新授權,並在成功後繼續上傳

#### Scenario: 已授權則直接上傳

- **WHEN** 帳號已具備 `drive.file` 授權
- **THEN** 系統 SHALL 直接進行上傳,不再要求重新授權

### Requirement: 上傳進度與失敗回報

上傳過程中系統 SHALL 回報每個檔案的進度與最終狀態(成功/跳過/失敗)。上傳失敗 SHALL NOT 影響本機已下載/正規化的檔案,且失敗項目 SHALL 可重新觸發上傳。

#### Scenario: 顯示逐檔進度

- **WHEN** 上傳進行中
- **THEN** 系統 SHALL 顯示各檔的狀態(pending/uploading/skipped/done/error)

#### Scenario: 上傳失敗可重試

- **WHEN** 某檔上傳因網路或授權問題失敗
- **THEN** 系統 SHALL 標記該檔為錯誤、保留本機檔案不動,並允許使用者重新觸發上傳
