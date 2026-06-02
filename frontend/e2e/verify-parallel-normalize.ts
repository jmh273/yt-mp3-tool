// One-shot verification for parallel-normalize (task 5.1).
// Run: npx tsx e2e/verify-parallel-normalize.ts   (from frontend/)
//
// 並行正規化是後端行為（asyncio.Semaphore + to_thread 套到 run_normalize_batch），
// 對前端透明：使用者可見效果是「多檔同時量測中/套用中」。後端並行語意
// （semaphore 上限、跳過/錯誤/完成逐檔獨立）已由 backend unit tests 覆蓋；
// 此 e2e 驗證：
//   A) 開始正規化送出含全部檔名的 POST /normalize/start
//   B) 單一 SSE frame 內多檔同時 measuring/normalizing → 多個進度 badge 並存
//   C) 設定頁的「並發數」欄位可顯示並送出（本次新增的共用設定 UI）

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

const FAKE_DIR = 'C:\\fake\\YT-MP3\\20260602'

const FAKE_FILES = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    filename: `track ${i + 1}.mp3`,
    size_bytes: 1_000_000 + i,
    needs_rename: false,
    suggested_name: `track ${i + 1}.mp3`,
  }))

async function mockSettings(ctx: BrowserContext) {
  await ctx.unroute('**/settings')
  await ctx.route('**/settings', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output_path: 'C:\\fake\\YT-MP3',
        videos_per_channel: 5,
        latest_hours: 24,
        discovery_keyword_top_n: 8,
        min_duration_minutes: 3,
        max_duration_minutes: 60,
        normalize_target_db: 89,
        drive_root_folder: 'YT-MP3',
        download_concurrency: 4,
      }),
    })
  })
}

async function mockNormalizeList(ctx: BrowserContext, count: number) {
  await ctx.unroute('**/normalize/list*')
  await ctx.route('**/normalize/list*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ directory: FAKE_DIR, files: FAKE_FILES(count) }),
    })
  })
}

async function mockNormalizeStart(ctx: BrowserContext): Promise<{ payloads: Record<string, unknown>[] }> {
  const state = { payloads: [] as Record<string, unknown>[] }
  await ctx.unroute('**/normalize/start')
  await ctx.route('**/normalize/start', async (route: Route, req: Request) => {
    if (req.method() === 'POST') {
      try {
        state.payloads.push(req.postDataJSON())
      } catch {
        state.payloads.push({})
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ task_id: 'verify-norm-task' }),
      })
    } else {
      await route.continue()
    }
  })
  return state
}

function progItem(filename: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    filename,
    status,
    measured_db: 84.0,
    target_db: 89.0,
    recommended_db_change: 5.0,
    error: null,
    ...extra,
  }
}

// SSE：先送「多檔同時 measuring/normalizing」frame（並行特徵），可選再送 done。
// es.onerror 不清 progress，且 file-list 不受 status gate → in-progress badge 會留存可斷言。
async function mockNormalizeProgress(
  ctx: BrowserContext,
  filenames: string[],
  opts: { withDone?: boolean } = {},
) {
  await ctx.unroute('**/normalize/progress/**')
  const inflight: Record<string, unknown> = {}
  filenames.forEach((fn, i) => {
    inflight[fn] = progItem(fn, i % 2 === 0 ? 'measuring' : 'normalizing')
  })
  let body = `data: ${JSON.stringify({ status: 'running', items: inflight })}\n\n`
  if (opts.withDone) {
    const done: Record<string, unknown> = {}
    filenames.forEach((fn) => (done[fn] = progItem(fn, 'done')))
    body += `data: ${JSON.stringify({ status: 'done', items: done })}\n\n`
  }
  await ctx.route('**/normalize/progress/**', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

async function openNormalizerTab(page: Page) {
  await page.goto(BASE_URL)
  await page.locator("button:has-text('音量正規化')").first().click()
  await page.waitForSelector('.normalizer .dir-input', { timeout: 5000 })
}

async function loadDir(page: Page) {
  const input = page.locator('.normalizer .dir-input')
  await input.fill('')
  await input.fill(FAKE_DIR)
  await page.locator('.normalizer .load-btn').click()
  await page.waitForSelector('.normalizer .file-item', { timeout: 5000 })
}

async function taskPayload(page: Page, ctx: BrowserContext) {
  log('=== A. 開始正規化送出全部檔名 ===')
  await mockSettings(ctx)
  await mockNormalizeList(ctx, 4)
  const startState = await mockNormalizeStart(ctx)
  await mockNormalizeProgress(ctx, ['track 1.mp3', 'track 2.mp3', 'track 3.mp3', 'track 4.mp3'], { withDone: true })
  await openNormalizerTab(page)
  await loadDir(page)
  await page.locator('.normalizer .start-btn').click()
  await page.waitForTimeout(600)

  if (startState.payloads.length === 0) {
    record('A POST /normalize/start 送出', 'FAIL', '0 payload')
    return
  }
  const p = startState.payloads[0]
  const n = Array.isArray(p.filenames) ? (p.filenames as unknown[]).length : 0
  if (n === 4 && typeof p.directory === 'string') {
    record('A POST /normalize/start（filenames:4 + directory）', 'PASS', `filenames=${n}`)
  } else {
    record('A POST /normalize/start（filenames:4 + directory）', 'FAIL', `filenames=${n} directory=${p.directory}`)
  }
}

async function taskConcurrentBadges(page: Page, ctx: BrowserContext) {
  log('=== B. 多檔同時 measuring/normalizing → 多個進度 badge 並存 ===')
  const files = ['track 1.mp3', 'track 2.mp3', 'track 3.mp3']
  await mockSettings(ctx)
  await mockNormalizeList(ctx, 3)
  await mockNormalizeStart(ctx)
  await mockNormalizeProgress(ctx, files) // 只送 in-progress frame，不送 done
  await openNormalizerTab(page)
  await loadDir(page)
  await page.locator('.normalizer .start-btn').click()

  let ok = false
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.file-item .badge.badge-measuring, .file-item .badge.badge-normalizing')
          .length >= 2,
      null,
      { timeout: 5000, polling: 16 },
    )
    ok = true
  } catch {
    ok = false
  }
  if (ok) {
    record('B 多個 in-progress badge 並存（並行可見）', 'PASS', '>=2 measuring/normalizing')
  } else {
    record('B 多個 in-progress badge 並存（並行可見）', 'FAIL', '未捕捉到 >=2 in-progress badge')
  }
  await page.waitForTimeout(300)
}

async function taskSettingsConcurrency(page: Page, ctx: BrowserContext) {
  log('=== C. 設定頁「並發數」欄位顯示並送出 ===')
  let putPayload: Record<string, unknown> | null = null
  // dev 下 API_BASE='/api'：API 走 /api/settings，SPA 頁面是 /settings。
  // 用 /api 前綴比對才只攔 API、不攔頁面 document（否則頁面會載入 JSON）。
  await ctx.unroute('**/settings')
  await ctx.route('**/api/settings', async (route: Route, req: Request) => {
    if (req.method() === 'PUT') {
      try {
        putPayload = req.postDataJSON()
      } catch {
        putPayload = {}
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...(putPayload ?? {}) }) })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output_path: 'C:\\fake\\YT-MP3',
          videos_per_channel: 5,
          latest_hours: 24,
          discovery_keyword_top_n: 8,
          min_duration_minutes: 3,
          max_duration_minutes: 60,
          normalize_target_db: 89,
          drive_root_folder: 'YT-MP3',
          download_concurrency: 4,
        }),
      })
    }
  })

  await page.goto(`${BASE_URL}/settings`)
  const input = page.locator('[data-testid="download-concurrency"]')
  await input.waitFor({ timeout: 5000 })
  const shown = await input.inputValue()
  if (shown === '4') {
    record('C 並發數欄位載入顯示設定值', 'PASS', `value="${shown}"`)
  } else {
    record('C 並發數欄位載入顯示設定值', 'FAIL', `expected "4", got "${shown}"`)
  }

  await input.fill('6')
  await page.locator('button:has-text("儲存")').first().click()
  await page.waitForTimeout(500)
  if (putPayload && (putPayload as Record<string, unknown>).download_concurrency === 6) {
    record('C 儲存送出 download_concurrency=6', 'PASS', 'PUT payload 正確')
  } else {
    record('C 儲存送出 download_concurrency=6', 'FAIL', `payload=${JSON.stringify(putPayload)}`)
  }
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('Verify parallel-normalize — task 5.1')
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
    await taskConcurrentBadges(page, ctx)
    await taskSettingsConcurrency(page, ctx)
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
