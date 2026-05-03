import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SelectedVideos from '@/components/SelectedVideos.vue'
import { useDownloadStore } from '@/stores/download'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiPost: vi.fn(),
}))

const CSS = extractCss('src/components/SelectedVideos.vue')

const FAKE_VIDEO = {
  video_id: 'v1',
  title: '測試影片',
  url: 'https://www.youtube.com/watch?v=v1',
  thumbnail: 'https://i.ytimg.com/vi/v1/mqdefault.jpg',
  published: '2024-01-15T10:00:00+00:00',
}

describe('SelectedVideos', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('無選取影片時不顯示面板', () => {
    const wrapper = mount(SelectedVideos)
    expect(wrapper.find('.selected-panel').exists()).toBe(false)
  })

  it('有選取影片時顯示面板與數量', async () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|有選取影片時顯示面板與數量', wrapper.html(), CSS)
    expect(wrapper.find('.selected-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('已選取 1 支影片')
  })

  it('選取多支影片時顯示正確數量', () => {
    const download = useDownloadStore()
    download.toggle({ ...FAKE_VIDEO, video_id: 'v1', title: 'Video 1' })
    download.toggle({ ...FAKE_VIDEO, video_id: 'v2', title: 'Video 2' })
    download.toggle({ ...FAKE_VIDEO, video_id: 'v3', title: 'Video 3' })

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|選取多支影片時顯示正確數量', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('已選取 3 支影片')
  })

  it('點擊「清除全部」清空選取清單', async () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    await wrapper.find('.clear').trigger('click')

    expect(download.selected).toHaveLength(0)
  })

  it('點擊「下載選取影片」呼叫 startDownload', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 'task-abc' })

    // EventSource 需要 class 式 constructor
    class MockES {
      onmessage: any = null
      onerror: any = null
      close = vi.fn()
    }
    vi.stubGlobal('EventSource', MockES)

    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    await wrapper.find('.dl').trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/download', { videos: [FAKE_VIDEO] })
  })

  it('下載中按鈕文字變為「下載中...」且 disabled', async () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)
    download.downloading = true

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|下載中按鈕文字變為「下載中...」且 disabled', wrapper.html(), CSS)
    const dlBtn = wrapper.find('.dl')
    expect(dlBtn.text()).toContain('下載中')
    expect(dlBtn.attributes('disabled')).toBeDefined()
  })

  it('下載中顯示進度條列表', () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)
    download.downloading = true
    download.progress = {
      v1: { title: '測試影片', percent: 55, status: 'downloading' },
    }

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|下載中顯示進度條列表', wrapper.html(), CSS)
    expect(wrapper.find('.progress-list').exists()).toBe(true)
    expect(wrapper.text()).toContain('測試影片')
    expect(wrapper.text()).toContain('下載中')
  })

  it('進度條寬度反映下載百分比', () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)
    download.downloading = true
    download.progress = {
      v1: { title: '測試影片', percent: 75, status: 'downloading' },
    }

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|進度條寬度反映下載百分比', wrapper.html(), CSS)
    const bar = wrapper.find('.bar')
    expect(bar.attributes('style')).toContain('75%')
  })

  it('下載完成後顯示成功摘要', () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)
    download.downloading = false
    download.progress = {
      v1: { title: '測試影片', percent: 100, status: 'done' },
    }

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|下載完成後顯示成功摘要', wrapper.html(), CSS)
    expect(wrapper.find('.summary').exists()).toBe(true)
    expect(wrapper.text()).toContain('下載完成！共 1 支')
  })

  it('部分失敗時顯示失敗數量', () => {
    const download = useDownloadStore()
    download.toggle({ ...FAKE_VIDEO, video_id: 'v1' })
    download.toggle({ ...FAKE_VIDEO, video_id: 'v2', title: '影片二' })
    download.downloading = false
    download.progress = {
      v1: { title: '測試影片', percent: 100, status: 'done' },
      v2: { title: '影片二', percent: 0, status: 'error', error: '影片不存在' },
    }

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|部分失敗時顯示失敗數量', wrapper.html(), CSS)
    expect(wrapper.text()).toContain('共 1 支')
    expect(wrapper.text()).toContain('1 支失敗')
  })

  it('轉換中顯示橘色進度條', () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)
    download.downloading = true
    download.progress = {
      v1: { title: '測試影片', percent: 100, status: 'converting' },
    }

    const wrapper = mount(SelectedVideos)
    snap('SelectedVideos|轉換中顯示橘色進度條', wrapper.html(), CSS)
    const bar = wrapper.find('.bar')
    expect(bar.classes()).toContain('converting')
  })
})
