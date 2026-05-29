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

  it('shows the shared empty state regardless of login state', async () => {
    const auth = useAuthStore()
    auth.currentAccount = ''
    const signedOut = mount(WatchlistPanel)
    // 共用名單：未登入也不阻擋，空名單顯示同一段空狀態文字
    expect(signedOut.text()).not.toContain('請先登入')
    expect(signedOut.text()).toContain('還沒加入任何頻道')

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

  it('disables the subscribe icon for a channel already subscribed; remove stays enabled', async () => {
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel, {
      props: { subscribedIds: new Set(['UC1']) },
    })

    const promote = wrapper.find('[aria-label="訂閱 Alpha"]')
    expect(promote.attributes('disabled')).toBeDefined()
    expect(promote.attributes('title')).toBe('已訂閱')
    // remove 不受影響
    expect(wrapper.find('[aria-label="移除 Alpha"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps subscribe enabled for a non-subscribed channel and never POSTs for a subscribed one', async () => {
    const { apiPost } = await import('@/api')
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })
    store.add({ channel_id: 'UC2', title: 'Beta', thumbnail: 'b.jpg' })

    const wrapper = mount(WatchlistPanel, {
      props: { subscribedIds: new Set(['UC1']) },
    })

    // 未訂閱的 Beta 可點
    expect(wrapper.find('[aria-label="訂閱 Beta"]').attributes('disabled')).toBeUndefined()

    // 點已訂閱的 Alpha 的訂閱鈕不會發出請求
    await wrapper.find('[aria-label="訂閱 Alpha"]').trigger('click')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('on subscriptionDuplicate shows a non-error notice, keeps the row, and does not emit subscribed', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockRejectedValue(
      new Error('訂閱失敗：<HttpError 400 ... reason: subscriptionDuplicate>'),
    )
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel)
    await wrapper.find('[aria-label="訂閱 Alpha"]').trigger('click')
    await flushPromises()

    const toast = wrapper.find('.watchlist-toast')
    expect(toast.exists()).toBe(true)
    expect(toast.text()).toContain('「Alpha」此帳號已訂閱')
    // 非紅色錯誤
    expect(toast.classes()).toContain('success')
    expect(toast.classes()).not.toContain('error')
    expect(toast.text()).not.toContain('訂閱失敗')
    // 名單項保留、未發出 subscribed
    expect(store.items).toHaveLength(1)
    expect(wrapper.emitted('subscribed')).toBeUndefined()
  })

  it('shows the backend error without doubling the「訂閱失敗：」prefix on non-duplicate failure', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockRejectedValue(new Error('訂閱失敗：quota 耗盡'))
    const auth = useAuthStore()
    auth.currentAccount = 'alice@example.com'
    const store = useWatchlistStore()
    await nextTick()
    store.add({ channel_id: 'UC1', title: 'Alpha', thumbnail: 'a.jpg' })

    const wrapper = mount(WatchlistPanel)
    await wrapper.find('[aria-label="訂閱 Alpha"]').trigger('click')
    await flushPromises()

    const toast = wrapper.find('.watchlist-toast')
    expect(toast.classes()).toContain('error')
    expect(toast.text()).toBe('訂閱失敗：quota 耗盡')
    expect(toast.text()).not.toContain('訂閱失敗：訂閱失敗：')
    expect(store.items).toHaveLength(1)
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
