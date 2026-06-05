// One-shot verification for search-channels.
// Run: npm run verify -- search-channels  (from frontend/)
//
// Covers:
//  - 勾「頻道」搜尋 → 頻道區（排在影片區之前）顯示頻道卡
//  - 頻道卡「加入觀察名單」→ 按鈕 disabled
//  - 頻道卡「訂閱」→ 補進左欄訂閱清單（訂閱 (n) +1）、按鈕轉已訂閱 disabled
//  - 已訂閱頻道的「訂閱」按鈕一開始即 disabled

import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'

async function installMocks({ browserCtx }: VerifyContext) {
  // 初始訂閱 1 筆（UC_existing）→ 訂閱 (1)
  await mockJson(browserCtx, '**/subscriptions', {
    channels: [
      { subscription_id: 's-exist', channel_id: 'UC_existing', title: '既有訂閱頻道', thumbnail: 'https://example.com/e.jpg' },
    ],
  })
  await mockJson(browserCtx, '**/subscriptions/latest-dates', { latest_dates: {} })

  // 頻道搜尋：一筆未訂閱（UC_new）、一筆已訂閱（UC_existing）
  await mockJson(browserCtx, '**/search-channels*', {
    channels: [
      { channel_id: 'UC_new', title: '新頻道', thumbnail: 'https://i.ytimg.com/vi/n/mqdefault.jpg' },
      { channel_id: 'UC_existing', title: '既有訂閱頻道', thumbnail: 'https://example.com/e.jpg' },
    ],
  })

  // 訂閱 UC_new 成功
  const subscribeHandler = async (route: Parameters<Parameters<typeof browserCtx.route>[1]>[0]) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        subscription_id: 'sub-UC_new',
        channel: { subscription_id: 'sub-UC_new', channel_id: 'UC_new', title: '新頻道', thumbnail: 'https://i.ytimg.com/vi/n/mqdefault.jpg' },
      }),
    })
  }
  await browserCtx.unroute('**/subscriptions/UC_new').catch(() => {})
  await browserCtx.unroute('**/api/subscriptions/UC_new').catch(() => {})
  await browserCtx.route('**/subscriptions/UC_new', subscribeHandler)
  await browserCtx.route('**/api/subscriptions/UC_new', subscribeHandler)
}

async function openSearchAndSearchChannels(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.goto('http://localhost:5173')
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('watchlist:')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  // 初始訂閱數 (1)
  await page.waitForFunction(
    () => /訂閱 \(1\)/.test(document.querySelector('.left-tab')?.textContent ?? ''),
    null,
    { timeout: 10000 },
  )
  await page.locator("button:has-text('搜尋影片')").click()
  // 勾「頻道」checkbox（第 2 個 checkbox）
  await page.locator('.scope-row input[type="checkbox"]').nth(1).check()
  await page.locator('.search-feed input[type="text"]').fill('lofi')
  await page.locator('.search-feed .search-btn').click()
  await page.waitForSelector('.channel-section .channel-card', { timeout: 10000 })
  const cards = await page.locator('.channel-section .channel-card').count()
  record('頻道搜尋顯示頻道卡', cards === 2 ? 'PASS' : 'FAIL', `${cards} cards`)

  // 頻道區排在影片區之前
  const order = await page.evaluate(() => {
    const ch = document.querySelector('.channel-section')
    const vid = document.querySelector('.video-section')
    if (!ch || !vid) return ch ? 'channel-only' : 'missing'
    return ch.compareDocumentPosition(vid) & Node.DOCUMENT_POSITION_FOLLOWING ? 'channel-first' : 'video-first'
  })
  record('頻道區排在影片區之前', order === 'channel-first' || order === 'channel-only' ? 'PASS' : 'FAIL', order)
}

async function verifyAlreadySubscribedDisabled(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '既有訂閱頻道' })
  const btn = card.locator('.subscribe-btn')
  const disabled = await btn.evaluate((el) => (el as HTMLButtonElement).disabled)
  const text = (await btn.textContent())?.trim() ?? ''
  record('已訂閱頻道訂閱鈕 disabled', disabled && text.includes('已訂閱') ? 'PASS' : 'FAIL', `disabled=${disabled}, "${text}"`)
}

async function verifyAddWatchlist(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '新頻道' })
  await card.locator('.watch-btn').click()
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('.channel-section .channel-card'))
      const c = cards.find((el) => el.textContent?.includes('新頻道'))
      const b = c?.querySelector('.watch-btn') as HTMLButtonElement | undefined
      return !!b && b.disabled && (b.textContent ?? '').includes('已在觀察名單')
    },
    null,
    { timeout: 5000 },
  )
  record('頻道卡加入觀察名單後 disabled', 'PASS', '')
}

async function verifySubscribe(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '新頻道' })
  await card.locator('.subscribe-btn').click()
  // 訂閱清單補進 → 訂閱 (2)
  await page.waitForFunction(
    () => /訂閱 \(2\)/.test(document.querySelectorAll('.left-tab')[0]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  record('訂閱成功後訂閱分頁 (2)', 'PASS', '')
  // 該卡訂閱鈕轉已訂閱 disabled
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('.channel-section .channel-card'))
      const c = cards.find((el) => el.textContent?.includes('新頻道'))
      const b = c?.querySelector('.subscribe-btn') as HTMLButtonElement | undefined
      return !!b && b.disabled && (b.textContent ?? '').includes('已訂閱')
    },
    null,
    { timeout: 5000 },
  )
  record('訂閱後該卡訂閱鈕 disabled', 'PASS', '')
}

runVerifySuite({
  title: 'Verify search-channels',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'search channels', run: openSearchAndSearchChannels },
    { name: 'already-subscribed disabled', run: verifyAlreadySubscribedDisabled },
    { name: 'add to watchlist', run: verifyAddWatchlist },
    { name: 'subscribe new channel', run: verifySubscribe },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('watchlist:')) localStorage.removeItem(key)
      }
    })
  },
}).then((code) => process.exit(code))
