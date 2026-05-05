# Spec: Quota UI Indicator

## Purpose

定義前端 `HomeView.vue` 對 YouTube API 配額狀態的視覺化呈現。涵蓋 Header 配額狀態列的顯示格式、依使用比例切換的三段警示色彩，以及在使用者操作消耗配額後同步刷新數值的行為，確保 UI 即時反映後端 `GET /quota` 的最新狀態。

## Requirements

### Requirement: 配額狀態列顯示
系統 SHALL 在 `HomeView.vue` 的 Header 區域顯示當前 API 配額使用狀況，格式為 `API Quota: <used> / 10000`。當數值未取得（API 失敗或尚未載入）時，MUST 以「—」或「載入中」字樣作為占位，不阻擋頁面其他功能。

#### Scenario: 元件掛載時取得並顯示配額
- **WHEN** 使用者進入首頁，`HomeView` 元件 `onMounted` 被觸發
- **THEN** 前端呼叫 `GET /quota`，並在 Header 顯示 `API Quota: <used> / 10000`

#### Scenario: API 失敗時不阻擋頁面
- **WHEN** `GET /quota` 回傳錯誤或無法連線
- **THEN** 配額狀態列顯示占位文字（如 `API Quota: — / 10000`），其他功能維持可用

### Requirement: 用量警示色彩
系統 SHALL 依配額使用比例（`used / 10000`）以三段顏色顯示狀態列：

- 安全：低於 80%（< 8000）顯示綠色
- 警告：80% – 95%（8000 – 9499）顯示橘色
- 危險：95% 以上（≥ 9500）顯示紅色

#### Scenario: 安全範圍顯示綠色
- **WHEN** 配額 `used` 為 `5000`
- **THEN** 配額狀態列以綠色（safe）樣式呈現

#### Scenario: 警告範圍顯示橘色
- **WHEN** 配額 `used` 為 `8500`
- **THEN** 配額狀態列以橘色（warning）樣式呈現

#### Scenario: 危險範圍顯示紅色
- **WHEN** 配額 `used` 為 `9700`
- **THEN** 配額狀態列以紅色（danger）樣式呈現

### Requirement: 操作後同步更新
系統 SHALL 在使用者執行會消耗配額的操作後，重新呼叫 `GET /quota` 以更新顯示，確保 UI 即時反映後端最新數值。

#### Scenario: 點擊頻道後更新
- **WHEN** 使用者於側邊欄點擊一個訂閱頻道，前端載入 `ChannelVideos`
- **THEN** 前端在 API 請求結束後重新呼叫 `GET /quota`，狀態列數值同步更新

#### Scenario: 重新載入最新影片後更新
- **WHEN** 使用者觸發「最新影片」重新載入（或元件重新掛載觸發 API）
- **THEN** 前端在 API 請求結束後重新呼叫 `GET /quota`，狀態列數值同步更新
