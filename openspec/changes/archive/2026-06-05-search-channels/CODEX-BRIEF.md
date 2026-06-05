# CODEX-BRIEF — search-channels

> 自足實作指示。規格在同目錄 `proposal.md` / `design.md` / `specs/channel-search/spec.md`，**本檔已含全部實作細節，照做即可**。
> 後端 FastAPI（`backend/main.py`）+ 前端 Vue 3 `<script setup>` + TS。
> **前提**：working tree 已含先前 `watchlist-add-and-channel-count` 的改動（`SearchVideosFeed.vue` 已有 `watch-btn` 與 `useWatchlistStore`）。在此基礎上續做。

---

## ⚠️ 中文編碼（務必遵守，避免亂碼）

本專案在 Windows，所有原始碼檔案一律 **UTF-8（無 BOM）**。上一個 change 你曾把測試裡的「全部」寫成「?券」這種亂碼——本次務必避免：

1. **一律以 UTF-8 寫檔**，跟現有檔案一致；不要寫成 UTF-16 / Big5 / 含 BOM。
2. **不要用 Windows 終端機 echo / 管線 / here-string 去寫含中文的檔案內容**（PowerShell 預設編碼會把中文轉壞）。請用你的編輯／檔案寫入工具直接寫 UTF-8，不要繞過終端機編碼。
3. **全形字元原樣保留**：中文標點如 `，`、`：`、`「」`、`（）`、刪節號 `…`、emoji（👁 ✓ ➕ 🚫）必須保持原樣，不要被轉成半形、跳脫成 `\uXXXX` 或變成 `?` / `�`。
4. **寫完含中文的檔案後自我回讀該行驗證**：確認沒有出現 `?`、`�`(U+FFFD)、或像「?券」這種半個字的亂碼；有就重寫。
5. **照抄既有中文風格**：本檔提供的字串（如「搜尋頻道中...」「約耗 100 配額」「✓ 已訂閱」）與既有檔（`SearchVideosFeed.vue` 的「搜尋影片」「載入中...」）直接照抄，不要自行改寫或翻譯。

---

## Part A — 後端：新增 `GET /search-channels`

位置：`backend/main.py`，緊接在 `/search-videos` 路由之後（約 2052 行 `return {"videos": videos}` 那個函式結束處）新增。

**取憑證 + build 的慣例**（照抄專案既有寫法，見 `post_subscription` 692-693）：
```python
creds = require_credentials()
youtube = build("youtube", "v3", credentials=creds)
```

**search.list type=channel 的慣例**（照抄 discovery 分支 1434-1440）：`part="snippet"`, `q=...`, `type="channel"`, `maxResults=50`。

**配額**：成功打 API 後 `consume_quota(_QUOTA_SEARCH_LIST)`（已定義=100，見 1066 行）。

**新路由（sync `def`，與 `get_channel_videos_paginated` 等一致；不要 async）：**
```python
@app.get("/search-channels")
def search_channels(q: str):
    require_credentials()  # 與其他路由一致的登入檢查
    if not q or not q.strip():
        return {"channels": []}
    creds = require_credentials()
    youtube = build("youtube", "v3", credentials=creds)
    resp = youtube.search().list(
        part="snippet",
        q=q.strip(),
        type="channel",
        maxResults=50,
    ).execute()
    consume_quota(_QUOTA_SEARCH_LIST)
    channels = []
    for item in resp.get("items", []):
        cid = (item.get("id", {}) or {}).get("channelId")
        if not cid:
            continue
        snippet = item.get("snippet", {}) or {}
        thumbs = snippet.get("thumbnails", {}) or {}
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
        channels.append({
            "channel_id": cid,
            "title": snippet.get("title", ""),
            "thumbnail": thumb,
        })
    return {"channels": channels}
```
> 空白 `q` 在打 API 前就 return → **不計 quota、不呼叫 search.list**（spec 要求）。

**後端測試**（沿用既有 `patch("main.build")` 慣例，參考 `backend/tests/test_discovery.py` / `test_subscriptions.py` 如何 mock `build` 與斷言 quota）：
- `q=lofi` → 呼叫一次 `search().list(..., type="channel")`，回傳含 `channel_id/title/thumbnail`，且 `quota_used` 增加 100。
- `q=""`（空白）→ 回 `{"channels": []}`，且 **`build` / `search` 未被呼叫**、quota 不變。

**禁區（後端）**：不動 `/search-videos`（yt-dlp、0 quota）；不抓 uploads / videos.list（只一發 search.list）。

---

## Part B — 前端：搜尋範圍 checkbox（`SearchVideosFeed.vue`）

### B1. 模板：在 `.search-bar`（13-16 行的 button 之後、`</div>` 之前那層）下方，`feed-header` 內加 checkbox 列：
```html
      <div class="scope-row">
        <label><input type="checkbox" v-model="searchVideos" /> 影片</label>
        <label><input type="checkbox" v-model="searchChannels" /> 頻道 <span class="quota-hint">(約耗 100 配額)</span></label>
      </div>
```

### B2. 搜尋按鈕：兩者皆未勾時 disabled。把第 13 行的 `:disabled="loading"` 改為：
```html
        <button class="search-btn" @click="handleSearch" :disabled="loading || channelLoading || (!searchVideos && !searchChannels)">
```

### B3. script 新增 state 與 import：
```ts
import { apiGet } from '@/api'            // 已有
import { apiPost } from '@/api'           // 新增（訂閱用）；或合併成一行 import { apiGet, apiPost }
// ...
const searchVideos = ref(true)
const searchChannels = ref(false)
const channels = ref<ChannelResult[]>([])
const channelLoading = ref(false)
const channelError = ref('')

interface ChannelResult { channel_id: string; title: string; thumbnail: string }
```

### B4. 改 `handleSearch`：依勾選分頭觸發。把現有 `handleSearch` 改成：
```ts
async function handleSearch() {
  const q = searchInput.value.trim()
  if (!q || (!searchVideos.value && !searchChannels.value)) return
  hasSearched.value = true

  // 影片（既有 yt-dlp 路徑，行為不變）
  if (searchVideos.value) {
    loading.value = true
    error.value = ''
    videos.value = []
    try {
      const data = await apiGet<{ videos: VideoItem[] }>(`/search-videos?q=${encodeURIComponent(q)}`)
      videos.value = data.videos || []
    } catch {
      error.value = '無法載入搜尋結果'
    } finally {
      loading.value = false
    }
  } else {
    videos.value = []
  }

  // 頻道（新路徑，100 quota）
  if (searchChannels.value) {
    channelLoading.value = true
    channelError.value = ''
    channels.value = []
    try {
      const data = await apiGet<{ channels: ChannelResult[] }>(`/search-channels?q=${encodeURIComponent(q)}`)
      channels.value = data.channels || []
    } catch {
      channelError.value = '無法載入頻道搜尋結果'
    } finally {
      channelLoading.value = false
    }
  } else {
    channels.value = []
  }

  quota.refresh()
}
```
> 注意：原本 `handleSearch` 內的 `loading`/`error`/`videos` 重置邏輯已併入上面，**移除舊版**避免重複。

---

## Part C — 前端：頻道結果區與頻道卡（`SearchVideosFeed.vue`）

在影片 `ul.video-grid`（24 行那段）**之前**插入頻道區（spec 要求頻道區排在影片區之前）。整個結果區建議包成：

```html
    <!-- 頻道區（僅勾頻道時） -->
    <section v-if="searchChannels && hasSearched" class="channel-section">
      <h3 class="section-title">頻道</h3>
      <div v-if="channelLoading" class="status">搜尋頻道中...</div>
      <div v-else-if="channelError" class="status error">{{ channelError }}</div>
      <div v-else-if="channels.length === 0" class="status">查無符合的頻道</div>
      <ul v-else class="channel-list">
        <li v-for="c in channels" :key="c.channel_id" class="channel-card">
          <img :src="c.thumbnail" :alt="c.title" width="40" height="40" />
          <span class="channel-name" :title="c.title">{{ c.title }}</span>
          <div class="channel-actions">
            <button
              class="watch-btn"
              :disabled="watchlist.has(c.channel_id)"
              :title="watchlist.has(c.channel_id) ? '已在觀察名單' : '加入觀察名單'"
              @click="addChannelToWatchlist(c)"
            >
              <template v-if="watchlist.has(c.channel_id)">✓ 已在觀察名單</template>
              <template v-else>👁 加入觀察名單</template>
            </button>
            <button
              class="subscribe-btn"
              :disabled="isSubscribed(c.channel_id) || subscribingId === c.channel_id"
              :title="isSubscribed(c.channel_id) ? '已訂閱' : '訂閱'"
              @click="subscribeChannel(c)"
            >
              <template v-if="isSubscribed(c.channel_id)">✓ 已訂閱</template>
              <template v-else>➕ 訂閱</template>
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 影片區（僅勾影片時）：把現有 19-53 行那段 status + ul.video-grid 用一層 wrapper 包起並加 v-if="searchVideos" -->
    <section v-if="searchVideos && hasSearched" class="video-section">
      <h3 class="section-title">影片</h3>
      <!-- ↓ 現有的 status 區塊與 ul.video-grid 移進來（內容不動） -->
    </section>
```
> 把現有第 19-53 行（影片 status + `ul.video-grid`）整段移進 `video-section`，**內容不改**（影片卡含 watch-btn 維持原樣）。未搜尋前的「請輸入關鍵字開始搜尋」提示可移到結果區外（兩區都沒搜過時顯示）。

### C1. script：頻道動作
```ts
const subscribingId = ref('')

function isSubscribed(channelId: string): boolean {
  return props.subscribedIds?.has(channelId) ?? false
}

function addChannelToWatchlist(c: ChannelResult) {
  watchlist.add({ channel_id: c.channel_id, title: c.title, thumbnail: c.thumbnail })
}

async function subscribeChannel(c: ChannelResult) {
  if (subscribingId.value || isSubscribed(c.channel_id)) return
  subscribingId.value = c.channel_id
  try {
    const res = await apiPost<{ subscription_id: string; channel?: { subscription_id: string; channel_id: string; title: string; thumbnail: string } }>(`/subscriptions/${c.channel_id}`)
    const channel = res.channel ?? {
      subscription_id: res.subscription_id,
      channel_id: c.channel_id,
      title: c.title,
      thumbnail: c.thumbnail,
    }
    emit('subscribed', channel)
  } catch {
    // 已訂閱（subscriptionDuplicate）或其他失敗：v1 靜默忽略；isSubscribed 之後若有資料會反映
  } finally {
    subscribingId.value = ''
    quota.refresh()
  }
}
```

### C2. props / emits（檔案目前沒有 defineProps/defineEmits，需新增）：
```ts
const props = defineProps<{ subscribedIds?: Set<string> }>()
const emit = defineEmits<{ (e: 'subscribed', channel: { subscription_id: string; channel_id: string; title: string; thumbnail: string }): void }>()
```

### C3. CSS（`<style scoped>` 末尾加；頻道卡比照訂閱清單 channel-card 的圓縮圖風格）：
```css
.scope-row { display: flex; gap: 1.2rem; margin-top: 0.6rem; font-size: 0.9rem; }
.scope-row label { display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer; }
.quota-hint { color: #d32f2f; font-size: 0.8rem; }
.section-title { font-size: 0.95rem; color: #555; margin: 1rem 0 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
.channel-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.channel-card { display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem; border: 1px solid #eee; border-radius: 8px; background: #fff; }
.channel-card img { border-radius: 50%; flex-shrink: 0; }
.channel-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 500; }
.channel-actions { display: inline-flex; gap: 0.4rem; }
.subscribe-btn { padding: 0.3rem 0.7rem; font-size: 0.78rem; background: #2ea043; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.subscribe-btn:hover:not(:disabled) { background: #278a3a; }
.subscribe-btn:disabled { background: #bdbdbd; cursor: not-allowed; }
```
> `.watch-btn` CSS 已存在於此檔（先前 change 加的），頻道卡的 watch-btn 直接複用，不要重複定義。

---

## Part D — `HomeView.vue` 接線

把第 157 行：
```html
        <SearchVideosFeed v-else-if="activeView === 'search'" />
```
改為（傳 subscribedIds、接 subscribed 事件，沿用既有 `appendSubscribedChannel`，見 287-290）：
```html
        <SearchVideosFeed
          v-else-if="activeView === 'search'"
          :subscribed-ids="subscribedIds"
          @subscribed="appendSubscribedChannel"
        />
```
> `subscribedIds`（259 行 computed）與 `appendSubscribedChannel`（287 行）**已存在**，直接用，不要新增。

---

## 禁區（全域）

- 不動 `/search-videos`（yt-dlp、0 quota）；影片搜尋既有結果版面、下載勾選行為不變。
- 不做「點頻道卡 → 看該頻道影片」導頁（Non-Goal）。
- 不做 quota 不足警示 / 二次確認（Non-Goal）；只在 checkbox 旁標注耗額。
- 不做頻道結果分頁 / 載入更多。
- 不改 `stores/watchlist.ts`、訂閱 API。

## 驗收分工

- **你（Codex）做**：Part A–D 實作 + **後端 pytest** + **前端 vitest 單元測試**（`SearchVideosFeed`：預設不打 /search-channels、勾頻道渲染頻道區、兩者皆未勾搜尋鈕 disabled、頻道卡加觀察名單 disabled、已訂閱頻道訂閱鈕 disabled）。
- **不要做**：e2e / Playwright、archive、改 CHANGELOG / 版本 / tag。e2e（`frontend/e2e/verify-search-channels.ts`）與最終 archive 由 Claude 負責。
- 自我檢查：後端 `pytest`、前端 `npx vitest run`、`npx vue-tsc --noEmit`。

## 完成後回報

- 改了哪些檔、各檔重點。
- pytest / vitest / type-check 結果摘要。
- **確認所有新增/修改檔的中文無亂碼**（已回讀檢查，無 `?`/`�`/半字）。
- 任何偏離本 brief 的決定請標出（方便 Claude 冷讀 diff 對焦）。
