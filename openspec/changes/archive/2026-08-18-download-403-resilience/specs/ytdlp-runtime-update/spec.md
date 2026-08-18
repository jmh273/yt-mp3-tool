## Purpose

定義 yt-dlp 與其 EJS solver 的執行期版本管理：內建版本作為保底、使用者資料夾中的受管版本優先，並在設定頁提供版本查詢、更新與回退。yt-dlp 依賴 YouTube 的內部實作且上游高頻發版，此能力讓使用者不必等待新的發行版即可跟上上游修正。

## ADDED Requirements

### Requirement: 內建保底與受管版本的載入優先序

系統 SHALL 以「使用者資料夾中的受管版本優先、發行版內建版本為保底」的順序載入 yt-dlp。受管版本不存在、損毀或無法載入時，系統 SHALL 自動退回內建版本並記錄該事實，SHALL NOT 因一次失敗的更新而使下載功能完全不可用。

#### Scenario: 無受管版本時使用內建版本
- **WHEN** 使用者資料夾中不存在受管版本
- **THEN** 系統 SHALL 載入發行版內建的版本

#### Scenario: 受管版本優先
- **GIVEN** 使用者資料夾中存在可正常載入的受管版本
- **WHEN** 系統啟動
- **THEN** 系統 SHALL 載入受管版本而非內建版本

#### Scenario: 受管版本損毀時自動退回
- **GIVEN** 受管版本存在但無法載入
- **WHEN** 系統啟動
- **THEN** 系統 SHALL 改為載入內建版本並記錄退回原因
- **AND** 下載功能 SHALL 維持可用

### Requirement: 設定頁的版本查詢與更新

設定頁 SHALL 顯示目前**生效中**的 yt-dlp 與 EJS solver 版本，並標示其來源為內建或受管。系統 SHALL 提供查詢上游最新版本與一鍵更新的操作。

yt-dlp 與 EJS solver 有版本相依，更新 SHALL 將兩者視為一組共同套用，SHALL NOT 允許只更新其中之一。

#### Scenario: 顯示生效版本與來源
- **WHEN** 使用者開啟設定頁
- **THEN** 頁面 SHALL 顯示目前生效的 yt-dlp 與 EJS solver 版本
- **AND** SHALL 標示各自來源為內建或受管

#### Scenario: 兩者共同更新
- **WHEN** 使用者觸發更新
- **THEN** 系統 SHALL 同時取得相容的 yt-dlp 與 EJS solver 版本並一併套用

#### Scenario: 離線時優雅降級
- **WHEN** 使用者觸發版本查詢但無法連線到上游
- **THEN** 系統 SHALL 顯示無法查詢的訊息並維持目前版本
- **AND** SHALL NOT 使既有安裝進入不可用狀態

### Requirement: 回退到內建版本

系統 SHALL 提供將受管版本移除、回退到內建版本的操作。回退後系統 SHALL 立即以內建版本為生效版本。

#### Scenario: 使用者主動回退
- **GIVEN** 目前生效的是受管版本
- **WHEN** 使用者執行回退
- **THEN** 受管版本 SHALL 被移除
- **AND** 設定頁 SHALL 顯示生效版本已變為內建版本
