# CODEX-BRIEF — watchlist-add-and-channel-count

> 給 Codex 的自足實作指示。規格在同目錄 `proposal.md` / `design.md` / `specs/channel-watchlist/spec.md`，但**本檔已含全部實作細節，照做即可，不必再翻 spec**。
> 純前端改動（Vue 3 `<script setup>` + TS）。**後端不動**。

## 你要做的事（共 6 個檔案）

### A. 三個影片 feed 各加一個「加入觀察名單」按鈕

照抄 `frontend/src/components/SimilarChannelDiscoveryFeed.vue` 既有模式（**那是唯一範本，照它的寫法**）：
- 範本按鈕：`SimilarChannelDiscoveryFeed.vue:75-83`
- 範本 handler：`SimilarChannelDiscoveryFeed.vue:142-149`
- 範本 CSS `.watch-btn`：`SimilarChannelDiscoveryFeed.vue:288-297`

**與範本唯一的差異**：範本的影片一定有 `channel_id`，但搜尋/網址預覽的 `channel_id` 可能為空字串 → 本功能要求缺 `channel_id` 時**停用按鈕並提示**。因此按鈕綁定要比範本多一個 `!v.channel_id` 條件。

對三個檔各做：**(1) script 加 import + store + handler、(2) 卡片 `.info` 內加按鈕、(3) `<style scoped>` 貼上 `.watch-btn` CSS**。

#### 三個檔的精確位置

| 檔案 | import 區 | store 宣告 | 卡片 `.info` | handler 放哪 |
|---|---|---|---|---|
| `TrendingVideosFeed.vue` | 65-67 一帶 | 69-71 一帶 | `.info` 在 39-49，按鈕加在 `.meta`(41-48) 之後、`</div>`(49) 之前 | script 內任意函式區 |
| `SearchVideosFeed.vue` | 49-51 一帶 | 53-55 一帶 | `.info` 在 37-40，按鈕加在 `.channel`(39) 之後、`</div>`(40) 之前 | script 內 |
| `UrlDownloadFeed.vue` | 95 一帶 | 98-99 一帶 | `.info` 在 82-85，按鈕加在 `.channel`(84) 之後、`</div>`(85) 之前 | script 內 |

> 三檔的 `VideoItem` 型別都**已 import**（`import { useDownloadStore, type VideoItem } from '@/stores/download'`），handler 參數直接用 `VideoItem`。
> `UrlDownloadFeed.vue` 注意：模板用的是 `pagedVideos` 迴圈變數 `v`，但 `v` 仍是 `VideoItem`，按鈕綁定一樣。

#### (1) script：加 import 與 store（三檔相同）

```ts
import { useWatchlistStore } from '@/stores/watchlist'
// ...其餘 import 不動
const watchlist = useWatchlistStore()
```

#### (2) handler（三檔相同，直接照抄範本，已含缺 channel_id 防衛）

```ts
function handleAddToWatchlist(video: VideoItem) {
  if (!video.channel_id) return
  watchlist.add({
    channel_id: video.channel_id,
    title: video.channel_title || video.channel_id,
    thumbnail: video.thumbnail,
  })
}
```

#### (3) 按鈕模板（三檔相同；比範本多 `!v.channel_id` 停用 + tooltip）

```html
<button
  class="watch-btn"
  :class="{ watched: watchlist.has(v.channel_id || '') }"
  :disabled="!v.channel_id || watchlist.has(v.channel_id)"
  :title="!v.channel_id
    ? '此影片缺少頻道資訊，無法加入觀察名單'
    : (watchlist.has(v.channel_id) ? '已在觀察名單' : '加入觀察名單')"
  @click="handleAddToWatchlist(v)"
>
  <template v-if="!v.channel_id">🚫 無法加入</template>
  <template v-else-if="watchlist.has(v.channel_id)">✓ 已在觀察名單</template>
  <template v-else>👁 加入觀察名單</template>
</button>
```

#### (4) CSS：三檔各自的 `<style scoped>` 末尾貼上（照抄範本 288-297，原樣保留紫色，當作觀察名單動作的一致識別色）

```css
.watch-btn {
  margin-top: 0.4rem;
  padding: 0.3rem 0.7rem; font-size: 0.78rem;
  background: #6a1b9a; color: white; border: none; border-radius: 4px;
  cursor: pointer; align-self: flex-start;
  transition: background 0.15s;
}
.watch-btn:hover:not(:disabled) { background: #4a148c; }
.watch-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
.watch-btn.watched { background: #888; }
```

> `.info` 三檔都已是 `display: flex; flex-direction: column`，`align-self: flex-start` 會讓按鈕靠左、不撐滿。`SearchVideosFeed` / `UrlDownloadFeed` 的 `.info` 無 `.meta`，按鈕直接接在 `.channel` 下方即可。

---

### B. HomeView 左欄分頁標題顯示數量

檔案 `frontend/src/views/HomeView.vue`，`.left-tab-bar` 在 82-97。

- **第 88 行** `訂閱` → 改成 `訂閱 ({{ channels.length }})`
- **第 95 行** `觀察名單` → 改成 `觀察名單 ({{ watchlist.items.length }})`

> `channels` 是現有 ref 陣列（見 259 行 `channels.value.map`），模板中 `channels.length` 自動解包可用。
> `watchlist` 已在此元件宣告並使用（見 128 行 `watchlist.has`）。
> 數量為 0 也要顯示 `(0)`，所以**不要**加 `v-if` 隱藏括號。

---

## 禁區（不要碰）

- **不改後端**任何檔（`backend/`）。`channel_id` 由現有 `/trending-videos`、`/search-videos`、`/url-preview` 提供，搜尋/網址在來源缺值時本就為空字串 —— 那正是 B 處停用按鈕要處理的情況，**不要為了補值去打 API**。
- 加入觀察名單 handler **只呼叫 `watchlist.add`**，不得觸發下載勾選（`download.toggle`）、不得呼叫任何訂閱/下載端點。
- 不動 `SimilarChannelDiscoveryFeed.vue`（它是範本，保持原樣）。
- 不動 `stores/watchlist.ts`（`add` / `has` 沿用現有）。
- 不調整既有卡片版面、checkbox、縮圖、分頁器等行為。

## 驗收分工（重要）

- **你（Codex）只做實作**。
- **不要 archive**、**不要寫或跑 e2e / Playwright**、**不要改 CHANGELOG / 版本號 / 開 tag**。
- e2e verify（`frontend/e2e/verify-watchlist-add-from-feeds.ts`）與最終 archive 由 Claude（審查者）負責。
- 你可以跑 `cd frontend && npm run test:unit` 自我檢查不破既有測試；但**新單元測試也由 Claude 補**，你不必寫測試。

## 完成後請回報

- 列出你改了哪些檔、每檔改了什麼（簡短）。
- 若 `npm run test:unit` 有跑，貼結果摘要。
- 若有任何偏離本 brief 的決定，明確標出（讓 Claude 冷讀 diff 時好對焦）。
