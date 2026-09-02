import { describe, expect, it } from 'vitest'

import {
  estimateSeconds,
  formatBytes,
  formatDuration,
  recordUpload,
  type UploadRate,
} from './uploadEstimate.js'

const MB = 1024 * 1024

describe('recordUpload', () => {
  it('learns a rate from the first real sample', () => {
    const r = recordUpload(null, 10 * MB, 10_000)
    expect(r?.bytesPerSec).toBeCloseTo(MB, 0)
    expect(r?.samples).toBe(1)
  })

  it('smooths rather than replaces, so one bad send does not erase the rest', () => {
    const fast: UploadRate = { bytesPerSec: 10 * MB, samples: 5 }
    const r = recordUpload(fast, 10 * MB, 10_000) // one slow send at 1 MB/s
    // Somewhere between the two, nearer the established value.
    expect(r!.bytesPerSec).toBeGreaterThan(1 * MB)
    expect(r!.bytesPerSec).toBeLessThan(10 * MB)
    expect(r!.samples).toBe(6)
  })

  it('ignores a sample too small to describe the link', () => {
    // 3 kB in 40 ms implies 75 MB/s. That is the handshake, not the network.
    const prev: UploadRate = { bytesPerSec: 2 * MB, samples: 3 }
    expect(recordUpload(prev, 3 * 1024, 40)).toBe(prev)
    expect(recordUpload(null, 3 * 1024, 40)).toBeNull()
  })

  it('ignores a sample too brief to time', () => {
    expect(recordUpload(null, 10 * MB, 5)).toBeNull()
  })

  it('survives nonsense without poisoning the rate', () => {
    const prev: UploadRate = { bytesPerSec: 2 * MB, samples: 1 }
    expect(recordUpload(prev, 10 * MB, 0)).toBe(prev)
    expect(recordUpload(prev, 0, 10_000)).toBe(prev)
    expect(recordUpload(prev, Number.NaN, 10_000)).toBe(prev)
  })
})

describe('estimateSeconds', () => {
  it('says nothing until something has been measured', () => {
    // The whole point: a guessed ETA is believed because it carries a unit.
    expect(estimateSeconds(50 * MB, null)).toBeNull()
  })

  it('divides size by the measured rate', () => {
    expect(estimateSeconds(10 * MB, { bytesPerSec: MB, samples: 2 })).toBeCloseTo(10, 5)
  })

  it('returns null for nothing to send, or a rate that cannot be true', () => {
    expect(estimateSeconds(0, { bytesPerSec: MB, samples: 1 })).toBeNull()
    expect(estimateSeconds(MB, { bytesPerSec: 0, samples: 1 })).toBeNull()
  })
})

describe('formatBytes', () => {
  it('uses the unit a person would have used', () => {
    expect(formatBytes(812)).toBe('812 B')
    expect(formatBytes(42_300)).toBe('41,3 kB')
    expect(formatBytes(13_002_342)).toBe('12,4 MB')
  })

  it('follows the locale it is given', () => {
    expect(formatBytes(42_300, 'en')).toBe('41.3 kB')
  })
})

describe('formatDuration', () => {
  it('never prints a zero for work about to happen', () => {
    // "0 s" reads as "nothing to do".
    expect(formatDuration(0.2)).toBe('< 5 s')
    expect(formatDuration(4.9)).toBe('< 5 s')
  })

  it('rounds up, because finishing early is the pleasant surprise', () => {
    expect(formatDuration(12.1)).toBe('13 s')
    expect(formatDuration(59)).toBe('59 s')
  })

  it('switches to minutes and hours', () => {
    expect(formatDuration(90)).toBe('1 min 30 s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(3900)).toBe('1 h 5 min')
  })
})
