import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SimilarChannelDiscoveryFeed from '@/components/SimilarChannelDiscoveryFeed.vue'
import { snap, extractCss } from './snap'

vi.mock('@/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  API_BASE: '',
}))

const CSS = extractCss('src/components/SimilarChannelDiscoveryFeed.vue')

const FAST_VIDEOS = [
  {
    video_id: 'vf1',
    title: '快速階段影片一',
    url: 'https://www.youtube.com/watch?v=vf1',
    thumbnail: 'https://i.ytimg.com/vi/vf1/mqdefault.jpg',
    published: '2026-05-20T10:00:00Z',
    duration_seconds: 300,
    channel_id: 'UC_new_a',
    channel_title: 'New Channel A',
    view_count: 5000,
  },
]

const FULL_VIDEOS = [
  {
    video_id: 'vf2',
    title: '完整階段影片二',
    url: 'https://www.youtube.com/watch?v=vf2',
    thumbnail: 'https://i.ytimg.com/vi/vf2/mqdefault.jpg',
    published: '2026-05-21T10:00:00Z',
    duration_seconds: 480,
    channel_id: 'UC_new_b',
    channel_title: 'New Channel B',
    view_count: 10000,
  },
]

function fastResponse(cursor = 1, hasMore = true) {
  return {
    videos: FAST_VIDEOS,
    cursor,
    has_more: hasMore,
    phase: 'fast' as const,
    phase_done: ['fast'],
    profile_summary: {
      subscribed_count: 3,
      keywords: ['tech', 'review'],
      categories: ['10', '28'],
    },
  }
}

function fullResponse(cursor = 2, hasMore = true) {
  return {
    videos: [...FAST_VIDEOS, ...FULL_VIDEOS],
    cursor,
    has_more: hasMore,
    phase: 'full' as const,
    phase_done: ['fast', 'full'],
    profile_summary: {
      subscribed_count: 3,
      keywords: ['tech', 'review'],
      categories: ['10', '28'],
    },
  }
}

function emptyResponse() {
  return {
    videos: [],
    cursor: 0,
    has_more: false,
    phase: 'fast' as const,
    phase_done: [],
    profile_summary: { subscribed_count: 0, keywords: [], categories: [] },
    empty_reason: 'no_subscriptions',
  }
}

describe('SimilarChannelDiscoveryFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('progressive 載入：fast phase 先渲染影片，full phase 後補上', async () => {
    const { apiGet } = await import('@/api')

    // 第一呼叫 → fast；第二呼叫 → full
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fastResponse())
      .mockResolvedValueOnce(fullResponse())

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    // 等 fast phase 完成
    await flushPromises()
    // 此時應該已有 fast 一筆 + full 兩筆 (因為 fullResponse 包含 fast)
    const items = wrapper.findAll('.video-item')
    expect(items.length).toBe(2)
    expect(wrapper.text()).toContain('快速階段影片一')
    expect(wrapper.text()).toContain('完整階段影片二')
    snap('SimilarChannelDiscoveryFeed|progressive 載入完成', wrapper.html(), CSS)
  })

  it('興趣關鍵字 chip 顯示', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fastResponse())
      .mockResolvedValueOnce(fullResponse())

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()
    expect(wrapper.text()).toContain('tech')
    expect(wrapper.text()).toContain('review')
  })

  it('無訂閱頻道時顯示空狀態引導', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValueOnce(emptyResponse())

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()
    expect(wrapper.text()).toContain('需要先訂閱')
    expect(wrapper.findAll('.video-item').length).toBe(0)
    snap('SimilarChannelDiscoveryFeed|無訂閱空狀態', wrapper.html(), CSS)
  })

  it('★ 新頻道 badge 顯示在每張卡', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fastResponse())
      .mockResolvedValueOnce(fullResponse())

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()
    const badges = wrapper.findAll('.new-channel-badge')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('點訂閱按鈕呼叫 apiPost 且成功後卡片淡出', async () => {
    vi.useFakeTimers()
    const { apiGet, apiPost } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fastResponse())
      .mockResolvedValueOnce(fullResponse())
    vi.mocked(apiPost).mockResolvedValueOnce({ success: true, channel_id: 'UC_new_a' })

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()

    const subBtn = wrapper.find('.subscribe-btn')
    expect(subBtn.exists()).toBe(true)
    await subBtn.trigger('click')
    await flushPromises()

    expect(vi.mocked(apiPost)).toHaveBeenCalledWith('/discovery/subscribe', {
      channel_id: 'UC_new_a',
    })

    // 1.5s 後該卡片應從 list 移除
    vi.advanceTimersByTime(1600)
    await flushPromises()
    const remaining = wrapper.findAll('.video-item')
    // 訂閱的是 UC_new_a (vf1)，應該被移除，只剩 vf2
    const ids = remaining.map((i) => i.text())
    expect(ids.some((t) => t.includes('快速階段影片一'))).toBe(false)
    vi.useRealTimers()
  })

  it('訂閱失敗時顯示 toast 並保留卡片', async () => {
    const { apiGet, apiPost } = await import('@/api')
    vi.mocked(apiGet)
      .mockResolvedValueOnce(fastResponse())
      .mockResolvedValueOnce(fullResponse())
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('訂閱失敗：subscriptionForbidden'))

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()

    await wrapper.find('.subscribe-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.toast.error').exists()).toBe(true)
    expect(wrapper.findAll('.video-item').length).toBe(2)  // 卡片仍在
  })

  it('🔁 重新分析按鈕觸發 force_rebuild=true 並重置清單', async () => {
    const { apiGet } = await import('@/api')
    const rebuiltVideos = [
      {
        video_id: 'vrb1',
        title: '重新分析後的新影片',
        url: '',
        thumbnail: '',
        published: '2026-05-23T00:00:00Z',
        duration_seconds: 360,
        channel_id: 'UC_rebuilt',
        channel_title: 'Rebuilt Channel',
        view_count: 9000,
      },
    ]

    const seen: string[] = []
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      seen.push(path)
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: 'x' }
      if (path.includes('force_rebuild=true')) {
        return {
          videos: rebuiltVideos,
          cursor: 1,
          has_more: false,
          phase: 'full',
          phase_done: ['fast', 'full'],
          profile_summary: {
            subscribed_count: 5,
            keywords: ['rebuilt'],
            categories: [],
            lang: 'latin',
            analyzed_at: '2026-05-23T08:00:00Z',
          },
        }
      }
      if (path.startsWith('/discovery/similar-channels?phase=fast')) return fastResponse()
      if (path.startsWith('/discovery/similar-channels?phase=full')) return fullResponse()
      throw new Error(`unexpected path: ${path}`)
    })

    // 加上 confirm = always-true
    vi.stubGlobal('confirm', () => true)

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()
    expect(wrapper.text()).toContain('快速階段影片一')

    await wrapper.find('.refresh-btn').trigger('click')
    await flushPromises()

    // 應該打了帶 force_rebuild=true 的 endpoint
    expect(seen.some((p) => p.includes('force_rebuild=true'))).toBe(true)
    // 舊清單已清，新清單顯示
    expect(wrapper.text()).toContain('重新分析後的新影片')
    expect(wrapper.text()).not.toContain('快速階段影片一')
  })

  it('換一批按鈕呼叫 loadMore 並 append 結果', async () => {
    const { apiGet } = await import('@/api')
    const moreVideo = {
      video_id: 'vf3',
      title: '額外影片三',
      url: '',
      thumbnail: '',
      published: '2026-05-22T00:00:00Z',
      duration_seconds: 200,
      channel_id: 'UC_new_c',
      channel_title: 'New Channel C',
      view_count: 8000,
    }

    // discovery.loadInitial 跟 quota.refresh 共用同一個 apiGet mock，
    // 用 URL 路由各自的回應，避免 once-queue 順序被打亂。
    let fastSeen = false
    let fullSeenInit = false
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith('/quota')) return { used: 100, limit: 10000, date: '2026-05-23' }
      if (path.startsWith('/discovery/similar-channels?phase=fast')) {
        fastSeen = true
        return fastResponse(1, true)
      }
      if (path.startsWith('/discovery/similar-channels?phase=full')) {
        if (!fullSeenInit) {
          fullSeenInit = true
          return fullResponse(2, true)
        }
        // 後續 (loadMore) 都回 moreVideo
        return {
          videos: [moreVideo],
          cursor: 3,
          has_more: false,
          phase: 'full',
          phase_done: ['fast', 'full'],
          profile_summary: { subscribed_count: 3, keywords: ['tech'], categories: [] },
        }
      }
      throw new Error(`unexpected path: ${path}`)
    })

    const wrapper = mount(SimilarChannelDiscoveryFeed)
    await flushPromises()
    expect(fastSeen).toBe(true)
    expect(fullSeenInit).toBe(true)

    await wrapper.find('.load-more-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('額外影片三')
  })
})
