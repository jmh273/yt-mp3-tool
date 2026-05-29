import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiPost } from '@/api'

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
  | { success: false; duplicate: true }
  | { success: false; error: string }

function sortByNewest(items: WatchlistItem[]) {
  return [...items].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
}

// 跨帳號共用單一份觀察名單，固定 key；切帳號不換內容。
const STORAGE_KEY = 'watchlist:shared'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref<WatchlistItem[]>([])

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      items.value = sortByNewest(Array.isArray(parsed) ? parsed : [])
    } catch {
      items.value = []
    }
  }

  function persist() {
    items.value = sortByNewest(items.value)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
  }

  function add(channel: WatchlistChannelInput) {
    if (has(channel.channel_id)) return
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
      const message = e?.message ?? ''
      if (/subscriptionDuplicate|already exists/i.test(message)) {
        // YouTube 回報已訂閱（subscriptions.list 可能因同步延遲未反映）。
        // 視為非錯誤，保留名單項（可能仍要搬到其他帳號）。
        return { success: false, duplicate: true }
      }
      return { success: false, error: message || '訂閱失敗' }
    }
  }

  load()

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
