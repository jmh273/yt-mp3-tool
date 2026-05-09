import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc09TabsKeepAlive(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-09',
    '右欄分頁切換 + KeepAlive 保留狀態',
    '驗證右欄「下載」「音量正規化」分頁切換、切換時保留各分頁狀態 (Vue KeepAlive)。',
    5,
  )

  const downloadTab = page.locator('.tab', { hasText: '下載' })
  const normalizeTab = page.locator('.tab', { hasText: '音量正規化' })

  await step(
    page,
    ctx,
    '確認預設右欄是「下載」分頁 active (紅色底線)。',
    undefined,
    200,
  )

  await step(
    page,
    ctx,
    '點擊「音量正規化」分頁。預期面板切換、目錄輸入框預填當日 YYYYMMDD 路徑、本次目標 (dB) 預填 89。',
    () => normalizeTab.click(),
    800,
  )

  await step(
    page,
    ctx,
    '在目錄輸入框打一些測試字串「TESTPATH123」(等下要驗 KeepAlive)。',
    () => page.locator('.dir-input').fill('TESTPATH123'),
    300,
  )

  await step(
    page,
    ctx,
    '切回「下載」分頁。預期看到下載面板 (如果沒選影片就是空的)。',
    () => downloadTab.click(),
    500,
  )

  await step(
    page,
    ctx,
    '再切回「音量正規化」分頁。預期目錄輸入框仍是「TESTPATH123」(KeepAlive 保留了狀態)。',
    async () => {
      await normalizeTab.click()
      await page.waitForTimeout(300)
      const value = await page.locator('.dir-input').inputValue()
      if (value !== 'TESTPATH123') {
        throw new Error(
          `KeepAlive 失效：dir-input 值應該保留為「TESTPATH123」，實際為「${value}」`,
        )
      }
    },
    500,
  )

  return ctx
}
