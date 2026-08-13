import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChannelVideos from '@/components/ChannelVideos.vue'
import { useDownloadStore } from '@/stores/download'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
}))

const CSS = extractCss('src/components/ChannelVideos.vue')

const FAKE_VIDEOS = [
  {
    video_id: 'v1',
    title: '測試影片一',
    url: 'https://www.youtube.com/watch?v=v1',
    thumbnail: 'https://i.ytimg.com/vi/v1/mqdefault.jpg',
    published: '2024-01-15T10:00:00+00:00',
    duration_seconds: 185,
    channel_id: 'UC_test',
    channel_title: 'Test Channel',
  },
  {
    video_id: 'v2',
    title: '測試影片二',
    url: 'https://www.youtube.com/watch?v=v2',
    thumbnail: 'https://i.ytimg.com/vi/v2/mqdefault.jpg',
    published: '2024-01-14T10:00:00+00:00',
    duration_seconds: 3661,
    channel_id: 'UC_test',
    channel_title: 'Test Channel',
  },
]

describe('ChannelVideos', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('載入中顯示 loading 文字', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    snap('ChannelVideos|載入中顯示 loading 文字', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('載入中')
  })

  it('成功載入後顯示影片清單', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()
    snap('ChannelVideos|成功載入後顯示影片清單', wrapper.html(), CSS)

    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('測試影片一')
    expect(items[1].text()).toContain('測試影片二')
  })

  it('API 失敗顯示錯誤訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockRejectedValue(new Error('RSS 失敗'))

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()
    snap('ChannelVideos|API 失敗顯示錯誤訊息', wrapper.html(), CSS)

    expect(wrapper.find('.error').text()).toContain('無法載入影片')
  })

  it('影片時長格式化：秒數轉為 m:ss', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()

    // 185 秒 = 3:05
    expect(wrapper.text()).toContain('3:05')
  })

  it('影片時長格式化：超過 1 小時顯示 h:mm:ss', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()

    // 3661 秒 = 1:01:01
    expect(wrapper.text()).toContain('1:01:01')
  })

  it('勾選 checkbox 將影片加入 downloadStore', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()

    const download = useDownloadStore()
    expect(download.selected).toHaveLength(0)

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].trigger('change')

    expect(download.selected).toHaveLength(1)
    expect(download.selected[0].video_id).toBe('v1')
  })

  it('取消勾選將影片從 downloadStore 移除', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()

    const download = useDownloadStore()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')

    // 勾選再取消
    await checkboxes[0].trigger('change')
    expect(download.selected).toHaveLength(1)

    await checkboxes[0].trigger('change')
    expect(download.selected).toHaveLength(0)
  })

  it('已選取的影片 checkbox 顯示為勾選狀態', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })

    const download = useDownloadStore()
    download.toggle(FAKE_VIDEOS[0])

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false)
  })
})

// ── 全域「允許再次下載」覆寫開關 ────────────────────────────────────────────────
describe('ChannelVideos 全域「允許再次下載」', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  async function mountWithDownloaded() {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ videos: FAKE_VIDEOS })
    const download = useDownloadStore()
    download.markAsDownloaded('v1')

    const wrapper = mount(ChannelVideos, { props: { channelId: 'UC_test' } })
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

  it('開關 ON：已下載影片可操作且呈現未勾選，徽章仍在', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()

    const cb = wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement
    expect(cb.disabled).toBe(false)
    expect(cb.checked).toBe(false)
    expect(wrapper.find('.dl-badge').exists()).toBe(true)
  })

  it('開關 ON：點擊已下載影片加入 selected 並轉為已勾選', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()

    await wrapper.findAll('.video-checkbox')[0].trigger('change')

    expect(download.selected.map((v) => v.video_id)).toEqual(['v1'])
    expect((wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement).checked).toBe(true)
  })

  it('關閉開關後 selected 內容不變', async () => {
    const { wrapper, download } = await mountWithDownloaded()
    download.allowRedownload = true
    await flushPromises()
    await wrapper.findAll('.video-checkbox')[0].trigger('change')
    expect(download.selected).toHaveLength(1)

    download.allowRedownload = false
    await flushPromises()

    expect(download.selected).toHaveLength(1)
    expect((wrapper.findAll('.video-checkbox')[0].element as HTMLInputElement).disabled).toBe(true)
  })
})
