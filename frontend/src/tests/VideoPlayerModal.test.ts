import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import VideoPlayerModal from '@/components/VideoPlayerModal.vue'
import { usePlayerStore } from '@/stores/player'

describe('VideoPlayerModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.style.overflow = ''
  })

  it('store 關閉時不渲染 modal DOM', () => {
    const wrapper = mount(VideoPlayerModal)
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false)
    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('store 開啟時渲染 iframe 且 src 包含正確 video_id', async () => {
    const wrapper = mount(VideoPlayerModal)
    const player = usePlayerStore()
    player.open('abc123')
    await nextTick()

    expect(wrapper.find('.modal-backdrop').exists()).toBe(true)
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe('https://www.youtube.com/embed/abc123?autoplay=1&rel=0')
    expect(iframe.attributes('allowfullscreen')).toBeDefined()
  })

  it('點 .close-btn 觸發 player.close()', async () => {
    const wrapper = mount(VideoPlayerModal)
    const player = usePlayerStore()
    player.open('abc')
    await nextTick()

    await wrapper.find('.close-btn').trigger('click')
    await nextTick()

    expect(player.isOpen).toBe(false)
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false)
  })

  it('點 .modal-backdrop 自身觸發 player.close()', async () => {
    const wrapper = mount(VideoPlayerModal)
    const player = usePlayerStore()
    player.open('abc')
    await nextTick()

    await wrapper.find('.modal-backdrop').trigger('click')
    await nextTick()

    expect(player.isOpen).toBe(false)
  })

  it('點 .modal-content 不觸發 player.close()（@click.self 在 backdrop）', async () => {
    const wrapper = mount(VideoPlayerModal)
    const player = usePlayerStore()
    player.open('abc')
    await nextTick()

    await wrapper.find('.modal-content').trigger('click')
    await nextTick()

    expect(player.isOpen).toBe(true)
  })

  it('按 ESC 觸發 player.close()', async () => {
    mount(VideoPlayerModal, { attachTo: document.body })
    const player = usePlayerStore()
    player.open('abc')
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(player.isOpen).toBe(false)
  })

  it('切換 video_id 時 iframe src 更新', async () => {
    const wrapper = mount(VideoPlayerModal)
    const player = usePlayerStore()
    player.open('abc123')
    await nextTick()
    expect(wrapper.find('iframe').attributes('src')).toContain('abc123')

    player.open('xyz999')
    await nextTick()
    expect(wrapper.find('iframe').attributes('src')).toContain('xyz999')
    expect(wrapper.find('iframe').attributes('src')).not.toContain('abc123')
  })
})
