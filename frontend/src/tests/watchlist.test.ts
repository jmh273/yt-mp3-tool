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

  it('sorts items by added_at descending and persists to the current account key', async () => {
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
    const stored = JSON.parse(localStorage.getItem('watchlist:alice@example.com') || '[]')
    expect(stored.map((item: { channel_id: string }) => item.channel_id)).toEqual(['UC-new', 'UC-old'])
  })

  it('reloads the list when currentAccount changes and keeps empty account isolated', async () => {
    localStorage.setItem('watchlist:alice@example.com', JSON.stringify([
      { ...channel('UC-a', 'Alice'), added_at: '2026-05-26T01:00:00.000Z' },
    ]))
    localStorage.setItem('watchlist:bob@example.com', JSON.stringify([
      { ...channel('UC-b', 'Bob'), added_at: '2026-05-26T02:00:00.000Z' },
    ]))

    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-a'])

    auth.currentAccount = 'bob@example.com'
    await nextTick()
    expect(store.items.map((item) => item.channel_id)).toEqual(['UC-b'])

    auth.currentAccount = ''
    await nextTick()
    store.add(channel('UC-empty', 'Empty'))
    expect(store.items).toEqual([])
    expect(localStorage.getItem('watchlist:')).toBeNull()
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
})
