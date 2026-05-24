## ADDED Requirements

### Requirement: 使用者興趣 Profile 建構

系統 SHALL 在使用者首次進入「同類新頻道」tab 時建立其興趣 profile，profile 內容包含：訂閱頻道集合、訂閱頻道所屬的 category 直方圖、從訂閱頻道 metadata 萃取的 keyword 集合，以及依訂閱頻道標題集合偵測的主要語言（'cjk' / 'latin' / 'mixed'）。Profile MUST 以 email 為 key 同時存於 backend in-memory cache 與磁碟 (`~/.yt-mp3-tool/discovery_profiles/{email}.json`)；磁碟 cache MUST 跨 backend 重啟保留。

#### Scenario: 首次切 tab 觸發 profile build

- **WHEN** 已登入使用者首次切換到「同類新頻道」tab
- **THEN** backend 呼叫 `subscriptions.list?mine=true` 取得訂閱頻道集合
- **AND** 對訂閱頻道呼叫 `channels.list?part=snippet,brandingSettings` 批次取得 metadata
- **AND** 從 `brandingSettings.channel.keywords` 與 `snippet.title` 萃取 keyword 集合，按頻率排序保留 top 8 組
- **AND** 從每個訂閱頻道的最近影片取得 `categoryId` 建立 category 直方圖
- **AND** 將 profile 存於 cache，key = 使用者 email

#### Scenario: 再次進入 tab 重用 cache

- **WHEN** 使用者在同一個 backend session 內再次切換到「同類新頻道」tab
- **THEN** 不重新打 YouTube API 建構 profile
- **AND** 直接使用 cache 中已存在的 profile

#### Scenario: backend 重啟後重用磁碟 profile

- **WHEN** backend process 重啟後，使用者再次進入「同類新頻道」tab
- **AND** 該 email 的磁碟 profile 檔案存在
- **THEN** 系統 MUST 從磁碟讀取 profile 並還原到 in-memory cache，不重新呼叫 `subscriptions.list` 與 `channels.list`
- **AND** 仍會依照前次保存的 keyword 與語言設定撈取候選影片

#### Scenario: 使用者手動重新分析

- **WHEN** 使用者在「同類新頻道」UI 點擊「🔁 重新分析」按鈕
- **THEN** 前端呼叫 `/discovery/similar-channels?force_rebuild=true`
- **AND** 系統 MUST 忽略既有 in-memory 與磁碟 cache，重新呼叫 `subscriptions.list` + `channels.list` 等 API 建構新 profile
- **AND** 新 profile MUST 覆寫磁碟檔案，舊候選池清空，候選依新 profile 重撈

#### Scenario: 切換帳號隔離

- **WHEN** 使用者從帳號 A 切換到帳號 B 並進入「同類新頻道」tab
- **THEN** 系統使用帳號 B 的 email 作為 cache key，不會回傳帳號 A 的 profile 結果

#### Scenario: 沒有訂閱頻道的使用者

- **WHEN** 使用者沒有任何訂閱頻道時進入「同類新頻道」tab
- **THEN** 系統回傳空狀態 + 提示文字「請先訂閱至少一個頻道才能使用此功能」

### Requirement: 候選影片池建構（兩階段）

系統 SHALL 以兩階段策略建構候選影片池：fast phase 使用 `videos.list?chart=mostPopular` 依 top categories 撈熱門影片；full phase 額外使用 `search.list?type=channel&q=keywords` 找相似頻道並抓其 uploads。兩 phase 結果合併、過濾、排序後 cache 整份候選池。

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
- **THEN** 系統 MUST 移除已存在於使用者下載輸出資料夾的影片（依檔名 stem 比對）

#### Scenario: 相關性過濾（profile.keywords 非空時）

- **WHEN** 候選池建構完成且 profile 已萃取出至少 1 個 keyword
- **THEN** 系統 MUST 移除「title 與 channel_title 都未命中任何 keyword、且沒有 `_matched_keyword` 標記」的影片
- **AND** 此過濾不適用於沒有訂閱頻道或 keyword 萃取失敗（空集合）的使用者

#### Scenario: 語言過濾（profile.lang ≠ "mixed" 時）

- **WHEN** 候選池建構完成且 profile.lang 為 `"cjk"` 或 `"latin"`
- **THEN** 系統 MUST 移除「title 與 channel_title 主要語言皆與 profile.lang 不符」的影片
- **AND** title 或 channel_title 任一處為 `"mixed"` 視為符合（保留邊界情況）
- **AND** profile.lang 為 `"mixed"` 時不施加此過濾

#### Scenario: 候選排序與頻道多樣性

- **WHEN** 候選池建構完成
- **THEN** 系統依公式 `recency × view_velocity × keyword_hit` 排序
- **AND** 每個頻道最多保留 2 部影片

### Requirement: 分頁與「換一批」

系統 SHALL 支援前端「換一批」操作：優先消費 cache 中剩餘的候選影片，僅在 cache 耗盡時才重新打 API；**換一批時 MUST NOT 重新分析 profile**（profile 是 sticky 的，重新分析需明確透過「🔁 重新分析」按鈕觸發）。

#### Scenario: 換一批消費 cache

- **WHEN** 前端帶 `cursor` query 呼叫 `GET /discovery/similar-channels?cursor=<n>`
- **AND** cache 內 cursor 後仍有候選影片
- **THEN** backend 回傳下一頁影片（每頁預設 20 部）+ 新 cursor，**不**消耗 YouTube API 配額

#### Scenario: 換一批 cache 耗盡只重撈候選

- **WHEN** 前端「換一批」時 cache 內 cursor 後已無候選影片
- **THEN** backend 使用既有 profile（記憶體或磁碟 cache）重新撈候選池（fast + full phase）
- **AND** MUST NOT 重新呼叫 `subscriptions.list` 或 `channels.list` 分析訂閱
- **AND** 配額計入 daily quota counter

### Requirement: 一鍵訂閱

系統 SHALL 支援「➕訂閱」按鈕，呼叫 YouTube `subscriptions.insert` 將該頻道加入使用者訂閱。

#### Scenario: 訂閱成功

- **WHEN** 使用者在某影片卡片點擊「➕訂閱」
- **THEN** backend 呼叫 `subscriptions.insert` 並消耗 50 quota units
- **AND** 將該 channelId 加入 cache 中的訂閱集合
- **AND** 從 cache 候選池移除該頻道的所有影片
- **AND** 前端卡片 badge 變為「已訂閱」並於 1~2 秒後淡出移除

#### Scenario: 訂閱失敗（頻道關閉訂閱或 API 錯誤）

- **WHEN** YouTube API 對 `subscriptions.insert` 回傳非 2xx
- **THEN** 前端顯示錯誤 toast「訂閱失敗：<原因>」
- **AND** 卡片保留在列表中，不淡出

### Requirement: Tab UI 整合

系統 SHALL 在前端主介面新增獨立 tab「🔍 同類新頻道」，與既有「訂閱頻道」「熱門影片」「URL 下載」並列。

#### Scenario: Tab 顯示載入進度

- **WHEN** 使用者首次切到此 tab
- **THEN** UI 顯示分階段進度提示（例：「分析訂閱中…」「找出興趣關鍵字…」「挖掘相似頻道…」）
- **AND** fast phase 結果一回來就 render 第一批卡片
- **AND** full phase 結果在背景補完，使用者可看到列表逐步填充

#### Scenario: 卡片視覺與其他 tab 一致

- **WHEN** 此 tab 顯示影片卡片
- **THEN** 卡片視覺結構與既有 trending / 訂閱影片卡片一致（縮圖、標題、頻道名、發布時間、時長、勾選下載按鈕）
- **AND** 額外顯示「➕訂閱」按鈕與「★新頻道」badge

### Requirement: 配額計數整合

系統 SHALL 將所有 YouTube API 呼叫消耗計入既有 daily quota counter（`backend/main.py` 的 `consume_quota`）。

#### Scenario: 完整 profile build 配額計入

- **WHEN** 完整 profile + 候選池 rebuild 執行
- **THEN** 所有 `subscriptions.list`、`channels.list`、`videos.list`、`search.list`、`playlistItems.list` 呼叫均依 YouTube 官方 cost 規格累計入今日 quota
- **AND** 若累計超過每日上限（10000），新呼叫拒絕並回傳明確錯誤
