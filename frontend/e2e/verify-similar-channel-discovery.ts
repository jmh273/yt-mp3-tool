// One-shot verification for add-similar-channel-discovery.
// Run: npx tsx e2e/verify-similar-channel-discovery.ts  (from frontend/)
//
// Mocks /discovery/similar-channels and /discovery/subscribe so we exercise
// the full UX without touching real YouTube API or affecting the user's real
// subscriptions. Verifies: progressive load, keyword chips, language tag,
// new-channel badge, subscribe fade-out, load-more, refresh-analysis with
// force_rebuild=true.

import { chromium, type Page, type Route, type BrowserContext } from 'playwright'
import { BASE_URL, STORAGE_STATE_PATH, preconditionCheck, log } from './helpers'

interface Result {
  task: string
  status: 'PASS' | 'FAIL'
  detail: string
}
const results: Result[] = []
function record(task: string, status: 'PASS' | 'FAIL', detail: string) {
  results.push({ task, status, detail })
  log(`  [${status}] ${task}: ${detail}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers

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
      keywords: opts.keywords ?? ['投資', '理財', 'etf', '美股'],
      categories: ['25'],
      lang: opts.lang ?? 'cjk',
      analyzed_at: opts.analyzedAt ?? '2026-05-23T08:00:00Z',
    },
  }
}

async function installDiscoveryMocks(
  ctx: BrowserContext,
): Promise<{ subscribeBodies: { channel_id: string }[]; rebuildSeen: boolean[] }> {
  const state = {
    subscribeBodies: [] as { channel_id: string }[],
    rebuildSeen: [] as boolean[],
  }

  await ctx.unroute('**/discovery/similar-channels*')
  await ctx.route('**/discovery/similar-channels*', async (route: Route) => {
    const url = new URL(route.request().url())
    const phase = (url.searchParams.get('phase') ?? 'fast') as 'fast' | 'full'
    const cursor = Number(url.searchParams.get('cursor') ?? '0')
    const forceRebuild = url.searchParams.get('force_rebuild') === 'true'
    state.rebuildSeen.push(forceRebuild)

    if (forceRebuild) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildMockResponse({
            videos: [
              { id: 'reb1', title: '【重新分析】2026 ETF 配息', channelId: 'UC_reb_a', channelTitle: '存股大叔', views: 22000 },
            ],
            cursor: 1,
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildMockResponse({
            videos: [
              { id: 'more1', title: '美股財報季', channelId: 'UC_more_a', channelTitle: '美股大本營', views: 15000 },
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
              { id: 'fast1', title: '台股盤後分析', channelId: 'UC_fast_a', channelTitle: '股海日報', views: 5000 },
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
    // full
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildMockResponse({
          videos: [
            { id: 'fast1', title: '台股盤後分析', channelId: 'UC_fast_a', channelTitle: '股海日報', views: 5000 },
            { id: 'full1', title: '存股觀念', channelId: 'UC_full_a', channelTitle: '財經觀察', views: 12000 },
            { id: 'full2', title: '美股新手入門', channelId: 'UC_full_b', channelTitle: '美股入門', views: 8500 },
          ],
          cursor: 3,
          hasMore: true,
          phase: 'full',
          phaseDone: ['fast', 'full'],
        }),
      ),
    })
  })

  await ctx.unroute('**/discovery/subscribe')
  await ctx.route('**/discovery/subscribe', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const body = JSON.parse(route.request().postData() ?? '{}') as { channel_id?: string }
    state.subscribeBodies.push({ channel_id: body.channel_id ?? '' })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, channel_id: body.channel_id ?? '' }),
    })
  })

  return state
}

async function openDiscoveryTab(page: Page) {
  await page.locator("button:has-text('同類新頻道')").first().click()
  await page.waitForSelector('.discovery-feed .video-item', { timeout: 10000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks

async function checkProgressiveLoad(page: Page) {
  log('=== Progressive load: fast → full ===')
  await page.goto(BASE_URL)
  await openDiscoveryTab(page)
  // 等 full phase 完成 → 至少 3 部影片
  await page.waitForFunction(
    () => document.querySelectorAll('.discovery-feed .video-item').length >= 3,
    null,
    { timeout: 10000 },
  )
  const count = await page.locator('.discovery-feed .video-item').count()
  if (count >= 3) {
    record('progressive load (fast→full)', 'PASS', `${count} cards rendered`)
  } else {
    record('progressive load (fast→full)', 'FAIL', `expected ≥3, got ${count}`)
  }
}

async function checkKeywordChipsAndLangTag(page: Page) {
  log('=== Keyword chips + 🀄 lang tag ===')
  const text = await page.locator('.discovery-feed .profile-summary').innerText()
  const okKw = ['投資', '理財', 'etf', '美股'].every((kw) => text.includes(kw))
  const okLang = text.includes('🀄') || text.includes('中文')
  if (okKw && okLang) {
    record('keyword chips + lang tag', 'PASS', `chips="${text.replace(/\s+/g, ' ').slice(0, 80)}"`)
  } else {
    record('keyword chips + lang tag', 'FAIL', `okKw=${okKw} okLang=${okLang} text="${text}"`)
  }
}

async function checkNewChannelBadge(page: Page) {
  log('=== ★ 新頻道 badge ===')
  const badges = await page.locator('.discovery-feed .new-channel-badge').count()
  if (badges >= 3) {
    record('★ 新頻道 badge on every card', 'PASS', `${badges} badges`)
  } else {
    record('★ 新頻道 badge on every card', 'FAIL', `expected ≥3, got ${badges}`)
  }
}

async function checkSubscribeFadeOut(
  page: Page,
  state: { subscribeBodies: { channel_id: string }[] },
) {
  log('=== Subscribe → toast → fade out ===')
  const beforeCount = await page.locator('.discovery-feed .video-item').count()
  const targetChannelId = await page
    .locator('.discovery-feed .video-item:nth-child(2)')
    .evaluate((el) => {
      const btn = el.querySelector('.subscribe-btn') as HTMLButtonElement | null
      return btn ? '__has__' : null
    })
  if (targetChannelId === null) {
    record('subscribe click + fade-out', 'FAIL', '找不到第 2 張卡片的訂閱按鈕')
    return
  }

  await page.locator('.discovery-feed .video-item:nth-child(2) .subscribe-btn').click()
  // toast 應立刻出現
  await page.waitForSelector('.discovery-feed .toast.success', { timeout: 3000 }).catch(() => {})
  const hasToast = (await page.locator('.discovery-feed .toast.success').count()) > 0
  if (hasToast) {
    record('subscribe success → 顯示 toast', 'PASS', '')
  } else {
    record('subscribe success → 顯示 toast', 'FAIL', '未見到 .toast.success')
  }

  // 1.5s 後該卡應從清單移除
  try {
    await page.waitForFunction(
      (b) => document.querySelectorAll('.discovery-feed .video-item').length < b,
      beforeCount,
      { timeout: 4000 },
    )
    const after = await page.locator('.discovery-feed .video-item').count()
    record('subscribe success → 卡片淡出移除', 'PASS', `${beforeCount} → ${after}`)
  } catch {
    const after = await page.locator('.discovery-feed .video-item').count()
    record('subscribe success → 卡片淡出移除', 'FAIL', `仍是 ${after} 張`)
  }

  if (state.subscribeBodies.length > 0) {
    record(
      'POST /discovery/subscribe payload',
      'PASS',
      `channel_id="${state.subscribeBodies[0].channel_id}"`,
    )
  } else {
    record('POST /discovery/subscribe payload', 'FAIL', '0 payload captured')
  }
}

async function checkLoadMore(page: Page) {
  log('=== 🔄 換一批 → 追加新一批 ===')
  const before = await page.locator('.discovery-feed .video-item').count()
  await page.locator('.discovery-feed .load-more-btn').click()
  try {
    await page.waitForFunction(
      (b) => document.querySelectorAll('.discovery-feed .video-item').length > b,
      before,
      { timeout: 5000 },
    )
    const after = await page.locator('.discovery-feed .video-item').count()
    record('換一批追加新影片', 'PASS', `${before} → ${after}`)
  } catch {
    const after = await page.locator('.discovery-feed .video-item').count()
    record('換一批追加新影片', 'FAIL', `仍是 ${after} 張`)
  }
}

async function checkRefreshAnalysis(
  page: Page,
  state: { rebuildSeen: boolean[] },
) {
  log('=== 🔁 重新分析 → force_rebuild=true → 整批換掉 ===')
  // confirm() 已在 page init 改為回 true
  await page.locator('.discovery-feed .refresh-btn').click()
  try {
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('.discovery-feed .video-item')
        if (items.length === 0) return false
        return Array.from(items).some((el) => el.textContent?.includes('重新分析'))
      },
      null,
      { timeout: 8000 },
    )
    record('🔁 重新分析 → 整批換掉', 'PASS', '看到「重新分析」標題的新卡片')
  } catch {
    record('🔁 重新分析 → 整批換掉', 'FAIL', '未見「重新分析」開頭的影片')
  }

  if (state.rebuildSeen.some((v) => v === true)) {
    record('endpoint 收到 force_rebuild=true', 'PASS', '')
  } else {
    record('endpoint 收到 force_rebuild=true', 'FAIL', '沒看到 force_rebuild=true 的請求')
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify add-similar-channel-discovery')
  log('='.repeat(60))
  await preconditionCheck()
  log('[OK] precondition')

  const browser = await chromium.launch({ headless: false, slowMo: 120 })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  // confirm() 永遠回 true，跳過重新分析的彈窗
  await ctx.addInitScript(() => {
    // @ts-expect-error override for testing
    window.confirm = () => true
  })
  const page = await ctx.newPage()
  const state = await installDiscoveryMocks(ctx)

  try {
    await checkProgressiveLoad(page)
    await checkKeywordChipsAndLangTag(page)
    await checkNewChannelBadge(page)
    await checkSubscribeFadeOut(page, state)
    await checkLoadMore(page)
    await checkRefreshAnalysis(page, state)
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    record('FATAL', 'FAIL', msg)
  }

  await browser.close()

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.length - passed
  log('='.repeat(60))
  log(`完成：${passed} pass / ${failed} fail（共 ${results.length} 項）`)
  for (const r of results) log(`  [${r.status}] ${r.task}: ${r.detail}`)
  log('='.repeat(60))
  return failed === 0 ? 0 : 1
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
