import { describe, expect, it } from 'vitest'

import { collectHealth } from './health.js'
import { collectOverview, createActivityRing } from './admin/overview.js'

/**
 * The live server reported `uptimeSec: -7028` — running for minus two hours.
 *
 * Nothing in the code reassigns the start instant; the wall clock moved. That
 * is routine on a server: NTP corrects a drifted VM or container clock and every
 * reading taken against a fixed `Date.now()` from boot is measured against an
 * instant that has since shifted.
 *
 * Two guards, because they fail differently. The server derives the start from
 * `process.uptime()`, which is monotonic — that is the fix. These clamps are the
 * floor under it: whatever a caller passes, a negative uptime is never a fact a
 * panel or a monitor can act on.
 */
const clockMovedBackwards = Date.now() + 2 * 60 * 60 * 1000

describe('uptime is never negative', () => {
  it('clamps in the health report', async () => {
    const health = await collectHealth({
      db: null,
      embedder: null,
      vaultRoot: '',
      dataDir: '',
      version: '0.0.0-test',
      authRequired: false,
      writable: false,
      vaultOwner: null,
      startedAt: clockMovedBackwards,
    })
    expect(health.uptimeSec).toBe(0)
  })

  it('clamps in the panel overview', async () => {
    const overview = await collectOverview({
      db: null,
      vaultRoot: '',
      ring: createActivityRing(),
      startedAt: clockMovedBackwards,
      version: '0.0.0-test',
    })
    expect(overview.uptimeSec).toBe(0)
  })

  it('still reports a real uptime forwards', async () => {
    const overview = await collectOverview({
      db: null,
      vaultRoot: '',
      ring: createActivityRing(),
      startedAt: Date.now() - 5_000,
      version: '0.0.0-test',
    })
    expect(overview.uptimeSec).toBeGreaterThanOrEqual(4)
    expect(overview.uptimeSec).toBeLessThanOrEqual(6)
  })
})

describe('process.uptime is the monotonic source the server uses', () => {
  /**
   * Guards the premise rather than the arithmetic: if this ever stopped being
   * monotonic, deriving the start instant from it would be no better than the
   * fixed timestamp it replaced.
   */
  it('never goes backwards between two reads', () => {
    const a = process.uptime()
    const b = process.uptime()
    expect(b).toBeGreaterThanOrEqual(a)
  })

  it('yields a start instant no later than now', () => {
    const derived = Date.now() - Math.round(process.uptime() * 1000)
    expect(derived).toBeLessThanOrEqual(Date.now())
  })
})
