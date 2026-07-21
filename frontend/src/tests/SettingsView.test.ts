import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SettingsView from '@/views/SettingsView.vue'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
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
  download_concurrency: 4,
  drive_upload_concurrency: 5,
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
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
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
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
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
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
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
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined()
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
    wrapper.find('[data-testid="save-settings"]').trigger('click')
    await flushPromises()
    snap('SettingsView|儲存中按鈕顯示「儲存中...」並 disabled', wrapper.html(), CSS)

    expect(wrapper.find('[data-testid="save-settings"]').text()).toContain('儲存中')
    expect(wrapper.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined()
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
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
      drive_root_folder: 'MusicDrive',
    }))
  })

  it('shows and saves download concurrency', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockResolvedValue({ ...FAKE_SETTINGS, download_concurrency: 6 })

    const wrapper = mount(SettingsView)
    await flushPromises()

    const concurrencyInput = wrapper.find('[data-testid="download-concurrency"]')
    expect((concurrencyInput.element as HTMLInputElement).value).toBe('4')
    await concurrencyInput.setValue('6')
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
      download_concurrency: 6,
    }))
  })

  it('shows and saves Drive upload concurrency', async () => {
    const { apiGet, apiPut } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue(FAKE_SETTINGS)
    vi.mocked(apiPut).mockResolvedValue({ ...FAKE_SETTINGS, drive_upload_concurrency: 7 })

    const wrapper = mount(SettingsView)
    await flushPromises()

    const concurrencyInput = wrapper.find('[data-testid="drive-upload-concurrency"]')
    expect((concurrencyInput.element as HTMLInputElement).value).toBe('5')
    await concurrencyInput.setValue('7')
    await wrapper.find('[data-testid="save-settings"]').trigger('click')
    await flushPromises()

    expect(apiPut).toHaveBeenCalledWith('/settings', expect.objectContaining({
      drive_upload_concurrency: 7,
    }))
  })
})

describe('SettingsView 訂閱頻道健檢', () => {
  const HEALTH_RESULT = {
    checked: 3,
    problems: [
      { channel_id: 'UC_a', subscription_id: 's_a', title: '理財不能等', thumbnail: 'http://t/a.jpg', reason: 'no_uploads', detail: 'playlist_not_found' },
      { channel_id: 'UC_b', subscription_id: 's_b', title: '四口人', thumbnail: '', reason: 'deleted', detail: 'error' },
    ],
  }

  function mockApiGet(healthData: unknown) {
    return async (path: string) => {
      if (path === '/settings') return FAKE_SETTINGS
      return healthData
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('預設顯示「設定」頁籤，點頁籤切換到健檢', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockApiGet(HEALTH_RESULT) as any)

    const wrapper = mount(SettingsView)
    await flushPromises()

    // 預設：設定表單可見、健檢區塊未渲染
    expect(wrapper.find('[data-testid="save-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="run-health-check"]').exists()).toBe(false)

    await wrapper.find('[data-testid="tab-health"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="run-health-check"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-settings"]').exists()).toBe(false)
  })

  it('點「檢查訂閱頻道」呼叫端點並逐列顯示問題頻道', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockApiGet(HEALTH_RESULT) as any)

    const wrapper = mount(SettingsView)
    await flushPromises()

    await wrapper.find('[data-testid="tab-health"]').trigger('click')
    await wrapper.find('[data-testid="run-health-check"]').trigger('click')
    await flushPromises()

    expect(apiGet).toHaveBeenCalledWith('/subscriptions/health-check')
    const rows = wrapper.findAll('[data-testid="problem-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('理財不能等')
    expect(rows[0].text()).toContain('無上傳影片')
    expect(rows[1].text()).toContain('四口人')
    expect(rows[1].text()).toContain('已刪除或終止')
  })

  it('全部正常時顯示「全部正常」且無頻道列', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockApiGet({ checked: 5, problems: [] }) as any)

    const wrapper = mount(SettingsView)
    await flushPromises()

    await wrapper.find('[data-testid="tab-health"]').trigger('click')
    await wrapper.find('[data-testid="run-health-check"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="health-ok"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="problem-row"]')).toHaveLength(0)
  })

  it('確認退訂會呼叫 apiDelete 並移除該列', async () => {
    const { apiGet, apiDelete } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockApiGet(HEALTH_RESULT) as any)
    vi.mocked(apiDelete).mockResolvedValue({ success: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-testid="tab-health"]').trigger('click')
    await wrapper.find('[data-testid="run-health-check"]').trigger('click')
    await flushPromises()

    await wrapper.findAll('[data-testid="unsub-btn"]')[0].trigger('click')
    await flushPromises()

    expect(apiDelete).toHaveBeenCalledWith('/subscriptions/s_a')
    const rows = wrapper.findAll('[data-testid="problem-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('四口人')
  })

  it('取消確認對話框則不退訂', async () => {
    const { apiGet, apiDelete } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(mockApiGet(HEALTH_RESULT) as any)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    const wrapper = mount(SettingsView)
    await flushPromises()
    await wrapper.find('[data-testid="tab-health"]').trigger('click')
    await wrapper.find('[data-testid="run-health-check"]').trigger('click')
    await flushPromises()

    await wrapper.findAll('[data-testid="unsub-btn"]')[0].trigger('click')
    await flushPromises()

    expect(apiDelete).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid="problem-row"]')).toHaveLength(2)
  })
})
