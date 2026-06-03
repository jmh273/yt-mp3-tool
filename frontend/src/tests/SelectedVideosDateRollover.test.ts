import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SelectedVideos from '@/components/SelectedVideos.vue'
import { useDownloadStore } from '@/stores/download'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiPost: vi.fn(),
  apiGet: vi.fn(),
}))

const FAKE_VIDEO = {
  video_id: 'v1',
  title: 'Rollover Video',
  url: 'https://www.youtube.com/watch?v=v1',
  thumbnail: 'https://i.ytimg.com/vi/v1/mqdefault.jpg',
  published: '2024-01-15T10:00:00+00:00',
}

describe('SelectedVideos date-prefix rollover', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rolls stale last download date prefix to today when building default target dir', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T12:00:00'))
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/settings') return { output_path: 'D:\\Music' } as any
      return { next_seq: '01', existing: [] } as any
    })
    const download = useDownloadStore()
    download.lastWorkDirName = '20260601_sports'
    download.toggle(FAKE_VIDEO)

    const wrapper = mount(SelectedVideos)
    await flushPromises()

    const input = wrapper.find<HTMLInputElement>('[data-testid="download-target-dir"]')
    expect(input.element.value).toBe('D:\\Music\\20260602_sports')
  })
})
