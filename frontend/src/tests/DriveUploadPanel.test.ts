import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DriveUploadPanel from '@/components/DriveUploadPanel.vue'
import { useDownloadStore } from '@/stores/download'
import { useDriveUploadStore } from '@/stores/driveUpload'
import { useAuthStore } from '@/stores/auth'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiPost: vi.fn(),
  apiGet: vi.fn(),
}))

const CSS = extractCss('src/components/DriveUploadPanel.vue')

describe('DriveUploadPanel', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.removeItem('yt_mp3_last_work_dir')
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/settings') return { output_path: 'D:\\Music' } as any
      return {} as any
    })
  })

  it('上傳主按鈕文字為「上傳雲端硬碟」', async () => {
    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    snap('DriveUploadPanel|上傳主按鈕文字為「上傳雲端硬碟」', wrapper.html(), CSS)
    expect(wrapper.find('[data-testid="drive-upload-button"]').text()).toBe('上傳雲端硬碟')
  })

  it('上傳中按鈕文字為「上傳中...」且 disabled', async () => {
    const drive = useDriveUploadStore()
    drive.status = 'running'

    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    const btn = wrapper.find('[data-testid="drive-upload-button"]')
    expect(btn.text()).toBe('上傳中...')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('本地端目錄欄位帶入完整路徑', async () => {
    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    const input = wrapper.find<HTMLInputElement>('[data-testid="dir-picker-input"]')
    expect(input.element.value).toMatch(/^D:\\Music\\\d{8}$/)
  })

  it('完整路徑採用下載後的 lastWorkDirName', async () => {
    const download = useDownloadStore()
    download.lastWorkDirName = '20260601_sports'

    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    const input = wrapper.find<HTMLInputElement>('[data-testid="dir-picker-input"]')
    expect(input.element.value).toBe('D:\\Music\\20260601_sports')
  })

  it('點擊上傳以完整路徑呼叫 startUpload', async () => {
    const download = useDownloadStore()
    download.lastWorkDirName = '20260601_sports'
    const drive = useDriveUploadStore()
    const spy = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)

    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    await wrapper.find('[data-testid="drive-upload-button"]').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith('D:\\Music\\20260601_sports')
  })

  it('選擇資料夾後以該資料夾完整路徑上傳', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/settings') return { output_path: 'D:\\Music' } as any
      if (url === '/drive/upload/folders') {
        return {
          folders: [
            { name: '20260601_evening', directory: 'D:\\Music\\20260601_evening', uploaded: false },
          ],
        } as any
      }
      return {} as any
    })
    const drive = useDriveUploadStore()
    const spy = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)

    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-choice"]').trigger('click')
    await flushPromises()

    // picker 只填路徑，尚未上傳
    expect(spy).not.toHaveBeenCalled()
    expect(wrapper.find<HTMLInputElement>('[data-testid="dir-picker-input"]').element.value)
      .toBe('D:\\Music\\20260601_evening')

    await wrapper.find('[data-testid="drive-upload-button"]').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledWith('D:\\Music\\20260601_evening')
  })

  it('改選彈窗對已上傳資料夾顯示「已上傳」badge', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === '/settings') return { output_path: 'D:\\Music' } as any
      if (url === '/drive/upload/folders') {
        return {
          folders: [
            { name: '20260601_done', directory: 'D:\\Music\\20260601_done', uploaded: true },
          ],
        } as any
      }
      return {} as any
    })
    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.folder-badge').text()).toBe('已上傳')
  })

  it('drive.reauthRequired 時顯示重新授權按鈕並觸發 login', async () => {
    const drive = useDriveUploadStore()
    drive.reauthRequired = true
    const auth = useAuthStore()
    const loginSpy = vi.spyOn(auth, 'login').mockResolvedValue(undefined)

    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    const btn = wrapper.find('[data-testid="drive-reauth-button"]')
    expect(btn.exists()).toBe(true)

    await btn.trigger('click')
    await flushPromises()
    expect(loginSpy).toHaveBeenCalled()
  })

  it('未要求重新授權時不顯示重新授權按鈕', async () => {
    const wrapper = mount(DriveUploadPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="drive-reauth-button"]').exists()).toBe(false)
  })
})
