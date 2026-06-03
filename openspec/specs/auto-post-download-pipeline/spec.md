# auto-post-download-pipeline Specification

## Purpose
定義下載面板的選用「下載後自動串接」流程：一個預設關閉、狀態持久化的勾選框，勾選後於下載完成自動對該批實際下載到的資料夾推進後續階段——mp3 先音量正規化再上傳 Drive、mp4 跳過正規化直接上傳。串接採 best-effort（階段內個別錯誤不中斷後續），由前端協調（重用既有 `/normalize/start`、`/drive/upload` 端點與進度面板），並以 `POST /download` 回傳的 resolved directory 作為串接依據。

## Requirements

### Requirement: 自動串接勾選框
下載面板 SHALL 提供「下載後自動正規化並上傳雲端」勾選框，預設 MUST 為**不勾選**。其狀態 SHALL 持久化（localStorage），跨會話保留。未勾選時，系統行為與現況完全一致（下載完不自動做任何後續動作）。

#### Scenario: 預設不勾選
- **WHEN** 使用者首次開啟下載面板
- **THEN** 該勾選框為未勾選狀態，下載完成後不自動正規化或上傳

#### Scenario: 勾選狀態跨會話保留
- **WHEN** 使用者勾選後重新整理頁面
- **THEN** 勾選框維持勾選狀態

### Requirement: 下載完成後自動推進
當勾選框為勾選時，系統 SHALL 在下載任務完成（SSE `status=done`）後，自動對「該批實際下載到的資料夾」串接後續階段，無需使用者手動觸發。

#### Scenario: mp3 串接正規化再上傳
- **WHEN** 使用者以 `mp3` 格式下載並勾選自動串接
- **THEN** 下載完成後系統 SHALL 自動對下載資料夾執行音量正規化，正規化完成後 SHALL 自動上傳該資料夾到 Drive

#### Scenario: mp4 跳過正規化但仍上傳
- **WHEN** 使用者以 `mp4` 格式下載並勾選自動串接
- **THEN** 系統 SHALL 跳過音量正規化（mp3gain 僅支援 mp3），並仍自動上傳該資料夾到 Drive

#### Scenario: 未勾選時不推進
- **WHEN** 勾選框未勾選且下載完成
- **THEN** 系統 SHALL NOT 自動正規化或上傳

### Requirement: best-effort 續行
自動串接 SHALL 採 best-effort：任一階段的個別項目錯誤（部分檔正規化失敗、Drive API 未啟用或部分檔上傳失敗）SHALL NOT 中斷後續階段；各階段錯誤照既有方式顯示於其進度面板。當 mp3 批次無可正規化的檔時，系統 SHALL 直接進入上傳階段，不卡在正規化。

#### Scenario: 正規化部分失敗仍續上傳
- **WHEN** 自動串接中某些檔正規化失敗
- **THEN** 系統 SHALL 仍繼續上傳階段，並在正規化面板標示失敗項

#### Scenario: 無檔可正規化時直接上傳
- **WHEN** mp3 批次的下載資料夾列不到可正規化的 mp3
- **THEN** 系統 SHALL 跳過正規化直接進入上傳，不停滯於正規化階段

#### Scenario: 上傳階段失敗不影響本機檔案
- **WHEN** 上傳階段因 Drive API 未啟用而失敗
- **THEN** 下載與正規化的本機結果 SHALL 保留不動，上傳面板顯示既有錯誤訊息

### Requirement: 下載回應提供 resolved 目錄
`POST /download` 回應 SHALL 除既有 `task_id` 外，additionally 提供該批 resolved 的下載目錄路徑（`directory`），作為前端串接正規化/上傳的依據。此為加欄位，現有呼叫者 MUST 不受影響。

#### Scenario: 回應含 directory
- **WHEN** 前端送出 `POST /download`
- **THEN** 回應 body 同時包含 `task_id` 與該批實際寫入的 `directory`（含日期子目錄 / target_dir 解析結果）

### Requirement: 進度階段可視
自動串接進行時，系統 SHALL 隨階段切換右欄分頁（下載 → 正規化 → 上傳），讓使用者看見當前進行中的階段。

#### Scenario: 階段推進時切換分頁
- **WHEN** 自動串接由下載進入正規化、再進入上傳
- **THEN** 右欄作用中分頁 SHALL 隨之切換到對應階段的面板
