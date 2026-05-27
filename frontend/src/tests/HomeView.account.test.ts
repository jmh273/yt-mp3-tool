import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { useAuthStore } from '@/stores/auth'

// api 全 mock：用 path 路由到可變的後端狀態，方便在測試中途模擬新帳號出現
vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

import HomeView from '@/views/HomeView.vue'
import { apiGet } from '@/api'

interface Status { logged_in: boolean; current_account: string; accounts: string[] }
type Ch = { subscription_id: string; channel_id: string; title: string; thumbnail: string }

let status: Status
let subsChannels: Ch[]

function ch(id: string): Ch {
  return { subscription_id: `sub-${id}`, channel_id: id, title: `Channel ${id}`, thumbnail: '' }
}

function subscriptionsCallCount() {
  return vi.mocked(apiGet).mock.calls.filter((c) => c[0] === '/subscriptions').length
}

beforeEach(() => {
  // 預設：已登入帳號 A，A 有 3 個訂閱頻道（刻意 > 帳號數，以暴露舊的錯誤中斷條件）
  status = { logged_in: true, current_account: 'a@example.com', accounts: ['a@example.com'] }
  subsChannels = [ch('UCA1'), ch('UCA2'), ch('UCA3')]
  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/version') return Promise.resolve({ version: '0.13.0' } as any)
    if (path === '/subscriptions') return Promise.resolve({ channels: subsChannels } as any)
    if (path === '/auth/login') return Promise.resolve({} as any)
    if (path === '/auth/status') return Promise.resolve(status as any)
    if (path === '/quota') return Promise.resolve({ used: 0, limit: 10000, date: '' } as any)
    return Promise.resolve({} as any)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function mountLoggedIn() {
  const auth = useAuthStore()
  auth.loggedIn = true
  auth.accounts = ['a@example.com']
  auth.currentAccount = 'a@example.com'
  const wrapper = mount(HomeView, { shallow: true })
  await flushPromises()
  return { wrapper, auth }
}

describe('HomeView 新增帳號', () => {
  it('新帳號出現後立即重新載入該帳號的訂閱清單', async () => {
    const { wrapper } = await mountLoggedIn()
    // 初始顯示帳號 A 的 3 個頻道
    expect(wrapper.findAll('.channel-card')).toHaveLength(3)
    expect(subscriptionsCallCount()).toBe(1)

    // 打開帳號下拉選單
    await wrapper.find('.account-toggle').trigger('click')
    expect(wrapper.find('.add-account').exists()).toBe(true)

    vi.useFakeTimers()
    // 模擬使用者在瀏覽器完成 OAuth：後端新增帳號 B 並把 current 切到 B，
    // /subscriptions 自此回傳 B 的 2 個頻道
    status = { logged_in: true, current_account: 'b@example.com', accounts: ['a@example.com', 'b@example.com'] }
    subsChannels = [ch('UCB1'), ch('UCB2')]

    await wrapper.find('.add-account').trigger('click')
    await flushPromises()               // addAccount() 完成，進入輪詢、等待 2s setTimeout
    await vi.advanceTimersByTimeAsync(2100) // 觸發輪詢 → checkStatus 偵測到新帳號 → 重載
    await flushPromises()

    // 重載發生（mount 1 次 + 新增帳號後 1 次），且畫面換成帳號 B 的頻道
    expect(subscriptionsCallCount()).toBe(2)
    const cards = wrapper.findAll('.channel-card')
    expect(cards).toHaveLength(2)
    expect(wrapper.text()).toContain('Channel UCB1')
    expect(wrapper.text()).not.toContain('Channel UCA1')
  })

  it('OAuth 未完成（帳號數未增加）時不做多餘重載', async () => {
    const { wrapper } = await mountLoggedIn()
    expect(subscriptionsCallCount()).toBe(1)

    await wrapper.find('.account-toggle').trigger('click')

    vi.useFakeTimers()
    await wrapper.find('.add-account').trigger('click')
    await flushPromises()
    // 帳號數始終是 1（status 維持只有 A）→ 輪詢直到 120s 逾時
    await vi.advanceTimersByTimeAsync(121_000)
    await flushPromises()

    // 沒有偵測到新帳號，不應重新載入訂閱清單
    expect(subscriptionsCallCount()).toBe(1)
    expect(wrapper.findAll('.channel-card')).toHaveLength(3)
  })
})
