import { chromium, type BrowserContext, type Route } from 'playwright'
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

function discoveryResponse(account: 'a' | 'b') {
  return {
    videos: [
      {
        video_id: `${account}-video`,
        title: `${account.toUpperCase()} discovery video`,
        url: `https://www.youtube.com/watch?v=${account}-video`,
        thumbnail: `https://i.ytimg.com/vi/${account}-video/mqdefault.jpg`,
        published: '2026-05-22T10:00:00Z',
        duration_seconds: 600,
        channel_id: `UC_${account}`,
        channel_title: `${account.toUpperCase()} Channel`,
        view_count: 1000,
      },
    ],
    cursor: 1,
    has_more: false,
    phase: 'fast',
    phase_done: ['fast'],
    profile_summary: {
      subscribed_count: 1,
      keywords: [`${account}-keyword`],
      categories: account === 'a' ? ['28'] : ['25'],
      lang: 'latin',
      analyzed_at: '2026-06-01T00:00:00Z',
    },
  }
}

async function installMocks(ctx: BrowserContext) {
  let currentAccount: 'a' | 'b' = 'a'
  const capturedSettings: unknown[] = []

  await ctx.route('**/version', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: 'test' }),
  }))
  await ctx.route('**/quota', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ used: 0, limit: 10000, date: '2026-06-01' }),
  }))
  await ctx.route('**/auth/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      logged_in: true,
      current_account: currentAccount === 'a' ? 'a@example.com' : 'b@example.com',
      accounts: ['a@example.com', 'b@example.com'],
    }),
  }))
  await ctx.route('**/subscriptions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      channels: [{
        subscription_id: `sub-${currentAccount}`,
        channel_id: `UC_sub_${currentAccount}`,
        title: `${currentAccount.toUpperCase()} Subscription`,
        thumbnail: '',
      }],
    }),
  }))
  await ctx.route('**/auth/switch', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { email?: string }
    currentAccount = body.email?.startsWith('b@') ? 'b' : 'a'
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await ctx.route('**/settings', async (route: Route) => {
    if (route.request().method() === 'PUT') {
      capturedSettings.push(JSON.parse(route.request().postData() ?? '{}'))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: route.request().postData() ?? '{}',
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output_path: 'C:\\Music',
        videos_per_channel: 5,
        latest_hours: 24,
        discovery_keyword_top_n: 8,
        min_duration_minutes: 3,
        max_duration_minutes: 60,
        normalize_target_db: 89,
        drive_root_folder: 'YT-MP3',
      }),
    })
  })
  await ctx.route('**/discovery/similar-channels*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(discoveryResponse(currentAccount)),
    })
  })

  return { capturedSettings }
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify discovery-per-account-keywords')
  log('='.repeat(60))
  await preconditionCheck()

  const browser = await chromium.launch({ headless: false, slowMo: 80 })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  const state = await installMocks(ctx)
  const page = await ctx.newPage()

  try {
    await page.goto(BASE_URL)
    await page.waitForSelector('.account-toggle')
    await page.locator('.discovery-btn').click()
    await page.waitForSelector('text=A discovery video')
    await page.locator('.account-toggle').click()
    await page.locator('.account-email', { hasText: 'b@example.com' }).click()
    await page.locator('.discovery-btn').click()
    await page.waitForSelector('text=B discovery video')
    const oldStillVisible = await page.locator('text=A discovery video').count()
    record(
      'account switch resets discovery feed',
      oldStillVisible === 0 ? 'PASS' : 'FAIL',
      oldStillVisible === 0 ? 'A feed cleared before loading B' : 'A feed still visible',
    )

    // SPA 內部導航；不可用 page.goto('/settings')，整頁請求會被 '**/settings' mock 攔成 JSON
    await page.locator('a[href="/settings"]').click()
    await page.waitForSelector('input[type="number"]')
    await page.locator('input[type="number"]').nth(2).fill('12')
    await page.locator('button').click()
    const body = state.capturedSettings.at(-1) as { discovery_keyword_top_n?: number } | undefined
    record(
      'settings saves discovery_keyword_top_n',
      body?.discovery_keyword_top_n === 12 ? 'PASS' : 'FAIL',
      JSON.stringify(body),
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    record('FATAL', 'FAIL', msg)
  }

  await browser.close()
  const failed = results.filter((r) => r.status === 'FAIL').length
  for (const r of results) log(`  [${r.status}] ${r.task}: ${r.detail}`)
  return failed === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
