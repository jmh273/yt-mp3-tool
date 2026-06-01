import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

const CSS = extractCss('src/views/SettingsView.vue')

const FAKE_SETTINGS = {
  output_path: 'C:\\Users\\Test\\Music\\YT-MP3',
  videos_per_channel: 5,
  latest_hours: 24,
  min_duration_minutes: 3,
  max_duration_minutes: 60,
  normalize_target_db: 89,
  drive_root_folder: 'YT-MP3',
}

describe('SettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('載入時呼叫 GET /settings 並填入欄位', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)

    const wrapper = mount(SettingsView)
    await flushPromises()
    snap('SettingsView|載入時呼叫 GET /settings 並填入欄位', wrapper.html(), CSS)

    const inputs = wrapper.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe(FAKE_SETTINGS.output_path)
    expect((inputs[1].element as HTMLInputElement).value).toBe('5')
    expect((inputs[2].element as HTMLInputElement).value).toBe('24')
  })

  it('修改輸出路徑後點擊儲存呼叫 PUT /settings', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockResolvedValue({ ...FAKE_SETTINGS, output_path: 'D:\\NewPath' })

    const wrapper = mount(SettingsView)
    await flushPromises()

    const pathInput = wrapper.findAll('input')[0]
    await pathInput.setValue('D:\\NewPath')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
      output_path: 'D:\\NewPath',
    }))
  })

  it('儲存成功顯示「已儲存！」', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockResolvedValue(FAKE_SETTINGS)

    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    snap('SettingsView|儲存成功顯示「已儲存！」', wrapper.html(), CSS)

    expect(wrapper.find('.ok').text()).toContain('已儲存')
  })

  it('儲存失敗顯示錯誤訊息', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockRejectedValue(new Error('伺服器錯誤'))

    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    snap('SettingsView|儲存失敗顯示錯誤訊息', wrapper.html(), CSS)

    expect(wrapper.find('.error').text()).toContain('伺服器錯誤')
  })

  it('latest_hours 超出範圍（0）顯示驗證錯誤且儲存按鈕 disabled', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)

    const wrapper = mount(SettingsView)
    await flushPromises()

    const hoursInput = wrapper.findAll('input')[2]
    await hoursInput.setValue('0')
    await hoursInput.trigger('input')
    snap('SettingsView|latest_hours 超出範圍（0）顯示驗證錯誤且儲存按鈕 disabled', wrapper.html(), CSS)

    expect(wrapper.find('.field-error').exists()).toBe(true)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('latest_hours 超出範圍（169）顯示驗證錯誤', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)

    const wrapper = mount(SettingsView)
    await flushPromises()

    const hoursInput = wrapper.findAll('input')[2]
    await hoursInput.setValue('169')
    await hoursInput.trigger('input')

    expect(wrapper.find('.field-error').exists()).toBe(true)
  })

  it('latest_hours 邊界值 1 和 168 通過驗證', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)

    const wrapper = mount(SettingsView)
    await flushPromises()

    const hoursInput = wrapper.findAll('input')[2]

    await hoursInput.setValue('1')
    await hoursInput.trigger('input')
    expect(wrapper.find('.field-error').exists()).toBe(false)

    await hoursInput.setValue('168')
    await hoursInput.trigger('input')
    expect(wrapper.find('.field-error').exists()).toBe(false)
  })

  it('儲存中按鈕顯示「儲存中...」並 disabled', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(SettingsView)
    await flushPromises()
    wrapper.find('button').trigger('click')
    await flushPromises()
    snap('SettingsView|儲存中按鈕顯示「儲存中...」並 disabled', wrapper.html(), CSS)

    expect(wrapper.find('button').text()).toContain('儲存中')
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })
  it('shows and saves Drive root folder', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockResolvedValue({ ...FAKE_SETTINGS, drive_root_folder: 'MusicDrive' })

    const wrapper = mount(SettingsView)
    await flushPromises()

    const driveInput = wrapper.find('[data-testid="drive-root-folder"]')
    expect((driveInput.element as HTMLInputElement).value).toBe('YT-MP3')
    await driveInput.setValue('MusicDrive')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
      drive_root_folder: 'MusicDrive',
    }))
  })
})
