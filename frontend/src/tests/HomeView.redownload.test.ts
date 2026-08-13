import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

import HomeView from '@/views/HomeView.vue'
import { apiGet } from '@/api'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/version') return Promise.resolve({ version: '0.13.1' } as any)
    if (path === '/subscriptions') return Promise.resolve({ channels: [] } as any)
    if (path === '/auth/status')
      return Promise.resolve({ logged_in: true, current_account: 'a@example.com', accounts: ['a@example.com'] } as any)
    if (path === '/quota') return Promise.resolve({ used: 0, limit: 10000, date: '' } as any)
    return Promise.resolve({} as any)
  })
})

async function mountLoggedIn() {
  const auth = useAuthStore()
  auth.loggedIn = true
  auth.accounts = ['a@example.com']
  auth.currentAccount = 'a@example.com'
  const wrapper = mount(HomeView, { shallow: true })
  await flushPromises()
  return wrapper
}

describe('HomeView 全域「允許再次下載」開關', () => {
  it('header 渲染出開關且預設未勾選', async () => {
    const wrapper = await mountLoggedIn()

    const toggle = wrapper.find('.redownload-toggle input[type="checkbox"]')
    expect(toggle.exists()).toBe(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
  })

  it('點擊開關後 store 的 allowRedownload 變為 true', async () => {
    const wrapper = await mountLoggedIn()
    const download = useDownloadStore()
    expect(download.allowRedownload).toBe(false)

    await wrapper.find('.redownload-toggle input[type="checkbox"]').setValue(true)

    expect(download.allowRedownload).toBe(true)
  })

  it('開關為 ON 時套用強調樣式，OFF 時不套用', async () => {
    const wrapper = await mountLoggedIn()
    const download = useDownloadStore()

    expect(wrapper.find('.redownload-toggle').classes()).not.toContain('on')

    download.allowRedownload = true
    await flushPromises()

    expect(wrapper.find('.redownload-toggle').classes()).toContain('on')
  })

  it('切換開關不寫入 localStorage', async () => {
    const wrapper = await mountLoggedIn()
    const before = { ...localStorage }

    await wrapper.find('.redownload-toggle input[type="checkbox"]').setValue(true)

    expect({ ...localStorage }).toEqual(before)
  })
})
