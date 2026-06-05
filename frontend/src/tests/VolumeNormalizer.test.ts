import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import VolumeNormalizer from '@/components/VolumeNormalizer.vue'
import { useDownloadStore } from '@/stores/download'
import { useNormalizeStore } from '@/stores/normalize'

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

describe('VolumeNormalizer 資料夾 picker', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.removeItem('yt_mp3_last_work_dir')
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/settings') return { output_path: 'D:\\Music', normalize_target_db: 89 } as any
      if (url === '/folders') {
        return { folders: [{ name: '20260601_evening', directory: 'D:\\Music\\20260601_evening' }] } as any
      }
      return {} as any
    })
  })

  it('點 icon 開 picker 由 /folders 取得清單', async () => {
    const wrapper = mount(VolumeNormalizer)
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    await flushPromises()
    const choices = wrapper.findAll('[data-testid="dir-picker-choice"]')
    expect(choices).toHaveLength(1)
    expect(choices[0].text()).toContain('20260601_evening')
  })

  it('從 picker 選資料夾只填路徑、不自動載入', async () => {
    const store = useNormalizeStore()
    const spy = vi.spyOn(store, 'loadDirectory').mockResolvedValue(undefined)

    const wrapper = mount(VolumeNormalizer)
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-choice"]').trigger('click')
    await flushPromises()

    expect(wrapper.find<HTMLInputElement>('.dir-input').element.value).toBe('D:\\Music\\20260601_evening')
    expect(spy).not.toHaveBeenCalled()

    await wrapper.find('.load-btn').trigger('click')
    expect(spy).toHaveBeenCalledWith('D:\\Music\\20260601_evening')
  })
})
