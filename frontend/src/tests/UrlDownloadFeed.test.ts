import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import UrlDownloadFeed from '@/components/UrlDownloadFeed.vue'
import { snap, extractCss } from './snap'
import { useDownloadStore } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'
import { useWatchlistStore } from '@/stores/watchlist'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
}))

const CSS = extractCss('src/components/UrlDownloadFeed.vue')

function makeVideo(id: string) {
  return {
    video_id: id,
    title: `網址解析結果 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: new Date().toISOString(),
    duration_seconds: 500,
    channel_id: 'UC_url',
    channel_title: '網址頻道',
  }
}

describe('UrlDownloadFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('初始狀態顯示提示', async () => {
    const wrapper = mount(UrlDownloadFeed)
    snap('UrlDownloadFeed|1. 初始提示解析', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('請貼上網址並點擊解析')
  })

  it('解析載入中', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/watch?v=123')
    await wrapper.find('.search-btn').trigger('click')

    snap('UrlDownloadFeed|2. 網址解析載入中', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('解析中')
  })

  it('單一網址解析成功但不自動勾選', async () => {
    const { apiGet } = await import('@/api')
    const v = makeVideo('u1')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [v] })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/watch?v=u1')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    snap('UrlDownloadFeed|3. 單一影片解析成功', wrapper.html(), CSS)
    const download = useDownloadStore()
    expect(download.selected).toHaveLength(0)
    expect(wrapper.text()).toContain('網址解析結果 u1')
  })

  it('播放清單網址解析成功顯示全選本頁按鈕與分頁列', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('u1'), makeVideo('u2'), makeVideo('u3')]
    })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/playlist?list=XXX')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    snap('UrlDownloadFeed|4. 播放清單解析成功', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('全選本頁')
    expect(wrapper.find('.pager').exists()).toBe(true)
    expect(wrapper.findAll('.video-item')).toHaveLength(3)
  })

  it('點縮圖呼叫 player.open(video_id)', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [makeVideo('u1'), makeVideo('u2')] })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/playlist?list=AAA')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    const player = usePlayerStore()
    const thumbs = wrapper.findAll('.thumb')
    await thumbs[0]?.trigger('click')
    expect(player.currentVideoId).toBe('u1')
    expect(player.isOpen).toBe(true)
  })

  it('adds a URL preview channel to the watchlist', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [makeVideo('u1')] })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/watch?v=u1')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()
    await wrapper.find('.watch-btn').trigger('click')

    const watchlist = useWatchlistStore()
    expect(watchlist.has('UC_url')).toBe(true)
    expect(watchlist.items[0]).toMatchObject({
      channel_id: 'UC_url',
      thumbnail: 'https://i.ytimg.com/vi/u1/mqdefault.jpg',
    })
    expect(wrapper.find('.watch-btn').attributes('disabled')).toBeDefined()
  })

  it('disables URL preview watchlist action without channel_id', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [{ ...makeVideo('u1'), channel_id: undefined }],
    })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/watch?v=u1')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    const btn = wrapper.find('.watch-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(useWatchlistStore().items).toHaveLength(0)
  })

  it('解析失敗顯示錯誤', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockRejectedValueOnce(new Error('無法解析網址'))

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('invalid-url')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    snap('UrlDownloadFeed|5. 網址解析失敗', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('無法解析網址')
  })
})

// ── 全域「允許再次下載」覆寫開關 ────────────────────────────────────────────────
describe('UrlDownloadFeed 全域「允許再次下載」', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
  })

  async function mountWithDownloaded() {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('u1'), makeVideo('u2'), makeVideo('u3')],
    })
    const download = useDownloadStore()
    download.markAsDownloaded('u1')

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/playlist?list=XXX')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()
    return { wrapper, download }
  }

  it('開關 OFF：已下載影片 disabled 且呈現已勾選', async () => {
    const { wrapper } = await mountWithDownloaded()

    const cb = wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement
    expect(cb.disabled).toBe(true)
    expect(cb.checked).toBe(true)
    expect(wrapper.find('.dl-badge').exists()).toBe(true)
  })

  it('開關 ON：已下載影片可操作且呈現未勾選', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()

    const cb = wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement
    expect(cb.disabled).toBe(false)
    expect(cb.checked).toBe(false)
    expect(wrapper.find('.dl-badge').exists()).toBe(true)
  })

  it('開關 OFF：「全選本頁」跳過已下載影片', async () => {
    const { wrapper, download } = await mountWithDownloaded()

    await wrapper.findAll('.action-btn')[0].trigger('click')

    expect(download.selected.map((v) => v.video_id)).toEqual(['u2', 'u3'])
  })

  it('開關 ON：「全選本頁」納入已下載影片', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()

    await wrapper.findAll('.action-btn')[0].trigger('click')

    expect(download.selected.map((v) => v.video_id)).toEqual(['u1', 'u2', 'u3'])
  })

  it('「取消本頁」可移除開關 ON 時加入的已下載影片', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()
    await wrapper.findAll('.action-btn')[0].trigger('click')
    expect(download.selected).toHaveLength(3)

    await wrapper.findAll('.action-btn')[1].trigger('click')

    expect(download.selected).toHaveLength(0)
  })

  it('關閉開關後 selected 保留已下載影片', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()
    await wrapper.findAll('.action-btn')[0].trigger('click')

    download.allowRedownload = false
    await flushPromises()

    expect(download.selected.map((v) => v.video_id)).toEqual(['u1', 'u2', 'u3'])
    expect((wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement).disabled).toBe(true)
  })
})
