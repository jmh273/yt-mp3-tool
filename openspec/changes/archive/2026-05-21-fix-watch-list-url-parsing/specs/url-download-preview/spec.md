## MODIFIED Requirements

### Requirement: 網址預覽解析端點
系統 SHALL 提供一個後端端點，能夠接受使用者貼上的 YouTube 影片或播放清單網址，並回傳該網址所對應的影片清單。每筆影片至少包含 `video_id`、`title`、`thumbnail`、`url`、`channel_title`、`duration_seconds` 欄位，以便前端統一以 `VideoItem` 結構處理。

當網址同時帶有 `v=`（影片 ID）與 `list=`（清單 ID）參數時，系統 SHALL 將該網址視為**播放清單**並展開所有 entries 後回傳，而**不**將其當作單一影片回傳一個 `video_id` 為 playlist ID 的假紀錄。每筆 `VideoItem.video_id` MUST 為實際影片 ID（11 碼 YouTube watch ID），而非 playlist ID。

#### Scenario: 解析單一影片網址
- **WHEN** 使用者送出一個僅指向單一影片的網址（例如 `youtube.com/watch?v=...` 或 `youtu.be/...`，不含 `list=` 參數）
- **THEN** 系統 SHALL 回傳僅含一筆 `VideoItem` 的清單，其 `video_id` MUST 為該影片的 11 碼 YouTube ID

#### Scenario: 解析播放清單網址
- **WHEN** 使用者送出指向播放清單（含 `list=` 參數）的網址，包含「純清單網址」（`youtube.com/playlist?list=...`）與「watch URL 同時帶 `v=` 與 `list=` 參數」（`youtube.com/watch?v=X&list=Y`）兩種型態
- **THEN** 系統 SHALL 展開該清單並回傳所有影片的 `VideoItem` 陣列，保留原本播放清單順序；每筆 `video_id` MUST 為該影片的 11 碼 YouTube ID，**不得**為 playlist ID

#### Scenario: 解析失敗
- **WHEN** 使用者送出無法被解析的網址（格式錯誤、影片被刪除、私人清單等）
- **THEN** 系統 SHALL 回傳 4xx 錯誤並附帶可讀的錯誤訊息，前端 SHALL 在預覽區顯示該錯誤而不是空清單

#### Scenario: 空網址
- **WHEN** 使用者未輸入任何網址即送出
- **THEN** 系統 SHALL 不發出後端請求，或者後端 SHALL 回傳 400 Bad Request
