import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

const DEFAULT_TIMEOUT = 4000

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0

  function push(type: ToastType, message: string, timeout = DEFAULT_TIMEOUT): number {
    const id = ++seq
    toasts.value.push({ id, type, message })
    if (timeout > 0) {
      setTimeout(() => dismiss(id), timeout)
    }
    return id
  }

  function dismiss(id: number) {
    const index = toasts.value.findIndex((toast) => toast.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  function success(message: string, timeout?: number) {
    return push('success', message, timeout)
  }

  function error(message: string, timeout?: number) {
    return push('error', message, timeout)
  }

  function info(message: string, timeout?: number) {
    return push('info', message, timeout)
  }

  return { toasts, push, dismiss, success, error, info }
})
