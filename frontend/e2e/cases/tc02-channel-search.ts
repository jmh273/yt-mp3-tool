import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc02ChannelSearch(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-02',
    '訂閱頻道搜尋過濾',
    '驗證左欄搜尋框能即時過濾頻道，清空後恢復全部，輸入無相符字串時顯示為空。',
    4,
  )

  const search = page.locator('.search-input')
  const cards = page.locator('.channel-card')
  const totalChannels = await cards.count()

  await step(
    page,
    ctx,
    `點選左欄上方的搜尋輸入框，輸入「a」。預期清單即時過濾為標題含「a」的頻道（小於原本 ${totalChannels} 個）。`,
    async () => {
      await search.fill('a')
      await page.waitForTimeout(200)
      const filtered = await cards.count()
      if (filtered >= totalChannels) {
        throw new Error(
          `搜尋「a」應該過濾掉部分頻道，但顯示 ${filtered} / ${totalChannels}`,
        )
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    `把搜尋字清空。預期清單立刻恢復為全部頻道（${totalChannels} 個）。`,
    async () => {
      await search.fill('')
      await page.waitForTimeout(200)
      const restored = await cards.count()
      if (restored !== totalChannels) {
        throw new Error(`清空後應該回到 ${totalChannels} 個，實際 ${restored}`)
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    '輸入一個幾乎不會中的字串「zzzzqqq」。預期清單變空（沒有任何頻道卡片）。',
    async () => {
      await search.fill('zzzzqqq')
      await page.waitForTimeout(200)
      const c = await cards.count()
      if (c !== 0) {
        throw new Error(`「zzzzqqq」應該過濾為 0 個，實際 ${c}`)
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    '再次清空搜尋以還原狀態，方便下個案例。',
    () => search.fill(''),
    400,
  )

  return ctx
}
