## Why

「最新影片」清單目前用後端 `downloaded_today` 旗標判斷一支影片是否已下載，但它**只掃描今天的日期資料夾** `<output_path>/<YYYYMMDD>/`。實務上使用者的下載散落在過去多個日期資料夾裡；同一支影片若是前幾天下載的，今天再看到它時 checkbox 仍可勾選、會再下載一次造成重複檔案。

使用者要的是「**只要這支影片的檔案已經存在於下載根目錄（任一子資料夾）底下，就視為已下載並 disable checkbox**」，把比對視野從「今日資料夾」擴大到「整個 `output_path`」。

後端其實已經有一個掃整個根目錄的工具函式 `_downloaded_stems_all()`（目前用於相似頻道探索的已下載過濾），比對規則與今日版本完全一致，因此這個變更主要是把 `/latest-videos` 改用它，並把名稱不再貼切的欄位 `downloaded_today` 更名為 `downloaded_on_disk`。

## What Changes

- `GET /latest-videos` 的已下載比對範圍由「今日資料夾」擴大為「整個 `output_path` 遞迴掃描」。改用既有 `_downloaded_stems_all()`，比對規則不變（去 `.part`、去 `^\d+_` 序號前綴、與 `_sanitize_filename(title)` 比對）。
- 回應欄位 `downloaded_today` 更名為 `downloaded_on_disk`（語意：存在於下載根目錄任一處）。
- 前端 `LatestVideosFeed.vue` 與 `download.ts` 的 `VideoItem` 型別同步改用 `downloaded_on_disk`；checkbox disabled 判斷、「✅ 已下載」徽章、「允許再次下載」覆寫開關行為皆不變。
- 範圍僅限「最新影片」面板；頻道 / 搜尋 / 發燒 / 相似頻道 / 網址面板**不變**（仍只用 session 端 `download.isDownloaded`）。
- 比對採純標題比對：跨整個資料庫時，sanitize 後標題相同的不同影片（重複標題 / 不同頻道）會被互相誤判為已下載——此為已接受的取捨，使用者可用既有「允許再次下載」開關覆寫。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `latest-videos-feed`: `/latest-videos` 的已下載比對由今日資料夾擴大為整個下載根目錄；回應欄位 `downloaded_today` 更名為 `downloaded_on_disk`；前端 disabled / 徽章 / 覆寫開關沿用同一旗標。

## Impact

- 後端：`backend/main.py` `get_latest_videos`（約 L2055）將 `_today_downloaded_stems()` 換成 `_downloaded_stems_all()`，並把欄位名改為 `downloaded_on_disk`。
- 前端：`frontend/src/components/LatestVideosFeed.vue`（`isAlreadyDownloaded`、L114 等）與 `frontend/src/stores/download.ts`（`VideoItem` 型別）把 `downloaded_today` 改為 `downloaded_on_disk`。
- `_today_downloaded_stems()` / `_today_download_dir()` 若無其他呼叫者可保留或清理（屬實作細節，不在此規格範圍硬性要求）。
- 效能：`_downloaded_stems_all()` 每次 `/latest-videos` 請求會對整個 `output_path` 做一次 `rglob("*")`；資料庫很大時掃描成本上升，目前接受不另加快取。
- 其他 endpoint（`/subscriptions/{channel_id}/videos`、`/trending-videos`、`/search-videos`）不接收/不回傳此欄位。
