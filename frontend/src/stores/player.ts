import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const currentVideoId = ref<string | null>(null)
  const isOpen = computed(() => currentVideoId.value !== null)

  let previousOverflow = ''

  watch(isOpen, (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousOverflow
    }
  })

  function open(videoId: string) {
    currentVideoId.value = videoId
  }

  function close() {
    currentVideoId.value = null
  }

  return { currentVideoId, isOpen, open, close }
})
