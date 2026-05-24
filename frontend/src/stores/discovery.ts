import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPost } from '@/api'
import type { VideoItem } from '@/stores/download'

export interface ProfileSummary {
  subscribed_count: number
  keywords: string[]
  categories: string[]
  lang?: 'cjk' | 'latin' | 'mixed'
  analyzed_at?: string | null
}

export interface DiscoveryResponse {
  videos: VideoItem[]
  cursor: number
  has_more: boolean
  phase: 'fast' | 'full'
  phase_done: ('fast' | 'full')[]
  profile_summary: ProfileSummary
  empty_reason?: string
}

export type LoadingPhase = 'idle' | 'fast' | 'full' | 'more' | 'done'

export const useDiscoveryStore = defineStore('discovery', () => {
  const videos = ref<VideoItem[]>([])
  const cursor = ref(0)
  const hasMore = ref(false)
  const loadingPhase = ref<LoadingPhase>('idle')
  const error = ref('')
  const profileSummary = ref<ProfileSummary | null>(null)
  const emptyReason = ref<string | null>(null)
  const phaseDone = ref<Set<string>>(new Set())
  const subscribedChannelIds = ref<Set<string>>(new Set())

  function reset() {
    videos.value = []
    cursor.value = 0
    hasMore.value = false
    loadingPhase.value = 'idle'
    error.value = ''
    profileSummary.value = null
    emptyReason.value = null
    phaseDone.value = new Set()
    subscribedChannelIds.value = new Set()
  }

  function _mergeVideos(incoming: VideoItem[]) {
    const seen = new Set(videos.value.map((v) => v.video_id))
    for (const v of incoming) {
      if (!seen.has(v.video_id)) {
        videos.value.push(v)
        seen.add(v.video_id)
      }
    }
  }

  async function _fetch(
    phase: 'fast' | 'full',
    curr: number,
    forceRebuild = false,
  ): Promise<DiscoveryResponse> {
    const params = new URLSearchParams({ phase, cursor: String(curr) })
    if (forceRebuild) params.set('force_rebuild', 'true')
    return apiGet<DiscoveryResponse>(`/discovery/similar-channels?${params.toString()}`)
  }

  async function loadInitial(forceRebuild = false) {
    reset()
    loadingPhase.value = forceRebuild ? 'full' : 'fast'
    try {
      // 第一次：先 fast phase 拿到結果秒回 UI；重新分析 (forceRebuild) 時跳過 fast，
      // 直接打 full 以確保 search.list 用到的是新 profile。
      if (!forceRebuild) {
        const fast = await _fetch('fast', 0)
        profileSummary.value = fast.profile_summary
        emptyReason.value = fast.empty_reason ?? null
        _mergeVideos(fast.videos)
        cursor.value = fast.cursor
        hasMore.value = fast.has_more
        phaseDone.value = new Set(fast.phase_done)
        if (emptyReason.value) {
          loadingPhase.value = 'done'
          return
        }
        loadingPhase.value = 'full'
      }
      const full = await _fetch('full', 0, forceRebuild)
      profileSummary.value = full.profile_summary
      emptyReason.value = full.empty_reason ?? null
      // 重新分析時舊清單已 reset()，這裡就是全新清單
      _mergeVideos(full.videos)
      cursor.value = full.cursor
      hasMore.value = full.has_more
      phaseDone.value = new Set(full.phase_done)
      loadingPhase.value = 'done'
    } catch (e: any) {
      error.value = e?.message || '載入失敗'
      loadingPhase.value = 'done'
    }
  }

  async function refreshAnalysis() {
    return loadInitial(true)
  }

  async function loadMore() {
    if (loadingPhase.value === 'more' || !hasMore.value) return
    loadingPhase.value = 'more'
    try {
      const data = await _fetch('full', cursor.value)
      _mergeVideos(data.videos)
      cursor.value = data.cursor
      hasMore.value = data.has_more
      phaseDone.value = new Set(data.phase_done)
    } catch (e: any) {
      error.value = e?.message || '載入更多失敗'
    } finally {
      loadingPhase.value = 'done'
    }
  }

  async function subscribe(channelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiPost<{ success: boolean; channel_id: string }>(
        '/discovery/subscribe',
        { channel_id: channelId },
      )
      subscribedChannelIds.value.add(channelId)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || '訂閱失敗' }
    }
  }

  function removeChannelFromList(channelId: string) {
    videos.value = videos.value.filter((v) => v.channel_id !== channelId)
  }

  function isSubscribed(channelId: string): boolean {
    return subscribedChannelIds.value.has(channelId)
  }

  return {
    videos,
    cursor,
    hasMore,
    loadingPhase,
    error,
    profileSummary,
    emptyReason,
    phaseDone,
    subscribedChannelIds,
    loadInitial,
    loadMore,
    refreshAnalysis,
    subscribe,
    removeChannelFromList,
    isSubscribed,
    reset,
  }
})
