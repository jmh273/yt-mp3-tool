// Shared harness for per-change Playwright verification scripts.
//
// Pattern:
//   import { runVerifySuite, mockJson, ... } from './verify-helpers'
//
//   runVerifySuite({
//     title: 'verify <change-name>',
//     tasks: [
//       { name: '1.1 ...', run: async (v) => { ... v.record('1.1 ...', 'PASS', ...) } },
//     ],
//   })
//
// All scripts share preconditionCheck (storage state + backend live) from helpers.ts.

import {
  chromium,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from 'playwright'
import { BASE_URL, STORAGE_STATE_PATH, preconditionCheck, log } from './helpers'

export interface VerifyResult {
  task: string
  status: 'PASS' | 'FAIL'
  detail: string
}

export interface VerifyContext {
  page: Page
  browserCtx: BrowserContext
  record: (task: string, status: 'PASS' | 'FAIL', detail: string) => void
}

export interface VerifyTask {
  name: string
  run: (vctx: VerifyContext) => Promise<void>
}

export interface VerifySuite {
  title: string
  tasks: VerifyTask[]
  /** Optional final hook that runs once after all tasks (e.g. localStorage cleanup). */
  cleanup?: (vctx: VerifyContext) => Promise<void>
  /** Playwright slowMo (default 120ms). */
  slowMo?: number
  /** Headless (default false — so the user can watch). */
  headless?: boolean
}

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Fulfill any request matching `urlPattern` with the given JSON body. */
export async function mockJson(
  ctx: BrowserContext,
  urlPattern: string,
  body: unknown,
): Promise<void> {
  await ctx.unroute(urlPattern).catch(() => {})
  await ctx.route(urlPattern, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

/**
 * Fulfill each call to `urlPattern` with the next body from `bodies`.
 * After the array is exhausted, repeat the last entry.
 */
export async function mockJsonSequence(
  ctx: BrowserContext,
  urlPattern: string,
  bodies: unknown[],
): Promise<void> {
  await ctx.unroute(urlPattern).catch(() => {})
  let i = 0
  await ctx.route(urlPattern, async (route: Route) => {
    const idx = Math.min(i, bodies.length - 1)
    i += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bodies[idx]),
    })
  })
}

export interface PostCapture {
  /** All captured POST bodies in arrival order. */
  payloads: Record<string, unknown>[]
}

/**
 * Capture POST payloads to `urlPattern` and respond with `response` (JSON).
 * Non-POST methods pass through.
 */
export async function mockPostCapture(
  ctx: BrowserContext,
  urlPattern: string,
  response: unknown,
): Promise<PostCapture> {
  const state: PostCapture = { payloads: [] }
  await ctx.unroute(urlPattern).catch(() => {})
  await ctx.route(urlPattern, async (route: Route, req: Request) => {
    if (req.method() === 'POST') {
      try {
        state.payloads.push(req.postDataJSON())
      } catch {
        state.payloads.push({})
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      })
    } else {
      await route.continue()
    }
  })
  return state
}

/**
 * Respond to `urlPattern` (SSE endpoint) with a single `data:` chunk emitting
 * a `{status: 'done', items}` event. The connection then closes, which the
 * EventSource consumer treats as a normal completion.
 */
export async function mockSseDone(
  ctx: BrowserContext,
  urlPattern: string,
  items: Record<string, unknown> = {},
): Promise<void> {
  await ctx.unroute(urlPattern).catch(() => {})
  const body = `data: ${JSON.stringify({ status: 'done', items })}\n\n`
  await ctx.route(urlPattern, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })
}

// ── Suite runner ─────────────────────────────────────────────────────────────

/**
 * Standard runner: precondition check, browser launch with storageState, run
 * tasks sequentially, print summary, exit with 0 (all PASS) or 1.
 *
 * Each task is wrapped in try/catch so one failure doesn't abort the rest.
 */
export async function runVerifySuite(suite: VerifySuite): Promise<number> {
  log('='.repeat(60))
  log(suite.title)
  log('='.repeat(60))
  await preconditionCheck()
  log('[OK] precondition')

  const results: VerifyResult[] = []
  const record = (task: string, status: 'PASS' | 'FAIL', detail: string) => {
    results.push({ task, status, detail })
    log(`  [${status}] ${task}: ${detail}`)
  }

  const browser = await chromium.launch({
    headless: suite.headless ?? false,
    slowMo: suite.slowMo ?? 120,
  })
  const browserCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  const page = await browserCtx.newPage()
  await page.goto(BASE_URL)

  const vctx: VerifyContext = { page, browserCtx, record }

  for (const task of suite.tasks) {
    log(`--- ${task.name} ---`)
    try {
      await task.run(vctx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      record(task.name, 'FAIL', `task threw: ${msg}`)
    }
  }

  if (suite.cleanup) {
    try {
      await suite.cleanup(vctx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`[cleanup] warning: ${msg}`)
    }
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
