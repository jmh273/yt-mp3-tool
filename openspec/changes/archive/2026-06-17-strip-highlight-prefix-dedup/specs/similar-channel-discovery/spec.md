## MODIFIED Requirements

### Requirement: 候選影片池建構（兩階段）

系統 SHALL 以兩階段策略建構候選影片池：fast phase 使用 `videos.list?chart=mostPopular` 依 top categories 撈熱門影片；full phase 額外使用 `search.list?type=channel&q=keywords` 找相似頻道並抓其 uploads。兩 phase 結果合併、過濾、排序後 cache 整份候選池。

已下載過濾 SHALL 以影片標題經 `_sanitize_filename` 後的 stem 與下載輸出資料夾內既有檔名 stem 比對；比對前兩側 SHALL 先正規化掉開頭的 `【精華】` 標記（即移除單一個位於開頭的 `精華` token 及其後緊鄰、由清洗全形括號 `【】` 產生的分隔符 `_`/空白），使 `【精華】xxx` 與 `xxx` 互相視為同一支。位於標題中間的 `精華` 字樣 SHALL NOT 被移除。

#### Scenario: Fast phase 先回傳結果

- **WHEN** 前端呼叫 `GET /discovery/similar-channels?phase=fast`
- **THEN** backend 只執行 mostPopular 分支（每個 top category 一次，最多 6 次）
- **AND** 在 2 秒內回傳第一批候選影片 + 分頁 token

#### Scenario: Full phase 補完候選池

- **WHEN** 前端呼叫 `GET /discovery/similar-channels?phase=full`
- **THEN** backend 執行 search.list 分支（最多 8 次）
- **AND** 抓相似頻道的 uploads playlist 近期影片
- **AND** 合併兩 phase 結果，存入 cache 的候選池
- **AND** 回傳完整候選清單

#### Scenario: 過濾已訂閱頻道

- **WHEN** 候選池建構完成
- **THEN** 系統 MUST 移除所有屬於使用者已訂閱頻道的影片

#### Scenario: 過濾已下載影片

- **WHEN** 候選池建構完成
- **THEN** 系統 MUST 移除已存在於使用者下載輸出資料夾的影片（依檔名 stem 比對，比對前套用 `【精華】` 前綴正規化）

#### Scenario: 精華前綴影片視為已下載

- **WHEN** 候選影片標題為 `「【精華】某某訪談」`，且下載輸出資料夾內已有檔名 stem 為 `某某訪談` 的檔案
- **THEN** 系統 MUST 將該候選影片視為已下載並移除

#### Scenario: 標題中間的精華不被當作前綴

- **WHEN** 候選影片標題為 `「2025 精華回顧」`，且下載輸出資料夾內無對應 stem
- **THEN** 系統 MUST NOT 因正規化而誤判其為已下載（僅移除開頭 `【精華】` 標記）

#### Scenario: 相關性過濾（profile.keywords 非空時）

- **WHEN** 候選池建構完成且 profile 已萃取出至少 1 個 keyword
- **THEN** 系統 MUST 移除「title 與 channel_title 都未命中任何 keyword、且沒有 `_matched_keyword` 標記」的影片
- **AND** 此過濾不適用於沒有訂閱頻道或 keyword 萃取失敗（空集合）的使用者

#### Scenario: 語言過濾（profile.lang ≠ "mixed" 時）

- **WHEN** 候選池建構完成且 profile.lang 為 `"cjk"` 或 `"latin"`
- **THEN** 系統 MUST 移除「title 與 channel_title 主要語言皆與 profile.lang 不符」的影片
- **AND** title 或 channel_title 任一處為 `"mixed"` 視為符合（保留邊界情況）
- **AND** profile.lang 為 `"mixed"` 時不施加此過濾
