import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWatchlistStore } from '@/stores/watchlist'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn(), replace: vi.fn() },
}))

function channel(id: string, title = id) {
  return {
    channel_id: id,
    title,
    thumbnail: `https://example.com/${id}.jpg`,
  }
}

describe('watchlistStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useRealTimers()
  })

  it('adds, removes, checks presence, and treats duplicate add as no-op', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-26T01:00:00Z'))
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()

    store.add(channel('UC1', 'Alpha'))
    const firstAddedAt = store.items[0]!.added_at
    vi.setSystemTime(new Date('2026-05-26T02:00:00Z'))
    store.add(channel('UC1', 'Alpha Updated'))

    expect(store.items).toHaveLength(1)
    expect(store.items[0]!.title).toBe('Alpha')
    expect(store.items[0]!.added_at).toBe(firstAddedAt)
    expect(store.has('UC1')).toBe(true)
    expect(store.has('missing')).toBe(false)

    store.remove('UC1')
    expect(store.items).toHaveLength(0)
  })

  it('sorts items by added_at descending and persists to the shared key', async () => {
    vi.useFakeTimers()
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()

    vi.setSystemTime(new Date('2026-05-25T01:00:00Z'))
    store.add(channel('UC-old', 'Old'))
    vi.setSystemTime(new Date('2026-05-26T01:00:00Z'))
    store.add(channel('UC-new', 'New'))

    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-new', 'UC-old'])
    const stored = JSON.parse(localStorage.getItem('watchlist:shared') || '[]')
    expect(stored.map((item: { channel_id: string }) => item.channel_id)).toEqual(['UC-new', 'UC-old'])
    expect(localStorage.getItem('watchlist:alice@example.com')).toBeNull()
  })

  it('shares one list across accounts; switching account does not change it', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()

    store.add(channel('UC-a', 'Alice'))
    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-a'])

    // 切到 B：名單不變（共用同一份）
    auth.currentAccount = 'bob@example.com'
    await nextTick()
    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-a'])

    // 在 B 加入後切回 A：仍看得到 B 加的項目
    store.add(channel('UC-b', 'Bob'))
    auth.currentAccount = 'alice@example.com'
    await nextTick()
    expect(store.items.map((item) => item.channel_id).sort()).toEqual(['UC-a', 'UC-b'])

    const stored = JSON.parse(localStorage.getItem('watchlist:shared') || '[]')
    expect(stored).toHaveLength(2)
  })

  it('add() works when not logged in (no login gate) and persists to shared key', async () => {
    const auth = useAuthStore()
    auth.currentAccount = ''
    const store = useWatchlistStore()
    await nextTick()

    store.add(channel('UC-anon', 'Anon'))

    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-anon'])
    const stored = JSON.parse(localStorage.getItem('watchlist:shared') || '[]')
    expect(stored.map((item: { channel_id: string }) => item.channel_id)).toEqual(['UC-anon'])
  })

  it('promotes a channel successfully by posting to subscriptions and removing the item', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      subscription_id: 'sub-1',
      channel: {
        subscription_id: 'sub-1',
        channel_id: 'UC1',
        title: 'Alpha',
        thumbnail: 'https://example.com/a.jpg',
      },
    })
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add(channel('UC1', 'Alpha'))

    const result = await store.promote('UC1')

    expect(apiPost).toHaveBeenCalledWith('/subscriptions/UC1')
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected promote success')
    expect(result.subscription_id).toBe('sub-1')
    expect(store.items).toHaveLength(0)
  })

  it('keeps the item when promote fails and returns the error', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockRejectedValue(new Error('quota exhausted'))
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add(channel('UC1', 'Alpha'))

    const result = await store.promote('UC1')

    expect(result).toEqual({ success: false, error: 'quota exhausted' })
    expect(store.items).toHaveLength(1)
  })

  it('treats subscriptionDuplicate as a non-error and keeps the item', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockRejectedValue(
      new Error('訂閱失敗：<HttpError 400 ... returned "The subscription that you are trying to create already exists." reason: subscriptionDuplicate>'),
    )
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add(channel('UC1', 'Alpha'))

    const result = await store.promote('UC1')

    expect(result).toEqual({ success: false, duplicate: true })
    // 保留名單項（不自動移除）
    expect(store.items).toHaveLength(1)
    expect(store.has('UC1')).toBe(true)
  })
})
