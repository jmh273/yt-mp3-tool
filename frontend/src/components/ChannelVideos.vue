<template>
  <div class="channel-videos">
    <div class="channel-header">
      <button class="back-btn" @click="$emit('back')">← 回最新動態</button>
      <h2>正在觀看頻道：{{ channelTitle || '載入中...' }}</h2>
    </div>
    <div v-if="loading && videos.length === 0" class="loading">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
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
            <img :src="v.thumbnail" :alt="v.title" class="thumb" />
            <span v-if="v.duration_seconds != null" class="duration">{{ formatDuration(v.duration_seconds) }}</span>
          </div>
          <div class="info">
            <span class="title" :title="v.title">{{ v.title }} <span v-if="download.isDownloaded(v.video_id)" class="dl-badge">✅ 已下載</span></span>
            <div class="meta">
              <span class="date">{{ formatDate(v.published) }}</span>
            </div>
          </div>
        </li>
      </ul>
      <div class="load-more-container" v-if="nextPageToken">
        <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
          {{ loadingMore ? '載入中...' : '載入更多' }}
        </button>
      </div>
      <div v-else-if="videos.length > 0" class="end-msg">已無更多影片</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'

const props = defineProps<{ channelId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()
const download = useDownloadStore()
const quota = useQuotaStore()

const videos = ref<VideoItem[]>([])
const channelTitle = ref('')
const nextPageToken = ref('')
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')

async function fetchPage(token?: string) {
  let url = `/channels/${props.channelId}/videos`
  if (token) {
    url += `?pageToken=${token}`
  }
  
  try {
    const data = await apiGet<{ items: VideoItem[], nextPageToken: string, channelTitle: string }>(url)
    if (token) {
      videos.value.push(...data.items)
    } else {
      videos.value = data.items
      channelTitle.value = data.channelTitle
    }
    nextPageToken.value = data.nextPageToken || ''
  } catch (e: any) {
    error.value = '無法載入影片：' + e.message
  } finally {
    quota.refresh()
  }
}

onMounted(async () => {
  loading.value = true
  await fetchPage()
  loading.value = false
})

async function loadMore() {
  if (!nextPageToken.value || loadingMore.value) return
  loadingMore.value = true
  await fetchPage(nextPageToken.value)
  loadingMore.value = false
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString('zh-TW') : ''
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
.channel-videos { padding: 0.5rem 1rem; padding-bottom: 2rem; }
.channel-header { margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 1rem; }
.channel-header h2 { margin: 0; font-size: 1.1rem; color: #333; }
.back-btn { padding: 0.3rem 0.6rem; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.back-btn:hover { background: #f5f5f5; }

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
.meta { display: flex; gap: 0.6rem; align-items: center; margin-top: auto; }
.date { font-size: 0.75rem; color: #888; }
.duration { position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.8); color: white; padding: 2px 4px; border-radius: 4px; font-size: 0.7rem; line-height: 1; font-variant-numeric: tabular-nums; }
.loading, .error { padding: 0.5rem; color: #666; }
.error { color: red; }

.load-more-container { margin-top: 1.5rem; text-align: center; }
.load-more-btn {
  padding: 0.6rem 1.5rem;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: background-color 0.2s;
}
.load-more-btn:hover:not(:disabled) { background-color: #e0e0e0; }
.load-more-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.end-msg { margin-top: 1.5rem; text-align: center; color: #999; font-size: 0.9rem; }
</style>
