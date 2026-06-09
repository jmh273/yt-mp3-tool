<template>
  <div v-if="toast.toasts.length" class="toast-host">
    <div
      v-for="item in toast.toasts"
      :key="item.id"
      class="toast"
      :class="item.type"
      role="status"
      @click="toast.dismiss(item.id)"
    >
      {{ item.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<style scoped>
.toast-host {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: min(360px, calc(100vw - 2rem));
}

.toast {
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.35;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  overflow-wrap: anywhere;
}

.toast.success {
  background: #2ea043;
}

.toast.error {
  background: #d32f2f;
}

.toast.info {
  background: #555;
}
</style>
