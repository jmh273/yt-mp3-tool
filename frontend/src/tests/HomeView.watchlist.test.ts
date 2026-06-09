import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useWatchlistStore } from '@/stores/watchlist'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

import HomeView from '@/views/HomeView.vue'
import { apiGet, apiDelete } from '@/api'
import ReconcileWizard from '@/components/ReconcileWizard.vue'
import SearchVideosFeed from '@/components/SearchVideosFeed.vue'

type Ch = { subscription_id: string; channel_id: string; title: string; thumbnail: string }

function ch(id: string): Ch {
  return { subscription_id: `sub-${id}`, channel_id: id, title: `Channel ${id}`, thumbnail: '' }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/version') return Promise.resolve({ version: '0.13.1' } as any)
    if (path === '/subscriptions') return Promise.resolve({ channels: [ch('UCA1'), ch('UCA2')] } as any)
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

describe('HomeView 加入觀察名單', () => {
  it('點訂閱頻道的「加入觀察名單」icon 會把頻道加入共用名單並顯示 already-added 狀態', async () => {
    const wrapper = await mountLoggedIn()
    const watchlist = useWatchlistStore()
    const cards = wrapper.findAll('.channel-card')
    expect(cards).toHaveLength(2)

    const addBtn = cards[0]!.find('.watchlist-add-btn')
    expect((addBtn.element as HTMLButtonElement).disabled).toBe(false)

    await addBtn.trigger('click')

    expect(watchlist.has('UCA1')).toBe(true)
    expect(watchlist.items).toHaveLength(1)
    // 仍保留訂閱（不取消）
    expect(cards).toHaveLength(2)
    // 已加入後 icon 變 disabled
    expect((wrapper.findAll('.channel-card')[0]!.find('.watchlist-add-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('已在名單的頻道：icon disabled、再點為 no-op，且不呼叫取消訂閱', async () => {
    const wrapper = await mountLoggedIn()
    const watchlist = useWatchlistStore()
    // 預先把 UCA1 放進名單
    watchlist.add({ channel_id: 'UCA1', title: 'Channel UCA1', thumbnail: '' })
    await flushPromises()

    const firstBtn = wrapper.findAll('.channel-card')[0]!.find('.watchlist-add-btn')
    expect((firstBtn.element as HTMLButtonElement).disabled).toBe(true)

    await firstBtn.trigger('click')

    expect(watchlist.items).toHaveLength(1)
    expect(apiDelete).not.toHaveBeenCalled()
  })

  it('shows subscribed and watchlist counts in the left tabs and updates after adding', async () => {
    const wrapper = await mountLoggedIn()

    const tabs = wrapper.findAll('.left-tab')
    expect(tabs[0]!.text()).toContain('(2)')
    expect(tabs[1]!.text()).toContain('(0)')

    await wrapper.findAll('.channel-card')[0]!.find('.watchlist-add-btn').trigger('click')

    expect(wrapper.findAll('.left-tab')[1]!.text()).toContain('(1)')
  })

  it('passes subscribedIds to search feed and appends subscribed channels from search', async () => {
    const wrapper = await mountLoggedIn()

    await wrapper.findAll('.latest-btn').find((btn) => btn.text().includes('搜尋'))!.trigger('click')
    await flushPromises()

    const search = wrapper.findComponent(SearchVideosFeed)
    expect(search.props('subscribedIds')).toBeInstanceOf(Set)
    expect(search.props('subscribedIds').has('UCA1')).toBe(true)

    search.vm.$emit('subscribed', ch('UCNEW'))
    await flushPromises()

    expect(wrapper.findAll('.left-tab')[0]!.text()).toContain('(3)')
  })

  it('opens the subscription reconcile wizard from the subscribed tab', async () => {
    const wrapper = await mountLoggedIn()

    expect(wrapper.findComponent(ReconcileWizard).exists()).toBe(false)

    await wrapper.find('.reconcile-btn').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(ReconcileWizard).exists()).toBe(true)
  })
})
