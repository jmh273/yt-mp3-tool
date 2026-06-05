import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DirectoryPicker from '@/components/DirectoryPicker.vue'

const folders = [
  { name: '20260603_c', directory: 'D:\\Music\\20260603_c' },
  { name: '20260601_a', directory: 'D:\\Music\\20260601_a', badge: '已上傳' },
]

describe('DirectoryPicker', () => {
  it('輸入欄反映 modelValue，輸入文字 emit update:modelValue', async () => {
    const wrapper = mount(DirectoryPicker, { props: { modelValue: 'D:\\Music', folders: [] } })
    const input = wrapper.find<HTMLInputElement>('[data-testid="dir-picker-input"]')
    expect(input.element.value).toBe('D:\\Music')

    await input.setValue('D:\\Other')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['D:\\Other'])
  })

  it('點 icon 開啟彈窗並 emit open；清單來自 props', async () => {
    const wrapper = mount(DirectoryPicker, { props: { modelValue: '', folders } })
    expect(wrapper.find('.folder-modal').exists()).toBe(false)

    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    const choices = wrapper.findAll('[data-testid="dir-picker-choice"]')
    expect(choices).toHaveLength(2)
    expect(choices[0].text()).toContain('20260603_c')
    expect(wrapper.find('.folder-badge').text()).toBe('已上傳')
  })

  it('選定資料夾只填路徑、關閉彈窗、不觸發其他動作', async () => {
    const wrapper = mount(DirectoryPicker, { props: { modelValue: '', folders } })
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    await wrapper.findAll('[data-testid="dir-picker-choice"]')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['D:\\Music\\20260601_a'])
    expect(wrapper.emitted('pick')?.[0]).toEqual([folders[1]])
    expect(wrapper.find('.folder-modal').exists()).toBe(false)
  })

  it('disabled 時輸入欄與 icon 皆停用', () => {
    const wrapper = mount(DirectoryPicker, { props: { modelValue: '', folders: [], disabled: true } })
    expect(wrapper.find('[data-testid="dir-picker-input"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="dir-picker-icon"]').attributes('disabled')).toBeDefined()
  })

  it('清單為空時顯示空狀態文字', async () => {
    const wrapper = mount(DirectoryPicker, { props: { modelValue: '', folders: [] } })
    await wrapper.find('[data-testid="dir-picker-icon"]').trigger('click')
    expect(wrapper.find('.picker-empty').text()).toContain('沒有可選的資料夾')
  })
})
