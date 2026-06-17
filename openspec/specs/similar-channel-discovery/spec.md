# Spec: Similar Channel Discovery

## Purpose

Defines the「🔍 同類新頻道」discovery feature — a backend pipeline + frontend tab that surfaces YouTube videos from channels stylistically similar to (but not already in) the user's subscriptions. Covers: per-user interest profile construction (subscribed channels + extracted keywords + dominant language) with both in-memory and disk persistence, two-phase candidate retrieval (fast `videos.list?chart=mostPopular` + slow `search.list?type=channel`), relevance + language filtering, ranking, pagination ("換一批"), and one-click ➕ subscribe via `subscriptions.insert`. All YouTube Data API calls are counted against the daily quota.

## Requirements

### Requirement: 使用者興趣 Profile 建構

系統 SHALL 在使用者首次進入「同類新頻道」tab 時建立其興趣 profile，profile 內容包含：訂閱頻道集合、訂閱頻道所屬的 category 直方圖、從訂閱頻道 metadata 萃取的 keyword 集合（含每個 keyword 的主 category 歸屬），以及依訂閱頻道標題集合偵測的主要語言（'cjk' / 'latin' / 'mixed'）。保留的 keyword 數量 SHALL 由 per-account 設定 `discovery_keyword_top_n`（預設 8）決定。keyword 選取 SHALL 採 **category-spread**：依 category 直方圖跨類別 round-robin 取詞，直到湊滿設定數量或詞用盡；當帳號僅涵蓋單一 category 群時，category-spread MUST 退化為與全域詞頻 `most_common(N)` 等價的扁平結果。Profile MUST 以 email 為 key 同時存於 backend in-memory cache 與磁碟 (`~/.yt-mp3-tool/discovery_profiles/{email}.json`)；磁碟 cache MUST 跨 backend 重啟保留。

#### Scenario: 首次切 tab 觸發 profile build

- **WHEN** 已登入使用者首次切換到「同類新頻道」tab
- **THEN** backend 呼叫 `subscriptions.list?mine=true` 取得訂閱頻道集合
- **AND** 對訂閱頻道呼叫 `channels.list?part=snippet,brandingSettings` 批次取得 metadata
- **AND** 從 `brandingSettings.channel.keywords` 與 `snippet.title` 萃取 keyword 集合
- **AND** 依 category-spread 跨類別 round-robin 保留 `discovery_keyword_top_n`（預設 8）組 keyword，並記錄每個 keyword 的主 category 歸屬
- **AND** 從每個訂閱頻道的最近影片取得 `categoryId` 建立 category 直方圖
- **AND** 將 profile 存於 cache，key = 使用者 email

#### Scenario: 單峰帳號 category-spread 等價扁平 top-N

- **WHEN** 使用者所有訂閱頻道僅落在單一 category 群
- **THEN** category-spread 選詞 MUST 產生與全域詞頻 `most_common(N)` 相同的 keyword 集合
- **AND** 既有單峰帳號的候選與排序行為不得改變

#### Scenario: 多峰帳號每個興趣群都有關鍵字代表

- **WHEN** 使用者訂閱橫跨多個 category 群（多峰）且 keyword 總數超過設定上限
- **THEN** 保留的 keyword 集合 MUST 跨多個 category 群分布，而非全部來自訂閱數最多的單一群
- **AND** 訂閱數較少的興趣群 MUST 至少有一個 keyword 代表（在設定上限容得下時）

#### Scenario: 再次進入 tab 重用 cache

- **WHEN** 使用者在同一個 backend session 內再次切換到「同類新頻道」tab
- **THEN** 不重新打 YouTube API 建構 profile
- **AND** 直接使用 cache 中已存在的 profile

#### Scenario: backend 重啟後重用磁碟 profile

- **WHEN** backend process 重啟後，使用者再次進入「同類新頻道」tab
- **AND** 該 email 的磁碟 profile 檔案存在
- **THEN** 系統 MUST 從磁碟讀取 profile 並還原到 in-memory cache，不重新呼叫 `subscriptions.list` 與 `channels.list`
- **AND** 仍會依照前次保存的 keyword 與語言設定撈取候選影片

#### Scenario: 使用者手動重新分析套用新設定

- **WHEN** 使用者在「同類新頻道」UI 點擊「🔁 重新分析」按鈕
- **THEN** 前端呼叫 `/discovery/similar-channels?force_rebuild=true`
- **AND** 系統 MUST 忽略既有 in-memory 與磁碟 cache，重新呼叫 `subscriptions.list` + `channels.list` 等 API 建構新 profile
- **AND** 新 profile MUST 依當前 `discovery_keyword_top_n` 設定值與 category-spread 策略重新選取 keyword
- **AND** 新 profile MUST 覆寫磁碟檔案，舊候選池清空，候選依新 profile 重撈

#### Scenario: 切換帳號隔離

- **WHEN** 使用者從帳號 A 切換到帳號 B
- **THEN** 前端 discovery store MUST reset，MUST NOT 沿用帳號 A 的 videos、profile_summary 或 cursor
- **AND** 進入「同類新頻道」tab 時系統使用帳號 B 的 email 作為 cache key，不會回傳帳號 A 的 profile 結果
- **AND** 若帳號 B 已有磁碟 profile，系統 MUST 重用磁碟 profile（不呼叫 `subscriptions.list`/`channels.list` 重新分析），帳號 B 的關鍵字 chips 依其 profile 還原，候選卡片重撈

#### Scenario: 沒有訂閱頻道的使用者

- **WHEN** 使用者沒有任何訂閱頻道時進入「同類新頻道」tab
- **THEN** 系統回傳空狀態 + 提示文字「請先訂閱至少一個頻道才能使用此功能」

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

### Requirement: 候選排序與頻道多樣性

系統 SHALL 在候選池建構完成後依公式 `recency × view_velocity × keyword_hit` 排序，並施加多樣性約束：每個頻道最多保留 `_DISCOVERY_MAX_PER_CHANNEL`（2）部影片；此外於組頁時施加 **per-category 多樣性閘門**，限制單一 category 在可見頁面的佔比（取樣或上限），避免高 view_velocity 的單一熱門類別洗版。多樣性閘門 MUST 為保守設計：當候選不足時不強制補滿，且單峰帳號（候選幾乎同一 category）不得因閘門被大量縮減。

#### Scenario: 候選排序與每頻道上限

- **WHEN** 候選池建構完成
- **THEN** 系統依公式 `recency × view_velocity × keyword_hit` 排序
- **AND** 每個頻道最多保留 2 部影片

#### Scenario: per-category 多樣性避免單類洗版

- **WHEN** 多峰帳號候選池中某單一 category 的影片數量遠多於其他類別
- **THEN** 組頁時該 category 在可見頁面的佔比 MUST 受限（取樣或上限），使頁面跨多個 category 呈現
- **AND** 其他興趣類別的候選 MUST 有機會出現在前幾頁

#### Scenario: 單峰帳號不被多樣性閘門縮減

- **WHEN** 單峰帳號候選池幾乎全部屬於同一 category
- **THEN** per-category 多樣性閘門 MUST NOT 大量移除候選或清空 feed
- **AND** 該帳號可見的候選數量與未加閘門時相當

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

系統 SHALL 移除「同類新頻道」影片卡片上的「➕ 訂閱」按鈕，改提供「👁 加入觀察名單」按鈕。卡片**不再因動作而淡出**；已加入觀察名單後按鈕變更為「✓ 已在觀察名單」並 disabled（單向動作，與「✓ 已訂閱」風格一致）。訂閱動作改由觀察名單面板承擔。

#### Scenario: 加入觀察名單

- **WHEN** 使用者在某影片卡片點擊「👁 加入觀察名單」
- **THEN** 該頻道 (`channel_id`、`title`、`thumbnail`) 加入觀察名單 store，`added_at` 為當下時間
- **AND** 卡片留在列表中，不淡出、不移除
- **AND** 該頻道後續所有出現在同類新頻道的卡片，按鈕 MUST 顯示為「✓ 已在觀察名單」且 disabled
- **AND** 無 YouTube API 呼叫，無配額消耗

#### Scenario: 已在觀察名單的頻道再次出現

- **WHEN** 候選池 reload 後，某已在觀察名單的頻道又出現在列表
- **THEN** 該頻道的卡片按鈕直接渲染為「✓ 已在觀察名單」並 disabled

#### Scenario: 不再有訂閱失敗 toast 從此卡片觸發

- **WHEN** 使用者在「同類新頻道」卡片點任何按鈕
- **THEN** MUST NOT 呼叫 `subscriptions.insert`
- **AND** MUST NOT 出現「訂閱成功」「訂閱失敗」相關 toast（這些 toast 改由觀察名單面板的「➕ 訂閱」動作觸發）

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
- **AND** 額外顯示「👁 加入觀察名單」按鈕與「★新頻道」badge

### Requirement: 配額計數整合

系統 SHALL 將所有 YouTube API 呼叫消耗計入既有 daily quota counter（`backend/main.py` 的 `consume_quota`）。

#### Scenario: 完整 profile build 配額計入

- **WHEN** 完整 profile + 候選池 rebuild 執行
- **THEN** 所有 `subscriptions.list`、`channels.list`、`videos.list`、`search.list`、`playlistItems.list` 呼叫均依 YouTube 官方 cost 規格累計入今日 quota
- **AND** 若累計超過每日上限（10000），新呼叫拒絕並回傳明確錯誤

### Requirement: 關鍵字數量 per-account 設定

系統 SHALL 提供 per-account 設定 `discovery_keyword_top_n`（預設 8）控制「同類新頻道」profile 保留並用於候選撈取／過濾／排序的 keyword 數量。設定變更 SHALL 僅在使用者觸發「🔁 重新分析」(`force_rebuild=true`) 重建 profile 時生效；一般進頁與「換一批」沿用既有 profile，不受新設定影響。前端 SHALL 於設定入口或重新分析說明處告知配額取捨（每多 1 個關鍵字約多一次 `search.list`，100 units）。

#### Scenario: 預設值維持既有行為

- **WHEN** 使用者未調整 `discovery_keyword_top_n`
- **THEN** 系統使用預設值 8
- **AND** profile 建構、候選撈取與過濾行為與本變更前一致

#### Scenario: 調整數值後重新分析生效

- **WHEN** 使用者將 `discovery_keyword_top_n` 設為與預設不同的值並點擊「🔁 重新分析」
- **THEN** 系統以新數值重建 profile（category-spread 選取對應數量的 keyword）
- **AND** full phase `search.list` 呼叫次數與相關性過濾／排序所用 keyword 數量 MUST 對應新數值
- **AND** 新數值寫入該帳號設定並於後續沿用

#### Scenario: 換一批不套用新設定

- **WHEN** 使用者調整 `discovery_keyword_top_n` 後未重新分析，直接點「換一批」
- **THEN** 系統沿用既有 profile 的 keyword，MUST NOT 因設定變更重新分析訂閱
