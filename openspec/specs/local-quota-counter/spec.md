# Spec: Local Quota Counter

## Purpose

定義後端對 YouTube Data API v3 配額消耗量的本地計數機制。在 `~/.yt-mp3-tool/settings.json` 持久化儲存當日已使用點數，並依太平洋時間（PT）日界自動歸零，提供 `GET /quota` 端點供前端查詢。涵蓋 `subscriptions().list` 與 `videos().list` 兩種讀取操作的計數規則。

## Requirements

### Requirement: 本地端配額計數欄位
系統 SHALL 在 `settings.json` 持久化儲存 `quota_used`（整數，當日已使用點數）與 `quota_date`（字串，格式 `YYYY-MM-DD`，記錄當前計數所屬之太平洋時間日期）。`DEFAULT_SETTINGS` 中 `quota_used` 初始值 MUST 為 `0`，`quota_date` 初始值 MUST 為空字串 `""`。

#### Scenario: 全新安裝時的預設值
- **WHEN** 使用者首次啟動後端，`settings.json` 尚未含有配額欄位
- **THEN** 系統將 `quota_used` 寫為 `0`、`quota_date` 寫為 `""`，並儲存至 `settings.json`

#### Scenario: 既有設定檔向後相容
- **WHEN** `settings.json` 已存在但缺少 `quota_used` 或 `quota_date` 欄位
- **THEN** 系統以預設值補齊缺漏欄位，不影響其他既有設定

### Requirement: 配額消耗函式
系統 SHALL 提供 `consume_quota(amount: int = 1)` 函式，用於記錄一次 YouTube API 呼叫所消耗的配額點數，並負責每日重置與持久化。

#### Scenario: 同一 PT 日期內累計
- **WHEN** `consume_quota(1)` 被呼叫，且當下太平洋時間日期與 `settings["quota_date"]` 相同
- **THEN** 系統將 `quota_used` 增加 `amount`，並寫回 `settings.json`

#### Scenario: 跨日自動重置
- **WHEN** `consume_quota(1)` 被呼叫，且當下太平洋時間日期與 `settings["quota_date"]` 不同
- **THEN** 系統將 `quota_used` 重置為 `amount`、`quota_date` 更新為當前 PT 日期，並寫回 `settings.json`

#### Scenario: 自訂消耗點數
- **WHEN** `consume_quota(50)` 被呼叫
- **THEN** 系統將 `quota_used` 增加 `50`（或在跨日時重置為 `50`）

### Requirement: YouTube API 呼叫處消耗配額
系統 SHALL 在每次呼叫 YouTube Data API v3 之 `subscriptions().list` 或 `videos().list` 後，呼叫 `consume_quota(1)` 以反映實際配額消耗。

#### Scenario: 取得最新影片時消耗配額
- **WHEN** 後端執行 `get_latest_videos` 並向 YouTube API 發出 `videos().list` 請求
- **THEN** 系統呼叫 `consume_quota(1)`，使 `quota_used` 增加 `1`

#### Scenario: 取得頻道影片時消耗配額
- **WHEN** 後端執行 `get_channel_videos` 並向 YouTube API 發出請求
- **THEN** 系統呼叫 `consume_quota(1)`，使 `quota_used` 增加 `1`

#### Scenario: 取得訂閱列表時消耗配額
- **WHEN** 後端呼叫 `subscriptions().list`
- **THEN** 系統呼叫 `consume_quota(1)`，使 `quota_used` 增加 `1`

### Requirement: 配額查詢 API
系統 SHALL 提供 `GET /quota` 路由，回傳當前配額使用狀況的 JSON 物件。回傳內容 MUST 至少包含 `used`（已使用點數）、`limit`（每日上限，固定為 `10000`）、`date`（當前計數所屬日期）三個欄位。

#### Scenario: 查詢當前配額
- **WHEN** 前端呼叫 `GET /quota`
- **THEN** 回傳 `200 OK` 與 `{ "used": <int>, "limit": 10000, "date": "<YYYY-MM-DD>" }`

#### Scenario: 查詢時若已跨日，自動重置後回傳
- **WHEN** 前端呼叫 `GET /quota`，但 `settings["quota_date"]` 與當前 PT 日期不同
- **THEN** 系統將 `quota_used` 重置為 `0`、更新 `quota_date`、儲存設定，並回傳重置後的數值
