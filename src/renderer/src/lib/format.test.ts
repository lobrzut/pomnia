import { describe, expect, it, vi, afterEach } from 'vitest'
import { relativeTime } from './format'

describe('relativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns Polish relative phrases', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09T12:00:00Z'))

    expect(relativeTime('2026-07-09T11:59:50Z')).toBe('przed chwilą')
    expect(relativeTime('2026-07-09T11:55:00Z')).toBe('5 min temu')
    expect(relativeTime('2026-07-09T10:00:00Z')).toBe('2 godz. temu')
    expect(relativeTime('2026-07-07T12:00:00Z')).toBe('2 dni temu')
  })
})
