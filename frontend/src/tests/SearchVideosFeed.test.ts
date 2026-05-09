import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SearchVideosFeed from '@/components/SearchVideosFeed.vue'
import { usePlayerStore } from '@/stores/player'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
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

describe('SearchVideosFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
