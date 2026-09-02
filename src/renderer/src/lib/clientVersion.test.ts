import { describe, expect, it } from 'vitest'

import { formatClientVersion } from './clientVersion.js'

describe('formatClientVersion', () => {
  it('adds the v a plain version lacks', () => {
    expect(formatClientVersion('2.1.247')).toBe('v2.1.247')
  })

  it('does not double the v a client already sent', () => {
    // antigravity-client reports "v1.0.0"; the card rendered "vv1.0.0".
    expect(formatClientVersion('v1.0.0')).toBe('v1.0.0')
    expect(formatClientVersion('V1.0.0')).toBe('v1.0.0')
  })

  it('handles an empty or whitespace version without printing a bare v', () => {
    expect(formatClientVersion('')).toBe('')
    expect(formatClientVersion('   ')).toBe('')
    expect(formatClientVersion('v')).toBe('')
  })

  it('leaves anything else alone', () => {
    expect(formatClientVersion('1.0.0-beta.3')).toBe('v1.0.0-beta.3')
    expect(formatClientVersion('2026.09.02')).toBe('v2026.09.02')
  })
})
