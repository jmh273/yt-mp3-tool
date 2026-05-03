<template>
  <div class="home">
    <header>
      <h1>YT → MP3 <span v-if="version" class="version">v{{ version }}</span></h1>
      <div class="header-actions">
        <router-link to="/settings">設定</router-link>
        <button @click="auth.logout">登出</button>
      </div>
    </header>

    <div v-if="loading" class="center">載入訂閱清單中...</div>
    <div v-else-if="error" class="center error">{{ error }}</div>

    <div v-else class="layout">
      <!-- 左欄：頻道清單 -->
      <aside class="left-pane">
        <button
          class="latest-btn"
          :class="{ active: activeView === 'latest' }"
          @click="showLatest"
        >
          最新影片
        </button>

        <button class="action-btn" @click="checkLatestDates" :disabled="checkingDates">
          {{ checkingDates ? '檢查中...' : '檢查更新日期' }}
        </button>

        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="搜尋頻道..."
          aria-label="搜尋頻道"
        />

        <div
          v-for="ch in filteredChannels"
          :key="ch.channel_id"
          class="channel-card"
          :class="{ selected: selectedChannelId === ch.channel_id }"
          @click="selectChannel(ch.channel_id)"
        >
          <img :src="ch.thumbnail" :alt="ch.title" width="32" height="32" />
          <div class="channel-info">
            <span class="channel-title">{{ ch.title }}</span>
            <span v-if="channelDates[ch.channel_id]" class="channel-date">
              {{ formatChannelDate(channelDates[ch.channel_id]!) }}
            </span>
          </div>
          <button class="delete-btn" @click.stop="deleteChannel(ch)" title="取消訂閱">🗑️</button>
        </div>
      </aside>

      <!-- 右欄：內容區 (原本的右欄，現在變成中間欄) -->
      <main class="middle-pane">
        <div v-if="activeView === 'none'" class="placeholder">
          請從左側選擇頻道，或點擊「最新影片」
        </div>
        <ChannelVideos
          v-else-if="activeView === 'channel' && selectedChannelId"
          :key="selectedChannelId"
          :channel-id="selectedChannelId"
        />
        <LatestVideosFeed v-else-if="activeView === 'latest'" />
      </main>

      <!-- 第三欄：分頁式右欄（下載 / 音量正規化） -->
      <aside class="right-pane-progress">
        <div class="tab-bar">
          <button
            class="tab"
            :class="{ active: activeRightTab === 'download' }"
            @click="activeRightTab = 'download'"
          >
            下載
            <span v-if="activeRightTab !== 'download' && downloadStore.downloading" class="dot" />
          </button>
          <button
            class="tab"
            :class="{ active: activeRightTab === 'normalize' }"
            @click="activeRightTab = 'normalize'"
          >
            音量正規化
            <span v-if="activeRightTab !== 'normalize' && normalizeStore.status === 'running'" class="dot" />
          </button>
        </div>
        <div class="tab-content">
          <KeepAlive>
            <SelectedVideos v-if="activeRightTab === 'download'" />
            <VolumeNormalizer v-else />
          </KeepAlive>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiDelete } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useNormalizeStore } from '@/stores/normalize'
import ChannelVideos from '@/components/ChannelVideos.vue'
import LatestVideosFeed from '@/components/LatestVideosFeed.vue'
import SelectedVideos from '@/components/SelectedVideos.vue'
import VolumeNormalizer from '@/components/VolumeNormalizer.vue'

interface Channel {
  subscription_id: string
  channel_id: string
  title: string
  thumbnail: string
}

const auth = useAuthStore()
const downloadStore = useDownloadStore()
const normalizeStore = useNormalizeStore()
const channels = ref<Channel[]>([])
const searchQuery = ref('')
const loading = ref(true)
const error = ref('')
const version = ref('')
const selectedChannelId = ref<string | null>(null)
const activeView = ref<'none' | 'channel' | 'latest'>('none')
const activeRightTab = ref<'download' | 'normalize'>('download')
const checkingDates = ref(false)
const channelDates = ref<Record<string, string>>({})

const filteredChannels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return channels.value
  return channels.value.filter(ch => ch.title.toLowerCase().includes(q))
})

onMounted(async () => {
  apiGet<{ version: string }>('/version')
    .then((d) => { version.value = d.version })
    .catch(() => { /* version 是輔助資訊，失敗不影響主流程 */ })
  try {
    const data = await apiGet<{ channels: Channel[] }>('/subscriptions')
    channels.value = data.channels
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

function selectChannel(id: string) {
  if (selectedChannelId.value === id && activeView.value === 'channel') return
  selectedChannelId.value = id
  activeView.value = 'channel'
}

function showLatest() {
  selectedChannelId.value = null
  activeView.value = 'latest'
}

function formatChannelDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-TW')
}

async function checkLatestDates() {
  checkingDates.value = true
  try {
    const data = await apiGet<{ latest_dates: Record<string, string> }>('/subscriptions/latest-dates')
    channelDates.value = data.latest_dates
  } catch (e: any) {
    alert('檢查更新日期失敗：' + e.message)
  } finally {
    checkingDates.value = false
  }
}

async function deleteChannel(ch: Channel) {
  if (!confirm(`確定要取消訂閱「${ch.title}」嗎？`)) return
  try {
    await apiDelete(`/subscriptions/${ch.subscription_id}`)
    channels.value = channels.value.filter(c => c.subscription_id !== ch.subscription_id)
    if (selectedChannelId.value === ch.channel_id) {
      selectedChannelId.value = null
      activeView.value = 'none'
    }
  } catch (e: any) {
    alert('取消訂閱失敗：' + e.message)
  }
}
</script>

<style scoped>
.home { display: flex; flex-direction: column; height: 100vh; overflow: hidden; box-sizing: border-box; }

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #eee;
  background: white;
  z-index: 10;
  flex-shrink: 0;
}
h1 { margin: 0; font-size: 1.2rem; }
.version { font-size: 0.7rem; color: #999; font-weight: normal; margin-left: 0.4rem; }
.header-actions { display: flex; gap: 1rem; align-items: center; }
.header-actions a { text-decoration: none; color: #333; font-size: 0.9rem; }
.header-actions button { background: none; border: 1px solid #ccc; padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }

.layout {
  display: grid;
  grid-template-columns: 240px 1fr 300px;
  flex: 1;
  overflow: hidden;
}

.left-pane {
  border-right: 1px solid #eee;
  overflow-y: auto;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.latest-btn {
  width: 100%;
  padding: 0.6rem 0.75rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: left;
  margin-bottom: 0.25rem;
}
.latest-btn.active { background: #ff0000; color: white; border-color: #cc0000; }
.latest-btn:hover:not(.active) { background: #ebebeb; }

.search-input {
  padding: 0.4rem 0.7rem;
  font-size: 0.88rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  margin-bottom: 0.25rem;
}
.search-input:focus { border-color: #c00; }

.channel-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.channel-card:hover { background: #f0f0f0; }
.channel-card.selected { background: #fff0f0; font-weight: 600; border-left: 3px solid #c00; }
.channel-card img { border-radius: 50%; flex-shrink: 0; }
.channel-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.channel-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.channel-date { font-size: 0.7rem; color: #888; }
.action-btn { width: 100%; padding: 0.5rem; background: #fff; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-bottom: 0.5rem; }
.action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.delete-btn { background: none; border: none; cursor: pointer; opacity: 0.5; padding: 0.2rem; }
.channel-card:hover .delete-btn { opacity: 1; }
.delete-btn:hover { color: red; }

.middle-pane { overflow-y: auto; padding-right: 0.5rem; }

.right-pane-progress {
  border-left: 1px solid #eee;
  overflow: hidden;
  background: #fafafa;
  display: flex;
  flex-direction: column;
}
.tab-bar { display: flex; border-bottom: 1px solid #ddd; background: #fff; flex-shrink: 0; }
.tab {
  flex: 1; padding: 0.55rem 0.5rem; border: none; background: transparent;
  cursor: pointer; font-size: 0.85rem; color: #555; border-bottom: 2px solid transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
}
.tab:hover { background: #f5f5f5; }
.tab.active { color: #c00; border-bottom-color: #c00; font-weight: 600; }
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #ff9800; display: inline-block;
}
.tab-content { flex: 1; overflow: hidden; min-height: 0; }
.tab-content > * { height: 100%; overflow-y: auto; }

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #aaa;
  font-size: 1rem;
}

.center { text-align: center; padding: 3rem; color: #666; }
.error { color: red; }

@media (max-width: 1024px) {
  .layout { grid-template-columns: 200px 1fr 250px; }
}

@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; }
  .left-pane { border-right: none; border-bottom: 1px solid #eee; max-height: 40vh; }
  .right-pane-progress { border-left: none; border-top: 1px solid #eee; max-height: 30vh; }
}
</style>
