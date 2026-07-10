import { describe, expect, it } from 'vitest'
import { replayTimeline, replayTotalMs, synthesizeReplaySteps } from './activityReplay'
import type { LastActivityReplay } from './types'

describe('activityReplay', () => {
  it('synthesizes distill timeline with finale', () => {
    const steps = synthesizeReplaySteps('distill', 'test chat')
    expect(steps.some((s) => s.kind === 'finale')).toBe(true)
    expect(steps[0].kind).toBe('distill')
  })

  it('replays stored MCP query', () => {
    const snapshot: LastActivityReplay = {
      completedAt: new Date().toISOString(),
      steps: [{ kind: 'mcp-query', phase: 'search_library', detail: 'vault', durationMs: 2000 }],
    }
    const timeline = replayTimeline(snapshot)
    expect(timeline).toHaveLength(1)
    expect(timeline[0].state.kind).toBe('mcp-query')
    expect(replayTotalMs(snapshot)).toBe(2000)
  })

  it('replays doc-import branch', () => {
    const snapshot: LastActivityReplay = {
      completedAt: new Date().toISOString(),
      steps: [
        { kind: 'doc-import', phase: 'parse', detail: 'book.epub', durationMs: 1500 },
        { kind: 'indexing', phase: 'index', durationMs: 1800 },
      ],
    }
    const timeline = replayTimeline(snapshot)
    expect(timeline.map((t) => t.state.kind)).toEqual(['doc-import', 'indexing'])
  })
})
