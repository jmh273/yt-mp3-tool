import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToastHost from '@/components/ToastHost.vue'
import { useToastStore } from '@/stores/toast'

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  it('pushes typed toasts and dismisses by id', () => {
    const toast = useToastStore()

    const successId = toast.success('Saved', 0)
    const errorId = toast.error('Failed', 0)
    const infoId = toast.info('Already subscribed', 0)

    expect(toast.toasts).toEqual([
      { id: successId, type: 'success', message: 'Saved' },
      { id: errorId, type: 'error', message: 'Failed' },
      { id: infoId, type: 'info', message: 'Already subscribed' },
    ])

    toast.dismiss(errorId)

    expect(toast.toasts).toEqual([
      { id: successId, type: 'success', message: 'Saved' },
      { id: infoId, type: 'info', message: 'Already subscribed' },
    ])
  })

  it('auto-dismisses after the configured timeout', () => {
    const toast = useToastStore()

    toast.success('Saved', 250)
    expect(toast.toasts).toHaveLength(1)

    vi.advanceTimersByTime(249)
    expect(toast.toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.toasts).toHaveLength(0)
  })
})

describe('ToastHost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders current toasts and lets users dismiss them', async () => {
    const toast = useToastStore()
    toast.success('Saved', 0)
    toast.error('Failed', 0)

    const wrapper = mount(ToastHost)
    await nextTick()

    expect(wrapper.find('.toast-host').exists()).toBe(true)
    expect(wrapper.findAll('.toast')).toHaveLength(2)
    expect(wrapper.find('.toast.success').text()).toBe('Saved')
    expect(wrapper.find('.toast.error').text()).toBe('Failed')

    await wrapper.find('.toast.success').trigger('click')

    expect(toast.toasts).toHaveLength(1)
    expect(toast.toasts[0]?.message).toBe('Failed')
  })
})
