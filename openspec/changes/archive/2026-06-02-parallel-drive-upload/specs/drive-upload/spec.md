## ADDED Requirements

### Requirement: Drive 上傳並行化

系統 SHALL 以可設定的並發數平行上傳同一批資料夾內的多個檔案,以縮短整批上傳時間。並行前的共用前置步驟——find-or-create 根目錄、find-or-create 葉資料夾、列出葉資料夾既有檔名——SHALL 在 fan-out 前以單一執行緒完成且只執行一次,並行階段 SHALL 僅平行化逐檔的上傳動作。為符合 Google API client 的執行緒安全限制,各並行 worker SHALL 各自使用獨立的 Drive service 物件(共用同一份 credentials),SHALL NOT 跨執行緒共用單一 service 物件。

#### Scenario: 多檔並行上傳

- **WHEN** 使用者上傳一批含多個檔案的資料夾,且並發數設為 N(>1)
- **THEN** 系統 SHALL 最多同時上傳 N 個檔案,前置的資料夾建立與既有檔名比對僅執行一次

#### Scenario: 並發數為 1 時序列上傳

- **WHEN** 並發數設為 1
- **THEN** 系統 SHALL 逐檔序列上傳,行為與現行單執行緒一致

#### Scenario: 各 worker 使用獨立 service

- **WHEN** 並行上傳啟動 N 個 worker
- **THEN** 每個 worker SHALL 持有自己的 Drive service 物件,不與其他 worker 共用同一 service 實例

### Requirement: Drive 上傳並發數可於設定頁調整

系統 SHALL 提供獨立設定 `drive_upload_concurrency`(預設 3),與下載/正規化的 `download_concurrency` 分離。系統 SHALL 把有效並發數夾限於 1..8;非法或缺失值 SHALL 回退為 3。此設定 SHALL 可於設定頁調整。

#### Scenario: 修改並發數後上傳

- **WHEN** 使用者於設定頁把 `drive_upload_concurrency` 設為 5 並觸發上傳
- **THEN** 系統 SHALL 以最多 5 個並行上傳該批檔案

#### Scenario: 缺失或非法值回退預設

- **WHEN** 設定中 `drive_upload_concurrency` 缺失或為非法值(非整數、超出 1..8)
- **THEN** 系統 SHALL 以夾限後的有效值上傳;完全無效時回退為 3

#### Scenario: 與下載並發數獨立

- **WHEN** 使用者調整 `download_concurrency`
- **THEN** `drive_upload_concurrency` SHALL NOT 因此改變,反之亦然

## MODIFIED Requirements

### Requirement: 上傳進度與失敗回報

上傳過程中系統 SHALL 回報每個檔案的進度與最終狀態(成功/跳過/失敗)。上傳失敗 SHALL NOT 影響本機已下載/正規化的檔案,且失敗項目 SHALL 可重新觸發上傳。在並行上傳下,各檔的進度狀態寫入 SHALL 為執行緒安全(各檔更新自身項目,不互相覆蓋);單一檔案失敗 SHALL NOT 中止其他檔案的上傳;批次整體最終狀態 SHALL 於所有並行上傳結束後才標記為完成。

#### Scenario: 顯示逐檔進度

- **WHEN** 上傳進行中
- **THEN** 系統 SHALL 顯示各檔的狀態(pending/uploading/skipped/done/error)

#### Scenario: 上傳失敗可重試

- **WHEN** 某檔上傳因網路或授權問題失敗
- **THEN** 系統 SHALL 標記該檔為錯誤、保留本機檔案不動,並允許使用者重新觸發上傳

#### Scenario: 並行下單檔失敗不影響其他檔

- **WHEN** 並行上傳中某一檔失敗
- **THEN** 系統 SHALL 僅將該檔標記為 error,其餘並行中的檔案 SHALL 繼續上傳至完成

#### Scenario: 整批完成於所有並行結束後標記

- **WHEN** 並行上傳全部結束(含成功、跳過、失敗)
- **THEN** 系統 SHALL 在所有 worker 完成後才將批次狀態標記為 done
