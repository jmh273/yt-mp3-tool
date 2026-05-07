<template>
  <div class="trending-videos">
    <div class="header">
      <h2>🔥 台灣地區發燒影片</h2>
      <p class="subtitle">依據 YouTube 官方統計的熱門內容</p>
    </div>
    
    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="videos.length === 0" class="empty">目前沒有發燒影片</div>
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
          <img :src="v.thumbnail" :alt="v.title" class="thumb" />
          <span v-if="v.duration_seconds != null" class="duration">{{ formatDuration(v.duration_seconds) }}</span>
        </div>
        <div class="info">
          <span class="title" :title="v.title">{{ v.title }} <span v-if="download.isDownloaded(v.video_id)" class="dl-badge">✅ 已下載</span></span>
          <div class="meta">
            <span class="channel">{{ v.channel_title }}</span>
            <span class="date">{{ formatDate(v.published) }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'

const download = useDownloadStore()
const quota = useQuotaStore()

const videos = ref<VideoItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await apiGet<{ videos: VideoItem[] }>('/trending-videos')
    videos.value = data.videos
  } catch (e: any) {
    error.value = '無法載入發燒影片：' + e.message
  } finally {
    loading.value = false
    quota.refresh()
  }
})

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
</script>

<style scoped>
.trending-videos { padding: 0.5rem 1rem; padding-bottom: 2rem; }
.header { margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #eee; }
.header h2 { margin: 0; font-size: 1.2rem; color: #d32f2f; }
.subtitle { margin: 0.2rem 0 0 0; font-size: 0.85rem; color: #777; }

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
.thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-checkbox { position: absolute; top: 6px; left: 6px; z-index: 2; transform: scale(1.2); cursor: pointer; }

.info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 0; }
.title { font-size: 0.85rem; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.4; margin-top: -0.2rem; }
.dl-badge { font-size: 0.7rem; color: #4caf50; font-weight: normal; margin-left: 0.3rem; white-space: nowrap; display: inline-block; }

.meta { display: flex; flex-direction: column; gap: 0.2rem; margin-top: auto; }
.channel { font-size: 0.75rem; color: #555; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date { font-size: 0.75rem; color: #888; }
.duration { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.8); color: white; padding: 2px 4px; border-radius: 4px; font-size: 0.7rem; line-height: 1; font-variant-numeric: tabular-nums; }

.loading, .error, .empty { padding: 1rem; color: #666; text-align: center; }
.error { color: red; }
</style>
