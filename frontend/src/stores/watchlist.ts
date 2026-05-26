import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { apiPost } from '@/api'
import { useAuthStore } from '@/stores/auth'

export interface WatchlistItem {
  channel_id: string
  title: string
  thumbnail: string
  added_at: string
}

export interface WatchlistChannelInput {
  channel_id: string
  title: string
  thumbnail: string
}

export interface PromotedChannel {
  subscription_id: string
  channel_id: string
  title: string
  thumbnail: string
}

export type PromoteResult =
  | { success: true; channel: PromotedChannel; subscription_id: string }
  | { success: false; error: string }

function sortByNewest(items: WatchlistItem[]) {
  return [...items].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
}

export const useWatchlistStore = defineStore('watchlist', () => {
  const auth = useAuthStore()
  const items = ref<WatchlistItem[]>([])

  function storageKey() {
    return auth.currentAccount ? `watchlist:${auth.currentAccount}` : ''
  }

  function load() {
    const key = storageKey()
    if (!key) {
      items.value = []
      return
    }
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : []
      items.value = sortByNewest(Array.isArray(parsed) ? parsed : [])
    } catch {
      items.value = []
    }
  }

  function persist() {
    const key = storageKey()
    if (!key) return
    items.value = sortByNewest(items.value)
    localStorage.setItem(key, JSON.stringify(items.value))
  }

  function add(channel: WatchlistChannelInput) {
    if (!auth.currentAccount || has(channel.channel_id)) return
    items.value = sortByNewest([
      ...items.value,
      {
        channel_id: channel.channel_id,
        title: channel.title,
        thumbnail: channel.thumbnail,
        added_at: new Date().toISOString(),
      },
    ])
    persist()
  }

  function remove(channelId: string) {
    const index = items.value.findIndex((item) => item.channel_id === channelId)
    if (index === -1) return
    items.value.splice(index, 1)
    persist()
  }

  function has(channelId: string) {
    return items.value.some((item) => item.channel_id === channelId)
  }

  async function promote(channelId: string): Promise<PromoteResult> {
    const item = items.value.find((entry) => entry.channel_id === channelId)
    try {
      const result = await apiPost<{
        success: boolean
        subscription_id: string
        channel?: PromotedChannel
      }>(`/subscriptions/${channelId}`)
      const channel = result.channel ?? {
        subscription_id: result.subscription_id,
        channel_id: item?.channel_id ?? channelId,
        title: item?.title ?? channelId,
        thumbnail: item?.thumbnail ?? '',
      }
      remove(channelId)
      return { success: true, subscription_id: channel.subscription_id, channel }
    } catch (e: any) {
      return { success: false, error: e?.message || '訂閱失敗' }
    }
  }

  watch(() => auth.currentAccount, () => load(), { immediate: true })

  return {
    items,
    load,
    persist,
    add,
    remove,
    has,
    promote,
  }
})
