<template>
  <div class="latest-feed">
    <div class="feed-header">
      <h2>最新影片</h2>
      <span class="hours-badge">{{ latestHours }}h 內</span>
    </div>

    <div v-if="loading" class="status">載入中...</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="videos.length === 0" class="status">此時間範圍內無新影片</div>

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
          <span class="duration">{{ formatDuration(v.duration_seconds ?? null) }}</span>
        </div>
        <div class="info">
          <span class="title">{{ v.title }} <span v-if="download.isDownloaded(v.video_id)" class="dl-badge">✅ 已下載</span></span>
          <span class="channel">{{ v.channel_title }}</span>
          <div class="meta">
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

const download = useDownloadStore()
const videos = ref<VideoItem[]>([])
const loading = ref(true)
const error = ref('')
const latestHours = ref(24)

onMounted(async () => {
  try {
    const settings = await apiGet<{ latest_hours?: number }>('/settings')
    latestHours.value = settings.latest_hours ?? 24
    const data = await apiGet<{ videos: VideoItem[] }>(`/latest-videos?hours=${latestHours.value}`)
    videos.value = data.videos
  } catch (e: any) {
    error.value = '無法載入最新影片'
  } finally {
    loading.value = false
  }
})

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

function formatDate(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} 分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小時前`
  return `${Math.floor(hrs / 24)} 天前`
}
</script>

<style scoped>
.latest-feed { padding: 1rem; }
.feed-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.feed-header h2 { margin: 0; font-size: 1.1rem; }
.hours-badge {
  background: #f0f0f0;
  border-radius: 12px;
  padding: 0.15rem 0.6rem;
  font-size: 0.78rem;
  color: #666;
}

.status { padding: 2rem; color: #888; text-align: center; }
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
  width: 140px; /* Reduced to ~1/2 size */
  flex-shrink: 0;
  aspect-ratio: 16 / 9; 
  border-radius: 6px; 
  overflow: hidden; 
  background: #eee; 
}
.thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-checkbox { position: absolute; top: 6px; left: 6px; z-index: 2; transform: scale(1.2); cursor: pointer; }
.info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 0; }
.title { font-size: 0.85rem; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.4; margin-top: -0.2rem; }
.dl-badge { font-size: 0.7rem; color: #4caf50; font-weight: normal; margin-left: 0.3rem; white-space: nowrap; display: inline-block; }
.channel { font-size: 0.75rem; color: #555; }
.meta { display: flex; gap: 0.6rem; align-items: center; margin-top: auto; }
.date { font-size: 0.7rem; color: #aaa; }
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
