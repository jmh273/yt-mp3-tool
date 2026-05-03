## ADDED Requirements

### Requirement: 觸發下載
系統 SHALL 在使用者點擊「下載」後，依序下載所有已選取影片並轉換為 MP3。

#### Scenario: 開始下載
- **WHEN** 使用者點擊「下載選取影片」按鈕且已選取至少一支影片
- **THEN** 系統呼叫後端 API，後端以 yt-dlp 下載音訊並以 ffmpeg 轉換為 MP3，存至設定路徑

#### Scenario: 無選取影片時點擊下載
- **WHEN** 使用者點擊下載但未勾選任何影片
- **THEN** 系統顯示提示「請先選取至少一支影片」

### Requirement: 即時進度顯示
系統 SHALL 透過 Server-Sent Events 將每支影片的下載進度（百分比）即時推送至前端。

#### Scenario: 下載進度更新
- **WHEN** yt-dlp 下載中
- **THEN** 前端每秒至少更新一次進度條，顯示當前下載百分比與速度

#### Scenario: 轉檔中
- **WHEN** 下載完成，ffmpeg 轉換 MP3 中
- **THEN** 前端顯示「轉換中...」狀態

### Requirement: 下載完成通知
系統 SHALL 在所有影片下載完成後顯示完成通知與輸出路徑。

#### Scenario: 全部完成
- **WHEN** 所有選取影片下載並轉換完成
- **THEN** 系統顯示「下載完成！共 N 支」，並顯示 MP3 儲存路徑

#### Scenario: 部分失敗
- **WHEN** 部分影片下載失敗（如影片已刪除）
- **THEN** 系統顯示成功/失敗各幾支，並列出失敗影片標題與原因

### Requirement: 輸出路徑設定
系統 SHALL 允許使用者設定 MP3 輸出資料夾路徑，預設為 `~/Music/YT-MP3/`。

#### Scenario: 設定輸出路徑
- **WHEN** 使用者在設定頁面輸入新路徑並儲存
- **THEN** 系統將路徑存至設定檔，後續下載使用新路徑

#### Scenario: 路徑不存在
- **WHEN** 指定路徑不存在
- **THEN** 系統自動建立該資料夾
