import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { Page } from 'playwright'
import { FIXTURES_DIR, log, startCase, step, type CaseContext } from '../helpers'

export interface Tc10State {
  tempDir: string | null
}

export async function tc10NormalizeBasic(
  page: Page,
  state: Tc10State,
): Promise<CaseContext> {
  const ctx = startCase(
    'TC-10',
    '音量正規化基本流程',
    '驗證載入目錄、顯示檔案、設定本次目標、執行 mp3gain、看到批次摘要。',
    6,
  )

  // Setup: copy fixture mp3s into a temp dir
  state.tempDir = mkdtempSync(join(tmpdir(), 'walkthrough-mp3-'))
  for (const fn of ['loud.mp3', 'quiet.mp3']) {
    copyFileSync(join(FIXTURES_DIR, fn), join(state.tempDir, fn))
  }
  log(`  fixtures copied to ${state.tempDir}`)
  // Use forward slashes in path for the input field on Windows is fine, vite/electron may differ
  const dirForInput = state.tempDir

  await step(
    page,
    ctx,
    `切到「音量正規化」分頁，把目錄輸入框改成測試目錄 ${dirForInput} (含兩個 fixture mp3)。`,
    async () => {
      // ensure normalize tab active
      await page.locator('.tab', { hasText: '音量正規化' }).click()
      await page.waitForTimeout(300)
      await page.locator('.dir-input').fill(dirForInput)
    },
    400,
  )

  await step(
    page,
    ctx,
    '點擊「載入」按鈕。預期看到 loud.mp3 和 quiet.mp3 兩個檔案出現在清單。',
    () => page.locator('.load-btn').click(),
    1500,
  )

  await step(
    page,
    ctx,
    '確認「本次目標 (dB)」欄位預填 89 (從 settings 拿)，可隨時手動覆寫只影響這次。',
    undefined,
    300,
  )

  await step(
    page,
    ctx,
    '點擊「開始正規化」按鈕。預期狀態徽章從「等待中」→「量測中」→「套用中」→「完成」/「已符合」。mp3gain 通常一首 < 1 秒。',
    () => page.locator('.start-btn').click(),
    4000,
  )

  await step(
    page,
    ctx,
    '等待整批處理完成。預期 quiet.mp3 (差距 ≥ 0.75 dB) 變「完成」綠色徽章；loud.mp3 (與目標 89 接近) 可能變「已符合」藍色徽章。',
    () =>
      page.waitForFunction(
        () =>
          document.querySelectorAll('.badge-done, .badge-skipped, .badge-error')
            .length >= 2,
        null,
        { timeout: 30000 },
      ),
    500,
  )

  await step(
    page,
    ctx,
    '確認最下方有批次摘要：「完成 X · 已符合 Y · 失敗 Z」。',
    async () => {
      // Wait for the summary line to render. Match either keyword robustly.
      await page.waitForFunction(
        () => {
          const text = document.body.innerText
          return /完成\s*\d+/.test(text) || /已符合\s*\d+/.test(text)
        },
        null,
        { timeout: 5000 },
      )
    },
    300,
  )

  // Suppress unused-import warning for `sep` (kept for future path tweaks)
  void sep

  return ctx
}
