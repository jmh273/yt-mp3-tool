## 1. 後端：Duration 解析與現有 API 擴充

- [x] 1.1 在 `fetch_channel_rss()` 中新增解析 `media:content` 的 `duration` 屬性，回傳 `duration_seconds`（int 或 None）
- [x] 1.2 更新 `fetch_channel_rss()` 回傳的每個 video dict，加入 `duration_seconds` 欄位
- [x] 1.3 確認 `/subscriptions/{channel_id}/videos` 回傳的影片物件包含 `duration_seconds`

## 2. 後端：設定擴充（latest_hours）

- [x] 2.1 在 `DEFAULT_SETTINGS` 新增 `"latest_hours": 24`
- [x] 2.2 在 `SettingsUpdate` Pydantic model 新增 `latest_hours: int | None = None`
- [x] 2.3 在 `update_settings()` 加入 `latest_hours` 的驗證（1 ≤ value ≤ 168）與儲存

## 3. 後端：新增 /latest-videos 端點

- [x] 3.1 新增 `GET /latest-videos` 端點，接受 `hours: int = None` query 參數（None 時讀 settings `latest_hours`）
- [x] 3.2 從 `/subscriptions` 取得全部頻道清單（呼叫 YouTube API）
- [x] 3.3 使用 `asyncio.gather` 並發呼叫 `fetch_channel_rss()`（每頻道 timeout 6s），失敗頻道靜默略過
- [x] 3.4 過濾 `published` 在指定小時內的影片，依 `published` 降序排序
- [x] 3.5 回傳格式：`{"videos": [...]}` 每項包含 `video_id, title, published, thumbnail, url, duration_seconds, channel_title, channel_id`
- [x] 3.6 無符合影片時回傳 `{"videos": []}` HTTP 200

## 4. 前端：HomeView 重構為左右分欄

- [x] 4.1 移除 `HomeView.vue` 中的 `expanded` Set 與 `toggleChannel()` 折疊展開邏輯
- [x] 4.2 將 template 改為 CSS Grid 兩欄結構（`grid-template-columns: 260px 1fr`）
- [x] 4.3 左欄加入 `overflow-y: auto`、固定高度（`height: calc(100vh - header高度)`）使其可獨立捲動
- [x] 4.4 右欄同樣設定獨立捲動
- [x] 4.5 新增 `selectedChannelId: ref<string | null>(null)` 與 `activeView: ref<'none' | 'channel' | 'latest'>('none')`
- [x] 4.6 頻道卡片點擊事件改為設定 `selectedChannelId` 與 `activeView = 'channel'`
- [x] 4.7 選中頻道卡片加上 `.selected` class，套用高亮樣式
- [x] 4.8 點擊已選中頻道時不重新觸發 fetch（比較 selectedChannelId 是否相同）
- [x] 4.9 右欄用 `v-if` 切換：`none` → 佔位文字、`channel` → ChannelVideos、`latest` → LatestVideosFeed
- [x] 4.10 加入 RWD：`@media (max-width: 768px)` 時 grid 改為單欄

## 5. 前端：左欄最新影片按鈕

- [x] 5.1 在左欄頻道清單上方加入「最新影片」按鈕
- [x] 5.2 點擊按鈕時設定 `activeView = 'latest'`，清除 `selectedChannelId`
- [x] 5.3 按鈕處於 active 狀態（activeView === 'latest'）時顯示對應樣式

## 6. 前端：新增 LatestVideosFeed.vue 元件

- [x] 6.1 建立 `frontend/src/components/LatestVideosFeed.vue`
- [x] 6.2 元件掛載時呼叫 `GET /api/latest-videos?hours={latest_hours}`，顯示 loading 狀態
- [x] 6.3 實作 `formatDuration(seconds: number | null): string` 工具函式（MM:SS / H:MM:SS / "—"）
- [x] 6.4 影片卡片顯示：thumbnail、title、channel_title、相對發布時間、格式化 duration
- [x] 6.5 影片卡片加入 checkbox，勾選後加入全域下載清單（與 ChannelVideos 相同行為）
- [x] 6.6 無影片時顯示「此時間範圍內無新影片」提示

## 7. 前端：設定頁新增 latest_hours 欄位

- [x] 7.1 在 `SettingsView.vue` 新增「最新影片時間範圍（小時）」數字輸入框，min=1 max=168
- [x] 7.2 值超出範圍時顯示驗證錯誤並禁用儲存按鈕
- [x] 7.3 儲存時將 `latest_hours` 一併送出至 `PUT /settings`

## 8. 測試更新

- [x] 8.1 更新 `ui-tests/ui_test.py`：TC-03（展開頻道）改為點選左欄頻道觀察右欄出現影片
- [x] 8.2 更新 `ui-tests/ui_test.py`：TC-07（收合）改為點擊最新影片按鈕驗證右欄切換
- [x] 8.3 更新 `ui-tests/skill_test.py`：TC-15 點選頻道改為 `.channel-card` 適配新佈局
- [x] 8.4 新增 TC-20：點擊「最新影片」按鈕後右欄出現影片列表且包含 duration 欄位
- [x] 8.5 新增 TC-21：左右分欄佈局驗證（左欄有頻道清單、最新影片按鈕，右欄有內容區）
