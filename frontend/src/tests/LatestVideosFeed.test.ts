import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LatestVideosFeed from '@/components/LatestVideosFeed.vue'
import { useDownloadStore } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
}))

const CSS = extractCss('src/components/LatestVideosFeed.vue')

function makeVideo(id: string, hoursAgo: number) {
  const pub = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
  return {
    video_id: id,
    title: `影片 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: pub,
    duration_seconds: 300,
    channel_id: 'UC_test',
    channel_title: '測試頻道',
  }
}

describe('LatestVideosFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('載入中顯示「載入中...」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(LatestVideosFeed)
    snap('LatestVideosFeed|載入中顯示「載入中...」', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('載入中')
  })

  it('載入後顯示影片清單', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 1), makeVideo('v2', 5)] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()
    snap('LatestVideosFeed|載入後顯示影片清單', wrapper.html(), CSS)

    const items = wrapper.findAll('.video-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('影片 v1')
  })

  it('顯示設定的時間範圍 badge', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 48 })
      .mockResolvedValueOnce({ videos: [] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.find('.badge').text()).toContain('48h')
  })

  it('無影片時顯示提示訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()
    snap('LatestVideosFeed|無影片時顯示提示訊息', wrapper.html(), CSS)

    expect(wrapper.text()).toContain('此條件下無影片')
  })

  it('API 失敗顯示錯誤訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockRejectedValue(new Error('網路錯誤'))

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()
    snap('LatestVideosFeed|API 失敗顯示錯誤訊息', wrapper.html(), CSS)

    expect(wrapper.find('.error').exists()).toBe(true)
    expect(wrapper.text()).toContain('無法載入最新影片')
  })

  it('顯示頻道名稱', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 1)] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.find('.channel').text()).toBe('測試頻道')
  })

  it('勾選 checkbox 將影片加入 downloadStore', async () => {
    const { apiGet } = await import('@/api')
    const video = makeVideo('v1', 1)
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [video] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    const download = useDownloadStore()
    expect(download.selected).toHaveLength(0)

    await wrapper.find('.video-checkbox').trigger('change')
    expect(download.selected).toHaveLength(1)
    expect(download.selected[0].video_id).toBe('v1')
  })

  it('downloaded_on_disk=true 時 checkbox 預設為 disabled 並顯示「已下載」徽章', async () => {
    const { apiGet } = await import('@/api')
    const video = { ...makeVideo('v1', 1), downloaded_on_disk: true }
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [video] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    const checkbox = wrapper.find('.video-checkbox').element as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
    expect(wrapper.find('.dl-badge').exists()).toBe(true)
  })

  it('打開「允許再次下載」後，已下載 checkbox 變為可勾選，徽章仍顯示', async () => {
    const { apiGet } = await import('@/api')
    const video = { ...makeVideo('v1', 1), downloaded_on_disk: true }
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [video] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    const toggle = wrapper.find('.redownload-toggle input[type="checkbox"]')
    await toggle.setValue(true)

    const checkbox = wrapper.find('.video-checkbox').element as HTMLInputElement
    expect(checkbox.disabled).toBe(false)
    expect(wrapper.find('.dl-badge').exists()).toBe(true)
  })

  it('關閉「允許再次下載」時，已下載的影片會從 download.selected 移除', async () => {
    const { apiGet } = await import('@/api')
    const video = { ...makeVideo('v1', 1), downloaded_on_disk: true }
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [video] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    const toggle = wrapper.find('.redownload-toggle input[type="checkbox"]')
    await toggle.setValue(true)
    await wrapper.find('.video-checkbox').trigger('change')

    const download = useDownloadStore()
    expect(download.selected).toHaveLength(1)

    await toggle.setValue(false)
    expect(download.selected).toHaveLength(0)
    const checkbox = wrapper.find('.video-checkbox').element as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('最近 1 小時內的影片顯示「X 分鐘前」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 0.5)] }) // 30 分鐘前

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.find('.date').text()).toContain('分鐘前')
  })

  it('點縮圖呼叫 player.open(video_id)', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 1)] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    const player = usePlayerStore()
    await wrapper.find('.thumb').trigger('click')
    expect(player.currentVideoId).toBe('v1')
    expect(player.isOpen).toBe(true)
  })

  it('超過 24 小時的影片顯示「X 天前」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 72 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 25)] }) // 25 小時前

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.find('.date').text()).toContain('天前')
  })

  it('結果超過一頁時只渲染 50 部並顯示「載入更多」', async () => {
    const { apiGet } = await import('@/api')
    const videos = Array.from({ length: 120 }, (_, i) => makeVideo(`v${i}`, i * 0.01))
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.findAll('.video-item')).toHaveLength(50)
    expect(wrapper.find('.load-more-btn').exists()).toBe(true)
    expect(wrapper.find('.count-badge').text()).toContain('120 部')
    expect(wrapper.find('.count-badge').text()).toContain('50 / 120')
  })

  it('點「載入更多」逐頁追加，全部顯示後按鈕消失', async () => {
    const { apiGet } = await import('@/api')
    const videos = Array.from({ length: 120 }, (_, i) => makeVideo(`v${i}`, i * 0.01))
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    await wrapper.find('.load-more-btn').trigger('click')
    expect(wrapper.findAll('.video-item')).toHaveLength(100)
    expect(wrapper.find('.load-more-btn').exists()).toBe(true)

    await wrapper.find('.load-more-btn').trigger('click')
    expect(wrapper.findAll('.video-item')).toHaveLength(120)
    expect(wrapper.find('.load-more-btn').exists()).toBe(false)
  })

  it('重新套用篩選後，顯示清單重置回第一頁', async () => {
    const { apiGet } = await import('@/api')
    const videos = Array.from({ length: 120 }, (_, i) => makeVideo(`v${i}`, i * 0.01))
    // 尾端用 mockResolvedValue 兜底，因為 fetchVideos 的 finally 會呼叫 quota.refresh()（共用 apiGet）
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValue({ videos })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    await wrapper.find('.load-more-btn').trigger('click')
    expect(wrapper.findAll('.video-item')).toHaveLength(100)

    await wrapper.find('.apply-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.video-item')).toHaveLength(50)
  })
})
