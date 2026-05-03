## Why

目前頻道清單與影片列表垂直堆疊，使用者需要不斷捲動才能切換頻道與瀏覽影片，操作動線不直覺。此外缺乏「跨頻道最新影片」的彙整視圖，無法快速掌握訂閱內容的最新動態。

## What Changes

- **BREAKING** 主頁改為左右分欄佈局：左欄為頻道清單，右欄為影片內容區
- 點選左欄頻道，對應影片即時顯示於右欄（不再折疊展開）
- 新增「最新影片」按鈕，彙整所有訂閱頻道的最新影片並依發布時間排序
- 最新影片列表可依「發布時間範圍」篩選，預設顯示 24 小時內的影片
- 影片卡片新增顯示影片長度（duration）欄位
- 設定頁新增「最新影片時間範圍（小時）」設定項

## Capabilities

### New Capabilities

- `sidebar-layout`: 左右分欄主頁佈局，左欄頻道清單支援點選切換，右欄顯示對應頻道影片，無需折疊/展開
- `latest-videos-feed`: 跨頻道最新影片彙整視圖，依發布時間排序，可依小時數篩選，並顯示影片長度

### Modified Capabilities

（無現有 specs，不適用）

## Impact

- **前端**
  - `HomeView.vue`：重構為 flexbox 左右分欄，移除折疊展開邏輯
  - `ChannelVideos.vue`：改為純列表元件，由父元件控制顯示
  - 新增 `LatestVideosFeed.vue`：跨頻道彙整影片列表元件
  - `SettingsView.vue`：新增 `latest_hours` 設定欄位（整數，預設 24）

- **後端**
  - `main.py`：
    - RSS 解析新增擷取 `media:content duration` 欄位
    - 新增 `GET /latest-videos?hours=24` 端點，彙整所有頻道 RSS 並排序
  - `settings.json`：新增 `latest_hours` 預設值（24）

- **測試**
  - `ui-tests/skill_test.py`：新增 TC-20（最新影片視圖）、TC-21（分欄佈局驗證）
