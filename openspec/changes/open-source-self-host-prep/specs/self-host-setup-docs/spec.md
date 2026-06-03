## ADDED Requirements

### Requirement: 繁體中文自架安裝指南

專案 SHALL 提供一份繁體中文自架安裝指南，使一位未接觸過本專案的自架者能依步驟在自己的 Windows 上完成安裝並成功登入。技術名詞 MAY 保留原文。

#### Scenario: 從零到可用

- **WHEN** 自架者依文件步驟操作
- **THEN** 涵蓋下載 release zip、放置 `client_secret.json`、安裝（ffmpeg 已內建免裝）、啟動、完成 Google 授權的完整路徑

### Requirement: GCP 憑證申請步驟完整

安裝指南 MUST 包含自架者自行申請 GCP OAuth 憑證的完整步驟，至少涵蓋：建立 GCP 專案、啟用 YouTube Data API v3（與選用的 Drive API）、設定 OAuth 同意畫面、建立 Desktop App 類型憑證、下載 `client_secret.json` 並放到 exe 同目錄。

#### Scenario: 啟用必要 API

- **WHEN** 自架者依文件啟用 API
- **THEN** 文件指明需啟用 YouTube Data API v3，並說明 Drive API 為選用（僅在使用 Drive 上傳時需要）

#### Scenario: 建立 Desktop App 憑證

- **WHEN** 自架者建立 OAuth 用戶端 ID
- **THEN** 文件指明應用程式類型選「桌面應用程式（Desktop App）」，並說明下載的 JSON 需命名為 `client_secret.json` 放到 exe 同目錄

### Requirement: 同意畫面與 token 過期說明

安裝指南 MUST 說明 OAuth 同意畫面設定的關鍵注意事項：將同意畫面發布到「正式（Production）」以避免「測試」模式下 refresh token 7 天過期；並說明「未驗證應用程式」警告為自架情境下的正常現象與如何安全通過。

#### Scenario: 避免 7 天過期

- **WHEN** 自架者讀到同意畫面設定章節
- **THEN** 文件明確建議發布到正式狀態，並解釋測試模式 token 每 7 天失效會導致每週重新登入

#### Scenario: 未驗證警告說明

- **WHEN** 自架者首次授權看到「未驗證應用程式」警告
- **THEN** 文件說明此為自架自用的正常現象、來自 youtube 受限 scope，並指引如何點「進階 → 繼續」通過

### Requirement: 權限與 scope 說明

安裝指南 MUST 說明本工具請求的 OAuth scope 及其用途，讓自架者理解授權範圍。

#### Scenario: scope 用途透明

- **WHEN** 自架者讀到權限說明章節
- **THEN** 文件列出所請求的 scope（YouTube、Drive file、email）並逐項說明用途
