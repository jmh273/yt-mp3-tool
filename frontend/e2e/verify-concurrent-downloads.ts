// One-shot verification for concurrent-downloads (task 5.1).
// Run: npx tsx e2e/verify-concurrent-downloads.ts   (from frontend/)
//
// 並行下載是後端行為（asyncio.Semaphore + to_thread），對前端透明：其使用者
// 可見效果是「多支影片同時處於下載中、多條進度條一起前進」。後端並行語意
// （semaphore 上限、序號與完成順序解耦、部分失敗不阻擋）已由 backend unit
// tests 覆蓋；此 e2e 驗證前端能正確渲染「單一 SSE frame 內多支 downloading」
// 的並行進度畫面，以及多支批次的 POST /download payload 正確送出。

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
    video_id: `ccid${String(i).padStart(2, '0')}`,
    title: `Concurrent Video ${i + 1}`,
    url: `https://www.youtube.com/watch?v=ccid${String(i).padStart(2, '0')}`,
    thumbnail: `https://i.ytimg.com/vi/ccid${String(i).padStart(2, '0')}/mqdefault.jpg`,
    published: '',
    duration_seconds: 200 + i,
    channel_id: 'UC_cc',
    channel_title: 'Concurrent Channel',
  }))

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

async function mockNextSeq(ctx: BrowserContext) {
  await ctx.unroute('**/download/next-seq')
  await ctx.route('**/download/next-seq', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ next_seq: '01', existing: [] }),
    })
  })
}

async function mockPostDownload(ctx: BrowserContext): Promise<{ payloads: Record<string, unknown>[] }> {
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
        body: JSON.stringify({ task_id: 'verify-cc-task' }),
      })
    } else {
      await route.continue()
    }
  })
  return state
}

// 模擬 SSE：先送一個「多支同時 downloading」的 frame（並行特徵），最後送 done。
// 並行 frame 讓 .progress-list 同時渲染多條 .bar.downloading。
async function mockProgressSseConcurrent(ctx: BrowserContext, videoIds: string[]) {
  await ctx.unroute('**/download/progress/**')
  const downloadingItems: Record<string, unknown> = {}
  videoIds.forEach((vid, i) => {
    downloadingItems[vid] = {
      title: `Concurrent Video ${i + 1}`,
      percent: 20 + i * 10,
      speed: '1.5MiB/s',
      status: 'downloading',
    }
  })
  const doneItems: Record<string, unknown> = {}
  videoIds.forEach((vid, i) => {
    doneItems[vid] = { title: `Concurrent Video ${i + 1}`, percent: 100, status: 'done' }
  })
  const body =
    `data: ${JSON.stringify({ status: 'running', items: downloadingItems })}\n\n` +
    `data: ${JSON.stringify({ status: 'done', items: doneItems })}\n\n`
  await ctx.route('**/download/progress/**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

async function openUrlFeedAndParse(page: Page, fakeUrl = 'https://www.youtube.com/playlist?list=fakecc') {
  await page.locator("button:has-text('網址下載')").first().click()
  await page.waitForSelector('.url-feed input.search-input', { timeout: 5000 })
  await page.locator('.url-feed input.search-input').fill(fakeUrl)
  await page.locator(".url-feed button:has-text('解析')").click()
  await page.waitForSelector('.url-feed .video-item', { timeout: 10000 })
}

async function checkFirstN(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.locator(`.url-feed .video-item:nth-child(${i + 1}) input[type='checkbox']`).check()
  }
}

async function taskPayload(page: Page, ctx: BrowserContext) {
  log('=== 多支批次 POST /download payload ===')
  await mockUrlPreview(ctx, 4)
  await mockNextSeq(ctx)
  const dlState = await mockPostDownload(ctx)
  await mockProgressSseConcurrent(ctx, ['ccid00', 'ccid01', 'ccid02', 'ccid03'])
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 4)
  await page.waitForSelector('.selected-panel button.dl', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.selected-panel button.dl').click()
  await page.waitForTimeout(600)

  if (dlState.payloads.length === 0) {
    record('多支批次送出 POST /download', 'FAIL', '0 payload')
    return
  }
  const payload = dlState.payloads[0]
  const n = Array.isArray(payload.videos) ? (payload.videos as unknown[]).length : 0
  if (n === 4) {
    record('多支批次送出 POST /download（videos:4）', 'PASS', `videos.length=${n}`)
  } else {
    record('多支批次送出 POST /download（videos:4）', 'FAIL', `videos.length=${n}`)
  }
  await page.goto(BASE_URL)
}

async function taskConcurrentBars(page: Page, ctx: BrowserContext) {
  log('=== 多支同時 downloading → 多條進度條並存 ===')
  const ids = ['ccid00', 'ccid01', 'ccid02']
  await mockUrlPreview(ctx, 3)
  await mockNextSeq(ctx)
  await mockPostDownload(ctx)
  await mockProgressSseConcurrent(ctx, ids)
  await page.goto(BASE_URL)
  await openUrlFeedAndParse(page)
  await checkFirstN(page, 3)
  await page.waitForSelector('.selected-panel button.dl', { timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.selected-panel button.dl').click()

  // 抓並行 frame 渲染瞬間：>=2 條 .bar.downloading 同時存在。
  let okConcurrent = false
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.progress-item .bar.downloading').length >= 2,
      null,
      { timeout: 5000, polling: 16 },
    )
    okConcurrent = true
  } catch {
    okConcurrent = false
  }
  if (okConcurrent) {
    record('多條 .bar.downloading 同時渲染（並行進度可見）', 'PASS', '>=2 同時 downloading')
  } else {
    record('多條 .bar.downloading 同時渲染（並行進度可見）', 'FAIL', '未捕捉到 >=2 同時 downloading')
  }
  await page.waitForTimeout(400)
  await page.goto(BASE_URL)
}

async function cleanup(page: Page) {
  await page.evaluate(() => localStorage.removeItem('yt_mp3_downloaded_ids'))
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify concurrent-downloads — task 5.1')
  log('='.repeat(60))
  await preconditionCheck()
  log('[OK] precondition')

  const browser = await chromium.launch({ headless: false, slowMo: 80 })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  const page = await ctx.newPage()

  try {
    await taskPayload(page, ctx)
    await taskConcurrentBars(page, ctx)
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
