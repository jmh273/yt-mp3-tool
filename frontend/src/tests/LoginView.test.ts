import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LoginView from '@/views/LoginView.vue'
import { mockRouter } from './setup'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const CSS = extractCss('src/views/LoginView.vue')

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('顯示標題與登入按鈕', () => {
    const wrapper = mount(LoginView)
    snap('LoginView|顯示標題與登入按鈕', wrapper.html(), CSS)
    expect(wrapper.find('h1').text()).toBe('YT → MP3')
    expect(wrapper.find('button').text()).toContain('登入 Google')
  })

  it('初始狀態按鈕可點擊', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('點擊登入後按鈕顯示「開啟授權中...」並變為 disabled', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(LoginView)
    await wrapper.find('button').trigger('click')
    snap('LoginView|點擊登入後按鈕顯示「開啟授權中...」並變為 disabled', wrapper.html(), CSS)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').text()).toContain('開啟授權中')
  })

  it('登入 API 失敗顯示錯誤訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockRejectedValue(new Error('網路錯誤'))

    const wrapper = mount(LoginView)
    await wrapper.find('button').trigger('click')
    await flushPromises()
    snap('LoginView|登入 API 失敗顯示錯誤訊息', wrapper.html(), CSS)
    expect(wrapper.find('.error').text()).toContain('網路錯誤')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('授權成功後導向首頁', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({})                  // /auth/login 成功
      .mockResolvedValueOnce({ logged_in: true }) // 第一次輪詢 /auth/status → 已登入

    vi.useFakeTimers()
    const wrapper = mount(LoginView)
    await wrapper.find('button').trigger('click')
    await flushPromises()

    // 觸發 2 秒輪詢計時器
    await vi.advanceTimersByTimeAsync(2100)
    await flushPromises()

    expect(mockRouter.push).toHaveBeenCalledWith('/')
    vi.useRealTimers()
  })

  it('授權逾時顯示錯誤訊息', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce({})                   // /auth/login
      .mockResolvedValue({ logged_in: false })      // 所有輪詢均未登入

    vi.useFakeTimers()
    const wrapper = mount(LoginView)
    await wrapper.find('button').trigger('click')
    await flushPromises()

    // 快轉到 2 分鐘逾時
    await vi.advanceTimersByTimeAsync(121_000)
    await flushPromises()

    snap('LoginView|授權逾時顯示錯誤訊息', wrapper.html(), CSS)
    expect(wrapper.find('.error').text()).toContain('授權逾時')
    vi.useRealTimers()
  })
})
