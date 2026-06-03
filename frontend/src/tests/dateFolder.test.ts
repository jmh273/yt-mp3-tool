import { describe, it, expect } from 'vitest'
import { rolloverDatePrefix } from '@/utils/dateFolder'

describe('rolloverDatePrefix', () => {
  const today = '20260602'

  it('rolls a bare stale date to today', () => {
    expect(rolloverDatePrefix('20260601', today)).toBe('20260602')
  })

  it('rolls a stale date while preserving the suffix', () => {
    expect(rolloverDatePrefix('20260601_music', today)).toBe('20260602_music')
  })

  it('keeps an existing today prefix unchanged', () => {
    expect(rolloverDatePrefix('20260602_music', today)).toBe('20260602_music')
  })

  it('keeps names without a leading 8-digit prefix unchanged', () => {
    expect(rolloverDatePrefix('music', today)).toBe('music')
  })

  it('treats any leading 8 digits as a rollover prefix', () => {
    expect(rolloverDatePrefix('20261301_test', today)).toBe('20260602_test')
  })
})
