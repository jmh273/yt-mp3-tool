<template>
  <div class="latest-feed">
    <div class="feed-header">
      <h2>最新影片</h2>
      <span class="badge">{{ appliedBadge }}</span>
      <span v-if="!loading && !error" class="count-badge" :class="{ 'count-cap': videos.length >= 100 }">
        {{ videos.length }} 部
        <template v-if="videos.length >= 100">（已達上限，調短時窗看完整列表）</template>
      </span>
    </div>

    <div class="filter-bar">
      <label class="field">
        <span>時間範圍（小時）</span>
        <input
          v-model.number="hoursInput"
          type="number"
          min="1"
          max="168"
        />
      </label>
      <label class="field">
        <span>最短長度（分鐘）</span>
        <input
          v-model.number="minDurationInput"
          type="number"
          min="0"
        />
      </label>
      <label class="field">
        <span>最長長度（分鐘）</span>
        <input
          v-model.number="maxDurationInput"
          type="number"
          min="1"
        />
      </label>
      <button
        class="apply-btn"
        :disabled="!!validationError || fetching"
        @click="applyFilters"
      >
        {{ fetching ? '套用中…' : '套用' }}
      </button>
      <label class="redownload-toggle">
        <input type="checkbox" v-model="allowRedownload" />
        <span>允許再次下載</span>
      </label>
      <p v-if="validationError" class="field-error">{{ validationError }}</p>
      <p class="hint">此處的調整只影響目前瀏覽，不會修改設定預設值。</p>
    </div>

    <div v-if="loading" class="status">載入中...</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="videos.length === 0" class="status">此條件下無影片</div>

    <ul v-else class="video-grid">
      <li v-for="v in videos" :key="v.video_id" class="video-item">
        <div class="thumb-wrapper">
          <input
            type="checkbox"
            class="video-checkbox"
            :checked="download.isSelected(v.video_id) || (isAlreadyDownloaded(v) && !allowRedownload)"
            :disabled="isAlreadyDownloaded(v) && !allowRedownload"
            @change="download.toggle(v)"
          />
          <img :src="v.thumbnail" :alt="v.title" class="thumb" @click="player.open(v.video_id)" />
          <span class="duration">{{ formatDuration(v.duration_seconds ?? null) }}</span>
        </div>
        <div class="info">
          <span class="title" :title="v.title">{{ v.title }} <span v-if="isAlreadyDownloaded(v)" class="dl-badge">✅ 已下載</span></span>
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
import { ref, computed, onMounted, watch } from 'vue'
import { apiGet } from '@/api'
import { useDownloadStore, type VideoItem } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'
import { usePlayerStore } from '@/stores/player'

const download = useDownloadStore()
const quota = useQuotaStore()
const player = usePlayerStore()
const videos = ref<VideoItem[]>([])
const loading = ref(true)
const fetching = ref(false)
const error = ref('')

const allowRedownload = ref(false)

function isAlreadyDownloaded(v: VideoItem): boolean {
  return download.isDownloaded(v.video_id) || v.downloaded_today === true
}

watch(allowRedownload, (now, prev) => {
  if (prev && !now) {
    for (const v of [...download.selected]) {
      if (isAlreadyDownloaded(v)) {
        download.toggle(v)
      }
    }
  }
})

const hoursInput = ref(24)
const minDurationInput = ref(3)
const maxDurationInput = ref(60)

const appliedHours = ref(24)
const appliedMin = ref(3)
const appliedMax = ref(60)

const validationError = computed(() => {
  const h = hoursInput.value
  if (!Number.isInteger(h) || h < 1 || h > 168) {
    return '時間範圍須為 1 到 168 之間的整數'
  }
  const mn = minDurationInput.value
  const mx = maxDurationInput.value
  if (!Number.isInteger(mn) || mn < 0) {
    return '最短長度須為 ≥ 0 的整數'
  }
  if (!Number.isInteger(mx) || mx < 1) {
    return '最長長度須為 ≥ 1 的整數'
  }
  if (mx < mn) {
    return '最長長度不可小於最短長度'
  }
  return ''
})

const appliedBadge = computed(() =>
  `${appliedHours.value}h · ${appliedMin.value}–${appliedMax.value} 分鐘`,
)

async function fetchVideos(h: number, mn: number, mx: number) {
  if (fetching.value) return
  fetching.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      hours: String(h),
      min_duration_minutes: String(mn),
      max_duration_minutes: String(mx),
    })
    const data = await apiGet<{ videos: VideoItem[] }>(`/latest-videos?${params.toString()}`)
    videos.value = data.videos
    appliedHours.value = h
    appliedMin.value = mn
    appliedMax.value = mx
  } catch (e: any) {
    error.value = '無法載入最新影片'
  } finally {
    loading.value = false
    fetching.value = false
    quota.refresh()
  }
}

async function applyFilters() {
  if (validationError.value || fetching.value) return
  await fetchVideos(hoursInput.value, minDurationInput.value, maxDurationInput.value)
}

onMounted(async () => {
  try {
    const settings = await apiGet<{
      latest_hours?: number
      min_duration_minutes?: number
      max_duration_minutes?: number
    }>('/settings')
    hoursInput.value = settings.latest_hours ?? 24
    minDurationInput.value = settings.min_duration_minutes ?? 3
    maxDurationInput.value = settings.max_duration_minutes ?? 60
    await fetchVideos(hoursInput.value, minDurationInput.value, maxDurationInput.value)
  } catch (e: any) {
    error.value = '無法載入最新影片'
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
.feed-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem; }
.feed-header h2 { margin: 0; font-size: 1.1rem; }
.badge {
  background: #f0f0f0;
  border-radius: 12px;
  padding: 0.15rem 0.6rem;
  font-size: 0.78rem;
  color: #666;
}
.count-badge {
  background: #e3f2fd;
  color: #1565c0;
  border: 1px solid #bbdefb;
  border-radius: 12px;
  padding: 0.15rem 0.6rem;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.count-badge.count-cap {
  background: #fff3e0;
  color: #b25e00;
  border-color: #ffd599;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.6rem 1rem;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin-bottom: 1rem;
}
.field { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.75rem; color: #555; }
.field span { font-weight: 500; }
.field input {
  width: 6.5rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.85rem;
}
.apply-btn {
  padding: 0.4rem 1rem;
  background: #ff0000;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.redownload-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.redownload-toggle input { cursor: pointer; }
.field-error {
  color: #c00;
  font-size: 0.75rem;
  margin: 0;
  flex-basis: 100%;
}
.hint {
  color: #888;
  font-size: 0.72rem;
  margin: 0;
  flex-basis: 100%;
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
