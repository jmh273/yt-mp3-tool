<template>
  <div class="dir-picker">
    <div class="dir-field">
      <input
        :value="modelValue"
        type="text"
        class="dir-input"
        :placeholder="placeholder"
        :disabled="disabled"
        data-testid="dir-picker-input"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="picker-icon"
        :disabled="disabled"
        title="選擇資料夾"
        data-testid="dir-picker-icon"
        @click="openPicker"
      >📁</button>
    </div>

    <div v-if="open" class="modal-backdrop" @click.self="open = false">
      <div class="folder-modal">
        <div class="modal-head">
          <strong>選擇資料夾</strong>
          <button type="button" @click="open = false">✕</button>
        </div>
        <p v-if="folders.length === 0" class="picker-empty">沒有可選的資料夾</p>
        <button
          v-for="folder in folders"
          :key="folder.directory"
          type="button"
          class="folder-choice"
          data-testid="dir-picker-choice"
          @click="choose(folder)"
        >
          <span>{{ folder.name }}</span>
          <span v-if="folder.badge" class="folder-badge">{{ folder.badge }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface PickerFolder {
  name: string
  directory: string
  badge?: string
}

defineProps<{
  modelValue: string
  folders: PickerFolder[]
  disabled?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  pick: [folder: PickerFolder]
  open: []
}>()

const open = ref(false)

// 開啟彈窗：先通知 parent 載入清單（清單由 props 反應式更新），再顯示。
function openPicker() {
  emit('open')
  open.value = true
}

// 選定資料夾：僅填路徑、關閉彈窗，不觸發任何載入/上傳動作。
function choose(folder: PickerFolder) {
  emit('update:modelValue', folder.directory)
  emit('pick', folder)
  open.value = false
}
</script>

<style scoped>
.dir-picker { width: 100%; }
.dir-field { display: flex; align-items: stretch; width: 100%; }
.dir-input {
  flex: 1; min-width: 0;
  padding: 0.4rem 0.6rem; font-size: 0.85rem;
  border: 1px solid #ccc; border-right: none;
  border-radius: 4px 0 0 4px;
}
.dir-input:disabled { opacity: 0.5; cursor: not-allowed; background: #f5f5f5; }
.picker-icon {
  flex: 0 0 auto;
  border: 1px solid #ccc; border-radius: 0 4px 4px 0;
  background: #f7f7f7; cursor: pointer; padding: 0 0.6rem; font-size: 0.9rem;
}
.picker-icon:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; z-index: 20; }
.folder-modal { width: min(360px, calc(100vw - 2rem)); max-height: 70vh; overflow-y: auto; background: white; border-radius: 6px; border: 1px solid #ddd; box-shadow: 0 8px 30px rgba(0,0,0,.18); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.modal-head button { background: none; border: none; cursor: pointer; font-size: 1rem; }
.picker-empty { margin: 0.4rem 0; color: #888; font-size: 0.82rem; text-align: center; }
.folder-choice { display: flex; justify-content: space-between; gap: 0.5rem; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem; cursor: pointer; font-size: 0.85rem; }
.folder-badge { color: #2e7d32; font-size: 0.75rem; }
</style>
