## Why

目前「最新影片」清單只用瀏覽器 `localStorage.yt_mp3_downloaded_ids` 判斷一支影片是否已下載；當使用者清快取、開不同 profile、或下載是在前次執行 app 期間完成（localStorage 雖然會保留，但若用過 incognito 或被清除）時，這個本機紀錄會缺失，導致剛剛下載過的同一支影片仍然能被勾選並再次下載一遍——形成重複檔案、浪費頻寬。

使用者關心的是「**本機今日的下載資料夾（`output_path/YYYYMMDD/`）裡面有沒有這支影片的檔案**」。把這個判斷改用「比對檔案系統」可以涵蓋上述 localStorage 缺失的情境。跨裝置同步**不在範圍內**（單機 app 假設）。

另外，使用者有時仍會「故意要再下載一次」（重新編碼、覆寫舊檔等），所以需要一個明確的逃生口：UI 上加一個「允許再次下載」開關，預設關閉。

## What Changes

- `GET /latest-videos` 回應的每一筆 video 物件新增 `downloaded_today: bool` 欄位。後端會掃描 `output_path/<今日 YYYYMMDD>/`，將 `_sanitize_filename(title)` 與資料夾中既有檔案的「去掉序號前綴後的 stem」進行比對；命中則為 `true`，否則 `false`。
- 前端 `LatestVideosFeed.vue` 的 checkbox `:disabled` 條件加入 `v.downloaded_today`；title 行右側「✅ 已下載」徽章顯示條件同步擴充。
- 在 latest-feed 的篩選列新增「允許再次下載」開關（預設 OFF）：開啟後，已下載影片的 checkbox 解除 disabled（但 badge 仍保留作為視覺提示），讓使用者可以明確地重新勾選下載。開關狀態僅作用於當次面板瀏覽，不寫回 settings。
- 行為僅作用於「最新影片」面板（與既有 duration filter scope 一致）；發燒、頻道、搜尋面板不變。
- 今日資料夾不存在或無對應檔案時，回傳 `downloaded_today: false`，不影響其他流程。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `latest-videos-feed`: `/latest-videos` 回應新增 `downloaded_today` 欄位（依今日下載資料夾比對）；前端 latest-videos-feed 視圖將其納入 checkbox disabled 判斷與「已下載」徽章顯示，並新增「允許再次下載」開關以覆寫 disabled 行為。

## Impact

- 後端：`backend/main.py` 中 `/latest-videos` 處理器；新增（或重用）一個小工具函式對「今日資料夾的檔案 stem 集合」做計算，呼叫既有 `_sanitize_filename()`。
- 前端：`frontend/src/components/LatestVideosFeed.vue` 模板綁定與下載 store 的整合。
- 沿用既有 `_sanitize_filename` 邏輯與既有的 `YYYYMMDD` 日期格式（`datetime.now().strftime("%Y%m%d")`，local time，與下載端一致）；不變更下載落地行為。
- 既有 `download.markAsDownloaded` / localStorage 機制保留作為「本次 session 已成功下載」的快速旗標；新欄位是補強，不是取代。
- `/subscriptions/{channel_id}/videos`、`/trending-videos`、`/search-videos` 不接收/不回傳新欄位。
