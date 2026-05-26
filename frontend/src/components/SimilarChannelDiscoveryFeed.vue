<template>
  <div class="discovery-feed">
    <div class="header">
      <h2>🔍 同類新頻道</h2>
      <p class="subtitle">跟你訂閱風格相近、但你還沒訂閱的頻道近期影片</p>
    </div>

    <!-- 載入進度 -->
    <div v-if="discovery.loadingPhase === 'fast'" class="progress-strip">
      🔎 分析訂閱中…找出興趣關鍵字…
    </div>
    <div v-else-if="discovery.loadingPhase === 'full'" class="progress-strip">
      🌱 挖掘相似頻道中…（首次需 10–30 秒）
    </div>

    <!-- 興趣摘要 + 重新分析 -->
    <div v-if="discovery.profileSummary && discovery.profileSummary.subscribed_count > 0" class="profile-summary">
      <span class="profile-label">你的興趣關鍵字：</span>
      <span v-if="discovery.profileSummary.keywords.length === 0" class="profile-empty">尚未推斷出</span>
      <span
        v-for="kw in discovery.profileSummary.keywords"
        :key="kw"
        class="kw-chip"
      >{{ kw }}</span>
      <span v-if="discovery.profileSummary.lang === 'cjk'" class="lang-tag" title="只顯示中文影片">🀄 中文</span>
      <span v-else-if="discovery.profileSummary.lang === 'latin'" class="lang-tag" title="只顯示英文影片">🅰️ EN</span>
      <button
        class="refresh-btn"
        :disabled="discovery.loadingPhase === 'fast' || discovery.loadingPhase === 'full'"
        :title="`上次分析：${formatAnalyzedAt(discovery.profileSummary.analyzed_at)}`"
        @click="handleRefreshAnalysis"
      >
        🔁 重新分析
      </button>
    </div>

    <!-- 錯誤 -->
    <div v-if="discovery.error" class="error">{{ discovery.error }}</div>

    <!-- 空狀態：無訂閱 -->
    <div v-if="discovery.emptyReason === 'no_subscriptions'" class="empty-state">
      <p>需要先訂閱至少一個頻道才能使用此功能。</p>
      <p class="hint">YouTube 會以你的訂閱風格為基礎，找出你還沒訂閱、但類似的頻道。</p>
    </div>

    <!-- 影片卡片列表 -->
    <ul v-else-if="discovery.videos.length > 0" class="video-grid">
      <li
        v-for="v in discovery.videos"
        :key="v.video_id"
        class="video-item"
      >
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
          <span class="new-channel-badge">★ 新頻道</span>
        </div>
        <div class="info">
          <span class="title" :title="v.title">{{ v.title }}</span>
          <div class="meta">
            <span class="channel">{{ v.channel_title }}</span>
            <div class="meta-row">
              <span class="date">{{ formatDate(v.published) }}</span>
              <span v-if="v.view_count != null" class="sep">·</span>
              <span v-if="v.view_count != null" class="views">{{ formatViewCount(v.view_count) }}</span>
            </div>
          </div>
          <button
            class="watch-btn"
            :class="{ watched: watchlist.has(v.channel_id || '') }"
            :disabled="watchlist.has(v.channel_id || '')"
            @click="handleAddToWatchlist(v)"
          >
            <template v-if="watchlist.has(v.channel_id || '')">✓ 已在觀察名單</template>
            <template v-else>👁 加入觀察名單</template>
          </button>
        </div>
      </li>
    </ul>

    <!-- 完全空白（不是無訂閱，但沒有候選） -->
    <div
      v-else-if="discovery.loadingPhase === 'done' && discovery.videos.length === 0 && !discovery.emptyReason"
      class="empty"
    >
      目前找不到合適的候選影片。試試 🔄 換一批
    </div>

    <!-- 換一批 -->
    <div
      v-if="discovery.videos.length > 0 && (discovery.hasMore || discovery.loadingPhase === 'done')"
      class="load-more-wrap"
    >
      <button
        class="load-more-btn"
        :disabled="discovery.loadingPhase === 'more' || discovery.loadingPhase === 'fast' || discovery.loadingPhase === 'full'"
        @click="discovery.loadMore()"
      >
        {{ discovery.loadingPhase === 'more' ? '載入中...' : '🔄 換一批' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { useQuotaStore } from '@/stores/quota'
import { usePlayerStore } from '@/stores/player'
import { useDiscoveryStore } from '@/stores/discovery'
import { useWatchlistStore } from '@/stores/watchlist'
import type { VideoItem } from '@/stores/download'

const download = useDownloadStore()
const quota = useQuotaStore()
const player = usePlayerStore()
const discovery = useDiscoveryStore()
const watchlist = useWatchlistStore()

async function handleRefreshAnalysis() {
  if (!confirm('重新分析訂閱會花 10–30 秒（重打 YouTube API 撈關鍵字 + 重抓相似頻道）。要繼續嗎？')) return
  await discovery.refreshAnalysis()
  quota.refresh()
}

function formatAnalyzedAt(iso?: string | null): string {
  if (!iso) return '尚未分析'
  try {
    return new Date(iso).toLocaleString('zh-TW', { hour12: false })
  } catch {
    return iso
  }
}

function handleAddToWatchlist(video: VideoItem) {
  if (!video.channel_id) return
  watchlist.add({
    channel_id: video.channel_id,
    title: video.channel_title || video.channel_id,
    thumbnail: video.thumbnail,
  })
}

onMounted(async () => {
  // 切到此 tab 時：若尚未載入，啟動 progressive load
  if (discovery.loadingPhase === 'idle' && discovery.videos.length === 0) {
    await discovery.loadInitial()
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
.discovery-feed { padding: 0.5rem 1rem; padding-bottom: 2rem; }
.header { margin-bottom: 0.6rem; padding-bottom: 0.5rem; border-bottom: 1px solid #eee; }
.header h2 { margin: 0; font-size: 1.2rem; color: #6a1b9a; }
.subtitle { margin: 0.2rem 0 0 0; font-size: 0.85rem; color: #777; }

.progress-strip {
  background: linear-gradient(90deg, #f3e5f5, #fff, #f3e5f5);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
  padding: 0.55rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #6a1b9a;
  margin-bottom: 0.8rem;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.profile-summary { margin-bottom: 0.8rem; font-size: 0.8rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
.profile-label { color: #777; }
.profile-empty { color: #aaa; font-style: italic; }
.kw-chip {
  background: #f3e5f5;
  color: #6a1b9a;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid #e1bee7;
}
.lang-tag {
  background: #fff;
  color: #555;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid #ddd;
  margin-left: 0.2rem;
}
.refresh-btn {
  margin-left: auto;
  padding: 0.25rem 0.7rem;
  font-size: 0.75rem;
  border: 1px solid #d1c4e9;
  background: #fff;
  color: #6a1b9a;
  border-radius: 6px;
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) { background: #f3e5f5; }
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

ul { list-style: none; padding: 0; margin: 0; }
.video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.video-item {
  display: flex; flex-direction: row; align-items: flex-start; gap: 0.8rem;
  background: #fff; padding: 0.5rem; border-radius: 8px; border: 1px solid #eee;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.video-item:hover { background: #fdfdfd; border-color: #ddd; }

.thumb-wrapper {
  position: relative; width: 140px; flex-shrink: 0;
  aspect-ratio: 16 / 9; border-radius: 6px; overflow: hidden; background: #eee;
}
.thumb { width: 100%; height: 100%; object-fit: cover; display: block; cursor: pointer; transition: opacity 0.15s; }
.thumb:hover { opacity: 0.92; }
.video-checkbox { position: absolute; top: 6px; left: 6px; z-index: 2; transform: scale(1.2); cursor: pointer; }
.new-channel-badge {
  position: absolute; top: 6px; right: 6px;
  background: rgba(106, 27, 154, 0.9); color: white;
  padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; line-height: 1.3;
}
.duration {
  position: absolute; bottom: 4px; right: 4px;
  background: rgba(0,0,0,0.8); color: white;
  padding: 2px 4px; border-radius: 4px; font-size: 0.7rem;
  line-height: 1; font-variant-numeric: tabular-nums;
}

.info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 0; }
.title {
  font-size: 0.85rem; font-weight: 500;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis; white-space: normal; line-height: 1.4;
}
.meta { display: flex; flex-direction: column; gap: 0.2rem; }
.meta-row { display: flex; flex-direction: row; align-items: baseline; gap: 0.35rem; }
.channel { font-size: 0.75rem; color: #555; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.date { font-size: 0.75rem; color: #888; }
.sep { font-size: 0.75rem; color: #aaa; }
.views { font-size: 0.75rem; color: #888; font-variant-numeric: tabular-nums; }

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

.error, .empty { padding: 1rem; text-align: center; color: #666; }
.error { color: #d32f2f; }

.empty-state {
  text-align: center; padding: 3rem 1rem; color: #555;
  background: #faf5ff; border: 1px dashed #d1c4e9; border-radius: 8px;
}
.empty-state .hint { font-size: 0.85rem; color: #888; margin-top: 0.5rem; }

.load-more-wrap { display: flex; justify-content: center; margin-top: 1.5rem; }
.load-more-btn {
  padding: 0.5rem 1.2rem; font-size: 0.85rem; border: 1px solid #d1c4e9;
  background: #fff; color: #6a1b9a; border-radius: 6px; cursor: pointer;
  transition: background 0.15s;
}
.load-more-btn:hover:not(:disabled) { background: #f3e5f5; }
.load-more-btn:disabled { opacity: 0.6; cursor: not-allowed; }

</style>
