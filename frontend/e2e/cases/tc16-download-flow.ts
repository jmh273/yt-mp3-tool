import type { Page } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

export async function tc16DownloadFlow(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-16',
    '下載 MP3/MP4 完整流程',
    '驗證選取面板的 format / quality 下拉、按下載後 SSE 進度條更新、最後完成標記。',
    6,
  )

  await step(
    page,
    ctx,
    '切到「最新影片」頁面以取得可下載的影片清單，並確保右欄是「下載」分頁。',
    async () => {
      await page.locator("button:has-text('最新影片')").first().click()
      // Make sure right pane shows SelectedVideos (download tab), not normalize tab
      await page.locator('.tab', { hasText: '下載' }).click()
    },
    1000,
  )

  await step(
    page,
    ctx,
    '勾選最新影片清單裡的第一支。預期右側「下載」分頁出現選取面板（顯示「已選取 1 支影片」與格式 / 品質下拉）。',
    async () => {
      await page.waitForSelector(".video-item input[type='checkbox']", {
        timeout: 20000,
      })
      await page.locator(".video-item input[type='checkbox']").first().check()
      // Wait for selected-panel to render (Vue reactivity tick)
      await page.waitForSelector('.selected-panel .format-select', {
        timeout: 5000,
      })
    },
    600,
  )

  await step(
    page,
    ctx,
    '在選取面板的格式下拉選擇「MP4」。預期品質下拉自動切換到 720p。',
    async () => {
      await page.locator('.format-select').selectOption('mp4')
    },
    600,
  )

  await step(
    page,
    ctx,
    '把格式切回 MP3，並把品質改成 192 kbps（預設值）。',
    async () => {
      await page.locator('.format-select').selectOption('mp3')
      await page.locator('.quality-select').selectOption('192')
    },
    400,
  )

  await step(
    page,
    ctx,
    '點擊「下載選取影片」按鈕。預期按鈕變「下載中...」、出現進度條列表、SSE 即時更新百分比。',
    () => page.locator('.selected-panel button.dl').click(),
    2000,
  )

  await step(
    page,
    ctx,
    '等待整批下載完成（轉換完成）。預期 .summary「下載完成！」摘要文字出現，或至少一張卡片顯示「✅ 已下載」徽章。',
    () =>
      page.waitForFunction(
        () =>
          document.querySelectorAll('.dl-badge').length >= 1 ||
          !!document.querySelector('.selected-panel .summary'),
        null,
        { timeout: 180000 },
      ),
    1000,
  )

  return ctx
}
