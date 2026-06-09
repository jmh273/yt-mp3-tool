<template>
  <div class="search-feed">
    <div class="feed-header">
      <h2>🔍 搜尋影片</h2>
      <div class="search-bar">
        <input 
          type="text" 
          v-model="searchInput" 
          @keyup.enter="handleSearch"
          placeholder="輸入關鍵字 (如: Lo-fi hip hop)" 
          class="search-input"
        />
        <button class="search-btn" @click="handleSearch" :disabled="loading || channelLoading || (!searchVideos && !searchChannels)">
          {{ loading || channelLoading ? '搜尋中...' : '搜尋' }}
        </button>
      </div>
      <div class="scope-row">
        <label><input type="checkbox" v-model="searchVideos" /> 影片</label>
        <label><input type="checkbox" v-model="searchChannels" /> 頻道 <span class="quota-hint">(約耗 100 配額)</span></label>
      </div>
    </div>

    <div v-if="!hasSearched" class="status empty-state">請輸入關鍵字開始搜尋</div>

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

    <section v-if="searchVideos && hasSearched" class="video-section">
      <h3 class="section-title">影片</h3>
      <div v-if="loading" class="status">載入中...</div>
      <div v-else-if="error" class="status error">{{ error }}</div>
      <div v-else-if="videos.length === 0" class="status">查無符合條件的影片</div>

      <ul v-else class="video-grid">
        <li v-for="v in videos" :key="v.video_id" class="video-item">
          <div class="thumb-wrapper">
            <input
              type="checkbox"
              class="video-checkbox"
              :checked="download.isSelected(v.video_id) || download.isDownloaded(v.video_id)"
              :disabled="download.isDownloaded(v.video_id)"
              @change="download.toggle(v)"
            />
            <img :src="v.thumbnail" :alt="v.title" class="thumb" @click="player.open(v.video_id)" />
            <span class="duration">{{ formatDuration(v.duration_seconds ?? null) }}</span>
          </div>
          <div class="info">
            <span class="title" :title="v.title">{{ v.title }} <span v-if="download.isDownloaded(v.video_id)" class="dl-badge">✅ 已下載</span></span>
            <span class="channel">{{ v.channel_title }}</span>
            <button
              class="watch-btn"
              :class="{ watched: watchlist.has(v.channel_id || '') }"
              :disabled="!v.channel_id || watchlist.has(v.channel_id)"
              :title="!v.channel_id ? '此影片缺少頻道資訊，無法加入觀察名單' : (watchlist.has(v.channel_id) ? '已在觀察名單' : '加入觀察名單')"
              @click="handleAddToWatchlist(v)"
            >
              <template v-if="!v.channel_id">🚫 無法加入</template>
              <template v-else-if="watchlist.has(v.channel_id)">✓ 已在觀察名單</template>
              <template v-else>👁 加入觀察名單</template>
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiGet, apiPost } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'
import { usePlayerStore } from '@/stores/player'
import { useToastStore } from '@/stores/toast'
import { useWatchlistStore } from '@/stores/watchlist'

interface ChannelResult {
  channel_id: string
  title: string
  thumbnail: string
}

interface SubscribedChannel {
  subscription_id: string
  channel_id: string
  title: string
  thumbnail: string
}

const props = defineProps<{ subscribedIds?: Set<string> }>()
const emit = defineEmits<{ (e: 'subscribed', channel: SubscribedChannel): void }>()

const download = useDownloadStore()
const quota = useQuotaStore()
const player = usePlayerStore()
const toast = useToastStore()
const watchlist = useWatchlistStore()

const searchInput = ref('')
const searchVideos = ref(true)
const searchChannels = ref(false)
const videos = ref<VideoItem[]>([])
const channels = ref<ChannelResult[]>([])
const loading = ref(false)
const error = ref('')
const channelLoading = ref(false)
const channelError = ref('')
const hasSearched = ref(false)
const subscribingId = ref('')

async function handleSearch() {
  const q = searchInput.value.trim()
  if (!q || (!searchVideos.value && !searchChannels.value)) return

  hasSearched.value = true

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

function handleAddToWatchlist(video: VideoItem) {
  if (!video.channel_id) return
  watchlist.add({
    channel_id: video.channel_id,
    title: video.channel_title || video.channel_id,
    thumbnail: video.thumbnail,
  })
}

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
    const res = await apiPost<{
      subscription_id: string
      channel?: SubscribedChannel
    }>(`/subscriptions/${c.channel_id}`)
    const channel = res.channel ?? {
      subscription_id: res.subscription_id,
      channel_id: c.channel_id,
      title: c.title,
      thumbnail: c.thumbnail,
    }
    emit('subscribed', channel)
    toast.success(`已訂閱「${c.title}」`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/subscriptionDuplicate|already exists/i.test(message)) {
      emit('subscribed', {
        subscription_id: '',
        channel_id: c.channel_id,
        title: c.title,
        thumbnail: c.thumbnail,
      })
      toast.info(`「${c.title}」此帳號已訂閱`)
    } else {
      toast.error(message)
    }
  } finally {
    subscribingId.value = ''
    quota.refresh()
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.search-feed { padding: 1rem; }
.feed-header { 
  display: flex; 
  flex-direction: column;
  gap: 1rem; 
  margin-bottom: 1.5rem; 
}
.feed-header h2 { margin: 0; font-size: 1.2rem; }

.search-bar {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  max-width: 500px;
}
.search-input {
  flex: 1;
  padding: 0.6rem 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus {
  border-color: #646cff;
}
.search-btn {
  padding: 0.6rem 1.2rem;
  background-color: #646cff;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}
.search-btn:hover:not(:disabled) {
  background-color: #535bf2;
}
.search-btn:disabled {
  background-color: #a0a4ff;
  cursor: not-allowed;
}

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

.status { padding: 2rem; color: #888; text-align: center; }
.empty-state { color: #aaa; font-style: italic; }
.status.error { color: red; }

ul { list-style: none; padding: 0; margin: 0; }
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.video-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.8rem;
  background: #fff;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid #eee;
}
.video-item:hover { background: #fdfdfd; border-color: #ddd; }

.thumb-wrapper { 
  position: relative; 
  width: 140px; 
  flex-shrink: 0;
  aspect-ratio: 16 / 9; 
  border-radius: 6px; 
  overflow: hidden; 
  background: #eee; 
}
.thumb { width: 100%; height: 100%; object-fit: cover; display: block; cursor: pointer; transition: opacity 0.15s; }
.thumb:hover { opacity: 0.92; }
.video-checkbox { position: absolute; top: 6px; left: 6px; z-index: 2; transform: scale(1.2); cursor: pointer; }
.info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 0; }
.title { font-size: 0.85rem; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.4; margin-top: -0.2rem; }
.dl-badge { font-size: 0.7rem; color: #4caf50; font-weight: normal; margin-left: 0.3rem; white-space: nowrap; display: inline-block; }
.channel { font-size: 0.75rem; color: #555; }
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
.duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.7rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
</style>
