<template>
  <div class="url-feed">
    <div class="feed-header">
      <h2>🔗 網址下載</h2>
      <p class="desc">貼上 YouTube 影片或播放清單網址，解析後即可勾選下載。</p>
      <p class="hint" v-if="videos.length > 0">請勾選要下載的影片，按右側「開始下載」即可分批處理。</p>
      <div class="search-bar">
        <input
          type="text"
          v-model="urlInput"
          @keyup.enter="handleParse"
          placeholder="例如: https://www.youtube.com/watch?v=... 或播放清單網址"
          class="search-input"
        />
        <button class="search-btn" @click="handleParse" :disabled="loading">
          {{ loading ? '解析中...' : '解析網址' }}
        </button>
      </div>

      <div class="actions" v-if="videos.length > 0">
        <button class="action-btn" @click="selectAllOnPage">✅ 全選本頁</button>
        <button class="action-btn" @click="deselectAllOnPage">🟩 取消本頁</button>
        <label class="page-size-label">
          每頁顯示
          <select class="page-size-select" v-model.number="pageSize">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          部
        </label>
      </div>

      <div class="pager" v-if="videos.length > 0">
        <button
          class="pager-btn"
          @click="goToPage(currentPage - 1)"
          :disabled="currentPage === 1"
        >‹ 上一頁</button>
        <span class="pager-pos">第 {{ currentPage }} / {{ totalPages }} 頁</span>
        <button
          class="pager-btn"
          @click="goToPage(currentPage + 1)"
          :disabled="currentPage === totalPages"
        >下一頁 ›</button>
        <span class="pager-jump">
          跳到第
          <input
            type="text"
            inputmode="numeric"
            class="pager-jump-input"
            v-model="jumpInput"
            @keyup.enter="handleJump"
            :placeholder="String(currentPage)"
          />
          頁
        </span>
        <span class="selected-count">已選 {{ selectedCount }} 部 / 共 {{ videos.length }} 部</span>
      </div>
    </div>

    <div ref="gridRef">
      <div v-if="loading" class="status">解析中，這可能需要幾秒鐘的時間...</div>
      <div v-else-if="error" class="status error">{{ error }}</div>
      <div v-else-if="hasSearched && videos.length === 0" class="status">找不到影片，請檢查網址是否正確。</div>
      <div v-else-if="!hasSearched" class="status empty-state">請貼上網址並點擊解析</div>

      <ul v-else class="video-grid">
        <li v-for="v in pagedVideos" :key="v.video_id" class="video-item">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'
import { useWatchlistStore } from '@/stores/watchlist'

const download = useDownloadStore()
const player = usePlayerStore()
const watchlist = useWatchlistStore()

const urlInput = ref('')
const videos = ref<VideoItem[]>([])
const loading = ref(false)
const error = ref('')
const hasSearched = ref(false)

const pageSize = ref<number>(25)
const currentPage = ref<number>(1)
const jumpInput = ref<string>('')
const gridRef = ref<HTMLElement | null>(null)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(videos.value.length / pageSize.value)),
)

const pagedVideos = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return videos.value.slice(start, start + pageSize.value)
})

const selectedCount = computed(
  () => videos.value.filter((v) => download.isSelected(v.video_id)).length,
)

watch(pageSize, () => {
  currentPage.value = 1
})

function goToPage(n: number) {
  const clamped = Math.min(Math.max(1, Math.floor(n)), totalPages.value)
  if (clamped !== currentPage.value) {
    currentPage.value = clamped
  }
  gridRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleJump() {
  const n = Number(jumpInput.value)
  if (!Number.isFinite(n) || n < 1 || n > totalPages.value || !Number.isInteger(n)) {
    jumpInput.value = ''
    return
  }
  goToPage(n)
  jumpInput.value = ''
}

async function handleParse() {
  const u = urlInput.value.trim()
  if (!u) return

  loading.value = true
  error.value = ''
  hasSearched.value = true
  videos.value = []
  currentPage.value = 1

  try {
    const data = await apiGet<{ videos: VideoItem[] }>(`/url-preview?url=${encodeURIComponent(u)}`)
    videos.value = data.videos || []
  } catch (e: any) {
    error.value = e.message || '無法解析該網址，請確認網址格式或權限是否正確。'
  } finally {
    loading.value = false
  }
}

function selectAllOnPage() {
  pagedVideos.value.forEach((v) => {
    if (!download.isDownloaded(v.video_id) && !download.isSelected(v.video_id)) {
      download.toggle(v)
    }
  })
}

function deselectAllOnPage() {
  pagedVideos.value.forEach((v) => {
    if (!download.isDownloaded(v.video_id) && download.isSelected(v.video_id)) {
      download.toggle(v)
    }
  })
}

function handleAddToWatchlist(video: VideoItem) {
  if (!video.channel_id) return
  watchlist.add({
    channel_id: video.channel_id,
    title: video.channel_title || video.channel_id,
    thumbnail: video.thumbnail,
  })
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
.url-feed { padding: 1rem; }
.feed-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.feed-header h2 { margin: 0; font-size: 1.2rem; }
.desc { margin: 0; color: #555; font-size: 0.9rem; margin-top: -0.5rem; }
.hint { margin: 0; color: #2196F3; font-size: 0.85rem; margin-top: -0.4rem; }

.search-bar {
  display: flex;
  gap: 0.5rem;
  width: 100%;
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
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}
.search-btn:hover:not(:disabled) {
  background-color: #1976D2;
}
.search-btn:disabled {
  background-color: #90CAF9;
  cursor: not-allowed;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.action-btn {
  padding: 0.4rem 0.8rem;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.action-btn:hover { background-color: #e4e4e4; }

.page-size-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #555;
  margin-left: auto;
}
.page-size-select {
  padding: 0.25rem 0.4rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #fff;
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #555;
}
.pager-btn {
  padding: 0.35rem 0.7rem;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}
.pager-btn:hover:not(:disabled) { background-color: #e4e4e4; }
.pager-btn:disabled { color: #aaa; cursor: not-allowed; background-color: #f7f7f7; }
.pager-pos { font-variant-numeric: tabular-nums; min-width: 6em; text-align: center; }
.pager-jump { display: inline-flex; align-items: center; gap: 0.3rem; }
.pager-jump-input {
  width: 60px;
  padding: 0.25rem 0.4rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.selected-count { margin-left: auto; color: #2196F3; font-weight: 500; }

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
