import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TrendingVideosFeed from '@/components/TrendingVideosFeed.vue'
import { useDownloadStore } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'
import { useWatchlistStore } from '@/stores/watchlist'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
}))

function makeVideo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    video_id: id,
    title: `熱門影片 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: new Date().toISOString(),
    duration_seconds: 150,
    channel_id: 'UC_trend',
    channel_title: '熱門頻道',
    view_count: 1234,
    ...overrides,
  }
}

function mockTrendingApi({
  categories = [
    { id: null, label: '全部' },
    { id: '10', label: '🎵 音樂' },
    { id: '20', label: '🎮 遊戲' },
  ],
  categoryFails = false,
} = {}) {
  return vi.fn(async (path: string) => {
    if (path === '/trending-videos/categories') {
      if (categoryFails) throw new Error('categories unavailable')
      return { categories }
    }
    if (path === '/trending-videos') {
      return { videos: [makeVideo('all1'), makeVideo('all2')], next_page_token: 'NEXT_ALL' }
    }
    if (path === '/trending-videos?category=10') {
      return { videos: [makeVideo('music1')], next_page_token: null }
    }
    if (path === '/trending-videos?category=20') {
      return { videos: [makeVideo('game1')], next_page_token: 'NEXT_GAME' }
    }
    if (path === '/trending-videos?page_token=NEXT_ALL') {
      return { videos: [makeVideo('all3')], next_page_token: null }
    }
    if (path === '/trending-videos?page_token=NEXT_GAME&category=20') {
      return { videos: [makeVideo('game2')], next_page_token: null }
    }
    throw new Error(`unexpected path ${path}`)
  })
}

describe('TrendingVideosFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows loading state', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(TrendingVideosFeed)
    expect(wrapper.text()).toContain('載入中')
  })

  it('renders videos and category chips in API order', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    expect(wrapper.findAll('.video-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('熱門影片 all1')
    const chips = wrapper.findAll('.category-chip')
    expect(chips.map(chip => chip.text())).toEqual(['全部', '🎵 音樂', '🎮 遊戲'])
    expect(chips[0]?.classes()).toContain('active')
  })

  it('shows an error when the trending request fails', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      throw new Error('quota exceeded')
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    expect(wrapper.text()).toContain('無法載入發燒影片')
  })

  it('selects videos for download', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.find('.video-checkbox').trigger('change')

    expect(useDownloadStore().selected).toHaveLength(1)
  })

  it('opens the player when clicking a thumbnail', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.find('.thumb').trigger('click')

    const player = usePlayerStore()
    expect(player.currentVideoId).toBe('all1')
    expect(player.isOpen).toBe(true)
  })

  it('adds a video channel to the watchlist from the feed', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.find('.watch-btn').trigger('click')

    const watchlist = useWatchlistStore()
    expect(watchlist.has('UC_trend')).toBe(true)
    expect(watchlist.items[0]).toMatchObject({
      channel_id: 'UC_trend',
      thumbnail: 'https://i.ytimg.com/vi/all1/mqdefault.jpg',
    })
    expect(wrapper.find('.watch-btn').attributes('disabled')).toBeDefined()
  })

  it('disables the watchlist button when channel_id is missing', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') return { categories: [{ id: null, label: '全部' }] }
      if (path === '/trending-videos') {
        return { videos: [makeVideo('missing-channel', { channel_id: undefined })], next_page_token: null }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const btn = wrapper.find('.watch-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(useWatchlistStore().items).toHaveLength(0)
  })

  it('formats view counts compactly', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos') {
        return { videos: [makeVideo('t1', { view_count: 1234567 })], next_page_token: null }
      }
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('1.23M views')
  })

  it('loads more videos with no category selected', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.find('.load-more-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/trending-videos?page_token=NEXT_ALL')
    expect(wrapper.findAll('.video-item')).toHaveLength(3)
  })

  it('clicking a non-active category refetches with category', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.findAll('.category-chip')[1]?.trigger('click')
    await flushPromises()

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/trending-videos?category=10')
    expect(wrapper.findAll('.video-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('熱門影片 music1')
  })

  it('clicking the active category is a no-op', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    const callsBefore = vi.mocked(apiGet).mock.calls.length
    await wrapper.find('.category-chip').trigger('click')
    await flushPromises()

    expect(vi.mocked(apiGet).mock.calls).toHaveLength(callsBefore)
  })

  it('load more carries the active category', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.findAll('.category-chip')[2]?.trigger('click')
    await flushPromises()
    await wrapper.find('.load-more-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/trending-videos?page_token=NEXT_GAME&category=20')
    expect(wrapper.findAll('.video-item')).toHaveLength(2)
  })

  it('falls back to the all chip when categories fail', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi({ categoryFails: true }))

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const chips = wrapper.findAll('.category-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.text()).toBe('全部')
  })

  it('view_count 999 顯示「999 views」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      if (path === '/trending-videos') {
        return { videos: [makeVideo('t1', { view_count: 999 })], next_page_token: null }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('999 views')
  })

  it('view_count 12345 顯示「12.3K views」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      if (path === '/trending-videos') {
        return { videos: [makeVideo('t1', { view_count: 12345 })], next_page_token: null }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('12.3K views')
  })

  it('30 秒短片不被時長過濾刷掉', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      if (path === '/trending-videos') {
        return { videos: [makeVideo('short1', { duration_seconds: 30 })], next_page_token: null }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('熱門影片 short1')
  })

  it('載入更多按鈕顯示「載入更多」和「約消耗 1 配額」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockTrendingApi())

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    const btn = wrapper.find('.load-more-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('載入更多')
    expect(btn.text()).toContain('約消耗 1 配額')
  })

  it('載入更多失敗保留既有清單並顯示錯誤', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos/categories') {
        return { categories: [{ id: null, label: '全部' }] }
      }
      if (path === '/trending-videos') {
        return { videos: [makeVideo('t1')], next_page_token: 'TOKEN_X' }
      }
      if (path.startsWith('/trending-videos?page_token=')) {
        throw new Error('quota exceeded')
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    await wrapper.find('.load-more-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.video-item')).toHaveLength(1)
    expect(wrapper.find('.load-more-error').text()).toContain('載入更多失敗')
    const btn = wrapper.find('.load-more-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeUndefined()
  })
})
