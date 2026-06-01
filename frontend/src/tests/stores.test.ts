import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useDownloadStore } from '@/stores/download'
import { useDriveUploadStore } from '@/stores/driveUpload'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

// auth store 直接 import router，需在這裡替換成 mock，避免 beforeEach guard 觸發 checkStatus
vi.mock('@/router', () => ({
  default: { push: vi.fn(), replace: vi.fn() },
}))

const FAKE_VIDEO = {
  video_id: 'v1',
  title: '測試影片',
  url: 'https://www.youtube.com/watch?v=v1',
  thumbnail: 'https://i.ytimg.com/vi/v1/mqdefault.jpg',
  published: '2024-01-15T10:00:00+00:00',
}

// ── authStore ──────────────────────────────────────────────────────────────────
describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始狀態 loggedIn 為 false', () => {
    const auth = useAuthStore()
    expect(auth.loggedIn).toBe(false)
  })

  it('checkStatus：API 回傳 logged_in:true 時設定 loggedIn', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ logged_in: true })

    const auth = useAuthStore()
    await auth.checkStatus()
    expect(auth.loggedIn).toBe(true)
  })

  it('checkStatus：API 回傳 logged_in:false 時 loggedIn 維持 false', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({ logged_in: false })

    const auth = useAuthStore()
    await auth.checkStatus()
    expect(auth.loggedIn).toBe(false)
  })

  it('logout：呼叫 POST /auth/logout 並清除 loggedIn', async () => {
    const { apiGet, apiPost } = await import('@/api')
    // auth store 直接 import router，mock router.push 不觸發 navigation guard
    // 只需確保 apiPost 被呼叫且 loggedIn 被設為 false
    vi.mocked(apiGet)
      .mockResolvedValueOnce({ logged_in: true })
      .mockResolvedValueOnce({ logged_in: false })
    vi.mocked(apiPost).mockResolvedValue({})

    const auth = useAuthStore()
    await auth.checkStatus()
    expect(auth.loggedIn).toBe(true)

    // 在 logout 之前再 mock：logout 後 push 不觸發 guard，loggedIn 應維持 false
    await auth.logout()
    expect(apiPost).toHaveBeenCalledWith('/auth/logout')
    expect(auth.loggedIn).toBe(false)
  })

  it('login：呼叫 GET /auth/login', async () => {
    const { apiGet } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({})

    const auth = useAuthStore()
    await auth.login()
    expect(apiGet).toHaveBeenCalledWith('/auth/login')
  })
})

describe('downloadStore target folders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('startDownload includes target_dir when provided', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload('mp3', 192, { targetDir: '20260601_sports' })

    expect(apiPost).toHaveBeenCalledWith('/download', expect.objectContaining({
      target_dir: '20260601_sports',
    }))
    expect(store.lastWorkDirName).toBe('20260601_sports')
  })
})

describe('driveUploadStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads upload folders and starts upload progress SSE', async () => {
    const { apiGet, apiPost } = await import('@/api')
    vi.mocked(apiGet).mockResolvedValue({
      folders: [{ name: '20260601_sports', directory: 'C:/out/20260601_sports', uploaded: true }],
    })
    vi.mocked(apiPost).mockResolvedValue({ task_id: 'drive-task' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDriveUploadStore()
    await store.loadFolders()
    expect(store.folders[0].uploaded).toBe(true)

    await store.startUpload('C:/out/20260601_sports')
    expect(apiPost).toHaveBeenCalledWith('/drive/upload', { directory: 'C:/out/20260601_sports' })
    const esInstance = Ctor.mock.instances[0]
    esInstance.onmessage({
      data: JSON.stringify({
        status: 'done',
        items: { '01_song.mp3': { filename: '01_song.mp3', status: 'done', error: null } },
      }),
    })
    expect(store.progress['01_song.mp3'].status).toBe('done')
    expect(store.status).toBe('done')
  })

  it('surfaces one-time reauthorization guidance on 401', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockRejectedValue(new Error('401 Drive upload needs one-time Google reauthorization'))
    const store = useDriveUploadStore()

    await store.startUpload('C:/out/20260601')

    expect(store.reauthRequired).toBe(true)
    expect(store.error).toContain('重新授權')
  })
})

// ── downloadStore ──────────────────────────────────────────────────────────────

/** 建立可作為 new EventSource() 使用的 constructor mock */
function makeEventSourceMock() {
  const instance = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: Event) => void) | null,
    close: vi.fn(),
  }
  const Ctor = vi.fn(function (this: typeof instance) {
    Object.assign(this, instance)
    // 讓外部能存取 instance 設定的 handler
    Ctor.lastInstance = this
  }) as any
  Ctor.lastInstance = null
  return { Ctor, instance }
}

describe('downloadStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始狀態：selected 為空、downloading 為 false', () => {
    const store = useDownloadStore()
    expect(store.selected).toHaveLength(0)
    expect(store.downloading).toBe(false)
  })

  it('toggle：第一次加入影片', () => {
    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    expect(store.selected).toHaveLength(1)
    expect(store.selected[0].video_id).toBe('v1')
  })

  it('toggle：第二次移除影片', () => {
    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    store.toggle(FAKE_VIDEO)
    expect(store.selected).toHaveLength(0)
  })

  it('isSelected：已選取回傳 true，未選取回傳 false', () => {
    const store = useDownloadStore()
    expect(store.isSelected('v1')).toBe(false)
    store.toggle(FAKE_VIDEO)
    expect(store.isSelected('v1')).toBe(true)
  })

  it('clearAll：清空所有選取', () => {
    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    store.toggle({ ...FAKE_VIDEO, video_id: 'v2', title: 'Video 2' })
    expect(store.selected).toHaveLength(2)

    store.clearAll()
    expect(store.selected).toHaveLength(0)
  })

  it('startDownload：無選取時不呼叫 API', async () => {
    const { apiPost } = await import('@/api')
    const store = useDownloadStore()
    await store.startDownload()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('startDownload：呼叫 POST /download 並取得 task_id', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 'task-xyz' })

    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload()

    expect(apiPost).toHaveBeenCalledWith('/download', { videos: [FAKE_VIDEO], format: 'mp3', quality: 192 })
    expect(store.taskId).toBe('task-xyz')
    expect(store.downloading).toBe(true)
  })

  it('startDownload：未傳參數時預設送出 mp3 / 192', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload()

    expect(apiPost).toHaveBeenCalledWith('/download', expect.objectContaining({
      format: 'mp3',
      quality: 192,
    }))
  })

  it('startDownload：自訂 format/quality 帶入 payload', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload('mp4', 1080)

    expect(apiPost).toHaveBeenCalledWith('/download', expect.objectContaining({
      format: 'mp4',
      quality: 1080,
    }))
  })

  it('startDownload：未帶 opts 時 payload 不含 seq 欄位', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload()

    const payload = vi.mocked(apiPost).mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('seq_enabled')
    expect(payload).not.toHaveProperty('start_seq')
  })

  it('startDownload：seqEnabled=false → payload 含 seq_enabled:false 且無 start_seq', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload('mp3', 192, { seqEnabled: false, startSeq: '05' })

    const payload = vi.mocked(apiPost).mock.calls[0][1] as Record<string, unknown>
    expect(payload.seq_enabled).toBe(false)
    expect(payload).not.toHaveProperty('start_seq')
  })

  it('startDownload：seqEnabled=true + startSeq 帶入兩個欄位', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload('mp3', 192, { seqEnabled: true, startSeq: '05' })

    expect(apiPost).toHaveBeenCalledWith('/download', expect.objectContaining({
      seq_enabled: true,
      start_seq: '05',
    }))
  })

  it('startDownload：seqEnabled=true 但 startSeq 為空字串時不帶 start_seq', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 't' })
    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload('mp3', 192, { seqEnabled: true, startSeq: '' })

    const payload = vi.mocked(apiPost).mock.calls[0][1] as Record<string, unknown>
    expect(payload.seq_enabled).toBe(true)
    expect(payload).not.toHaveProperty('start_seq')
  })

  it('startDownload：SSE done 事件結束下載狀態', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 'task-xyz' })

    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload()

    expect(store.downloading).toBe(true)

    // 取得 store 內的 EventSource 實例並觸發 onmessage
    const esInstance = Ctor.mock.instances[0]
    esInstance.onmessage({ data: JSON.stringify({ status: 'done', items: {} }) })

    expect(store.downloading).toBe(false)
    expect(esInstance.close).toHaveBeenCalled()
  })

  it('startDownload：SSE 更新 progress items', async () => {
    const { apiPost } = await import('@/api')
    vi.mocked(apiPost).mockResolvedValue({ task_id: 'task-xyz' })

    const { Ctor } = makeEventSourceMock()
    vi.stubGlobal('EventSource', Ctor)

    const store = useDownloadStore()
    store.toggle(FAKE_VIDEO)
    await store.startDownload()

    const esInstance = Ctor.mock.instances[0]
    esInstance.onmessage({
      data: JSON.stringify({
        status: 'running',
        items: { v1: { title: '測試影片', percent: 60, status: 'downloading' } },
      }),
    })

    expect(store.progress['v1'].percent).toBe(60)
    expect(store.progress['v1'].status).toBe('downloading')
  })
})
