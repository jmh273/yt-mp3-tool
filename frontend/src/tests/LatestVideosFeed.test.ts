import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LatestVideosFeed from '@/components/LatestVideosFeed.vue'
import { useDownloadStore } from '@/stores/download'
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

    expect(wrapper.find('.hours-badge').text()).toContain('48h')
  })

  it('無影片時顯示提示訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 24 })
      .mockResolvedValueOnce({ videos: [] })

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()
    snap('LatestVideosFeed|無影片時顯示提示訊息', wrapper.html(), CSS)

    expect(wrapper.text()).toContain('此時間範圍內無新影片')
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

    await wrapper.find('input[type="checkbox"]').trigger('change')
    expect(download.selected).toHaveLength(1)
    expect(download.selected[0].video_id).toBe('v1')
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

  it('超過 24 小時的影片顯示「X 天前」', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ latest_hours: 72 })
      .mockResolvedValueOnce({ videos: [makeVideo('v1', 25)] }) // 25 小時前

    const wrapper = mount(LatestVideosFeed)
    await flushPromises()

    expect(wrapper.find('.date').text()).toContain('天前')
  })
})
