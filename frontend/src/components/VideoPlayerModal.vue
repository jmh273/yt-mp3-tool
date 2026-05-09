<template>
  <div v-if="player.isOpen" class="modal-backdrop" role="dialog" aria-modal="true" @click.self="player.close">
    <div class="modal-content">
      <button class="close-btn" type="button" aria-label="關閉" @click="player.close">×</button>
      <iframe
        :src="iframeSrc"
        class="player-iframe"
        title="YouTube video player"
        allowfullscreen
        allow="autoplay; encrypted-media; picture-in-picture"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()

const iframeSrc = computed(() =>
  player.currentVideoId
    ? `https://www.youtube.com/embed/${player.currentVideoId}?autoplay=1&rel=0`
    : ''
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && player.isOpen) {
    player.close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-content {
  position: relative;
  width: min(90vw, 1280px);
  aspect-ratio: 16 / 9;
  max-height: 90vh;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.player-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.15s;
}
.close-btn:hover { background: rgba(0, 0, 0, 0.85); }
.close-btn:focus { outline: 2px solid #fff; outline-offset: 2px; }
</style>
