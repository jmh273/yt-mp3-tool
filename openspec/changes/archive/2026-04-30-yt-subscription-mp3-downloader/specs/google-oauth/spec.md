## ADDED Requirements

### Requirement: 啟動 OAuth 授權流程
系統 SHALL 在使用者未登入時提供授權入口，透過 Google OAuth2 取得 YouTube readonly 存取權限。

#### Scenario: 首次登入
- **WHEN** 使用者點擊「登入 Google」按鈕
- **THEN** 系統開啟瀏覽器至 Google 授權頁面，並在本機 `localhost:8080/callback` 等待回調

#### Scenario: 授權成功
- **WHEN** 使用者在 Google 完成授權
- **THEN** 系統取得 access_token 與 refresh_token，儲存至 `~/.yt-mp3-tool/token.json`，前端顯示已登入狀態

#### Scenario: 授權失敗或取消
- **WHEN** 使用者取消授權或授權失敗
- **THEN** 系統顯示錯誤訊息，保持未登入狀態

### Requirement: 自動 token 刷新
系統 SHALL 在 access_token 過期時自動使用 refresh_token 取得新 token，不需要使用者重新授權。

#### Scenario: Token 自動刷新
- **WHEN** API 呼叫因 token 過期失敗（401）
- **THEN** 系統自動刷新 token 並重試原始請求，使用者無感知

### Requirement: 登出
系統 SHALL 提供登出功能，清除本機 token。

#### Scenario: 使用者登出
- **WHEN** 使用者點擊「登出」
- **THEN** 系統刪除 `~/.yt-mp3-tool/token.json`，前端回到未登入狀態
