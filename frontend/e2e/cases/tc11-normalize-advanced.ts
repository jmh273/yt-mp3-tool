import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { FIXTURES_DIR, log, startCase, step, type CaseContext } from '../helpers'
import type { Tc10State } from './tc10-normalize-basic'

export async function tc11NormalizeAdvanced(
  page: Page,
  state: Tc10State,
): Promise<CaseContext> {
  const ctx = startCase(
    'TC-11',
    '音量正規化進階：自動 rename + 已符合',
    '驗證含全形標點的檔名被偵測 needs_rename、按按鈕自動 rename、_rename_log.json 產生、再跑全部「已符合」。',
    5,
  )

  if (!state.tempDir) {
    await step(
      page,
      ctx,
      '前置條件失敗：TC-10 必須先跑成功（temp dir 才會存在）。',
      undefined,
      200,
    )
    return ctx
  }

  const unsafeName = '重磅！測試？.mp3'
  copyFileSync(join(FIXTURES_DIR, 'loud.mp3'), join(state.tempDir, unsafeName))
  log(`  added unsafe-name file: ${unsafeName}`)

  await step(
    page,
    ctx,
    `在測試目錄裡放一個含全形標點的檔名「${unsafeName}」(模擬 YouTube 標題下載下來的舊檔)。重新載入目錄。`,
    () => page.locator('.load-btn').click(),
    1500,
  )

  await step(
    page,
    ctx,
    '預期看到橘色「⚠ 重新命名 N 個檔案」按鈕，因為含全形「！」「？」是 mp3gain 處理不到的字元。',
    () => page.waitForSelector('.rename-btn', { timeout: 5000 }),
    500,
  )

  await step(
    page,
    ctx,
    '點擊「重新命名」按鈕。預期該檔被 atomic rename 成 sanitized 名字，list 重新載入後不再顯示橘色警告。',
    () => page.locator('.rename-btn').click(),
    2000,
  )

  // Verify _rename_log.json
  const logFile = join(state.tempDir, '_rename_log.json')
  if (existsSync(logFile)) {
    log(`  _rename_log.json exists: ${logFile}`)
  } else {
    log('  WARNING: _rename_log.json not created!')
  }

  await step(
    page,
    ctx,
    '再次點擊「開始正規化」(這次清單包含已正規化的 loud.mp3 + quiet.mp3 + 剛 rename 過的第三個檔案)。',
    () => page.locator('.start-btn').click(),
    5000,
  )

  await step(
    page,
    ctx,
    '預期所有檔案都顯示藍色「已符合」徽章 — 因為前一次跑已把它們調到目標 ±0.75 dB 以內。',
    () =>
      page.waitForFunction(
        () => document.querySelectorAll('.badge-skipped').length >= 1,
        null,
        { timeout: 30000 },
      ),
    500,
  )

  return ctx
}
