import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc08SettingsValidation(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-08',
    '設定頁範圍驗證',
    '驗證 latest_hours、normalize_target_db 兩個欄位的範圍檢查 (前端 + 後端 422)。',
    4,
  )

  await step(
    page,
    ctx,
    '再次進入設定頁。',
    () => page.locator("a[href='/settings']").click(),
    800,
  )

  const numInputs = page.locator("input[type='number']")

  await step(
    page,
    ctx,
    '把「最新影片時間範圍」改成 0 (低於下限 1)。預期欄位下方出現紅色 validation 訊息「請輸入 1 到 168 之間的整數」，儲存按鈕被 disable。',
    async () => {
      await numInputs.nth(1).fill('0')
      await page.waitForSelector('.field-error:has-text("1 到 168")', {
        timeout: 3000,
      })
      const saveDisabled = await page
        .locator("button:has-text('儲存')")
        .isDisabled()
      if (!saveDisabled) {
        throw new Error('儲存按鈕應該被 disable，但仍可按')
      }
    },
    400,
  )

  await step(
    page,
    ctx,
    '把「目標響度 (dB SPL)」改成 75 (低於下限 80)。預期該欄位也跳 validation 錯誤。',
    async () => {
      await numInputs.last().fill('75')
      await page.waitForSelector('.field-error:has-text("80 到 100")', {
        timeout: 3000,
      })
    },
    400,
  )

  await step(
    page,
    ctx,
    '把兩個欄位都改回合法值 (latest_hours=24, normalize_target_db=89)。預期錯誤訊息消失、儲存按鈕重新可按。',
    async () => {
      await numInputs.nth(1).fill('24')
      await numInputs.last().fill('89')
      await page.waitForTimeout(300)
      const errs = await page.locator('.field-error').count()
      if (errs > 0) {
        throw new Error(`錯誤訊息應該消失，但仍有 ${errs} 個 .field-error`)
      }
      const saveDisabled = await page
        .locator("button:has-text('儲存')")
        .isDisabled()
      if (saveDisabled) {
        throw new Error('改回合法值後儲存按鈕應該重新可按，但仍 disabled')
      }
    },
    500,
  )

  await step(
    page,
    ctx,
    '回主頁。',
    () => page.locator("a:has-text('返回')").click(),
    600,
  )

  return ctx
}
