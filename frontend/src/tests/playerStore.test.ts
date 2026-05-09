import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'

describe('usePlayerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('初始狀態 currentVideoId 為 null、isOpen 為 false', () => {
    const player = usePlayerStore()
    expect(player.currentVideoId).toBeNull()
    expect(player.isOpen).toBe(false)
  })

  it('open(id) 後 currentVideoId 與 isOpen 正確更新', () => {
    const player = usePlayerStore()
    player.open('abc123')
    expect(player.currentVideoId).toBe('abc123')
    expect(player.isOpen).toBe(true)
  })

  it('close() 後 currentVideoId 變回 null、isOpen 變 false', () => {
    const player = usePlayerStore()
    player.open('abc123')
    player.close()
    expect(player.currentVideoId).toBeNull()
    expect(player.isOpen).toBe(false)
  })

  it('開啟中再 open 另一個 id 應替換 currentVideoId', () => {
    const player = usePlayerStore()
    player.open('abc')
    player.open('xyz')
    expect(player.currentVideoId).toBe('xyz')
    expect(player.isOpen).toBe(true)
  })

  it('開啟時 document.body.style.overflow 設為 hidden、關閉後還原', async () => {
    document.body.style.overflow = 'auto'
    const player = usePlayerStore()
    player.open('abc')
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')

    player.close()
    await nextTick()
    expect(document.body.style.overflow).toBe('auto')
  })
})
