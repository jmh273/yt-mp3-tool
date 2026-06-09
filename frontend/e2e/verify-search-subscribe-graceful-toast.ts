// One-shot verification for search-subscribe-graceful-toast (改動 A).
// Run: npm run verify -- search-subscribe-graceful-toast  (from frontend/)
//
// Covers:
//  - 搜尋頻道卡訂閱成功 → 綠色 success toast「已訂閱「X」」、補進左欄訂閱清單、按鈕 disabled
//  - 訂閱回 409 subscriptionDuplicate → info toast「「X」此帳號已訂閱」、樂觀補進清單、按鈕 disabled、不出現 error toast
//  - 其他錯誤（500）→ 紅色 error toast 顯示後端 detail、不補進清單

import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'

const OK = 'UC_ok'
const DUP = 'UC_dup'
const ERR = 'UC_err'

async function installMocks({ browserCtx }: VerifyContext) {
  // 初始無訂閱 → 訂閱 (0)
  await mockJson(browserCtx, '**/subscriptions', { channels: [] })
  await mockJson(browserCtx, '**/subscriptions/latest-dates', { latest_dates: {} })

  // 頻道搜尋：三筆未訂閱頻道
  await mockJson(browserCtx, '**/search-channels*', {
    channels: [
      { channel_id: OK, title: '成功頻道', thumbnail: 'https://i.ytimg.com/vi/o/mqdefault.jpg' },
      { channel_id: DUP, title: '已訂閱頻道', thumbnail: 'https://i.ytimg.com/vi/d/mqdefault.jpg' },
      { channel_id: ERR, title: '錯誤頻道', thumbnail: 'https://i.ytimg.com/vi/e/mqdefault.jpg' },
    ],
  })

  // 每個頻道的 POST /subscriptions/{id} 回不同狀態
  type Route = Parameters<Parameters<typeof browserCtx.route>[1]>[0]
  const handler = (status: number, body: unknown) => async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  }

  const register = async (id: string, status: number, body: unknown) => {
    const h = handler(status, body)
    await browserCtx.unroute(`**/subscriptions/${id}`).catch(() => {})
    await browserCtx.unroute(`**/api/subscriptions/${id}`).catch(() => {})
    await browserCtx.route(`**/subscriptions/${id}`, h)
    await browserCtx.route(`**/api/subscriptions/${id}`, h)
  }

  await register(OK, 200, {
    success: true,
    subscription_id: `sub-${OK}`,
    channel: { subscription_id: `sub-${OK}`, channel_id: OK, title: '成功頻道', thumbnail: 'https://i.ytimg.com/vi/o/mqdefault.jpg' },
  })
  await register(DUP, 409, {
    detail: '訂閱失敗：<HttpError 409 ... "The subscription that you are trying to create already exists." reason: "subscriptionDuplicate">',
  })
  await register(ERR, 500, { detail: '訂閱失敗：配額已用盡' })
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
  await page.waitForFunction(
    () => /訂閱 \(0\)/.test(document.querySelector('.left-tab')?.textContent ?? ''),
    null,
    { timeout: 10000 },
  )
  await page.locator("button:has-text('搜尋影片')").click()
  await page.locator('.scope-row input[type="checkbox"]').nth(1).check()
  await page.locator('.search-feed input[type="text"]').fill('lofi')
  await page.locator('.search-feed .search-btn').click()
  await page.waitForSelector('.channel-section .channel-card', { timeout: 10000 })
  const cards = await page.locator('.channel-section .channel-card').count()
  record('頻道搜尋顯示 3 張頻道卡', cards === 3 ? 'PASS' : 'FAIL', `${cards} cards`)
}

async function verifySubscribeSuccess(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '成功頻道' })
  await card.locator('.subscribe-btn').click()
  // success toast
  await page.waitForSelector('.toast-host .toast.success', { timeout: 5000 })
  const text = (await page.locator('.toast-host .toast.success').first().textContent())?.trim() ?? ''
  record('成功 → success toast「已訂閱「成功頻道」」', text.includes('已訂閱') && text.includes('成功頻道') ? 'PASS' : 'FAIL', `"${text}"`)
  // 訂閱 (1)
  await page.waitForFunction(
    () => /訂閱 \(1\)/.test(document.querySelectorAll('.left-tab')[0]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  record('成功 → 訂閱分頁 (1)', 'PASS', '')
  // 按鈕轉已訂閱 disabled
  const disabled = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.channel-section .channel-card')).find((el) => el.textContent?.includes('成功頻道'))
    const b = c?.querySelector('.subscribe-btn') as HTMLButtonElement | undefined
    return !!b && b.disabled && (b.textContent ?? '').includes('已訂閱')
  })
  record('成功 → 該卡訂閱鈕 disabled', disabled ? 'PASS' : 'FAIL', `disabled=${disabled}`)
}

async function verifySubscribeDuplicate(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '已訂閱頻道' })
  await card.locator('.subscribe-btn').click()
  // info toast（非 error）
  await page.waitForSelector('.toast-host .toast.info', { timeout: 5000 })
  const text = (await page.locator('.toast-host .toast.info').first().textContent())?.trim() ?? ''
  record('409 → info toast「此帳號已訂閱」', text.includes('已訂閱頻道') && text.includes('此帳號已訂閱') ? 'PASS' : 'FAIL', `"${text}"`)
  // 不應有 error toast
  const errCount = await page.locator('.toast-host .toast.error').count()
  record('409 → 不出現 error toast', errCount === 0 ? 'PASS' : 'FAIL', `error toasts=${errCount}`)
  // 樂觀補進清單 → 訂閱 (2)、按鈕 disabled
  await page.waitForFunction(
    () => /訂閱 \(2\)/.test(document.querySelectorAll('.left-tab')[0]?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  const disabled = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.channel-section .channel-card')).find((el) => el.textContent?.includes('已訂閱頻道'))
    const b = c?.querySelector('.subscribe-btn') as HTMLButtonElement | undefined
    return !!b && b.disabled && (b.textContent ?? '').includes('已訂閱')
  })
  record('409 → 樂觀補進清單 (2) 且該卡 disabled', disabled ? 'PASS' : 'FAIL', `disabled=${disabled}`)
}

async function verifySubscribeError(vctx: VerifyContext) {
  const { page, record } = vctx
  const card = page.locator('.channel-section .channel-card', { hasText: '錯誤頻道' })
  await card.locator('.subscribe-btn').click()
  // error toast 顯示 detail
  await page.waitForSelector('.toast-host .toast.error', { timeout: 5000 })
  const text = (await page.locator('.toast-host .toast.error').first().textContent())?.trim() ?? ''
  record('500 → error toast 顯示後端 detail', text.includes('配額已用盡') ? 'PASS' : 'FAIL', `"${text}"`)
  // 不補進清單 → 仍 (2)、該卡訂閱鈕仍可按（未 disabled）
  const stillTwo = await page.evaluate(() => /訂閱 \(2\)/.test(document.querySelectorAll('.left-tab')[0]?.textContent ?? ''))
  record('500 → 不補進清單（仍為 2）', stillTwo ? 'PASS' : 'FAIL', '')
  const notDisabled = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.channel-section .channel-card')).find((el) => el.textContent?.includes('錯誤頻道'))
    const b = c?.querySelector('.subscribe-btn') as HTMLButtonElement | undefined
    return !!b && !b.disabled
  })
  record('500 → 該卡訂閱鈕未被標記已訂閱', notDisabled ? 'PASS' : 'FAIL', `enabled=${notDisabled}`)
}

runVerifySuite({
  title: 'Verify search-subscribe-graceful-toast',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'search channels', run: openSearchAndSearchChannels },
    { name: 'subscribe success', run: verifySubscribeSuccess },
    { name: 'subscribe duplicate (409)', run: verifySubscribeDuplicate },
    { name: 'subscribe error (500)', run: verifySubscribeError },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('watchlist:')) localStorage.removeItem(key)
      }
    })
  },
}).then((code) => process.exit(code))
