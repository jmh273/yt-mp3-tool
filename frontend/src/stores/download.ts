import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiPost, API_BASE } from '@/api'

export interface VideoItem {
  video_id: string
  title: string
  url: string
  thumbnail: string
  published: string
  duration_seconds?: number | null
  channel_id?: string
  channel_title?: string
  view_count?: number
  downloaded_today?: boolean
}

export interface ProgressItem {
  title: string
  percent: number
  speed?: string
  status: 'pending' | 'downloading' | 'converting' | 'done' | 'error'
  error?: string
}

export const useDownloadStore = defineStore('download', () => {
  const selected = ref<VideoItem[]>([])
  const taskId = ref<string | null>(null)
  const progress = ref<Record<string, ProgressItem>>({})
  const downloading = ref(false)

  const downloadedIds = ref<Set<string>>(new Set())
  const storedIds = localStorage.getItem('yt_mp3_downloaded_ids')
  if (storedIds) {
    try {
      downloadedIds.value = new Set(JSON.parse(storedIds))
    } catch {
      // ignore
    }
  }

  function markAsDownloaded(videoId: string) {
    downloadedIds.value.add(videoId)
    localStorage.setItem('yt_mp3_downloaded_ids', JSON.stringify(Array.from(downloadedIds.value)))
    
    // 從待下載清單移除
    const idx = selected.value.findIndex(v => v.video_id === videoId)
    if (idx >= 0) selected.value.splice(idx, 1)
  }

  function isDownloaded(videoId: string) {
    return downloadedIds.value.has(videoId)
  }

  function toggle(video: VideoItem) {
    const idx = selected.value.findIndex((v) => v.video_id === video.video_id)
    if (idx >= 0) {
      selected.value.splice(idx, 1)
    } else {
      selected.value.push(video)
    }
  }

  function isSelected(video_id: string) {
    return selected.value.some((v) => v.video_id === video_id)
  }

  function clearAll() {
    selected.value = []
  }

  async function startDownload(
    format: 'mp3' | 'mp4' = 'mp3',
    quality: number = 192,
    opts: { seqEnabled?: boolean; startSeq?: string | null } = {},
  ) {
    if (selected.value.length === 0) return
    downloading.value = true
    progress.value = {}

    const payload: Record<string, unknown> = {
      videos: selected.value,
      format,
      quality,
    }
    if (opts.seqEnabled === false) {
      payload.seq_enabled = false
    } else if (opts.seqEnabled === true) {
      payload.seq_enabled = true
      if (typeof opts.startSeq === 'string' && opts.startSeq.length > 0) {
        payload.start_seq = opts.startSeq
      }
    }

    const { task_id } = await apiPost<{ task_id: string }>('/download', payload)
    taskId.value = task_id

    const es = new EventSource(`${API_BASE}/download/progress/${task_id}`)
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.items) {
        progress.value = data.items
        for (const [vid, info] of Object.entries(data.items)) {
          if ((info as ProgressItem).status === 'done') {
            markAsDownloaded(vid)
          }
        }
      }
      if (data.status === 'done') {
        es.close()
        downloading.value = false
      }
    }
    es.onerror = () => {
      es.close()
      downloading.value = false
    }
  }

  return { selected, taskId, progress, downloading, toggle, isSelected, clearAll, startDownload, isDownloaded, markAsDownloaded }
})
