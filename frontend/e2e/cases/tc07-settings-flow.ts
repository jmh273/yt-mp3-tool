import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc07SettingsFlow(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-07',
    '設定頁完整流程',
    '驗證設定頁能讀現有值、可改各欄位、儲存成功、回主頁。',
    7,
  )

  await step(
    page,
    ctx,
    '點擊 header 的「設定」連結，導向設定頁。預期看到表單上各個欄位顯示目前的設定值。',
    () => page.locator("a[href='/settings']").click(),
    800,
  )

  await step(
    page,
    ctx,
    '看到表單上的欄位：MP3 輸出資料夾、每頻道顯示影片數、最新影片時間範圍、最短/最長影片長度、目標響度 (dB SPL)。',
    undefined,
    300,
  )

  const numInputs = page.locator("input[type='number']")
  await step(
    page,
    ctx,
    '把「每頻道顯示影片數」改成 3。',
    () => numInputs.nth(0).fill('3'),
    300,
  )

  await step(
    page,
    ctx,
    '把「最新影片時間範圍」改成 48 小時。',
    () => numInputs.nth(1).fill('48'),
    300,
  )

  await step(
    page,
    ctx,
    '把「目標響度 (dB SPL)」改成 92 (mp3gain 想要更接近 YouTube 響度時用)。',
    () => numInputs.last().fill('92'),
    300,
  )

  await step(
    page,
    ctx,
    '點擊「儲存」按鈕。預期看到「已儲存！」提示（綠字 .ok）。',
    async () => {
      await page.locator("button:has-text('儲存')").click()
      await page.waitForSelector('.ok:has-text("已儲存")', { timeout: 5000 })
    },
    800,
  )

  await step(
    page,
    ctx,
    '點擊「← 返回」回主頁。預期回到頻道清單畫面。',
    () => page.locator("a:has-text('返回')").click(),
    800,
  )

  return ctx
}
