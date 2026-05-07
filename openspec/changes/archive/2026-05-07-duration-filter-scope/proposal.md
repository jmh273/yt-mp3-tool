# 影片時長過濾範圍調整 (Duration Filter Scope)

## 需求描述
使用者希望「影片時長限制 (3 ~ 60 分鐘)」這項功能，**僅對「最新影片」生效**。對於其他的探索與瀏覽功能（如「單一頻道影片」、「發燒影片」、「搜尋影片」等），不應套用該時長限制，以便於使用者自由發掘與下載不同長度的內容（如 Shorts 或長篇演講）。

## 現行狀況與問題
目前系統中，長度限制過濾邏輯主要散佈在兩個地方：
1. `enhance_and_filter_videos()`：該函式不僅被「最新影片」呼叫，也被「單一頻道影片」與「發燒影片」呼叫。
2. `_sync_search_videos_yt_dlp()`：該搜尋函式內部也套用了長度過濾。

這導致所有功能目前都被長度過濾給限制了。

## 實作設計方案

### 後端 API 修改 (`main.py`)
1. **修改 `enhance_and_filter_videos` 簽名**：
   - 增加一個參數 `apply_duration_filter: bool = True` (或預設為 `False`)。
   - 只有在 `apply_duration_filter=True` 時，才會執行 `min_duration_minutes` 與 `max_duration_minutes` 的判斷與剔除邏輯。
2. **調整各端點呼叫**：
   - `/latest-videos` (`get_latest_videos`)：呼叫時傳入 `apply_duration_filter=True`。
   - `/subscriptions/{channel_id}/videos` (`get_channel_videos`)：傳入 `apply_duration_filter=False`。
   - `/trending-videos` (`get_trending_videos`)：傳入 `apply_duration_filter=False`。
3. **移除搜尋過濾**：
   - 針對 `/search-videos` 端點底層的 `_sync_search_videos_yt_dlp` 函式，直接刪除內部讀取 `settings` 時長限制並過濾 `entries` 的程式碼。

### 前端 UI 修改 (`SettingsView.vue`)
- 在「設定」頁面中，將「影片長度限制」的說明文字修改為：「設定**最新影片**顯示的影片長度範圍 (分鐘)」，讓使用者清楚認知此設定的生效範圍。

## 預期影響
- **最新影片**：維持不變，依然只顯示符合長度區間的影片。
- **發燒影片、單一頻道影片、搜尋結果**：將會顯示包含 YouTube Shorts (<1分鐘) 以及超長篇直播存檔 (>60分鐘) 的所有影片。

---
此方案變更單純且可有效解決您的痛點。
**如果您同意此設計，請回覆 `/opsx:apply`，我將立即為您修改程式碼並移除這些不必要的限制！**
