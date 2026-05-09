import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc05VideoSelect(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-05',
    '影片勾選與下載選取面板',
    '驗證勾選影片時右欄「下載」分頁面板出現、可多選、可清除全部。',
    6,
  )

  const boxes = page.locator(".video-item input[type='checkbox']")
  const n = await boxes.count()

  await step(
    page,
    ctx,
    '在右欄找到第一支影片卡片，準備勾選它。',
    undefined,
    200,
  )

  await step(
    page,
    ctx,
    '勾選第一支影片的 checkbox。預期右側「下載」分頁出現選取面板，顯示「已選取 1 支影片」。',
    () => boxes.nth(0).check(),
    600,
  )

  if (n >= 2) {
    await step(
      page,
      ctx,
      '勾選第二支影片。預期面板數字更新為「已選取 2 支影片」。',
      () => boxes.nth(1).check(),
      600,
    )
  } else {
    await step(page, ctx, '影片數不足 2 支，跳過第二支勾選。', undefined, 200)
  }

  if (n >= 3) {
    await step(
      page,
      ctx,
      '勾選第三支影片。預期面板數字繼續更新為 3。',
      () => boxes.nth(2).check(),
      600,
    )
  } else {
    await step(page, ctx, '影片數不足 3 支，跳過。', undefined, 200)
  }

  await step(
    page,
    ctx,
    '點擊面板裡的「清除全部」按鈕。預期面板消失、所有勾選回復為空。',
    () => page.locator(".selected-panel button:has-text('清除')").click(),
    600,
  )

  await step(
    page,
    ctx,
    '確認所有 checkbox 都已 uncheck，且選取面板已不顯示。',
    undefined,
    200,
  )

  return ctx
}
