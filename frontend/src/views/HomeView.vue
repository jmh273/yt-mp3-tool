<template>
  <div class="home">
    <header>
      <h1>YT → MP3 <span v-if="version" class="version">v{{ version }}</span></h1>
      <div class="header-actions">
        <span class="quota-badge" :class="quota.level" :title="`API Quota: ${quotaUsedDisplay} / ${quota.limit}\n(跨帳號共用)`">
          API Quota: {{ quotaUsedDisplay }} / {{ quota.limit }}
        </span>

        <!-- 帳號切換 dropdown -->
        <div class="account-switcher" v-if="auth.accounts.length > 0">
          <button class="account-toggle" @click="accountDropdownOpen = !accountDropdownOpen">
            {{ truncateEmail(auth.currentAccount) }} ▾
          </button>
          <div v-if="accountDropdownOpen" class="account-dropdown">
            <div
              v-for="email in auth.accounts"
              :key="email"
              class="account-item"
              :class="{ current: email === auth.currentAccount }"
            >
              <span class="account-email" @click="handleSwitch(email)">{{ email }}</span>
              <button class="account-logout-btn" @click.stop="handleLogoutAccount(email)" title="登出此帳號">✕</button>
            </div>
            <div class="account-item add-account" @click="handleAddAccount">
              ＋ 新增帳號
            </div>
          </div>
        </div>

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

        <button
          class="latest-btn trending"
          :class="{ active: activeView === 'trending' }"
          @click="showTrending"
        >
          🔥 發燒影片
        </button>

        <button
          class="latest-btn search-btn"
          :class="{ active: activeView === 'search' }"
          @click="showSearch"
        >
          🔍 搜尋影片
        </button>

        <button
          class="latest-btn url-btn"
          :class="{ active: activeView === 'url' }"
          @click="showUrl"
        >
          🔗 網址下載
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
          @back="showLatest"
        />
        <LatestVideosFeed v-else-if="activeView === 'latest'" />
        <TrendingVideosFeed v-else-if="activeView === 'trending'" />
        <SearchVideosFeed v-else-if="activeView === 'search'" />
        <UrlDownloadFeed v-else-if="activeView === 'url'" />
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
import { useQuotaStore } from '@/stores/quota'
import ChannelVideos from '@/components/ChannelVideos.vue'
import LatestVideosFeed from '@/components/LatestVideosFeed.vue'
import TrendingVideosFeed from '@/components/TrendingVideosFeed.vue'
import SearchVideosFeed from '@/components/SearchVideosFeed.vue'
import UrlDownloadFeed from '@/components/UrlDownloadFeed.vue'
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
const quota = useQuotaStore()
const quotaUsedDisplay = computed(() => quota.used === null ? '—' : quota.used)
const channels = ref<Channel[]>([])
const searchQuery = ref('')
const loading = ref(true)
const error = ref('')
const version = ref('')
const selectedChannelId = ref<string | null>(null)
const activeView = ref<'none' | 'channel' | 'latest' | 'trending' | 'search' | 'url'>('none')
const activeRightTab = ref<'download' | 'normalize'>('download')
const checkingDates = ref(false)
const channelDates = ref<Record<string, string>>({})
const accountDropdownOpen = ref(false)

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
    quota.refresh()
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

function showTrending() {
  selectedChannelId.value = null
  activeView.value = 'trending'
}

function showSearch() {
  selectedChannelId.value = null
  activeView.value = 'search'
}

function showUrl() {
  selectedChannelId.value = null
  activeView.value = 'url'
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
    quota.refresh()
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

function truncateEmail(email: string): string {
  if (!email) return ''
  if (email.length <= 20) return email
  const parts = email.split('@')
  const local = parts[0] || ''
  const domain = parts[1]
  if (!domain) return email.slice(0, 18) + '…'
  return local.slice(0, 8) + '…@' + domain
}

async function handleSwitch(email: string) {
  if (email === auth.currentAccount) {
    accountDropdownOpen.value = false
    return
  }
  accountDropdownOpen.value = false
  loading.value = true
  error.value = ''
  try {
    await auth.switchAccount(email)
    // 重新載入該帳號的訂閱清單
    selectedChannelId.value = null
    activeView.value = 'none'
    channelDates.value = {}
    const data = await apiGet<{ channels: Channel[] }>('/subscriptions')
    channels.value = data.channels
    quota.refresh()
  } catch (e: any) {
    error.value = '切換帳號失敗：' + e.message
  } finally {
    loading.value = false
  }
}

async function handleLogoutAccount(email: string) {
  if (!confirm(`確定要登出帳號「${email}」嗎？`)) return
  accountDropdownOpen.value = false
  await auth.logoutAccount(email)
  if (auth.loggedIn) {
    // 還有其他帳號，重新載入
    loading.value = true
    try {
      const data = await apiGet<{ channels: Channel[] }>('/subscriptions')
      channels.value = data.channels
      selectedChannelId.value = null
      activeView.value = 'none'
      quota.refresh()
    } finally {
      loading.value = false
    }
  }
}

async function handleAddAccount() {
  accountDropdownOpen.value = false
  await auth.addAccount()
  // 使用者需在瀏覽器完成 OAuth，之後 poll
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    await auth.checkStatus()
    if (auth.accounts.length > channels.value.length) break // 新帳號出現
  }
  // 重新載入
  if (auth.loggedIn) {
    loading.value = true
    try {
      const data = await apiGet<{ channels: Channel[] }>('/subscriptions')
      channels.value = data.channels
      quota.refresh()
    } finally {
      loading.value = false
    }
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
.header-actions { display: flex; gap: 0.75rem; align-items: center; }
.header-actions a { text-decoration: none; color: #333; font-size: 0.9rem; }
.header-actions > button { background: none; border: 1px solid #ccc; padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }

/* 帳號切換 dropdown */
.account-switcher { position: relative; }
.account-toggle {
  background: #f5f5f5; border: 1px solid #ddd; padding: 0.25rem 0.6rem;
  border-radius: 4px; cursor: pointer; font-size: 0.82rem; white-space: nowrap;
}
.account-toggle:hover { background: #eee; }
.account-dropdown {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 100;
  background: white; border: 1px solid #ddd; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12); min-width: 240px;
  overflow: hidden;
}
.account-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.75rem; font-size: 0.85rem; cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}
.account-item:last-child { border-bottom: none; }
.account-item:hover { background: #f8f8f8; }
.account-item.current { background: #fff0f0; font-weight: 600; }
.account-email { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-logout-btn {
  background: none; border: none; color: #999; cursor: pointer;
  font-size: 0.9rem; padding: 0 0.3rem; line-height: 1;
}
.account-logout-btn:hover { color: #d1242f; }
.add-account { color: #0969da; font-weight: 500; justify-content: center; }
.add-account:hover { background: #f0f6ff; }

.quota-badge {
  font-size: 0.78rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
}
.quota-badge.unknown { background: #f0f0f0; color: #888; border-color: #ddd; }
.quota-badge.safe    { background: #e6f4ea; color: #2ea043; border-color: #b5e0c2; }
.quota-badge.warning { background: #fff4e0; color: #b25e00; border-color: #ffd599; }
.quota-badge.danger  { background: #fce8e9; color: #d1242f; border-color: #f5b3b6; }

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
