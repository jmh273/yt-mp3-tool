// One-shot verification for watchlist-add-and-channel-count.
// Run: npm run verify -- watchlist-add-and-channel-count  (from frontend/)
//
// Covers:
//  - 「加入觀察名單」按鈕 in 發燒影片 / 搜尋影片 / 網址下載 feeds
//  - 缺 channel_id 時按鈕 disabled、點擊 no-op
//  - 左欄分頁標題顯示「訂閱 (n)」「觀察名單 (n)」並即時更新

import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'

function video(id: string, channelId: string, channelTitle: string) {
  return {
    video_id: id,
    title: `影片 ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    published: '2026-05-26T01:00:00Z',
    duration_seconds: 300,
    channel_id: channelId,
    channel_title: channelTitle,
    view_count: 1000,
  }
}

async function installMocks({ browserCtx }: VerifyContext) {
  // 訂閱清單固定 2 筆 → 訂閱 (2)
  await mockJson(browserCtx, '**/subscriptions', {
    channels: [
      { subscription_id: 's1', channel_id: 'UC_sub1', title: '訂閱頻道一', thumbnail: 'https://example.com/1.jpg' },
      { subscription_id: 's2', channel_id: 'UC_sub2', title: '訂閱頻道二', thumbnail: 'https://example.com/2.jpg' },
    ],
  })
  await mockJson(browserCtx, '**/subscriptions/latest-dates', { latest_dates: {} })

  // 發燒影片：第一筆有 channel_id、第二筆缺 channel_id
  await mockJson(browserCtx, '**/trending-videos/categories', {
    categories: [{ id: null, label: '全部' }],
  })
  await mockJson(browserCtx, '**/trending-videos', {
    videos: [
      video('t1', 'UC_trend', '發燒頻道'),
      video('t2', '', '無頻道ID'),
    ],
    next_page_token: null,
  })

  // 搜尋影片
  await mockJson(browserCtx, '**/search-videos*', {
    videos: [video('q1', 'UC_search', '搜尋頻道')],
  })

  // 網址下載預覽
  await mockJson(browserCtx, '**/url-preview*', {
    videos: [video('u1', 'UC_url', '網址頻道')],
  })
}

async function resetWatchlist(vctx: VerifyContext) {
  const { page } = vctx
  await page.goto('http://localhost:5173')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('watchlist:')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  // 等訂閱清單載入完（訂閱 tab 數字出現）
  await page.waitForFunction(
    () => /訂閱 \(\d+\)/.test(document.querySelector('.left-tab')?.textContent ?? ''),
    null,
    { timeout: 10000 },
  )
}

async function verifyInitialCounts(vctx: VerifyContext) {
  const { page, record } = vctx
  const subText = (await page.locator('.left-tab').nth(0).textContent())?.trim() ?? ''
  const watchText = (await page.locator('.left-tab').nth(1).textContent())?.trim() ?? ''
  record('訂閱分頁顯示 (2)', subText.includes('(2)') ? 'PASS' : 'FAIL', subText)
  record('觀察名單分頁顯示 (0)', watchText.includes('(0)') ? 'PASS' : 'FAIL', watchText)
}

async function verifyTrendingAdd(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator("button:has-text('發燒影片')").click()
  await page.waitForSelector('.trending-videos .video-item', { timeout: 10000 })

  const buttons = page.locator('.trending-videos .watch-btn')
  // 第一筆（有 channel_id）：點擊後 disabled + 文字「已加入觀察名單」
  await buttons.nth(0).click()
  await page.waitForFunction(
    () => {
      const b = document.querySelectorAll('.trending-videos .watch-btn')[0] as HTMLButtonElement | undefined
      return !!b && b.disabled && (b.textContent ?? '').includes('已在觀察名單')
    },
    null,
    { timeout: 5000 },
  )
  record('發燒影片：加入後按鈕 disabled + 已加入', 'PASS', '')

  // 第二筆（缺 channel_id）：一開始就 disabled，點擊 no-op
  const secondDisabled = await buttons.nth(1).evaluate((el) => (el as HTMLButtonElement).disabled)
  await buttons.nth(1).click({ force: true }).catch(() => {})
  const watchlistLen = await page.evaluate(() => {
    const raw = localStorage.getItem('watchlist:shared')
    return raw ? (JSON.parse(raw) as unknown[]).length : 0
  })
  record(
    '發燒影片：缺 channel_id 按鈕 disabled 且不入名單',
    secondDisabled && watchlistLen === 1 ? 'PASS' : 'FAIL',
    `disabled=${secondDisabled}, watchlistLen=${watchlistLen}`,
  )

  // 觀察名單分頁即時更新為 (1)
  await page.waitForFunction(
    () => /觀察名單 \(1\)/.test(document.querySelectorAll('.left-tab')[1]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  record('加入後觀察名單分頁更新為 (1)', 'PASS', '')
}

async function verifySearchAdd(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator("button:has-text('搜尋影片')").click()
  await page.locator('.search-feed input').fill('lofi')
  await page.locator('.search-feed .search-btn').click()
  await page.waitForSelector('.search-feed .video-item', { timeout: 10000 })
  await page.locator('.search-feed .watch-btn').first().click()
  await page.waitForFunction(
    () => /觀察名單 \(2\)/.test(document.querySelectorAll('.left-tab')[1]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  record('搜尋影片：加入後觀察名單 (2)', 'PASS', '')
}

async function verifyUrlAdd(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator("button:has-text('網址下載')").click()
  await page.locator('.url-feed .search-input').fill('https://www.youtube.com/watch?v=u1')
  await page.locator('.url-feed .search-btn').click()
  await page.waitForSelector('.url-feed .video-item', { timeout: 10000 })
  await page.locator('.url-feed .watch-btn').first().click()
  await page.waitForFunction(
    () => /觀察名單 \(3\)/.test(document.querySelectorAll('.left-tab')[1]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  record('網址下載：加入後觀察名單 (3)', 'PASS', '')
}

runVerifySuite({
  title: 'Verify watchlist-add-and-channel-count',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'reset watchlist', run: resetWatchlist },
    { name: 'initial tab counts', run: verifyInitialCounts },
    { name: 'add from trending + missing channel_id', run: verifyTrendingAdd },
    { name: 'add from search', run: verifySearchAdd },
    { name: 'add from url download', run: verifyUrlAdd },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('watchlist:')) localStorage.removeItem(key)
      }
    })
  },
}).then((code) => process.exit(code))
