// Main walkthrough entry — runs all 17 cases sequentially, emits HTML report.
// Usage: npm run e2e (from frontend/)

import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { chromium } from 'playwright'
import type { Page } from 'playwright'

import {
  REPORT_DIR,
  STORAGE_STATE_PATH,
  log,
  makeHtml,
  preconditionCheck,
  startCase,
  type CaseContext,
} from './helpers'

// Cases (TC-01 .. TC-17)
import { tc01Startup } from './cases/tc01-startup'
import { tc02ChannelSearch } from './cases/tc02-channel-search'
import { tc03ChannelDates } from './cases/tc03-channel-dates'
import { tc04ChannelPick, type Tc04State } from './cases/tc04-channel-pick'
import { tc05VideoSelect } from './cases/tc05-video-select'
import { tc06LatestFeed } from './cases/tc06-latest-feed'
import { tc07SettingsFlow } from './cases/tc07-settings-flow'
import { tc08SettingsValidation } from './cases/tc08-settings-validation'
import { tc09TabsKeepAlive } from './cases/tc09-tabs-keepalive'
import { tc10NormalizeBasic, type Tc10State } from './cases/tc10-normalize-basic'
import { tc11NormalizeAdvanced } from './cases/tc11-normalize-advanced'
import { tc12Trending } from './cases/tc12-trending'
import { tc13Search } from './cases/tc13-search'
import { tc14UrlDownload } from './cases/tc14-url-download'
import { tc15PlayerModal } from './cases/tc15-player-modal'
import { tc16DownloadFlow } from './cases/tc16-download-flow'
import { tc17QuotaCounter } from './cases/tc17-quota-counter'
import { tc18Discovery } from './cases/tc18-discovery'

async function safeRun(
  name: string,
  page: Page,
  fn: () => Promise<CaseContext>,
): Promise<CaseContext> {
  // Defensive: dismiss any leftover modal from a previous case so click
  // intercept doesn't cascade-fail subsequent cases.
  try {
    if ((await page.locator('.modal-backdrop').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
  } catch {
    // ignore
  }

  try {
    return await fn()
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    log(`[FATAL] ${name}: ${msg}`)
    const bad = startCase(name, name, `FATAL: ${msg}`, 1)
    bad.steps.push({
      n: 1,
      narration: 'case crashed before any step ran',
      screenshot: '—',
      status: 'FAIL',
      error: msg,
    })
    return bad
  }
}

async function main(): Promise<number> {
  log('='.repeat(60))
  log('YT-MP3 完整功能 Walkthrough 測試開始')
  log('='.repeat(60))

  await preconditionCheck()
  log('[OK] precondition (登入狀態 + 後端可達)')

  const cases: CaseContext[] = []

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
  })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: STORAGE_STATE_PATH,
  })
  const page = await context.newPage()

  const tc04State: Tc04State = { channelIndex: 0 }
  const tc10State: Tc10State = { tempDir: null }

  // Run cases in order; case-level crashes don't abort the run
  cases.push(await safeRun('TC-01', page, () => tc01Startup(page)))
  cases.push(await safeRun('TC-02', page, () => tc02ChannelSearch(page)))
  cases.push(await safeRun('TC-03', page, () => tc03ChannelDates(page)))
  cases.push(await safeRun('TC-04', page, () => tc04ChannelPick(page, tc04State)))
  cases.push(await safeRun('TC-05', page, () => tc05VideoSelect(page)))
  cases.push(await safeRun('TC-06', page, () => tc06LatestFeed(page)))
  cases.push(await safeRun('TC-07', page, () => tc07SettingsFlow(page)))
  cases.push(await safeRun('TC-08', page, () => tc08SettingsValidation(page)))
  cases.push(await safeRun('TC-09', page, () => tc09TabsKeepAlive(page)))
  cases.push(await safeRun('TC-10', page, () => tc10NormalizeBasic(page, tc10State)))
  cases.push(await safeRun('TC-11', page, () => tc11NormalizeAdvanced(page, tc10State)))
  cases.push(await safeRun('TC-12', page, () => tc12Trending(page)))
  cases.push(await safeRun('TC-13', page, () => tc13Search(page)))
  cases.push(await safeRun('TC-14', page, () => tc14UrlDownload(page)))
  cases.push(await safeRun('TC-15', page, () => tc15PlayerModal(page)))
  cases.push(await safeRun('TC-16', page, () => tc16DownloadFlow(page)))
  cases.push(await safeRun('TC-17', page, () => tc17QuotaCounter(page)))
  cases.push(await safeRun('TC-18', page, () => tc18Discovery(page)))

  await browser.close()

  // Cleanup TC-10/11 temp dir
  if (tc10State.tempDir) {
    try {
      rmSync(tc10State.tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }

  // Write report
  const reportPath = join(REPORT_DIR, 'walkthrough.html')
  makeHtml(cases, reportPath)

  const passed = cases.filter((c) => {
    const status =
      c.steps.some((s) => s.status === 'FAIL') || c.steps.length < c.minSteps
        ? 'FAIL'
        : 'PASS'
    return status === 'PASS'
  }).length

  log('='.repeat(60))
  log(`完成：${passed} / ${cases.length} 通過`)
  log(`報告：${reportPath}`)
  log('='.repeat(60))

  return passed === cases.length ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e)
    process.stderr.write(`[FATAL] ${msg}\n`)
    process.exit(1)
  })
