// One-shot verification for configurable-sequence-prefix (tasks 6.1–6.7).
// Run: npx tsx e2e/verify-configurable-sequence-prefix.ts  (from frontend/)
//
// Mocks /url-preview, /download/next-seq, POST /download, and SSE so we exercise
// the full UX without touching real quotas or producing real files.

import { chromium, type Page, type Route, type Request, type BrowserContext } from 'playwright'
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

const FAKE_VIDEOS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    video_id: `fakeid${String(i).padStart(2, '0')}`,
    title: `Fake Video ${i + 1}`,
    url: `https://www.youtube.com/watch?v=fakeid${String(i).padStart(2, '0')}`,
    thumbnail: `https://i.ytimg.com/vi/fakeid${String(i).padStart(2, '0')}/mqdefault.jpg`,
    published: '',
    duration_seconds: 180 + i,
    channel_id: 'UC_fake',
    channel_title: 'Fake Channel',
  }))

// Helper: install URL-preview mock returning the given count of fake videos.
async function mockUrlPreview(ctx: BrowserContext, count: number) {
  await ctx.unroute('**/url-preview*')
  await ctx.route('**/url-preview*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ videos: FAKE_VIDEOS(count) }),
    })
  })
}

// Helper: install /download/next-seq mock. Pass an array of responses; each call
// returns the next one in order, and after exhaustion repeats the last one.
async function mockNextSeq(
  ctx: BrowserContext,
  responses: { next_seq: string; existing: number[] }[],
) {
  await ctx.unroute('**/download/next-seq')
  let i = 0
  await ctx.route('**/download/next-seq', async (route: Route) => {
    const r = responses[Math.min(i, responses.length - 1)]
    i += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(r),
    })
  })
}

// Helper: install POST /download mock; captures payload, returns fake task_id.
async function mockPostDownload(
  ctx: BrowserContext,
): Promise<{ payloads: Record<string, unknown>[] }> {
  const state = { payloads: [] as Record<string, unknown>[] }
  await ctx.unroute('**/download')
  await ctx.route('**/download', async (route: Route, req: Request) => {
    if (req.method() === 'POST') {
      try {
        state.payloads.push(req.postDataJSON())
      } catch {
        state.payloads.push({})
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task_id: 'verify-task' }),
      })
    } else {
      await route.continue()
    }
  })
  return state
}

// Helper: mock SSE progress endpoint to immediately stream a `done` event.
async function mockProgressSseDone(ctx: BrowserContext, videoIds: string[]) {
  await ctx.unroute('**/download/progress/**')
  const items: Record<string, unknown> = {}
  for (const vid of videoIds) {
    items[vid] = { title: vid, percent: 100, status: 'done' }
  }
  const body =
    `data: ${JSON.stringify({ status: 'done', items })}\n\n`
  await ctx.route('**/download/progress/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })
}

async function openUrlFeedAndParse(page: Page, fakeUrl = 'https://www.youtube.com/playlist?list=fake') {
  await page.locator("button:has-text('網址下載')").first().click()
  await page.waitForSelector('.url-feed input.search-input', { timeout: 5000 })
  await page.locator('.url-feed input.search-input').fill(fakeUrl)
  await page.locator(".url-feed button:has-text('解析')").click()
  await page.waitForSelector('.url-feed .video-item', { timeout: 10000 })
}

async function checkFirstN(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page
      .locator(`.url-feed .video-item:nth-child(${i + 1}) input[type='checkbox']`)
      .check()
  }
}

async function uncheckAll(page: Page) {
  const boxes = page.locator('.url-feed .video-item input[type="checkbox"]')
  const total = await boxes.count()
  for (let i = 0; i < total; i++) {
    const b = boxes.nth(i)
    if (await b.isChecked()) await b.uncheck()
  }
}

async function readStartSeqValue(page: Page): Promise<string> {
  return (await page.locator('.start-seq-input').inputValue()) ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

async function task61(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.1: 預填 startSeqInput 從 /download/next-seq ===')
  await mockUrlPreview(ctx, 5)
  await mockNextSeq(ctx, [{ next_seq: '08', existing: [1, 2, 3, 5, 7] }])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 1)
  await page.waitForSelector('.selected-panel', { timeout: 5000 })
  // 等 fetchNextSeq 完成
  await page.waitForTimeout(500)
  const val = await readStartSeqValue(page)
  if (val === '08') {
    record('6.1 startSeqInput 預填 next_seq', 'PASS', `value="${val}"`)
  } else {
    record('6.1 startSeqInput 預填 next_seq', 'FAIL', `expected "08", got "${val}"`)
  }
  await uncheckAll(page)
}

async function task62(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.2: 勾選盒切換 + localStorage 持久化 ===')
  // 設一個乾淨初值
  await page.evaluate(() => localStorage.removeItem('yt_mp3_seq_enabled'))
  await mockUrlPreview(ctx, 3)
  await mockNextSeq(ctx, [{ next_seq: '01', existing: [] }])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 1)
  await page.waitForSelector('.selected-panel .seq-checkbox-label', { timeout: 5000 })

  // 預設應勾選；start-seq-input 可見
  const initiallyChecked = await page
    .locator('.seq-checkbox-label input[type="checkbox"]')
    .isChecked()
  const inputVisibleBefore = await page.locator('.start-seq-input').isVisible()
  if (initiallyChecked && inputVisibleBefore) {
    record('6.2 預設勾選 + start-seq-input 可見', 'PASS', '兩者皆 true')
  } else {
    record(
      '6.2 預設勾選 + start-seq-input 可見',
      'FAIL',
      `checked=${initiallyChecked} visible=${inputVisibleBefore}`,
    )
  }

  // 取消勾選 → input 消失
  await page.locator('.seq-checkbox-label input[type="checkbox"]').uncheck()
  await page.waitForTimeout(200)
  const inputVisibleAfter = await page.locator('.start-seq-input').isVisible()
  if (!inputVisibleAfter) {
    record('6.2 取消勾選後 start-seq-input 消失', 'PASS', 'input 不可見')
  } else {
    record('6.2 取消勾選後 start-seq-input 消失', 'FAIL', 'input 仍可見')
  }

  // localStorage 已寫入 false
  const lsVal = await page.evaluate(() => localStorage.getItem('yt_mp3_seq_enabled'))
  if (lsVal === 'false') {
    record('6.2 localStorage = "false"', 'PASS', `value=${lsVal}`)
  } else {
    record('6.2 localStorage = "false"', 'FAIL', `value=${lsVal}`)
  }

  // Reload，再勾一支影片，確認 checkbox 維持 unchecked
  await page.reload()
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 1)
  await page.waitForSelector('.selected-panel .seq-checkbox-label', { timeout: 5000 })
  const afterReloadChecked = await page
    .locator('.seq-checkbox-label input[type="checkbox"]')
    .isChecked()
  if (!afterReloadChecked) {
    record('6.2 reload 後 checkbox 仍 unchecked（跨會話保留）', 'PASS', '')
  } else {
    record(
      '6.2 reload 後 checkbox 仍 unchecked（跨會話保留）',
      'FAIL',
      'checkbox 自動變回 checked',
    )
  }

  // 還原預設 = true，避免影響後續 task
  await page.locator('.seq-checkbox-label input[type="checkbox"]').check()
  await page.waitForTimeout(100)
  await uncheckAll(page)
}

async function task63(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.3: start_seq="100" 送出 payload ===')
  await mockUrlPreview(ctx, 5)
  await mockNextSeq(ctx, [{ next_seq: '01', existing: [] }])
  const dlState = await mockPostDownload(ctx)
  await mockProgressSseDone(ctx, [])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 3)
  await page.waitForSelector('.start-seq-input', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.start-seq-input').fill('100')
  await page.locator('.selected-panel button.dl').click()
  await page.waitForTimeout(800)

  if (dlState.payloads.length === 0) {
    record('6.3 POST /download 被送出', 'FAIL', '0 payload')
    return
  }
  const payload = dlState.payloads[0]
  const okSeqEnabled = payload.seq_enabled === true
  const okStartSeq = payload.start_seq === '100'
  const okVideosLen = Array.isArray(payload.videos) && (payload.videos as unknown[]).length === 3
  if (okSeqEnabled && okStartSeq && okVideosLen) {
    record(
      '6.3 payload {seq_enabled:true, start_seq:"100", videos:3}',
      'PASS',
      JSON.stringify({ seq_enabled: payload.seq_enabled, start_seq: payload.start_seq, n: (payload.videos as unknown[]).length }),
    )
  } else {
    record(
      '6.3 payload {seq_enabled:true, start_seq:"100", videos:3}',
      'FAIL',
      `got seq_enabled=${payload.seq_enabled} start_seq=${payload.start_seq} videos.length=${(payload.videos as unknown[])?.length}`,
    )
  }
  await page.waitForTimeout(500)
  await page.goto(BASE_URL)  // reset
}

async function task64(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.4: 衝突警告（existing=[5], start="04", count=4）===')
  await mockUrlPreview(ctx, 5)
  await mockNextSeq(ctx, [{ next_seq: '06', existing: [5] }])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 4)
  await page.waitForSelector('.start-seq-input', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.start-seq-input').fill('04')
  await page.waitForTimeout(300)

  const warnText = await page.locator('.seq-warn').innerText().catch(() => '')
  if (/05/.test(warnText) && warnText.includes('重複')) {
    record('6.4 衝突警告顯示「05」', 'PASS', `text="${warnText.trim()}"`)
  } else {
    record('6.4 衝突警告顯示「05」', 'FAIL', `text="${warnText.trim()}"`)
  }

  // 下載按鈕仍可按
  const disabled = await page.locator('.selected-panel button.dl').isDisabled()
  if (!disabled) {
    record('6.4 下載按鈕仍可按（後端不阻擋衝突）', 'PASS', '')
  } else {
    record('6.4 下載按鈕仍可按', 'FAIL', '按鈕為 disabled')
  }
  await page.goto(BASE_URL)
}

async function task65(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.5: start_seq="999" 送出 payload（auto-widen 由後端負責）===')
  await mockUrlPreview(ctx, 3)
  await mockNextSeq(ctx, [{ next_seq: '01', existing: [] }])
  const dlState = await mockPostDownload(ctx)
  await mockProgressSseDone(ctx, [])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 3)
  await page.waitForSelector('.start-seq-input', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.start-seq-input').fill('999')
  await page.locator('.selected-panel button.dl').click()
  await page.waitForTimeout(800)

  if (dlState.payloads.length === 0) {
    record('6.5 POST /download 被送出', 'FAIL', '0 payload')
    return
  }
  const payload = dlState.payloads[0]
  if (payload.start_seq === '999' && payload.seq_enabled === true) {
    record('6.5 payload start_seq="999"', 'PASS', `(後端 unit tests 已驗證 999→1000→1001 擴位行為)`)
  } else {
    record(
      '6.5 payload start_seq="999"',
      'FAIL',
      `got seq_enabled=${payload.seq_enabled} start_seq=${payload.start_seq}`,
    )
  }
  await page.goto(BASE_URL)
}

async function task66(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.6: 輸入驗證 ===')
  await mockUrlPreview(ctx, 3)
  await mockNextSeq(ctx, [{ next_seq: '01', existing: [] }])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 1)
  await page.waitForSelector('.start-seq-input', { timeout: 5000 })
  await page.waitForTimeout(300)

  // 清空 → 按鈕應仍可按（fallback to auto-scan）
  await page.locator('.start-seq-input').fill('')
  await page.waitForTimeout(150)
  const emptyDisabled = await page.locator('.selected-panel button.dl').isDisabled()
  if (!emptyDisabled) {
    record('6.6 起始號清空 → 按鈕仍可按（fallback）', 'PASS', '')
  } else {
    record('6.6 起始號清空 → 按鈕仍可按（fallback）', 'FAIL', '按鈕被 disabled')
  }

  // 填 "abc" → 按鈕應停用
  await page.locator('.start-seq-input').fill('abc')
  await page.waitForTimeout(150)
  const abcDisabled = await page.locator('.selected-panel button.dl').isDisabled()
  if (abcDisabled) {
    record('6.6 起始號 "abc" → 按鈕停用', 'PASS', '')
  } else {
    record('6.6 起始號 "abc" → 按鈕停用', 'FAIL', '按鈕仍可按')
  }
  await page.goto(BASE_URL)
}

async function task67(page: Page, ctx: BrowserContext) {
  log('=== TASK 6.7: 下載完成後 refetch next-seq ===')
  await mockUrlPreview(ctx, 5)
  // 首次預填 01，第二次（下載完成後）預填 04（模擬資料夾多了 01_/02_/03_）
  await mockNextSeq(ctx, [
    { next_seq: '01', existing: [] },
    { next_seq: '04', existing: [1, 2, 3] },
  ])
  await mockPostDownload(ctx)
  await mockProgressSseDone(ctx, ['fakeid00', 'fakeid01', 'fakeid02'])

  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 3)
  await page.waitForSelector('.start-seq-input', { timeout: 5000 })
  await page.waitForTimeout(400)
  const before = await readStartSeqValue(page)
  if (before !== '01') {
    record('6.7 第一次預填 "01"', 'FAIL', `got "${before}"`)
    return
  }
  record('6.7 第一次預填 "01"', 'PASS', '')

  await page.locator('.selected-panel button.dl').click()
  // 等 SSE done → downloading 變 false → watch 觸發第二次 fetch
  // 也等 selected 被清空（mock SSE done 會把 fakeid00..02 標記 downloaded → 從 selected 移除）
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(
        '.selected-panel button.dl',
      ) as HTMLButtonElement | null
      // 下載結束後按鈕文字會變回 "下載選取影片"，或面板因 selected=0 隱藏
      const text = btn?.innerText ?? ''
      const panelGone = !document.querySelector('.selected-panel')
      return panelGone || !text.includes('下載中')
    },
    null,
    { timeout: 10000 },
  )

  // 再勾新影片觸發面板，看 startSeqInput 是否變成 "04"
  await page.waitForTimeout(400)
  // 重新打開 URL feed（如果面板因 selected=0 消失），勾一支
  const panelStillThere = await page.locator('.selected-panel').isVisible()
  if (!panelStillThere) {
    // 把第 4 張勾起來
    await page.locator('.url-feed .video-item:nth-child(4) input[type="checkbox"]').check()
  } else {
    // 勾任一支沒被「下載」標記的
    await page.locator('.url-feed .video-item:nth-child(4) input[type="checkbox"]').check()
  }
  await page.waitForTimeout(500)
  const after = await readStartSeqValue(page)
  if (after === '04') {
    record('6.7 下載完成 + 重勾後 startSeqInput 更新為 "04"', 'PASS', `value="${after}"`)
  } else {
    record(
      '6.7 下載完成 + 重勾後 startSeqInput 更新為 "04"',
      'FAIL',
      `expected "04", got "${after}"`,
    )
  }
  await page.goto(BASE_URL)
}

async function cleanup(page: Page) {
  // 還原 localStorage 預設 (移除 seq_enabled，清掉 mock 下載期間累積的 downloaded_ids)
  await page.evaluate(() => {
    localStorage.removeItem('yt_mp3_seq_enabled')
    localStorage.removeItem('yt_mp3_downloaded_ids')
  })
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify configurable-sequence-prefix — 6.1–6.7')
  log('='.repeat(60))
  await preconditionCheck()
  log('[OK] precondition')

  const browser = await chromium.launch({ headless: false, slowMo: 120 })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  const page = await ctx.newPage()

  try {
    await task61(page, ctx)
    await task62(page, ctx)
    await task63(page, ctx)
    await task64(page, ctx)
    await task65(page, ctx)
    await task66(page, ctx)
    await task67(page, ctx)
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    record('FATAL', 'FAIL', msg)
  }

  await cleanup(page)
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
