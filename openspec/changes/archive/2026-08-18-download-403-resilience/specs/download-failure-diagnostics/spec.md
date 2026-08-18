## Purpose

定義下載失敗的診斷可觀測性。yt-dlp 的警告是判斷失敗根因的主要依據（例如缺少 JavaScript runtime、challenge 解算失敗），目前這些訊息被 `no_warnings` 全數丟棄，導致故障必須靠人工逐層推測才能定位。此能力確保診斷資訊被保留、被記錄、且在程式關閉後仍可追查。

## ADDED Requirements

### Requirement: 保留下載工具的警告訊息

系統 SHALL NOT 抑制 yt-dlp 的警告輸出。警告 SHALL 與錯誤一同被視為診斷資料保留。

#### Scenario: 缺少必要元件時警告可見
- **WHEN** 下載時 yt-dlp 因缺少必要元件而發出警告
- **THEN** 該警告 SHALL 被保留並記錄，SHALL NOT 被丟棄

### Requirement: 失敗寫入檔案 log

系統 SHALL 將下載的警告、錯誤與每次失敗嘗試寫入使用者資料夾下的 log 檔，使程式關閉或 console 視窗消失後仍可追查。

每筆紀錄 SHALL 可辨識對應的影片、發生時間，以及該次為第幾次嘗試。

#### Scenario: console 關閉後仍可追查
- **GIVEN** 一批下載中有影片失敗
- **WHEN** 使用者關閉程式後開啟 log 檔
- **THEN** log SHALL 含有該失敗的錯誤訊息與相關警告

#### Scenario: 重試各次皆有紀錄
- **WHEN** 一支影片經過多次重試後才成功或失敗
- **THEN** log SHALL 含有每一次嘗試的紀錄，而非僅最後一次

#### Scenario: log 可對應到影片
- **WHEN** 使用者檢視 log 中的一筆失敗紀錄
- **THEN** 該筆 SHALL 可辨識是哪一支影片、何時發生、第幾次嘗試
