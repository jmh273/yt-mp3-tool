import { ref, watch, type Ref } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { useNormalizeStore } from '@/stores/normalize'
import { useDriveUploadStore } from '@/stores/driveUpload'

type RightTab = 'download' | 'normalize' | 'upload'
type PipelineStage = 'idle' | 'normalizing' | 'uploading'

export function useAutoPostDownloadPipeline(activeRightTab: Ref<RightTab>) {
  const downloadStore = useDownloadStore()
  const normalizeStore = useNormalizeStore()
  const driveUploadStore = useDriveUploadStore()
  const pipelineStage = ref<PipelineStage>('idle')
  const pipelineDir = ref('')

  watch(() => downloadStore.downloading, async (now, prev) => {
    if (!(prev === true && now === false)) return
    if (!downloadStore.autoPipeline) return
    const dir = downloadStore.lastDownloadDir
    if (!dir) return

    pipelineDir.value = dir
    if (downloadStore.lastFormat === 'mp3') {
      pipelineStage.value = 'normalizing'
      activeRightTab.value = 'normalize'
      try {
        await normalizeStore.loadDirectory(dir)
      } catch {
        // loadDirectory 內部已吞錯；無論成敗都往下判斷有無檔可正規化
      }
      // 有可正規化的檔才跑 normalize；否則 best-effort 直接進上傳，
      // 避免 startBatch 因 files=0 提早 return、status 永不為 done 而卡在 normalizing。
      if (normalizeStore.files.length > 0) {
        normalizeStore.startBatch().catch(() => {
          // best-effort：正規化整批啟動失敗也續行至上傳
          pipelineStage.value = 'uploading'
          activeRightTab.value = 'upload'
          driveUploadStore.startUpload(dir)
        })
        return // 正規化進行中，由 normalizeStore.status 的 watcher 接續上傳
      }
    }

    pipelineStage.value = 'uploading'
    activeRightTab.value = 'upload'
    driveUploadStore.startUpload(dir)
  })

  watch(() => normalizeStore.status, (status) => {
    if (pipelineStage.value !== 'normalizing' || status !== 'done') return
    pipelineStage.value = 'uploading'
    activeRightTab.value = 'upload'
    driveUploadStore.startUpload(pipelineDir.value)
  })

  watch(() => driveUploadStore.status, (status) => {
    if (pipelineStage.value === 'uploading' && status === 'done') {
      pipelineStage.value = 'idle'
    }
  })

  return { pipelineStage, pipelineDir }
}
