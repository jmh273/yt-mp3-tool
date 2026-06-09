import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReconcileWizard from '@/components/ReconcileWizard.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { parseTakeoutCsv } from '@/utils/parseTakeoutCsv'

vi.mock('@/api', () => ({
  apiPost: vi.fn(),
}))

class MockFileReader {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null
  result: string | ArrayBuffer | null = null

  readAsText(file: File) {
    file.text().then((text) => {
      this.result = text
      this.onload?.({ target: { result: text } } as ProgressEvent<FileReader>)
    })
  }
}

describe('parseTakeoutCsv', () => {
  it('parses Google Takeout subscriptions CSV and skips non-channel rows', () => {
    const csv = '\uFEFFChannel Id,Channel Url,Channel Title\nUC_A,https://youtube.com/channel/UC_A,Alpha\nnot-channel,url,Skip\nUC_B,https://youtube.com/channel/UC_B,"Beta, Channel"'

    expect(parseTakeoutCsv(csv)).toEqual([
      { channel_id: 'UC_A', url: 'https://youtube.com/channel/UC_A', title: 'Alpha' },
      { channel_id: 'UC_B', url: 'https://youtube.com/channel/UC_B', title: 'Beta, Channel' },
    ])
  })
})

describe('ReconcileWizard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('FileReader', MockFileReader)
    localStorage.clear()
    vi.resetAllMocks()
  })

  it('uploads parsed channel ids and renders dead and desynced results', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValueOnce({
      takeout_count: 3,
      api_count: 1,
      missing_count: 2,
      dead: ['UC_DEAD'],
      desynced: ['UC_SYNC'],
    })

    const wrapper = mount(ReconcileWizard)
    const file = new File(
      [
        'Channel Id,Channel Url,Channel Title\nUC_OK,https://youtube.com/channel/UC_OK,OK\nUC_SYNC,https://youtube.com/channel/UC_SYNC,Sync Title\nUC_DEAD,https://youtube.com/channel/UC_DEAD,Dead Title',
      ],
      'subscriptions.csv',
      { type: 'text/csv' },
    )
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await flushPromises()
    await wrapper.find('.reconcile-run').trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/subscriptions/reconcile', {
      channel_ids: ['UC_OK', 'UC_SYNC', 'UC_DEAD'],
    })
    expect(wrapper.text()).toContain('Takeout：3')
    expect(wrapper.text()).toContain('API：1')
    expect(wrapper.text()).toContain('死頻道：1')
    expect(wrapper.text()).toContain('Sync Title')
    expect(wrapper.find('a[href="https://www.youtube.com/channel/UC_SYNC"]').exists()).toBe(true)
  })

  it('labels the initial reconcile action and only uploads parsed channel ids', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValueOnce({
      takeout_count: 1,
      api_count: 1,
      missing_count: 0,
      dead: [],
      desynced: [],
    })

    const wrapper = mount(ReconcileWizard)
    const file = new File(
      ['Channel Id,Channel Url,Channel Title\nUC_ONLY,https://youtube.com/channel/UC_ONLY,Only Title'],
      'subscriptions.csv',
      { type: 'text/csv' },
    )
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('.reconcile-run').text()).toBe('開始比對')

    await wrapper.find('.reconcile-run').trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledWith('/subscriptions/reconcile', {
      channel_ids: ['UC_ONLY'],
    })
  })

  it('tracks desynced channel resubscribe progress per account in localStorage', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'one@example.com'
    localStorage.setItem('reconcile-done:one@example.com:UC_DONE', '1')

    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValueOnce({
      takeout_count: 2,
      api_count: 0,
      missing_count: 2,
      dead: [],
      desynced: ['UC_DONE', 'UC_TODO'],
    })

    const wrapper = mount(ReconcileWizard)
    const file = new File(
      [
        'Channel Id,Channel Url,Channel Title\nUC_DONE,https://youtube.com/channel/UC_DONE,Done Title\nUC_TODO,https://youtube.com/channel/UC_TODO,Todo Title',
      ],
      'subscriptions.csv',
      { type: 'text/csv' },
    )
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await flushPromises()
    await wrapper.find('.reconcile-run').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已處理 1 / 2')
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((boxes[1].element as HTMLInputElement).checked).toBe(false)

    await boxes[1].setValue(true)

    expect(wrapper.text()).toContain('已處理 2 / 2')
    expect(localStorage.getItem('reconcile-done:one@example.com:UC_TODO')).toBe('1')

    await boxes[0].setValue(false)

    expect(wrapper.text()).toContain('已處理 1 / 2')
    expect(localStorage.getItem('reconcile-done:one@example.com:UC_DONE')).toBeNull()
  })

  it('re-reconciles from the result view reusing parsed channel ids without re-upload', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost)
      .mockResolvedValueOnce({ takeout_count: 1, api_count: 0, missing_count: 1, dead: [], desynced: ['UC_X'] })
      .mockResolvedValueOnce({ takeout_count: 1, api_count: 1, missing_count: 0, dead: [], desynced: [] })

    const wrapper = mount(ReconcileWizard)
    const file = new File(
      ['Channel Id,Channel Url,Channel Title\nUC_X,https://youtube.com/channel/UC_X,X Title'],
      'subscriptions.csv',
      { type: 'text/csv' },
    )
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await flushPromises()
    await wrapper.find('.reconcile-run').trigger('click')
    await flushPromises()

    const rerun = wrapper.find('.reconcile-rerun')
    expect(rerun.exists()).toBe(true)
    expect(rerun.text()).toBe('重新對帳')

    await rerun.trigger('click')
    await flushPromises()

    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(vi.mocked(apiPost).mock.calls[1]).toEqual(['/subscriptions/reconcile', { channel_ids: ['UC_X'] }])
    expect(wrapper.text()).toContain('沒有不同步的頻道')
  })

  it('keeps users on upload step and shows a toast when the selected file has no channels', async () => {
    const wrapper = mount(ReconcileWizard)
    const file = new File(['Channel Id,Channel Url,Channel Title\n'], 'subscriptions.csv', { type: 'text/csv' })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })

    await input.trigger('change')
    await flushPromises()

    expect(useToastStore().toasts).toContainEqual(
      expect.objectContaining({ type: 'error', message: '無法從檔案解析出頻道，請確認是 Takeout 的 subscriptions.csv。' }),
    )
    expect(wrapper.find('.reconcile-run').exists()).toBe(false)
  })
})
