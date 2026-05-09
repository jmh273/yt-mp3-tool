# 設計：影片串流播放預覽

## Context

目前 5 個影片清單元件（[TrendingVideosFeed](../../../frontend/src/components/TrendingVideosFeed.vue)、[LatestVideosFeed](../../../frontend/src/components/LatestVideosFeed.vue)、[ChannelVideos](../../../frontend/src/components/ChannelVideos.vue)、[SearchVideosFeed](../../../frontend/src/components/SearchVideosFeed.vue)、[UrlDownloadFeed](../../../frontend/src/components/UrlDownloadFeed.vue)）都共用相同的卡片結構：

```html
<div class="thumb-wrapper">          <!-- 容器：position:relative -->
  <input type="checkbox"             <!-- 絕對定位左上 -->
         class="video-checkbox" />
  <img class="thumb"                 <!-- 縮圖：佔滿容器 -->
       :src="v.thumbnail" />
  <span class="duration">...</span>  <!-- 絕對定位右下，時長徽章 -->
</div>
```

YouTube 提供官方嵌入 URL `https://www.youtube.com/embed/<video_id>`，加上 `?autoplay=1&rel=0` 等查詢參數即可在 `<iframe>` 內以 16:9 比例正常播放，無需引入額外 JavaScript SDK。

專案使用 Pinia 作為狀態管理（[download store](../../../frontend/src/stores/download.ts)、[quota store](../../../frontend/src/stores/quota.ts)），新元件會沿用同一架構。

## Goals / Non-Goals

**Goals:**
- 點縮圖即可串流播放，不離開應用程式
- 單例 modal：任何時間最多一個播放器開啟，避免多支影片同時播放
- 不破壞既有的 checkbox 加入下載清單行為
- 純前端、零後端、零配額成本

**Non-Goals:**
- 不做音訊獨立播放（不切音訊串流）
- 不做迷你播放器或可拖曳浮動視窗
- 不做下一首自動播放、播放清單、佇列
- 不做播放歷史紀錄
- 不嘗試規避 YouTube 廣告或嵌入限制
- 不做行動裝置特殊全螢幕處理（瀏覽器原生 `<iframe allowfullscreen>` 即可）

## Decisions

### Decision 1: YouTube iframe 嵌入而非後端音訊串流

**選擇**：用 `<iframe src="https://www.youtube.com/embed/<video_id>?autoplay=1&rel=0">`。

**理由**：
- 零後端工作、零配額、零頻寬成本（媒體直接從 YouTube CDN 流到使用者瀏覽器）
- YouTube 官方播放器體驗最完整：解析度切換、字幕、全螢幕、進度條都內建
- 與「下載 MP3」的核心功能職責清楚切開：預覽用 iframe，下載仍走 yt-dlp
- 不需要管 URL 過期、token 重新整理、CDN 分流邏輯

**替代方案**：
- yt-dlp 取得直連音訊 URL 加 `<audio>`：URL 有效期約 6 小時，需要過期重抓邏輯；要為了「無廣告」付出工程量。對 MVP 過度。
- 後端代理串流：需處理 Range request、bandwidth、超時，且得在 Windows 上做 yt-dlp 子程序管理。完全不必要。

**接受的取捨**：
- iframe 會有 YouTube 廣告：這是嵌入 API 的代價，提升價值不夠取代設計簡潔度
- 部分頻道設定不允許嵌入時，iframe 會顯示 YouTube 錯誤頁：尊重 YouTube 政策，不規避

### Decision 2: 單例 modal + Pinia store 而非各元件自帶 modal

**選擇**：建立 `usePlayerStore`（state: `currentVideoId: string | null`、`isOpen: boolean`），在 [App.vue](../../../frontend/src/App.vue) 最外層掛一次 `<VideoPlayerModal />`。各 feed 元件只需呼叫 `player.open(video_id)`。

**理由**：
- 任意時刻只能有一個影片在播放（避免兩支同時喊歌）
- DOM 只有一個 modal 實體 → 切換 video 時 iframe `src` 變更會自動重置播放，不會殘留前一支聲音
- 各 feed 元件不需要自己管理 modal 的 mount / unmount / portal 邏輯
- 與既有 `useDownloadStore` 掛載模式一致

**替代方案**：
- 各 feed 元件自帶一個 modal：DOM 重複、可能多支同時播放、ESC 互相干擾
- 用 provide/inject：與 Pinia 重複造輪子，沒理由

### Decision 3: 點擊事件綁在 `<img class="thumb">` 而非 `.thumb-wrapper`

**選擇**：在 `<img class="thumb">` 上加 `@click="player.open(v.video_id)"`、`style="cursor: pointer"`。

**理由**：
- `.video-checkbox` 與 `.duration` 都是 `position: absolute`，疊在 `.thumb-wrapper` 上方。它們會擋住對應位置的點擊事件不傳到 wrapper，但不會擋到 `<img>` 上的事件（事件目標就是它們本身）
- 點 checkbox 觸發既有 `@change` 處理（不冒泡到 img）
- 點 duration 徽章不會觸發任何行為（也不冒泡到 img）— 接受
- 點縮圖中央（最大面積）開啟播放器，符合使用者直覺

**替代方案**：
- 點 `.thumb-wrapper` 並用 `@click.stop` 在 checkbox 上：要改的事件繫結比較多，沒省下什麼
- 整張卡片可點：與「checkbox 切換」語意衝突，需要區別 click target，複雜度遠高於需求

### Decision 4: Modal 排版採 16:9 響應式 + 視窗 90% 寬上限

**選擇**：
```css
.modal-content {
  width: min(90vw, 1280px);
  aspect-ratio: 16 / 9;
}
```
iframe 直接 `width: 100%; height: 100%`。

**理由**：
- 16:9 是 YouTube 影片的原生比例
- 90vw 上限在小螢幕仍有邊距，1280px 上限在大螢幕避免過度放大畫質
- 用 `aspect-ratio` 一行解決高度，不靠 padding-bottom hack

### Decision 5: 關閉行為三選一（ESC、背景點擊、X 按鈕）

**選擇**：
- ESC 鍵：document-level keydown listener
- 點背景遮罩（不點 modal 內容）：`@click.self="close"` 在 backdrop
- 右上角 `×` 按鈕：`@click="close"`

**理由**：標準 modal 互動，符合使用者預期。

### Decision 6: 開啟時鎖背景 scroll

**選擇**：modal 開啟時設 `document.body.style.overflow = 'hidden'`，關閉時還原。

**理由**：避免使用者用滾輪滑動背景時 modal 仍在前景，視覺干擾。

**替代方案**：使用 CSS `overscroll-behavior` 或全頁 fixed positioning — 對單例 modal 來說過度。

## Risks / Trade-offs

- **[Risk] 部分頻道不允許 iframe 嵌入** → 緩解：YouTube 自己會在 iframe 內顯示「禁止播放」訊息，使用者可關閉 modal 改去 YouTube 直接看。文件中說明，不額外做「fallback 到外開」。

- **[Risk] iframe autoplay 在某些瀏覽器（行動 Safari）會被擋** → 緩解：`autoplay=1` 帶上但不依賴；使用者可手動點 iframe 內的播放鈕。

- **[Risk] 切換影片時 iframe `src` 改變需要瀏覽器重新載入** → 接受：每次切換有 0.5–1 秒空白是合理的，使用者預期會有讀取。

- **[Trade-off] iframe 中有廣告** → 接受：免費獲得 YouTube 完整播放體驗，使用者已熟悉廣告流程。

- **[Trade-off] 切換影片不重置 modal 狀態而是覆寫** → 設計成同 store / 同 modal：呼叫 `player.open(other_id)` 直接換 `currentVideoId`，iframe 會用新 src 重新載入。比 close→open 動畫流暢。

- **[Risk] modal 開啟時前景 modal 與背景元件鍵盤焦點互搶** → 緩解：modal 開啟時 `aria-modal="true"` + 自動 focus 關閉按鈕；按 Tab 不會跳出 iframe（但 YouTube iframe 內部有自己的焦點，由 YouTube 控制）。
