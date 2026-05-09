import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TrendingVideosFeed from '@/components/TrendingVideosFeed.vue'
import { useDownloadStore } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
}))

const CSS = extractCss('src/components/TrendingVideosFeed.vue')

function makeVideo(id: string, overrides: Record<string, unknown> = {}) {
  return {
    video_id: id,
    title: `發燒影片 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: new Date().toISOString(),
    duration_seconds: 150,
    channel_id: 'UC_trend',
    channel_title: '發燒頻道',
    view_count: 1234,
    ...overrides,
  }
}

describe('TrendingVideosFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('載入中顯示「載入中...」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(TrendingVideosFeed)
    snap('TrendingVideosFeed|1. 載入狀態', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('載入中')
  })

  it('API 成功載入並顯示影片', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1'), makeVideo('t2')],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    snap('TrendingVideosFeed|2. 成功顯示發燒影片清單', wrapper.html(), CSS)
    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('發燒影片 t1')
  })

  it('API 失敗顯示錯誤訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockRejectedValueOnce(new Error('網路錯誤'))

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    snap('TrendingVideosFeed|3. 錯誤狀態', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('無法載入發燒影片')
  })

  it('勾選加入下載佇列', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1')],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const download = useDownloadStore()
    await wrapper.find('.video-checkbox').trigger('change')
    expect(download.selected).toHaveLength(1)

    snap('TrendingVideosFeed|4. 勾選影片後加入下載', wrapper.html(), CSS)
  })

  it('view_count 1234567 顯示「1.23M views」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1', { view_count: 1234567 })],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('1.23M views')
  })

  it('view_count 12345 顯示「12.3K views」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1', { view_count: 12345 })],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('12.3K views')
  })

  it('view_count 999 顯示「999 views」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1', { view_count: 999 })],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.views').text()).toBe('999 views')
  })

  it('next_page_token 為 null 時不顯示「載入更多」按鈕', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1')],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()
    expect(wrapper.find('.load-more-btn').exists()).toBe(false)
  })

  it('next_page_token 存在時顯示按鈕，點擊後 append 新影片', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/trending-videos') {
        return { videos: [makeVideo('t1'), makeVideo('t2')], next_page_token: 'TOKEN_ABC' }
      }
      if (path.startsWith('/trending-videos?page_token=')) {
        return { videos: [makeVideo('t3'), makeVideo('t4')], next_page_token: null }
      }
      return {}
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const btn = wrapper.find('.load-more-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('載入更多')
    expect(btn.text()).toContain('1 配額')

    await btn.trigger('click')
    await flushPromises()

    const trendingCalls = vi.mocked(apiGet).mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].startsWith('/trending-videos?page_token=')
    )
    expect(trendingCalls).toHaveLength(1)
    expect(trendingCalls[0]?.[0]).toBe('/trending-videos?page_token=TOKEN_ABC')
    expect(wrapper.findAll('.video-item')).toHaveLength(4)
    expect(wrapper.find('.load-more-btn').exists()).toBe(false)
  })

  it('載入更多失敗保留既有清單並顯示錯誤', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
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

  it('點縮圖呼叫 player.open(video_id)', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1')],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const player = usePlayerStore()
    await wrapper.find('.thumb').trigger('click')
    expect(player.currentVideoId).toBe('t1')
    expect(player.isOpen).toBe(true)
  })

  it('點 checkbox 不觸發 player.open（仍走原本下載勾選）', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('t1')],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const player = usePlayerStore()
    const download = useDownloadStore()
    await wrapper.find('.video-checkbox').trigger('change')
    expect(player.isOpen).toBe(false)
    expect(download.selected).toHaveLength(1)
  })

  it('30 秒短片不被時長過濾刷掉', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('short1', { duration_seconds: 30 })],
      next_page_token: null,
    })

    const wrapper = mount(TrendingVideosFeed)
    await flushPromises()

    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('發燒影片 short1')
  })
})
