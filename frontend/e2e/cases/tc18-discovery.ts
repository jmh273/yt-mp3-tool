import type { Page, Route, BrowserContext } from 'playwright'
import { startCase, step, type CaseContext } from '../helpers'

// Build a realistic mocked discovery response with finance-themed cards
function buildMockResponse(opts: {
  videos: { id: string; title: string; channelId: string; channelTitle: string; views: number }[]
  cursor: number
  hasMore: boolean
  phase: 'fast' | 'full'
  phaseDone: ('fast' | 'full')[]
  keywords?: string[]
  lang?: 'cjk' | 'latin' | 'mixed'
  analyzedAt?: string
}) {
  return {
    videos: opts.videos.map((v) => ({
      video_id: v.id,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      published: '2026-05-22T10:00:00Z',
      duration_seconds: 600,
      channel_id: v.channelId,
      channel_title: v.channelTitle,
      view_count: v.views,
    })),
    cursor: opts.cursor,
    has_more: opts.hasMore,
    phase: opts.phase,
    phase_done: opts.phaseDone,
    profile_summary: {
      subscribed_count: 8,
      keywords: opts.keywords ?? ['投資', '理財', '股票', 'etf', '台股', '美股', '財經', '存股'],
      categories: ['25'],
      lang: opts.lang ?? 'cjk',
      analyzed_at: opts.analyzedAt ?? '2026-05-23T08:00:00Z',
    },
  }
}

async function mockDiscovery(ctx: BrowserContext) {
  // Mock GET /discovery/similar-channels with phase-aware + force_rebuild-aware behavior
  await ctx.unroute('**/discovery/similar-channels*')
  let rebuiltAlready = false
  await ctx.route('**/discovery/similar-channels*', async (route: Route) => {
    const url = new URL(route.request().url())
    const phase = (url.searchParams.get('phase') ?? 'fast') as 'fast' | 'full'
    const cursor = Number(url.searchParams.get('cursor') ?? '0')
    const forceRebuild = url.searchParams.get('force_rebuild') === 'true'

    if (forceRebuild) {
      rebuiltAlready = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildMockResponse({
            videos: [
              { id: 'reb_1', title: '【重新分析後】2026 ETF 配息全攻略', channelId: 'UC_reb_a', channelTitle: '存股大叔', views: 28000 },
              { id: 'reb_2', title: '【重新分析後】台積電還能買嗎？', channelId: 'UC_reb_b', channelTitle: '台股實戰', views: 41000 },
            ],
            cursor: 2,
            hasMore: false,
            phase: 'full',
            phaseDone: ['fast', 'full'],
            analyzedAt: new Date().toISOString(),
          }),
        ),
      })
      return
    }

    if (cursor > 0) {
      // 換一批
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildMockResponse({
            videos: [
              { id: 'more_1', title: '美股財報季：FAANG 重點整理', channelId: 'UC_more_a', channelTitle: '美股大本營', views: 15000 },
            ],
            cursor: cursor + 1,
            hasMore: false,
            phase,
            phaseDone: ['fast', 'full'],
          }),
        ),
      })
      return
    }

    if (phase === 'fast') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildMockResponse({
            videos: [
              { id: 'fast_1', title: '【fast phase】台股盤後分析', channelId: 'UC_fast_a', channelTitle: '股海日報', views: 5000 },
            ],
            cursor: 1,
            hasMore: true,
            phase: 'fast',
            phaseDone: ['fast'],
          }),
        ),
      })
      return
    }

    // phase=full
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildMockResponse({
          videos: [
            { id: 'fast_1', title: '【fast phase】台股盤後分析', channelId: 'UC_fast_a', channelTitle: '股海日報', views: 5000 },
            { id: 'full_1', title: '【full phase】存股觀念：高股息 ETF 比較', channelId: 'UC_full_a', channelTitle: '財經觀察', views: 12000 },
            { id: 'full_2', title: '【full phase】美股投資新手入門', channelId: 'UC_full_b', channelTitle: '美股入門', views: 8500 },
          ],
          cursor: 3,
          hasMore: true,
          phase: 'full',
          phaseDone: ['fast', 'full'],
        }),
      ),
    })
  })

  // Mock POST /discovery/subscribe — always success
  await ctx.unroute('**/discovery/subscribe')
  await ctx.route('**/discovery/subscribe', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as { channel_id?: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, channel_id: body.channel_id ?? '' }),
    })
  })
}

export async function tc18Discovery(page: Page): Promise<CaseContext> {
  const ctx = startCase(
    'TC-18',
    '同類新頻道發現',
    '驗證「🔍 同類新頻道」獨立分頁：progressive 載入、興趣關鍵字 chips、語言標籤、★新頻道 badge、➕訂閱 → 淡出移除、換一批、🔁 重新分析。所有 /discovery 端點都用 route mock 替代以避免真打 YouTube API。',
    7,
  )

  await mockDiscovery(page.context())

  // confirm() 一律回 true 以便走完重新分析路徑
  await page.addInitScript(() => {
    // @ts-expect-error override for testing
    window.confirm = () => true
  })

  await step(
    page,
    ctx,
    '點擊左欄的「🔍 同類新頻道」按鈕。預期右欄切到 discovery-feed 並顯示分階段載入文案。',
    () => page.locator("button:has-text('同類新頻道')").first().click(),
    1500,
  )

  await step(
    page,
    ctx,
    '等待 full phase 載入完成，至少 2 張影片卡片出現。',
    () => page.waitForSelector('.discovery-feed .video-item', { timeout: 10000 }),
    1500,
  )

  await step(
    page,
    ctx,
    '確認頂部顯示興趣關鍵字 chips（投資 / 理財 / 股票 / etf 等），以及 🀄 中文 語言標籤。',
    async () => {
      const text = await page.locator('.discovery-feed .profile-summary').innerText()
      const hasKeywords = ['投資', '理財', '股票', 'etf'].every((kw) => text.includes(kw))
      const hasLang = text.includes('🀄') || text.includes('中文')
      if (!hasKeywords) throw new Error(`expected keywords missing from "${text}"`)
      if (!hasLang) throw new Error(`expected lang tag missing from "${text}"`)
    },
    300,
  )

  await step(
    page,
    ctx,
    '確認每張卡片都顯示「★ 新頻道」badge 與「➕ 訂閱」按鈕。',
    async () => {
      const badges = await page.locator('.discovery-feed .new-channel-badge').count()
      const subBtns = await page.locator('.discovery-feed .subscribe-btn').count()
      if (badges === 0) throw new Error('no new-channel badges found')
      if (subBtns === 0) throw new Error('no subscribe buttons found')
    },
    300,
  )

  await step(
    page,
    ctx,
    '勾選第 1 張卡片的下載 checkbox，預期右欄下載清單出現該影片。',
    async () => {
      await page
        .locator('.discovery-feed .video-item:first-child input.video-checkbox')
        .check()
    },
    500,
  )

  const cardsBeforeSubscribe = await page.locator('.discovery-feed .video-item').count()
  await step(
    page,
    ctx,
    `點擊第 2 張卡片的「➕ 訂閱」按鈕。預期 backend 回 success → toast「已訂閱！」→ 1.5s 後該卡淡出移除。卡數從 ${cardsBeforeSubscribe} 減少。`,
    async () => {
      await page
        .locator('.discovery-feed .video-item:nth-child(2) .subscribe-btn')
        .click()
      // 等淡出動畫 + 移除
      await page.waitForFunction(
        (before) =>
          document.querySelectorAll('.discovery-feed .video-item').length < before,
        cardsBeforeSubscribe,
        { timeout: 5000 },
      )
    },
    600,
  )

  await step(
    page,
    ctx,
    '點擊「🔄 換一批」按鈕。預期 backend 回新一批影片 append 進清單。',
    async () => {
      const before = await page.locator('.discovery-feed .video-item').count()
      await page.locator('.discovery-feed .load-more-btn').click()
      await page.waitForFunction(
        (b) => document.querySelectorAll('.discovery-feed .video-item').length > b,
        before,
        { timeout: 5000 },
      )
    },
    500,
  )

  await step(
    page,
    ctx,
    '點擊「🔁 重新分析」按鈕。先彈出 confirm()（在 init script 已 stub 為 true）→ 觸發 force_rebuild=true → 清單整批換成「【重新分析後】...」開頭的兩部影片。',
    async () => {
      await page.locator('.discovery-feed .refresh-btn').click()
      await page.waitForFunction(
        () => {
          const items = document.querySelectorAll('.discovery-feed .video-item')
          if (items.length === 0) return false
          // 至少有一張卡片標題含「重新分析後」
          return Array.from(items).some((el) =>
            el.textContent?.includes('重新分析後'),
          )
        },
        null,
        { timeout: 8000 },
      )
    },
    600,
  )

  // 清掉 mock 避免影響後續 case
  await page.context().unroute('**/discovery/similar-channels*')
  await page.context().unroute('**/discovery/subscribe')

  return ctx
}
