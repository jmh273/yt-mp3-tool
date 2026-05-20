<template>
  <div class="trending-videos">
    <div class="header">
      <h2>🔥 台灣地區發燒影片</h2>
      <p class="subtitle">依據 YouTube 官方統計的熱門內容</p>
    </div>

    <div class="category-row" aria-label="發燒影片分類">
      <button
        v-for="category in categories"
        :key="category.id ?? 'all'"
        class="category-chip"
        :class="{ active: category.id === activeCategoryId }"
        type="button"
        :disabled="loading || loadingMore"
        @click="selectCategory(category.id)"
      >
        {{ category.label }}
      </button>
    </div>

    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="videos.length === 0" class="empty">目前沒有發燒影片</div>
    <template v-else>
      <ul class="video-grid">
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
            <span v-if="v.duration_seconds != null" class="duration">{{ formatDuration(v.duration_seconds) }}</span>
          </div>
          <div class="info">
            <span class="title" :title="v.title">{{ v.title }} <span v-if="download.isDownloaded(v.video_id)" class="dl-badge">✅ 已下載</span></span>
            <div class="meta">
              <span class="channel">{{ v.channel_title }}</span>
              <div class="meta-row">
                <span class="date">{{ formatDate(v.published) }}</span>
                <span v-if="v.view_count != null" class="dot">·</span>
                <span v-if="v.view_count != null" class="views">{{ formatViewCount(v.view_count) }}</span>
              </div>
            </div>
          </div>
        </li>
      </ul>
      <div v-if="nextPageToken" class="load-more-wrap">
        <button class="load-more-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '載入中...' : '載入更多 (約消耗 1 配額)' }}
        </button>
        <div v-if="loadMoreError" class="load-more-error">{{ loadMoreError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'
import { usePlayerStore } from '@/stores/player'

const download = useDownloadStore()
const quota = useQuotaStore()
const player = usePlayerStore()

interface TrendingResponse {
  videos: VideoItem[]
  next_page_token: string | null
}

interface TrendingCategory {
  id: string | null
  label: string
}

interface TrendingCategoriesResponse {
  categories: TrendingCategory[]
}

const fallbackCategories: TrendingCategory[] = [{ id: null, label: '全部' }]
const videos = ref<VideoItem[]>([])
const loading = ref(true)
const error = ref('')
const nextPageToken = ref<string | null>(null)
const loadingMore = ref(false)
const loadMoreError = ref('')
const categories = ref<TrendingCategory[]>(fallbackCategories)
const activeCategoryId = ref<string | null>(null)

function trendingUrl(pageToken?: string | null) {
  const params = new URLSearchParams()
  if (pageToken) params.set('page_token', pageToken)
  if (activeCategoryId.value) params.set('category', activeCategoryId.value)
  const query = params.toString()
  return query ? `/trending-videos?${query}` : '/trending-videos'
}

async function fetchTrendingCategories() {
  try {
    const data = await apiGet<TrendingCategoriesResponse>('/trending-videos/categories')
    categories.value = data.categories.length > 0 ? data.categories : fallbackCategories
  } catch {
    categories.value = fallbackCategories
  }
}

async function loadInitial() {
  loading.value = true
  error.value = ''
  loadMoreError.value = ''
  activeCategoryId.value = null
  try {
    await fetchTrendingCategories()
    const data = await apiGet<TrendingResponse>(trendingUrl())
    videos.value = data.videos
    nextPageToken.value = data.next_page_token ?? null
  } catch (e: any) {
    error.value = '無法載入發燒影片：' + e.message
  } finally {
    loading.value = false
    quota.refresh()
  }
}

async function loadMore() {
  if (!nextPageToken.value || loadingMore.value) return
  loadingMore.value = true
  loadMoreError.value = ''
  try {
    const data = await apiGet<TrendingResponse>(trendingUrl(nextPageToken.value))
    const seen = new Set(videos.value.map(v => v.video_id))
    for (const v of data.videos) {
      if (!seen.has(v.video_id)) videos.value.push(v)
    }
    nextPageToken.value = data.next_page_token ?? null
  } catch (e: any) {
    loadMoreError.value = '載入更多失敗：' + e.message
  } finally {
    loadingMore.value = false
    quota.refresh()
  }
}

async function selectCategory(categoryId: string | null) {
  if (categoryId === activeCategoryId.value || loading.value || loadingMore.value) return
  activeCategoryId.value = categoryId
  videos.value = []
  nextPageToken.value = null
  loadMoreError.value = ''
  error.value = ''
  loading.value = true
  try {
    const data = await apiGet<TrendingResponse>(trendingUrl())
    videos.value = data.videos
    nextPageToken.value = data.next_page_token ?? null
  } catch (e: any) {
    error.value = '無法載入發燒影片：' + e.message
  } finally {
    loading.value = false
    quota.refresh()
  }
}

onMounted(loadInitial)

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatViewCount(n: number): string {
  if (n < 1000) return `${n} views`
  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ]
  for (const { v, s } of units) {
    if (n >= v) {
      const scaled = n / v
      let str: string
      if (scaled >= 100) str = scaled.toFixed(0)
      else if (scaled >= 10) str = scaled.toFixed(1)
      else str = scaled.toFixed(2)
      return `${str}${s} views`
    }
  }
  return `${n} views`
}
</script>

<style scoped>
.trending-videos { padding: 0.5rem 1rem; padding-bottom: 2rem; }
.header { margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #eee; }
.header h2 { margin: 0; font-size: 1.2rem; color: #d32f2f; }
.subtitle { margin: 0.2rem 0 0 0; font-size: 0.85rem; color: #777; }

.category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0 0 1rem 0;
}
.category-chip {
  border: 1px solid #ddd;
  background: #fff;
  color: #444;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.category-chip:hover:not(:disabled) { background: #f5f5f5; border-color: #bbb; }
.category-chip.active {
  background: #d32f2f;
  border-color: #d32f2f;
  color: #fff;
}
.category-chip:disabled { opacity: 0.65; cursor: not-allowed; }

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
.title { font-size: 0.85rem; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.4; margin-top: -0.2rem; }
.dl-badge { font-size: 0.7rem; color: #4caf50; font-weight: normal; margin-left: 0.3rem; white-space: nowrap; display: inline-block; }

.meta { display: flex; flex-direction: column; gap: 0.2rem; margin-top: auto; }
.meta-row { display: flex; flex-direction: row; align-items: baseline; gap: 0.35rem; }
.channel { font-size: 0.75rem; color: #555; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date { font-size: 0.75rem; color: #888; }
.dot { font-size: 0.75rem; color: #aaa; }
.views { font-size: 0.75rem; color: #888; font-variant-numeric: tabular-nums; }
.duration { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.8); color: white; padding: 2px 4px; border-radius: 4px; font-size: 0.7rem; line-height: 1; font-variant-numeric: tabular-nums; }

.loading, .error, .empty { padding: 1rem; color: #666; text-align: center; }
.error { color: red; }

.load-more-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-top: 1.2rem; }
.load-more-btn {
  padding: 0.5rem 1.2rem;
  font-size: 0.85rem;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  color: #444;
  transition: background 0.15s, border-color 0.15s;
}
.load-more-btn:hover:not(:disabled) { background: #f5f5f5; border-color: #bbb; }
.load-more-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.load-more-error { color: #d32f2f; font-size: 0.8rem; }
</style>
