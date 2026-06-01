import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import VolumeNormalizer from '@/components/VolumeNormalizer.vue'
import { useDownloadStore } from '@/stores/download'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiPost: vi.fn(),
  apiGet: vi.fn().mockResolvedValue({ output_path: 'D:\\Music', normalize_target_db: 89 }),
}))

describe('VolumeNormalizer 預設路徑與下載同步', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem('yt_mp3_last_work_dir')
  })

  it('預設路徑採用下載分頁的完整路徑', async () => {
    const download = useDownloadStore()
    download.targetDirPath = 'D:\\Music\\20260601_sports'

    const wrapper = mount(VolumeNormalizer)
    await flushPromises()
    expect(wrapper.find<HTMLInputElement>('.dir-input').element.value).toBe('D:\\Music\\20260601_sports')
  })

  it('下載分頁修改路徑後一併同步', async () => {
    const download = useDownloadStore()
    download.targetDirPath = 'D:\\Music\\20260601'

    const wrapper = mount(VolumeNormalizer)
    await flushPromises()
    expect(wrapper.find<HTMLInputElement>('.dir-input').element.value).toBe('D:\\Music\\20260601')

    download.targetDirPath = 'D:\\Music\\20260601_evening'
    await flushPromises()
    expect(wrapper.find<HTMLInputElement>('.dir-input').element.value).toBe('D:\\Music\\20260601_evening')
  })

  it('使用者手動編輯後不再被下載路徑覆寫', async () => {
    const download = useDownloadStore()
    download.targetDirPath = 'D:\\Music\\20260601'

    const wrapper = mount(VolumeNormalizer)
    await flushPromises()

    await wrapper.find('.dir-input').setValue('D:\\Other\\folder')
    download.targetDirPath = 'D:\\Music\\20260601_evening'
    await flushPromises()

    expect(wrapper.find<HTMLInputElement>('.dir-input').element.value).toBe('D:\\Other\\folder')
  })
})
