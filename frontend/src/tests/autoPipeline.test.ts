import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useAutoPostDownloadPipeline } from '@/composables/useAutoPostDownloadPipeline'
import { useDownloadStore } from '@/stores/download'
import { useNormalizeStore } from '@/stores/normalize'
import { useDriveUploadStore } from '@/stores/driveUpload'

vi.mock('@/api', () => ({
  API_BASE: '/api',
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

describe('useAutoPostDownloadPipeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('runs mp3 downloads through normalize before Drive upload', async () => {
    const activeRightTab = ref<'download' | 'normalize' | 'upload'>('download')
    const download = useDownloadStore()
    const normalize = useNormalizeStore()
    const drive = useDriveUploadStore()
    const loadDirectory = vi.spyOn(normalize, 'loadDirectory').mockResolvedValue(undefined)
    const startBatch = vi.spyOn(normalize, 'startBatch').mockResolvedValue(undefined)
    const startUpload = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)
    // 模擬目錄載入後有可正規化的 mp3 檔
    normalize.files = [{ filename: 'a.mp3', size_bytes: 1, needs_rename: false, suggested_name: 'a.mp3' }]

    download.autoPipeline = true
    download.lastDownloadDir = 'C:/out/20260601'
    download.lastFormat = 'mp3'
    download.downloading = true
    const pipeline = useAutoPostDownloadPipeline(activeRightTab)

    download.downloading = false
    await nextTick()
    await Promise.resolve()

    expect(pipeline.pipelineStage.value).toBe('normalizing')
    expect(activeRightTab.value).toBe('normalize')
    expect(loadDirectory).toHaveBeenCalledWith('C:/out/20260601')
    expect(startBatch).toHaveBeenCalled()
    expect(startUpload).not.toHaveBeenCalled()

    normalize.status = 'done'
    await nextTick()

    expect(pipeline.pipelineStage.value).toBe('uploading')
    expect(activeRightTab.value).toBe('upload')
    expect(startUpload).toHaveBeenCalledWith('C:/out/20260601')

    drive.status = 'done'
    await nextTick()

    expect(pipeline.pipelineStage.value).toBe('idle')
  })

  it('skips straight to upload when an mp3 batch has no files to normalize', async () => {
    const activeRightTab = ref<'download' | 'normalize' | 'upload'>('download')
    const download = useDownloadStore()
    const normalize = useNormalizeStore()
    const drive = useDriveUploadStore()
    // loadDirectory 成功但目錄沒有可正規化的檔 → files 維持空
    const loadDirectory = vi.spyOn(normalize, 'loadDirectory').mockResolvedValue(undefined)
    const startBatch = vi.spyOn(normalize, 'startBatch').mockResolvedValue(undefined)
    const startUpload = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)
    normalize.files = []

    download.autoPipeline = true
    download.lastDownloadDir = 'C:/out/empty'
    download.lastFormat = 'mp3'
    download.downloading = true
    const pipeline = useAutoPostDownloadPipeline(activeRightTab)

    download.downloading = false
    await nextTick()
    await Promise.resolve()

    expect(loadDirectory).toHaveBeenCalledWith('C:/out/empty')
    expect(startBatch).not.toHaveBeenCalled()
    expect(startUpload).toHaveBeenCalledWith('C:/out/empty')
    expect(activeRightTab.value).toBe('upload')
    expect(pipeline.pipelineStage.value).toBe('uploading')
  })

  it('uploads mp4 downloads directly without normalization', async () => {
    const activeRightTab = ref<'download' | 'normalize' | 'upload'>('download')
    const download = useDownloadStore()
    const normalize = useNormalizeStore()
    const drive = useDriveUploadStore()
    const loadDirectory = vi.spyOn(normalize, 'loadDirectory').mockResolvedValue(undefined)
    const startBatch = vi.spyOn(normalize, 'startBatch').mockResolvedValue(undefined)
    const startUpload = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)

    download.autoPipeline = true
    download.lastDownloadDir = 'C:/out/videos'
    download.lastFormat = 'mp4'
    download.downloading = true
    useAutoPostDownloadPipeline(activeRightTab)

    download.downloading = false
    await nextTick()

    expect(activeRightTab.value).toBe('upload')
    expect(loadDirectory).not.toHaveBeenCalled()
    expect(startBatch).not.toHaveBeenCalled()
    expect(startUpload).toHaveBeenCalledWith('C:/out/videos')
  })

  it('does nothing when auto pipeline is disabled or the directory is missing', async () => {
    const activeRightTab = ref<'download' | 'normalize' | 'upload'>('download')
    const download = useDownloadStore()
    const normalize = useNormalizeStore()
    const drive = useDriveUploadStore()
    const loadDirectory = vi.spyOn(normalize, 'loadDirectory').mockResolvedValue(undefined)
    const startUpload = vi.spyOn(drive, 'startUpload').mockResolvedValue(undefined)

    download.autoPipeline = false
    download.lastDownloadDir = ''
    download.downloading = true
    useAutoPostDownloadPipeline(activeRightTab)

    download.downloading = false
    await nextTick()

    expect(loadDirectory).not.toHaveBeenCalled()
    expect(startUpload).not.toHaveBeenCalled()
    expect(activeRightTab.value).toBe('download')
  })
})
