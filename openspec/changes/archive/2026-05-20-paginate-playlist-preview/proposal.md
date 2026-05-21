## Why

當使用者在「🔗 網址下載」貼上一份包含數十甚至數百部影片的 YouTube 播放清單時，目前 `UrlDownloadFeed.vue` 會把整份清單一次顯示在同一個網格中，並且當清單只有一部影片時還會自動勾選，造成下列問題：

- 解析後畫面很長、捲動成本高，使用者難以一次決定要下載哪些。
- 「全選」按鈕容易讓人不小心把數百部影片一次丟進下載佇列，遠超出後端與本地配額能負擔的量。
- 沒有「分梯次處理」的概念——使用者無法「先抓這 25 部，下載完再回來抓下一批」。

我們希望把 URL 預覽改成分頁顯示，讓播放清單可以一頁一頁、一批一批地下載。

## What Changes

- **UI / `UrlDownloadFeed.vue`**：
  - 解析結果改為分頁顯示，預設每頁 25 部影片；提供下拉選單讓使用者切換每頁 10 / 25 / 50 / 100 部。
  - 在影片網格上下加上分頁列：上一頁 / 下一頁、目前頁數 / 總頁數、跳頁輸入框。
  - 「全選 / 全不選」按鈕的作用範圍改為「**目前這一頁**」，並改名為「全選本頁 / 取消本頁」；另外新增整體狀態顯示「已選 X 部 / 共 Y 部」。
  - **BREAKING（行為變更）**：解析完成後**不再自動勾選任何影片**（包含原本「單一影片自動勾選」的行為），統一由使用者主動勾選。
- **狀態保留**：切換分頁時，先前頁面的勾選狀態必須保留（透過 `downloadStore` 內已存在的 `selected` 集合）。
- **後端 (`backend/main.py`)**：`GET /url-preview` 維持回傳整份解析後的清單；分頁完全在前端切片，不更動 API 介面或 `_sync_url_preview_yt_dlp` 的行為。
- **新規格 (`specs/url-download-preview/spec.md`)**：建立此能力的正式規格，記錄解析、分頁、選取、與下載佇列整合的需求。

## Capabilities

### New Capabilities
- `url-download-preview`: 透過貼上 YouTube 影片或播放清單網址產生預覽清單，支援分頁顯示、每頁勾選與整合下載佇列，讓大型播放清單能夠分梯次下載。

### Modified Capabilities
<!-- 目前沒有其他既有 spec 描述 URL 預覽行為（archived change 未產出 spec），故無 modified capabilities。 -->

## Impact

- **前端**：`frontend/src/components/UrlDownloadFeed.vue` 模板與 `<script setup>` 邏輯需新增分頁狀態（`pageSize`、`currentPage`）、分頁工具方法、與分頁 UI；CSS 需新增分頁列樣式。
- **下載 store**：不需改動 `frontend/src/stores/download.ts`，沿用既有 `toggle / isSelected / isDownloaded`。
- **後端**：`backend/main.py` 不需改動，`GET /url-preview` 維持原行為。
- **UI 行為相容性**：移除「單一影片自動勾選」的行為屬於使用者體驗變更，需在 release notes / 測試報告中註明。
- **測試**：`ui-tests/` 內現有的 Playwright walkthrough 若有觸發 URL 下載流程的步驟，需更新對自動勾選的預期。
