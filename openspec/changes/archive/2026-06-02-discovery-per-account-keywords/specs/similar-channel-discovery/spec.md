## MODIFIED Requirements

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

## ADDED Requirements

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
