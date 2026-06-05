import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SearchVideosFeed from '@/components/SearchVideosFeed.vue'
import { usePlayerStore } from '@/stores/player'
import { useWatchlistStore } from '@/stores/watchlist'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const CSS = extractCss('src/components/SearchVideosFeed.vue')

function makeVideo(id: string) {
  return {
    video_id: id,
    title: `搜尋結果 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: new Date().toISOString(),
    duration_seconds: 400,
    channel_id: 'UC_search',
    channel_title: '搜尋頻道',
  }
}

function makeChannel(id: string, title = `Channel ${id}`) {
  return {
    channel_id: id,
    title,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  }
}

describe('SearchVideosFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('初始狀態顯示提示', async () => {
    const wrapper = mount(SearchVideosFeed)
    snap('SearchVideosFeed|1. 初始提示搜尋', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('請輸入關鍵字開始搜尋')
  })

  it('搜尋載入中', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('lofi')
    await wrapper.find('button').trigger('click')

    snap('SearchVideosFeed|2. 搜尋載入中', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('載入中')
  })

  it('搜尋成功顯示結果', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('s1'), makeVideo('s2')]
    })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('lofi')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    snap('SearchVideosFeed|3. 成功顯示搜尋結果', wrapper.html(), CSS)
    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('搜尋結果 s1')
    expect(vi.mocked(apiGet)).not.toHaveBeenCalledWith('/search-channels?q=lofi')
  })

  it('點縮圖呼叫 player.open(video_id)', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [makeVideo('s1')] })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('lofi')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    const player = usePlayerStore()
    await wrapper.find('.thumb').trigger('click')
    expect(player.currentVideoId).toBe('s1')
    expect(player.isOpen).toBe(true)
  })

  it('adds a search result channel to the watchlist', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [makeVideo('s1')] })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('lofi')
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await wrapper.find('.watch-btn').trigger('click')

    const watchlist = useWatchlistStore()
    expect(watchlist.has('UC_search')).toBe(true)
    expect(watchlist.items[0]).toMatchObject({
      channel_id: 'UC_search',
      thumbnail: 'https://i.ytimg.com/vi/s1/mqdefault.jpg',
    })
    expect(wrapper.find('.watch-btn').attributes('disabled')).toBeDefined()
  })

  it('disables search result watchlist action without channel_id', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [{ ...makeVideo('s1'), channel_id: undefined }],
    })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('lofi')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    const btn = wrapper.find('.watch-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(useWatchlistStore().items).toHaveLength(0)
  })

  it('disables the search button when both scopes are unchecked', async () => {
    const wrapper = mount(SearchVideosFeed)

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0]!.setValue(false)

    expect((wrapper.find('.search-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('searches channels and renders channel results before videos when enabled', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/search-videos')) return { videos: [makeVideo('s1')] }
      if (path.startsWith('/search-channels')) return { channels: [makeChannel('UC_chan', 'Lo-fi Radio')] }
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: '' }
      return {}
    })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input[type="text"]').setValue('lofi')
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/search-channels?q=lofi')
    expect(wrapper.find('.channel-section').exists()).toBe(true)
    expect(wrapper.find('.video-section').exists()).toBe(true)
    expect(wrapper.text()).toContain('頻道')
    expect(wrapper.text()).toContain('Lo-fi Radio')
    expect(wrapper.find('.channel-section').element.compareDocumentPosition(wrapper.find('.video-section').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds a channel result to the watchlist and disables the channel watch button', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/search-channels')) return { channels: [makeChannel('UC_chan', 'Lo-fi Radio')] }
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: '' }
      return {}
    })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input[type="text"]').setValue('lofi')
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(false)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()
    await wrapper.find('.channel-card .watch-btn').trigger('click')

    const watchlist = useWatchlistStore()
    expect(watchlist.has('UC_chan')).toBe(true)
    expect(wrapper.find('.channel-card .watch-btn').attributes('disabled')).toBeDefined()
  })

  it('disables subscribe for an already subscribed channel', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/search-channels')) return { channels: [makeChannel('UC_subbed', 'Subscribed Channel')] }
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: '' }
      return {}
    })

    const wrapper = mount(SearchVideosFeed, {
      props: { subscribedIds: new Set(['UC_subbed']) },
    })
    await wrapper.find('input[type="text"]').setValue('lofi')
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(false)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    const subscribeBtn = wrapper.find('.subscribe-btn')
    expect(subscribeBtn.text()).toContain('✓ 已訂閱')
    expect(subscribeBtn.attributes('disabled')).toBeDefined()
  })

  it('subscribes a channel result and emits the subscribed channel', async () => {
    const { apiGet, apiPost } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/search-channels')) return { channels: [makeChannel('UC_chan', 'Lo-fi Radio')] }
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: '' }
      return {}
    })
    vi.mocked(apiPost).mockResolvedValueOnce({
      subscription_id: 'sub-UC_chan',
    })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input[type="text"]').setValue('lofi')
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(false)
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()
    await wrapper.find('.subscribe-btn').trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/subscriptions/UC_chan')
    expect(wrapper.emitted('subscribed')?.[0]?.[0]).toEqual({
      subscription_id: 'sub-UC_chan',
      channel_id: 'UC_chan',
      title: 'Lo-fi Radio',
      thumbnail: 'https://i.ytimg.com/vi/UC_chan/mqdefault.jpg',
    })
  })

  it('查無結果時顯示提示', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [] })

    const wrapper = mount(SearchVideosFeed)
    await wrapper.find('input').setValue('no-match-keyword')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    snap('SearchVideosFeed|4. 查無符合條件的影片', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('查無符合條件的影片')
  })
})
