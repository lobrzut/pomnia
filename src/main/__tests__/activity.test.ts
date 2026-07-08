import { describe, expect, it, vi } from 'vitest'
import { activity, activityTrayTooltip, type ActivityState } from '../activity.js'

describe('activityTrayTooltip', () => {
  it('returns Pomnia when idle', () => {
    expect(activityTrayTooltip({ kind: 'idle' })).toBe('Pomnia')
  })

  it('formats distill progress with detail', () => {
    const s: ActivityState = {
      kind: 'distill',
      done: 3,
      total: 7,
      detail: 'przypomnij sobie akcje z brain vault',
    }
    expect(activityTrayTooltip(s)).toBe('Pomnia — destylacja 3/7 — przypomnij sobie akcje z brain vault')
  })

  it('formats doc import without counter', () => {
    expect(activityTrayTooltip({ kind: 'doc-import', detail: 'report.epub' })).toBe(
      'Pomnia — import dokumentu — report.epub',
    )
  })
})

describe('activity manager', () => {
  it('broadcasts update and idle', () => {
    const broadcast = vi.fn()
    const onChange = vi.fn()
    activity.wire(broadcast, onChange)

    activity.update({ kind: 'distill', done: 1, total: 5, detail: 'chat A' })
    expect(activity.get().kind).toBe('distill')
    expect(broadcast).toHaveBeenCalledWith('activity:update', expect.objectContaining({ kind: 'distill' }))
    expect(onChange).toHaveBeenCalled()

    activity.idle('distill')
    expect(activity.get().kind).toBe('idle')
    expect(broadcast).toHaveBeenCalledWith('activity:idle')

    activity.update({ kind: 'indexing', phase: 'reindex' })
    activity.idle('distill')
    expect(activity.get().kind).toBe('indexing')
  })
})
