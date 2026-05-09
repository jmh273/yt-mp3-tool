// Playwright walkthrough helpers — step API + HTML reporter + precondition check.
// Mirrors the semantics of the legacy Python ui-tests/walkthrough_helpers.py.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'

export const BASE_URL = 'http://localhost:5173'
export const BACKEND_URL = 'http://localhost:8000'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPORT_DIR = join(HERE, 'report')
export const SCREENSHOTS_DIR = join(REPORT_DIR, 'screenshots')
export const AUTH_DIR = join(HERE, '.auth')
export const STORAGE_STATE_PATH = join(AUTH_DIR, 'storageState.json')
export const FIXTURES_DIR = join(HERE, 'fixtures')

mkdirSync(SCREENSHOTS_DIR, { recursive: true })
mkdirSync(AUTH_DIR, { recursive: true })

export interface StepEntry {
  n: number
  narration: string
  screenshot: string
  status: 'PASS' | 'FAIL'
  error?: string
}

export interface CaseContext {
  id: string
  name: string
  description: string
  minSteps: number
  steps: StepEntry[]
  startedAt: string
}

export function nowTime(): string {
  return new Date().toLocaleTimeString('zh-TW', { hour12: false })
}

export function log(msg: string): void {
  console.log(`[${nowTime()}] ${msg}`)
}

export function startCase(
  id: string,
  name: string,
  description: string,
  minSteps: number,
): CaseContext {
  return {
    id,
    name,
    description,
    minSteps,
    steps: [],
    startedAt: new Date().toISOString(),
  }
}

export async function step(
  page: Page,
  ctx: CaseContext,
  narration: string,
  action?: () => Promise<unknown> | unknown,
  waitMs: number = 500,
): Promise<StepEntry> {
  const idx = ctx.steps.length + 1
  const fname = `${ctx.id}_step${String(idx).padStart(2, '0')}.png`
  const fullPath = join(SCREENSHOTS_DIR, fname)

  const entry: StepEntry = {
    n: idx,
    narration,
    screenshot: fname,
    status: 'PASS',
  }

  log(`  ${ctx.id} step ${idx}: ${narration}`)

  try {
    if (action) {
      await action()
    }
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs)
    }
  } catch (e: unknown) {
    entry.status = 'FAIL'
    entry.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    log(`    [FAIL] ${entry.error}`)
  }

  // Always screenshot — even on FAIL — so the report shows the failure state
  try {
    await page.screenshot({ path: fullPath, fullPage: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    entry.error = (entry.error ?? '') + ` | screenshot failed: ${msg}`
  }

  ctx.steps.push(entry)
  return entry
}

export function caseStatus(ctx: CaseContext): 'PASS' | 'FAIL' {
  if (ctx.steps.some((s) => s.status === 'FAIL')) return 'FAIL'
  if (ctx.steps.length < ctx.minSteps) return 'FAIL'
  return 'PASS'
}

export async function preconditionCheck(): Promise<void> {
  // 1. storage state file exists
  if (!existsSync(STORAGE_STATE_PATH)) {
    process.stderr.write(
      '[precondition] 找不到登入狀態，請先跑 npm run e2e:auth 完成 Google 授權後再執行此測試。\n',
    )
    process.exit(1)
  }

  // 2. backend reachable + logged in
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    const resp = await fetch(`${BACKEND_URL}/auth/status`, { signal: ctrl.signal })
    clearTimeout(timer)
    const data = (await resp.json()) as { logged_in?: boolean }
    if (!data.logged_in) {
      process.stderr.write(
        '[precondition] 登入狀態已失效，請重跑 npm run e2e:auth 完成 Google 授權後再執行。\n',
      )
      process.exit(1)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    process.stderr.write(
      '[precondition] 連不到後端 / 前端：請確認:\n' +
        '  1. 後端 (uvicorn) 在 http://localhost:8000\n' +
        '  2. 前端 (vite) 在 http://localhost:5173\n' +
        '  3. 你已在前端完成 Google 登入並執行過 npm run e2e:auth\n' +
        `  原始錯誤：${msg}\n`,
    )
    process.exit(1)
  }
}

function htmlEscape(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function makeHtml(cases: CaseContext[], outPath: string): void {
  const total = cases.length
  const passed = cases.filter((c) => caseStatus(c) === 'PASS').length
  const failed = total - passed
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0
  const failedNames = cases.filter((c) => caseStatus(c) === 'FAIL').map((c) => c.name)
  const timestamp = new Date().toLocaleString('zh-TW', { hour12: false })

  const sections = cases
    .map((c) => {
      const status = caseStatus(c)
      const isOpen = status === 'FAIL' ? 'open' : ''
      const badgeClass = status === 'PASS' ? 'badge-pass' : 'badge-fail'
      const stepCount = c.steps.length
      const warn =
        stepCount < c.minSteps
          ? ` <span class="warn">(MISSING STEPS: ${stepCount}/${c.minSteps})</span>`
          : ''

      const stepsHtml = c.steps
        .map((s) => {
          const rowClass = s.status === 'PASS' ? 'step' : 'step step-fail'
          const errHtml = s.error
            ? `<pre class="err">${htmlEscape(s.error)}</pre>`
            : ''
          return `
        <div class="${rowClass}">
          <div class="narration"><span class="num">Step ${s.n}</span> ${htmlEscape(s.narration)}</div>
          <a href="screenshots/${s.screenshot}" target="_blank">
            <img src="screenshots/${s.screenshot}" alt="step ${s.n}" loading="lazy"/>
          </a>
          ${errHtml}
        </div>`
        })
        .join('\n')

      return `
    <details ${isOpen} class="case case-${status.toLowerCase()}">
      <summary><span class="case-id">${c.id}</span> ${htmlEscape(c.name)} <span class="${badgeClass}">${status}</span>${warn}</summary>
      <p class="case-desc">${htmlEscape(c.description)}</p>
      <div class="steps">${stepsHtml}</div>
    </details>`
    })
    .join('\n')

  const failedListHtml =
    failedNames.length > 0
      ? `<div class="failed-list"><strong>失敗案例：</strong><ul>${failedNames
          .map((n) => `<li>${htmlEscape(n)}</li>`)
          .join('')}</ul></div>`
      : ''

  const summaryColor = failed === 0 ? 'ok' : 'fail'

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>YT-MP3 完整功能 Walkthrough 測試報告</title>
<style>
  body { font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; margin: 0; background: #f6f6f8; color: #222; }
  .hdr { background: #c00; color: #fff; padding: 1.4rem 2rem; }
  .hdr h1 { margin: 0; font-size: 1.5rem; }
  .hdr p { margin: .3rem 0 0; opacity: .85; font-size: .85rem; }
  .summary { display: flex; gap: 1rem; padding: 1rem 2rem; background: #fff; border-bottom: 1px solid #ddd; align-items: center; }
  .summary .num { font-size: 1.6rem; font-weight: 700; }
  .summary .label { font-size: .75rem; color: #888; }
  .summary .ok .num { color: #2e7d32; }
  .summary .fail .num { color: #c62828; }
  .failed-list { padding: .8rem 2rem; background: #fff5f5; border-bottom: 1px solid #ffd1d1; font-size: .9rem; }
  .failed-list ul { margin: .3rem 0 0; padding-left: 1.2rem; }
  main { padding: 1rem 2rem; }
  details.case { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: .8rem; padding: .6rem 1rem; }
  details.case-fail { border-color: #f5a5a5; background: #fffafa; }
  summary { cursor: pointer; font-size: 1rem; font-weight: 600; padding: .3rem 0; outline: none; }
  .case-id { display: inline-block; min-width: 4em; color: #c00; font-family: monospace; }
  .badge-pass, .badge-fail { float: right; padding: .1rem .6rem; border-radius: 10px; font-size: .75rem; font-weight: 600; }
  .badge-pass { background: #e8f5e9; color: #2e7d32; }
  .badge-fail { background: #ffebee; color: #c62828; }
  .warn { background: #fff3e0; color: #e65100; padding: .1rem .4rem; border-radius: 4px; font-size: .7rem; }
  .case-desc { color: #555; font-size: .85rem; margin: .3rem 0 .8rem; }
  .steps { display: flex; flex-direction: column; gap: 1rem; }
  .step { border-left: 3px solid #ccc; padding: .4rem .8rem; }
  .step-fail { border-left-color: #c62828; background: #fff5f5; }
  .narration { font-size: .92rem; line-height: 1.6; margin-bottom: .4rem; }
  .narration .num { color: #c00; font-family: monospace; font-weight: 600; margin-right: .4rem; }
  .step img { max-width: 480px; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .step img:hover { box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  .err { background: #fff; border: 1px solid #f5a5a5; border-radius: 4px; padding: .4rem .6rem; font-size: .75rem; color: #c62828; white-space: pre-wrap; margin-top: .4rem; }
  footer { text-align: center; padding: 1.5rem; color: #888; font-size: .75rem; }
</style>
</head>
<body>
  <div class="hdr">
    <h1>YT-MP3 完整功能 Walkthrough 測試報告</h1>
    <p>${timestamp} · Playwright headed mode · ${total} 個測試案例</p>
  </div>
  <div class="summary">
    <div class="ok"><div class="num">${passed}</div><div class="label">通過</div></div>
    <div class="fail"><div class="num">${failed}</div><div class="label">失敗</div></div>
    <div><div class="num">${total}</div><div class="label">總計</div></div>
    <div class="${summaryColor}"><div class="num">${pct}%</div><div class="label">通過率</div></div>
  </div>
  ${failedListHtml}
  <main>
    ${sections}
  </main>
  <footer>YT-MP3 Tool · feature walkthrough · 自動產生於 ${timestamp}</footer>
</body>
</html>`

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf-8')
}
