import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SelectedVideos from '@/components/SelectedVideos.vue'
import { useDownloadStore } from '@/stores/download'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiPost: vi.fn(),
  apiGet: vi.fn().mockResolvedValue({ next_seq: '01', existing: [] }),
}))

const FAKE_VIDEO = {
  video_id: 'v1',
  title: 'Pipeline Video',
  url: 'https://www.youtube.com/watch?v=v1',
  thumbnail: 'https://i.ytimg.com/vi/v1/mqdefault.jpg',
  published: '2024-01-15T10:00:00+00:00',
}

describe('SelectedVideos auto pipeline controls', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows auto pipeline toggle and persists opt-in', async () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    const checkbox = wrapper.find<HTMLInputElement>('[data-testid="auto-pipeline"]')
    expect(checkbox.exists()).toBe(true)
    expect(checkbox.element.checked).toBe(false)

    await checkbox.setValue(true)

    expect(download.autoPipeline).toBe(true)
    expect(localStorage.getItem('yt_mp3_auto_pipeline')).toBe('true')
  })

  it('shows mp4 pipeline hint because mp4 skips normalization', async () => {
    const download = useDownloadStore()
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    await wrapper.find<HTMLSelectElement>('.format-select').setValue('mp4')

    expect(wrapper.find('[data-testid="auto-pipeline-mp4-hint"]').exists()).toBe(true)
  })
})
