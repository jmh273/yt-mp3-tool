// One-shot verification for subscription-reconciliation (改動 B).
// Run: npm run verify -- subscription-reconciliation  (from frontend/)
//
// Covers:
//  - 左欄訂閱分頁「訂閱對帳」按鈕開啟精靈
//  - 上傳解析不出頻道的 CSV → error toast、無「開始比對」按鈕
//  - 上傳有效 subscriptions.csv → 顯示已解析頻道數
//  - 開始比對 → 後端回應渲染 Takeout／API／死頻道計數，並列出不同步頻道（含 YouTube 連結）

import { runVerifySuite, mockJson, type VerifyContext } from './verify-helpers'

const RESULT = {
  takeout_count: 3,
  api_count: 1,
  missing_count: 2,
  dead: ['UC_DEAD'],
  desynced: ['UC_SYNC'],
}

const VALID_CSV =
  'Channel Id,Channel Url,Channel Title\n' +
  'UC_OK,https://www.youtube.com/channel/UC_OK,正常頻道\n' +
  'UC_SYNC,https://www.youtube.com/channel/UC_SYNC,不同步頻道\n' +
  'UC_DEAD,https://www.youtube.com/channel/UC_DEAD,死頻道'

async function installMocks({ browserCtx }: VerifyContext) {
  await mockJson(browserCtx, '**/subscriptions', { channels: [] })
  await mockJson(browserCtx, '**/subscriptions/latest-dates', { latest_dates: {} })

  type Route = Parameters<Parameters<typeof browserCtx.route>[1]>[0]
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULT) })
  }
  await browserCtx.unroute('**/subscriptions/reconcile').catch(() => {})
  await browserCtx.unroute('**/api/subscriptions/reconcile').catch(() => {})
  await browserCtx.route('**/subscriptions/reconcile', handler)
  await browserCtx.route('**/api/subscriptions/reconcile', handler)
}

async function openWizard(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.goto('http://localhost:5173')
  await page.reload()
  await page.waitForSelector('.left-tab-content .reconcile-btn', { timeout: 10000 })
  await page.locator('.reconcile-btn').click()
  await page.waitForSelector('.reconcile-modal', { timeout: 5000 })
  const titleOk = await page.locator('.reconcile-head h2').textContent()
  record('開啟訂閱對帳精靈', (titleOk ?? '').includes('訂閱對帳') ? 'PASS' : 'FAIL', `"${titleOk?.trim()}"`)
}

async function verifyParseError(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator('.reconcile-modal input[type="file"]').setInputFiles({
    name: 'subscriptions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Channel Id,Channel Url,Channel Title\n', 'utf-8'),
  })
  await page.waitForSelector('.toast-host .toast.error', { timeout: 5000 })
  const text = (await page.locator('.toast-host .toast.error').first().textContent())?.trim() ?? ''
  record('解析不出頻道 → error toast', text.includes('無法') && text.includes('解析') ? 'PASS' : 'FAIL', `"${text}"`)
  const runVisible = await page.locator('.reconcile-run').count()
  record('解析失敗 → 無「開始比對」按鈕', runVisible === 0 ? 'PASS' : 'FAIL', `run buttons=${runVisible}`)
}

async function verifyParseAndReconcile(vctx: VerifyContext) {
  const { page, record } = vctx
  await page.locator('.reconcile-modal input[type="file"]').setInputFiles({
    name: 'subscriptions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(VALID_CSV, 'utf-8'),
  })
  await page.waitForSelector('.reconcile-ready', { timeout: 5000 })
  const parsed = (await page.locator('.reconcile-ready').textContent())?.trim() ?? ''
  record('上傳有效 CSV → 顯示已解析 3 個頻道', parsed.includes('3') ? 'PASS' : 'FAIL', `"${parsed}"`)

  await page.locator('.reconcile-run').click()
  await page.waitForSelector('.reconcile-summary', { timeout: 5000 })
  const summary = (await page.locator('.reconcile-summary').textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  const summaryOk = summary.includes('Takeout：3') && summary.includes('API：1') && summary.includes('死頻道：1')
  record('比對結果摘要（Takeout：3／API：1／死頻道：1）', summaryOk ? 'PASS' : 'FAIL', `"${summary}"`)

  // 不同步頻道列出，含 YouTube 連結與標題
  const linkExists = await page.locator('a[href="https://www.youtube.com/channel/UC_SYNC"]').count()
  const linkText = (await page.locator('a[href="https://www.youtube.com/channel/UC_SYNC"]').first().textContent())?.trim() ?? ''
  record('列出不同步頻道（連結 + 標題）', linkExists > 0 && linkText.includes('不同步頻道') ? 'PASS' : 'FAIL', `links=${linkExists}, "${linkText}"`)
}

async function verifyResyncHelpers(vctx: VerifyContext) {
  const { page, record } = vctx
  // 手勢說明 + 漏訂警告
  const note = (await page.locator('.resync-note').textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  const noteOk = note.includes('取消訂閱') && note.includes('退訂後務必再次訂閱')
  record('不同步區顯示退訂再訂手勢 + 漏訂警告', noteOk ? 'PASS' : 'FAIL', `"${note.slice(0, 40)}..."`)

  // 進度初始 0 / 1
  const before = (await page.locator('.resync-progress').textContent())?.trim() ?? ''
  record('已處理進度初始為 0 / 1', before.includes('已處理 0 / 1') ? 'PASS' : 'FAIL', `"${before}"`)

  // 勾「已處理」→ 進度 1 / 1 + 寫入 localStorage
  await page.locator('.resync-done input[type="checkbox"]').first().check()
  await page.waitForFunction(
    () => /已處理 1 \/ 1/.test(document.querySelector('.resync-progress')?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  const persisted = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith('reconcile-done:') && k.endsWith(':UC_SYNC') && localStorage.getItem(k) === '1'),
  )
  record('勾「已處理」→ 進度 1/1 且持久化 localStorage', persisted ? 'PASS' : 'FAIL', `persisted=${persisted}`)

  // 「重新對帳」按鈕重用 ids（不需重新上傳），且勾選狀態保留
  const rerun = page.locator('.reconcile-rerun')
  const rerunText = (await rerun.textContent())?.trim() ?? ''
  await rerun.click()
  await page.waitForSelector('.reconcile-summary', { timeout: 5000 })
  const stillDone = (await page.locator('.resync-progress').textContent())?.trim() ?? ''
  record('「重新對帳」重用 ids 並保留已處理狀態', rerunText.includes('重新對帳') && stillDone.includes('已處理 1 / 1') ? 'PASS' : 'FAIL', `"${rerunText}" / "${stillDone}"`)
}

runVerifySuite({
  title: 'Verify subscription-reconciliation',
  tasks: [
    { name: 'install mocks', run: installMocks },
    { name: 'open wizard', run: openWizard },
    { name: 'parse error toast', run: verifyParseError },
    { name: 'parse + reconcile', run: verifyParseAndReconcile },
    { name: 'resync helpers (1b)', run: verifyResyncHelpers },
  ],
  cleanup: async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('reconcile-done:')) localStorage.removeItem(key)
      }
    })
  },
}).then((code) => process.exit(code))
