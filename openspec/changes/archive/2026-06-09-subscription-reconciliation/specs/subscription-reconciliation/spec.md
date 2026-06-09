## ADDED Requirements

### Requirement: 訂閱對帳後端路由

系統 SHALL 提供 `POST /subscriptions/reconcile`，接受 JSON body `{"channel_ids": [<string>...]}`（來自使用者 Takeout `subscriptions.csv` 的頻道 id 清單）。系統 SHALL：

1. 以登入帳號抓取目前 API 訂閱清單（沿用 `subscriptions.list(mine=true)` 分頁邏輯），得到 `api_ids`。
2. 計算差集 `missing = unique(channel_ids) − api_ids`（Takeout 有、API 沒有）。
3. 對 `missing` 以 `channels.list(part="id")` 每批最多 50 個 id 查詢；查得到的歸為**不同步**（`desynced`）、查不到的歸為**死頻道**（`dead`）。
4. 回傳 `{"takeout_count", "api_count", "missing_count", "dead": [...], "desynced": [...]}`。

`channel_ids` 為空或缺漏時 SHALL 回 400（或等效錯誤），且 MUST NOT 呼叫任何 YouTube API。配額 SHALL 計入：`subscriptions.list` 每頁 1、`channels.list` 每批 1。

#### Scenario: 對帳找出死頻道與不同步頻道

- **WHEN** 呼叫 `POST /subscriptions/reconcile`，body 含 5 個 channel_id，其中 3 個已在 API 訂閱清單、1 個 `channels.list` 查無、1 個 `channels.list` 查得到但不在 API 清單
- **THEN** 回傳 `takeout_count=5`、`api_count`=目前訂閱數、`missing_count=2`
- **AND** `dead` 含那 1 個查無的 id
- **AND** `desynced` 含那 1 個查得到但 API 漏掉的 id

#### Scenario: 全部一致

- **WHEN** 上傳的 channel_ids 全部都在 API 訂閱清單中
- **THEN** `missing_count=0`、`dead` 與 `desynced` 皆為空陣列

#### Scenario: 空清單不打 API

- **WHEN** 呼叫 `POST /subscriptions/reconcile`，`channel_ids` 為空或缺漏
- **THEN** 回傳錯誤（400 或等效）
- **AND** MUST NOT 呼叫 `subscriptions.list` 或 `channels.list`、MUST NOT 計入 quota

### Requirement: Takeout CSV 前端解析

系統 SHALL 於前端（client-side）解析使用者選擇的 Takeout `subscriptions.csv`：略過標頭列，從每列第一欄取 `channel_id`（`UC...`），並保留每筆的 `title` 與 `channel_url` 供結果顯示。解析 SHALL 容忍 UTF-8 BOM 與空白列。系統 MUST NOT 將整份 CSV 檔上傳後端，只送出 `channel_id` 清單至 `POST /subscriptions/reconcile`。

#### Scenario: 解析標準 Takeout CSV

- **WHEN** 使用者選擇含標頭 `Channel Id,Channel Url,Channel Title` 與多列資料的 `subscriptions.csv`
- **THEN** 系統取出各列的 `channel_id`，並保留對應 `title` / `channel_url`
- **AND** 僅將 `channel_id` 清單送往後端對帳

#### Scenario: 非預期檔案給出錯誤回饋

- **WHEN** 使用者選擇的檔案解析不出任何 `channel_id`（格式錯誤或非 subscriptions.csv）
- **THEN** 系統以錯誤 toast 提示檔案無法解析
- **AND** MUST NOT 呼叫後端對帳

### Requirement: 引導式對帳精靈

系統 SHALL 提供 step-by-step 對帳精靈：Step 1 以圖文指引使用者匯出 Takeout，含可點擊的 Google Takeout 連結，並以明確、與 Takeout 現行 UI 一致的步驟說明：(a) 在 Takeout 先按「取消全選」，再只勾選「YouTube 和 YouTube Music」；(b) 點該項的「包含所有 YouTube 資料」按鈕（**非**「進階」），在跳出的清單先按「取消全選」，再只勾選「訂閱內容」並確定；(c) 格式選 CSV、建立匯出；(d) 收到 Google email 後下載 zip、解壓縮取出 `subscriptions.csv`。Step 2 提供檔案選擇／拖曳上傳 `subscriptions.csv`；Step 3 呈現比對結果——Takeout 總數、API 看到數、死頻道數、與**不同步頻道清單**（每筆顯示標題並提供「在 YouTube 開啟」連結）。比對進行中 SHALL 有 loading 狀態，失敗 SHALL 以錯誤 toast 回饋。

#### Scenario: 完成對帳並列出不同步頻道

- **WHEN** 使用者在精靈上傳有效的 `subscriptions.csv` 並完成比對
- **THEN** 顯示 Takeout 總數、API 看到數、死頻道數
- **AND** 列出每個不同步頻道的標題與「在 YouTube 開啟」連結

#### Scenario: 指引步驟含正確的 Takeout 匯出說明

- **WHEN** 使用者開啟對帳精靈的 Step 1
- **THEN** 顯示可點擊的 Google Takeout 連結
- **AND** 說明包含「先取消全選再只勾 YouTube 和 YouTube Music」「點『包含所有 YouTube 資料』後先取消全選再只勾『訂閱內容』」「格式 CSV、等 email 下載解壓」等步驟

#### Scenario: 對帳失敗顯示錯誤

- **WHEN** 對帳請求失敗（網路或後端錯誤）
- **THEN** 顯示錯誤 toast
- **AND** 精靈停留在可重試的狀態

### Requirement: 不同步頻道的手動再同步輔助

由於 YouTube Data API 無法刪除「不在 `subscriptions.list` 中」的訂閱（取得不到其 `subscription_id`），系統 MUST NOT 嘗試以 API 自動退訂／重訂不同步頻道。系統 SHALL 改以**引導使用者在 YouTube 網站手動退訂再訂**的方式輔助再同步：

- 不同步區 SHALL 顯示手勢說明（在 YouTube 該頻道點「已訂閱」→「取消訂閱」→ 再點「訂閱」），並 SHALL 明確警告「退訂後務必再次訂閱，避免真的漏掉訂閱」。
- 每個不同步頻道列 SHALL 提供「已處理」勾選；勾選狀態 SHALL 本地持久化（localStorage），關閉並重新開啟精靈後仍保留。
- 不同步區 SHALL 顯示已處理進度（例如「已處理 X / N」）。

#### Scenario: 標記頻道為已處理並持久化

- **WHEN** 使用者勾選某不同步頻道列的「已處理」
- **THEN** 該列呈現已處理狀態、進度計數 +1
- **AND** 關閉精靈再重新開啟後，該列仍為已處理

#### Scenario: 顯示手動再同步手勢與漏訂警告

- **WHEN** 比對結果含至少一個不同步頻道
- **THEN** 不同步區顯示「在 YouTube 退訂再訂」的手勢說明
- **AND** 顯示「退訂後務必再次訂閱」的警告

### Requirement: 重新對帳

系統 SHALL 在比對結果頁提供「重新對帳」動作，使用**已解析的 `channel_ids`** 直接重新呼叫 `POST /subscriptions/reconcile`，MUST NOT 要求使用者重新上傳 CSV。重新對帳進行中 SHALL 有 loading 狀態，完成後 SHALL 以最新結果取代原結果。

#### Scenario: 手動再同步後重新對帳

- **WHEN** 使用者在結果頁點「重新對帳」
- **THEN** 系統以原本已解析的 `channel_ids` 重新呼叫對帳，不需重新上傳
- **AND** 以最新的 `missing` / `desynced` 結果更新畫面

#### Scenario: 結果可能因 YouTube 同步延遲而未立即下降

- **WHEN** 使用者剛在 YouTube 手動退訂再訂後立即「重新對帳」
- **THEN** 不同步數量 MAY 尚未下降（YouTube `subscriptions.list` 同步有延遲）
- **AND** UI MUST NOT 暗示「未下降＝再同步失敗」
