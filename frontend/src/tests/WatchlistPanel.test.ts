import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import WatchlistPanel from '@/components/WatchlistPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useWatchlistStore } from '@/stores/watchlist'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn(), replace: vi.fn() },
}))

describe('WatchlistPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.resetAllMocks()
  })

  it('shows distinct empty states for signed out and signed in users', async () => {
    const auth = useAuthStore()
    auth.currentAccount = ''
    const signedOut = mount(WatchlistPanel)
    expect(signedOut.text()).toContain('請先登入')

    auth.currentAccount = 'alice@example.com'
    await nextTick()
    const signedIn = mount(WatchlistPanel)
    expect(signedIn.text()).toContain('還沒加入任何頻道')
  })

  it('emits select-channel when a row body is clicked', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel)
    await wrapper.find('.watchlist-row').trigger('click')

    expect(wrapper.emitted('select-channel')?.[0]).toEqual(['UC1'])
  })

  it('removes without bubbling when the remove icon is clicked', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel)
    await wrapper.find('[aria-label="移除 Alpha"]').trigger('click')

    expect(store.items).toHaveLength(0)
    expect(wrapper.emitted('select-channel')).toBeUndefined()
  })

  it('promotes a row, disables actions while pending, emits subscribed, and shows success toast', async () => {
    const { apiPost } = await import('@/api')
    let resolvePost!: (value: unknown) => void
    vi.mocked(apiPost).mockReturnValue(new Promise((resolve) => { resolvePost = resolve }) as any)
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel)
    const promote = wrapper.find('[aria-label="訂閱 Alpha"]')
    await promote.trigger('click')
    expect(wrapper.find('[aria-label="訂閱 Alpha"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="移除 Alpha"]').attributes('disabled')).toBeDefined()

    resolvePost({
      success: true,
      subscription_id: 'sub-1',
      channel: { subscription_id: 'sub-1', channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' },
    })
    await flushPromises()

    expect(wrapper.emitted('subscribed')?.[0]![0]).toMatchObject({ subscription_id: 'sub-1', channel_id: 'UC1' })
    expect(wrapper.text()).toContain('已訂閱：Alpha')
  })

  it('filters rows by the search input', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha Channel', thumbnail: 'a.jpg' })
    store.add({ channel_id: 'UC2', title: 'Beta Channel', thumbnail: 'b.jpg' })

    const wrapper = mount(WatchlistPanel)
    await wrapper.find('input[type="search"]').setValue('beta')

    expect(wrapper.text()).toContain('Beta Channel')
    expect(wrapper.text()).not.toContain('Alpha Channel')
  })
})
