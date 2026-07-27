// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import type { ActivityKind, ActivityReplayStep, ActivityState, LastActivityReplay } from './types'

const PIPELINE_FINALE_MS = 2600
const DEFAULT_STEP_MS = 1400
const MCP_REPLAY_MS = 2400

function toActivityState(step: ActivityReplayStep): ActivityState {
  return {
    kind: step.kind,
    phase: step.phase,
    done: step.done,
    total: step.total,
    detail: step.detail,
  }
}

/** Fallback timeline when only the primary kind is known (legacy / partial snapshots). */
export function synthesizeReplaySteps(primaryKind: Exclude<ActivityKind, 'idle'>, detail?: string): ActivityReplayStep[] {
  switch (primaryKind) {
    case 'distill':
      return [
        { kind: 'distill', phase: 'distill', done: 1, total: 3, durationMs: 1800 },
        { kind: 'distill', phase: 'distill', done: 3, total: 3, durationMs: 1600, detail },
        { kind: 'indexing', phase: 'reindex', done: 1, total: 1, durationMs: 1800, detail: 'po destylacji…' },
        { kind: 'finale', durationMs: PIPELINE_FINALE_MS },
      ]
    case 'doc-import':
      return [
        { kind: 'doc-import', phase: 'parse', done: 1, total: 1, durationMs: 1600, detail },
        { kind: 'indexing', phase: 'index', done: 1, total: 1, durationMs: 1800 },
      ]
    case 'brain-start':
      return [{ kind: 'brain-start', phase: 'start', durationMs: DEFAULT_STEP_MS, detail }]
    case 'indexing':
    case 'embed':
      return [
        { kind: primaryKind, phase: 'index', done: 1, total: 2, durationMs: 1600, detail },
        { kind: primaryKind, phase: 'index', done: 2, total: 2, durationMs: 1600, detail },
      ]
    case 'mcp-query':
      return [{ kind: 'mcp-query', phase: detail, detail, durationMs: MCP_REPLAY_MS }]
    case 'finale':
      return [{ kind: 'finale', durationMs: PIPELINE_FINALE_MS }]
    default:
      return [{ kind: primaryKind, durationMs: DEFAULT_STEP_MS, detail }]
  }
}

export function normalizeReplaySteps(snapshot: LastActivityReplay): ActivityState[] {
  const steps = snapshot.steps?.length
    ? snapshot.steps
    : synthesizeReplaySteps('distill')
  return steps.map(toActivityState)
}

export function replayTimeline(snapshot: LastActivityReplay): Array<{ state: ActivityState; durationMs: number }> {
  const steps = snapshot.steps?.length
    ? snapshot.steps
    : synthesizeReplaySteps('distill')
  return steps.map((step) => ({
    state: toActivityState(step),
    durationMs: step.durationMs > 0 ? step.durationMs : DEFAULT_STEP_MS,
  }))
}

export function replayTotalMs(snapshot: LastActivityReplay): number {
  return replayTimeline(snapshot).reduce((sum, step) => sum + step.durationMs, 0)
}

export function primaryReplayKind(snapshot: LastActivityReplay): Exclude<ActivityKind, 'idle'> {
  const first = snapshot.steps.find((s) => s.kind !== 'finale')
  return first?.kind ?? snapshot.steps[0]?.kind ?? 'distill'
}
