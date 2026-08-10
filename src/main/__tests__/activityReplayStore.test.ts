import { describe, expect, it, vi } from 'vitest'

// Pulled in transitively via activity.ts → mainStrings → appSettings.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/pomnia-test' } }))

import { buildReplayFromSession, type LastActivityReplay } from '../activityReplayStore.js'
import { PIPELINE_FINALE_MS } from '../activity.js'

describe('buildReplayFromSession', () => {
  it('builds timed steps from session samples', () => {
    const t0 = 1_000_000
    const replay = buildReplayFromSession(
      [
        { state: { kind: 'distill', phase: 'distill', done: 1, total: 3 }, at: t0 },
        { state: { kind: 'distill', phase: 'distill', done: 3, total: 3 }, at: t0 + 2000 },
        { state: { kind: 'indexing', phase: 'reindex' }, at: t0 + 4000 },
        { state: { kind: 'finale' }, at: t0 + 5500 },
      ],
      t0 + 5500 + PIPELINE_FINALE_MS,
    ) as LastActivityReplay

    expect(replay.steps.length).toBeGreaterThanOrEqual(3)
    expect(replay.steps[0].kind).toBe('distill')
    expect(replay.steps.some((s) => s.kind === 'finale')).toBe(true)
    expect(replay.steps.find((s) => s.kind === 'finale')?.durationMs).toBe(PIPELINE_FINALE_MS)
  })

  it('returns null for empty session', () => {
    expect(buildReplayFromSession([], Date.now())).toBeNull()
  })
})
