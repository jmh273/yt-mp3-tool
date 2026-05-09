import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import UrlDownloadFeed from '@/components/UrlDownloadFeed.vue'
import { snap, extractCss } from './snap'
import { useDownloadStore } from '@/stores/download'
import { usePlayerStore } from '@/stores/player'

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
    setActivePinia(createPinia())
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

  it('單一網址解析成功並自動勾選', async () => {
    const { apiGet } = await import('@/api')
    const v = makeVideo('u1')
    vi.mocked(apiGet).mockResolvedValueOnce({ videos: [v] })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/watch?v=u1')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    snap('UrlDownloadFeed|3. 單一影片解析成功', wrapper.html(), CSS)
    const download = useDownloadStore()
    expect(download.selected).toHaveLength(1)
    expect(wrapper.text()).toContain('網址解析結果 u1')
  })

  it('播放清單網址解析成功顯示全選按鈕', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce({
      videos: [makeVideo('u1'), makeVideo('u2'), makeVideo('u3')]
    })

    const wrapper = mount(UrlDownloadFeed)
    await wrapper.find('input').setValue('https://youtube.com/playlist?list=XXX')
    await wrapper.find('.search-btn').trigger('click')
    await flushPromises()

    snap('UrlDownloadFeed|4. 播放清單解析成功', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('✅ 全選')
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
