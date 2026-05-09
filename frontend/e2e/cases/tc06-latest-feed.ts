import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc06LatestFeed(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-06',
    '最新影片分頁',
    '驗證「最新影片」按鈕可切換右欄為跨頻道時間排序的清單；勾選後也會進到「下載」面板。',
    5,
  )

  await step(
    page,
    ctx,
    '點擊左欄上方的「最新影片」按鈕。預期右欄切換到 latest-videos-feed，並顯示載入中。',
    () => page.locator("button:has-text('最新影片')").first().click(),
    1000,
  )

  await step(
    page,
    ctx,
    '等待最新影片從後端載入完成。預期看到至少一張影片卡片，按發布時間 (新→舊) 排序。',
    () =>
      page.waitForSelector('.latest-feed .video-item, .video-item', {
        timeout: 20000,
      }),
    600,
  )

  const boxes = page.locator(".video-item input[type='checkbox']")
  const n = await boxes.count()
  if (n > 0) {
    await step(
      page,
      ctx,
      '勾選最新影片清單裡的第一支。預期「下載」分頁面板出現「已選取 1 支」(跟頻道頁的勾選共用同一份選取狀態)。',
      () => boxes.nth(0).check(),
      600,
    )

    await step(
      page,
      ctx,
      '確認面板顯示在右欄「下載」分頁；切到「下載」分頁可看到剛選的這支。',
      () => page.locator(".tab", { hasText: '下載' }).click(),
      600,
    )

    await step(
      page,
      ctx,
      '再點「清除全部」清空，方便下個案例。',
      () => page.locator(".selected-panel button:has-text('清除')").click(),
      400,
    )
  } else {
    await step(page, ctx, '最新影片清單無任何影片，無法勾選。', undefined, 200)
    await step(page, ctx, '—', undefined, 200)
    await step(page, ctx, '—', undefined, 200)
  }

  return ctx
}
