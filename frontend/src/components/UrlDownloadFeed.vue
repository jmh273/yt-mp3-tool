<template>
  <div class="url-feed">
    <div class="feed-header">
      <h2>🔗 網址下載</h2>
      <p class="desc">貼上 YouTube 影片或播放清單網址，解析後即可勾選下載。</p>
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

      <div class="actions" v-if="videos.length > 1">
        <button class="action-btn" @click="selectAll">✅ 全選</button>
        <button class="action-btn" @click="deselectAll">🟩 全不選</button>
      </div>
    </div>

    <div v-if="loading" class="status">解析中，這可能需要幾秒鐘的時間...</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="hasSearched && videos.length === 0" class="status">找不到影片，請檢查網址是否正確。</div>
    <div v-else-if="!hasSearched" class="status empty-state">請貼上網址並點擊解析</div>

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
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'

const download = useDownloadStore()
const player = usePlayerStore()

const urlInput = ref('')
const videos = ref<VideoItem[]>([])
const loading = ref(false)
const error = ref('')
const hasSearched = ref(false)

async function handleParse() {
  const u = urlInput.value.trim()
  if (!u) return

  loading.value = true
  error.value = ''
  hasSearched.value = true
  videos.value = []

  try {
    const data = await apiGet<{ videos: VideoItem[] }>(`/url-preview?url=${encodeURIComponent(u)}`)
    videos.value = data.videos || []
    
    // 單一影片直接勾選
    if (videos.value.length === 1) {
      const v = videos.value[0]
      if (v && !download.isDownloaded(v.video_id) && !download.isSelected(v.video_id)) {
        download.toggle(v as VideoItem)
      }
    }
  } catch (e: any) {
    error.value = e.message || '無法解析該網址，請確認網址格式或權限是否正確。'
  } finally {
    loading.value = false
  }
}

function selectAll() {
  videos.value.forEach(v => {
    if (!download.isDownloaded(v.video_id) && !download.isSelected(v.video_id)) {
      download.toggle(v)
    }
  })
}

function deselectAll() {
  videos.value.forEach(v => {
    if (!download.isDownloaded(v.video_id) && download.isSelected(v.video_id)) {
      download.toggle(v)
    }
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

.actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.action-btn {
  padding: 0.4rem 0.8rem;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.action-btn:hover { background-color: #e4e4e4; }

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
