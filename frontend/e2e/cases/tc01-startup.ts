import type { Page } from 'playwright'
import { BASE_URL, startCase, step, type CaseContext } from '../helpers'

export async function tc01Startup(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-01',
    '啟動與版號顯示',
    '驗證主畫面能順利載入、header 顯示版號、訂閱清單成功從後端拉回。',
    3,
  )

  await step(
    page,
    ctx,
    '在瀏覽器開啟 http://localhost:5173/，等待頁面初始化。預期看到「YT → MP3」標題與 loading 指示。',
    () => page.goto(BASE_URL),
    1500,
  )

  await step(
    page,
    ctx,
    '等待訂閱清單從後端載入完成。預期左欄出現至少一個頻道卡片（若首次載入因 backend 瞬間錯誤失敗，自動 reload 重試最多 2 次）。',
    async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.waitForSelector('.channel-card', { timeout: 15000 })
          return
        } catch {
          if (attempt < 2) {
            await page.reload()
            await page.waitForTimeout(1500)
          } else {
            throw new Error('channels did not load after 3 attempts')
          }
        }
      }
    },
    500,
  )

  await step(
    page,
    ctx,
    '確認 header 右上角顯示版號標籤（例如 v0.0.0-dev 或 v0.6.0）。版號是後端 GET /version 回傳的，前端從那裡拉。',
    async () => {
      const version = await page.locator('.version').textContent()
      if (!version || !/^v\d/.test(version.trim())) {
        throw new Error(`version label missing or malformed: "${version}"`)
      }
    },
    300,
  )

  return ctx
}
