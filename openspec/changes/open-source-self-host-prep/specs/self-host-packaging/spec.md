## ADDED Requirements

### Requirement: 公開 release 不含個人憑證

公開散布的 release zip 與其建置流程 SHALL NOT 包含開發者個人的 `client_secret.json`。建置流程（`build.bat` 與 CI）MUST 在缺少該檔時仍能成功產出 zip，且產出的 zip 內不得存在任何 `client_secret.json`。

#### Scenario: build.bat 不再 stage client_secret

- **WHEN** 執行 `scripts/build.bat` 產生 release bundle
- **THEN** bundle 與最終 zip 內不包含 `client_secret.json`
- **AND** 缺少 `tools/client_secret.json` 不會導致 build 失敗

#### Scenario: CI 不注入 client_secret

- **WHEN** GitHub Actions `release.yml` 在 tag 推送後執行
- **THEN** 不執行任何將 `client_secret.json` 寫入 `tools/` 或 bundle 的步驟
- **AND** 公開 release 的 zip 不含 `client_secret.json`

### Requirement: 內建轉檔工具維持打包

release zip MUST 持續內建 `ffmpeg.exe` 與 `mp3gain.exe`，使自架者無須自行安裝即可使用轉檔與音量正規化功能。

#### Scenario: zip 內含 ffmpeg 與 mp3gain

- **WHEN** 自架者解開公開 release zip
- **THEN** exe 同目錄存在 `ffmpeg.exe` 與 `mp3gain.exe`
- **AND** 啟動程式後 `ffmpeg -version` 自我檢查通過

### Requirement: 隨附第三方授權聲明

release zip MUST 隨附第三方授權聲明檔（涵蓋 ffmpeg、mp3gain 的 GPL 授權與原始碼取得方式），以符合 GPL 散布要求。

#### Scenario: zip 內含第三方授權檔

- **WHEN** 自架者解開公開 release zip
- **THEN** 內含 `THIRD-PARTY-NOTICES`（或等義檔案），列出 ffmpeg / mp3gain 的授權條款與原始碼來源連結

### Requirement: 缺憑證時提供中文設定引導

當啟動時找不到 `client_secret.json`，系統 SHALL 回應一則繁體中文引導訊息，指引自架者前往安裝文件完成 GCP 憑證設定，而非僅顯示通用錯誤。

#### Scenario: 啟動缺憑證

- **WHEN** 自架者啟動程式但 exe 同目錄沒有 `client_secret.json`
- **THEN** 嘗試登入時回傳的訊息明確說明需自行申請 GCP OAuth 憑證並放到 exe 同目錄
- **AND** 訊息指向自架安裝文件
