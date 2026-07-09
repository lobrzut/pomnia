import { describe, expect, it, vi } from 'vitest'
import { activity, activityTrayTooltip, PIPELINE_FINALE_MS, type ActivityState } from '../activity.js'

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

  it('pipelineIdle clears distill, embed, and indexing', () => {
    const broadcast = vi.fn()
    activity.wire(broadcast, vi.fn())

    activity.update({ kind: 'indexing', phase: 'reindex', detail: 'po destylacji…' })
    activity.pipelineIdle()
    expect(activity.get().kind).toBe('idle')
    expect(broadcast).toHaveBeenCalledWith('activity:idle')

    activity.update({ kind: 'distill', detail: 'przypomnij sobie…' })
    activity.pipelineIdle()
    expect(activity.get().kind).toBe('idle')

    activity.update({ kind: 'embed', phase: 'index', done: 2, total: 5 })
    activity.pipelineIdle()
    expect(activity.get().kind).toBe('idle')
  })

  it('idle is a no-op when already idle', () => {
    const broadcast = vi.fn()
    activity.wire(broadcast, vi.fn())
    activity.idle('distill')
    broadcast.mockClear()
    activity.idle('distill')
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('pipelineFinale plays brief finale then idles', () => {
    vi.useFakeTimers()
    const broadcast = vi.fn()
    activity.wire(broadcast, vi.fn())

    activity.update({ kind: 'embed', phase: 'index', done: 5, total: 5 })
    activity.pipelineFinale()
    expect(activity.get().kind).toBe('finale')
    expect(broadcast).toHaveBeenCalledWith('activity:update', expect.objectContaining({ kind: 'finale' }))

    vi.advanceTimersByTime(PIPELINE_FINALE_MS)
    expect(activity.get().kind).toBe('idle')
    expect(broadcast).toHaveBeenCalledWith('activity:idle')

    vi.useRealTimers()
  })

  it('pipelineFinale yields to real mcp-query', () => {
    activity.wire(vi.fn(), vi.fn())
    activity.update({ kind: 'mcp-query', phase: 'search_library', detail: 'vault' })
    activity.pipelineFinale()
    expect(activity.get().kind).toBe('mcp-query')
  })

  it('real mcp-query cancels pending finale timer', () => {
    vi.useFakeTimers()
    const broadcast = vi.fn()
    activity.wire(broadcast, vi.fn())

    activity.pipelineFinale()
    activity.update({ kind: 'mcp-query', phase: 'get_skill' })
    expect(activity.get().kind).toBe('mcp-query')
    vi.advanceTimersByTime(PIPELINE_FINALE_MS)
    expect(activity.get().kind).toBe('mcp-query')

    vi.useRealTimers()
  })
})
