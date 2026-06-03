## ADDED Requirements

### Requirement: 更新器以公開下載網址運作（gh 為選用）

`update.bat` SHALL 能在未安裝 `gh`、未登入 GitHub 的乾淨 Windows 上完成更新（針對公開 repo），MUST NOT 把 `gh` 或 GitHub 登入當成**必要**前提。為支援 repo 公開前的私有過渡期，更新器 MAY 在偵測到可用 token（`GH_TOKEN` 環境變數或已登入的 `gh`）時帶認證下載私有 release；無 token 時 SHALL 退回匿名公開下載。

#### Scenario: 無 gh 環境執行更新（公開 repo）

- **WHEN** 自架者在未安裝 `gh`、未登入 GitHub 的機器上對**公開** repo 執行 `update.bat`
- **THEN** 更新器以匿名 HTTP 下載最新 release zip 並完成更新
- **AND** 過程不要求任何 GitHub 認證

#### Scenario: 私有過渡期帶認證更新

- **WHEN** repo 仍為私有，且機器上 `gh` 已登入或設了 `GH_TOKEN`
- **THEN** 更新器帶 token 查詢並經 asset API endpoint 下載，成功完成更新

#### Scenario: repo 來源可設定

- **WHEN** 自架者 fork 後設定環境變數指向自己的 repo
- **THEN** `update.bat` 從該 repo 的 release 下載，無須改其他設定

### Requirement: 更新時版本比對

`update.bat` SHALL 比對本機 `_version.txt` 與最新 release 版本，已是最新時 MUST 直接結束、不重新下載。

#### Scenario: 已是最新版

- **WHEN** 本機版本等於最新 release 版本
- **THEN** 更新器顯示已是最新並結束，不下載

#### Scenario: 有新版本

- **WHEN** 最新 release 版本高於本機版本
- **THEN** 更新器下載新版、停止執行中的程式、解壓覆蓋後重啟

### Requirement: 使用者資料不被覆蓋

更新過程 MUST NOT 覆蓋或刪除使用者資料目錄（`%USERPROFILE%\.yt-mp3-tool\` 內的設定、token）與既有的 MP3 下載目錄。

#### Scenario: 更新後資料保留

- **WHEN** 更新器解壓新版覆蓋安裝目錄
- **THEN** `%USERPROFILE%\.yt-mp3-tool\settings.json` 與 `token.json` 維持不變
- **AND** 既有下載的 MP3 不受影響
