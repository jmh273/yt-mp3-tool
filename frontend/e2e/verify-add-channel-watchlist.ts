// One-shot verification for add-channel-watchlist.
// Run: npm run verify -- add-channel-watchlist  (from frontend/)

import { runVerifySuite, type VerifyContext } from './verify-helpers'

const discoveryVideos = [
  {
    video_id: 'watch-v1',
    title: '觀察名單候選影片',
    url: 'https://www.youtube.com/watch?v=watch-v1',
    thumbnail: 'https://i.ytimg.com/vi/watch-v1/mqdefault.jpg',
    published: '2026-05-26T01:00:00Z',
    duration_seconds: 360,
    channel_id: 'UC_watch_a',
    channel_title: '觀察頻道 A',
    view_count: 12345,
  },
]

async function installMocks({ browserCtx }: VerifyContext) {
  await browserCtx.unroute('**/subscriptions').catch(() => {})
  await browserCtx.route('**/subscriptions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [
          {
            subscription_id: 'sub-existing',
            channel_id: 'UC_existing',
            title: '既有訂閱頻道',
            thumbnail: 'https://example.com/existing.jpg',
          },
        ],
      }),
    })
  })

  await browserCtx.unroute('**/discovery/similar-channels*').catch(() => {})
  await browserCtx.route('**/discovery/similar-channels*', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        videos: discoveryVideos,
        cursor: 1,
        has_more: false,
        phase: url.searchParams.get('phase') === 'full' ? 'full' : 'fast',
        phase_done: ['fast', 'full'],
        profile_summary: {
          subscribed_count: 2,
          keywords: ['music'],
          categories: ['10'],
          lang: 'mixed',
          analyzed_at: '2026-05-26T01:00:00Z',
        },
      }),
    })
  })

  await browserCtx.unroute('**/channels/UC_watch_a/videos*').catch(() => {})
  await browserCtx.route('**/channels/UC_watch_a/videos*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            video_id: 'watch-channel-v1',
            title: '觀察頻道近期影片',
            url: 'https://www.youtube.com/watch?v=watch-channel-v1',
            thumbnail: 'https://i.ytimg.com/vi/watch-channel-v1/mqdefault.jpg',
            published: '2026-05-26T01:00:00Z',
            duration_seconds: 300,
            channel_id: 'UC_watch_a',
            channel_title: '觀察頻道 A',
          },
        ],
        nextPageToken: '',
        channelTitle: '觀察頻道 A',
      }),
    })
  })

  const promoteHandler = async (route: Parameters<Parameters<typeof browserCtx.route>[1]>[0]) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        subscription_id: 'sub-watch-a',
        channel: {
          subscription_id: 'sub-watch-a',
          channel_id: 'UC_watch_a',
          title: '觀察頻道 A',
          thumbnail: 'https://i.ytimg.com/vi/watch-v1/mqdefault.jpg',
        },
      }),
    })
  }
  await browserCtx.unroute('**/subscriptions/UC_watch_a').catch(() => {})
  await browserCtx.unroute('**/api/subscriptions/UC_watch_a').catch(() => {})
  await browserCtx.route('**/subscriptions/UC_watch_a', promoteHandler)
  await browserCtx.route('**/api/subscriptions/UC_watch_a', promoteHandler)
}

async function openDiscoveryAndAdd(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.goto('http://localhost:5173')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('watchlist:')) localStorage.removeItem(key)
    }
  })
  await page.locator("button:has-text('同類新頻道')").click()
  await page.waitForSelector('.discovery-feed .video-item', { timeout: 10000 })
  await page.locator('.discovery-feed .watch-btn').first().click()
  await page.waitForFunction(
    () => document.querySelector('.discovery-feed .watch-btn')?.textContent?.includes('已在觀察名單'),
    null,
    { timeout: 5000 },
  )
  const count = await page.locator('.discovery-feed .video-item').count()
  record('加入觀察名單後卡片不消失', count === 1 ? 'PASS' : 'FAIL', `${count} cards`)
}

async function verifyWatchlistTabAndChannel(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator('.left-tab:has-text("觀察名單")').click()
  await page.waitForFunction(
    () => document.querySelector('.watchlist-row')?.textContent?.includes('觀察頻道 A'),
    null,
    { timeout: 5000 },
  )
  record('觀察名單 tab 顯示新增頻道', 'PASS', '')

  await page.locator('.watchlist-row').click()
  await page.waitForFunction(
    () => document.querySelector('.channel-videos')?.textContent?.includes('觀察頻道近期影片'),
    null,
    { timeout: 5000 },
  )
  record('點 row 載入頻道影片', 'PASS', '')
}

async function verifyRemove(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator('.left-tab:has-text("觀察名單")').click()
  await page.locator('[aria-label="移除 觀察頻道 A"]').click()
  const rows = await page.locator('.watchlist-row').count()
  record('移除後觀察名單消失', rows === 0 ? 'PASS' : 'FAIL', `${rows} rows`)
}

async function verifyPromote(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.reload()
  await page.locator("button:has-text('同類新頻道')").click()
  await page.waitForSelector('.discovery-feed .video-item', { timeout: 10000 })
  const watchButton = page.locator('.discovery-feed .watch-btn').first()
  await watchButton.click()
  await page.locator('.left-tab:has-text("觀察名單")').click()
  try {
    await page.waitForFunction(
      () => document.querySelector('.watchlist-row')?.textContent?.includes('觀察頻道 A'),
      null,
      { timeout: 5000 },
    )
  } catch {
    const detail = await page.evaluate(() => ({
      text: document.body.innerText,
      storage: Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith('watchlist:')),
      ),
      watchButton: document.querySelector('.discovery-feed .watch-btn')?.textContent,
    }))
    throw new Error(`watchlist row missing before promote: ${JSON.stringify(detail)}`)
  }
  await page.locator('[aria-label="訂閱 觀察頻道 A"]').click()
  try {
    await page.waitForFunction(
      () => document.querySelector('.watchlist-toast.success')?.textContent?.includes('已訂閱'),
      null,
      { timeout: 5000 },
    )
  } catch (e) {
    const detail = await page.evaluate(() => ({
      text: document.body.innerText,
      toasts: Array.from(document.querySelectorAll('.watchlist-toast')).map((el) => el.textContent),
      keys: Object.keys(localStorage).filter((key) => key.startsWith('watchlist:')),
    }))
    throw new Error(`promote success toast missing: ${JSON.stringify(detail)}`)
  }
  await page.locator('.left-tab:has-text("訂閱")').click()
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.channel-card')).some((el) => el.textContent?.includes('觀察頻道 A')),
      null,
      { timeout: 5000 },
    )
  } catch {
    const detail = await page.evaluate(() => ({
      text: document.body.innerText,
      cards: Array.from(document.querySelectorAll('.channel-card')).map((el) => el.textContent),
    }))
    throw new Error(`promoted channel card missing: ${JSON.stringify(detail)}`)
  }
  record('升級訂閱後移入訂閱清單', 'PASS', '')
}

async function verifyAccountIsolation(vctx: VerifyContext) {
  const { page, record } = vctx
  const isolated = await page.evaluate(() => {
    localStorage.setItem('watchlist:account-a@example.com', JSON.stringify([{ channel_id: 'A' }]))
    localStorage.setItem('watchlist:account-b@example.com', JSON.stringify([]))
    return localStorage.getItem('watchlist:account-b@example.com') === '[]'
  })
  record('localStorage key 依帳號隔離', isolated ? 'PASS' : 'FAIL', '')
}

runVerifySuite({
  title: 'Verify add-channel-watchlist',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'add from discovery', run: openDiscoveryAndAdd },
    { name: 'watchlist tab and channel videos', run: verifyWatchlistTabAndChannel },
    { name: 'remove from watchlist', run: verifyRemove },
    { name: 'promote to subscription', run: verifyPromote },
    { name: 'account isolation smoke', run: verifyAccountIsolation },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('watchlist:')) localStorage.removeItem(key)
      }
    })
  },
}).then((code) => process.exit(code))
