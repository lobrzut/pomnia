// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Global background-operation state — shared by IPC, tray tooltip, and renderer banners.
 */

import {
  buildReplayFromSession,
  saveLastActivityReplay,
} from './activityReplayStore.js'

export type ActivityKind =
  | 'idle'
  | 'distill'
  | 'doc-import'
  | 'brain-start'
  | 'indexing'
  | 'embed'
  | 'mcp-query'
  | 'finale'

export interface ActivityUpdate {
  kind: Exclude<ActivityKind, 'idle'>
  phase?: string
  done?: number
  total?: number
  detail?: string
}

export interface ActivityState {
  kind: ActivityKind
  phase?: string
  done?: number
  total?: number
  detail?: string
}

const TRAY_KIND: Record<Exclude<ActivityKind, 'idle'>, string> = {
  distill: 'destylacja',
  'doc-import': 'import dokumentu',
  'brain-start': 'uruchamianie Brain',
  indexing: 'indeksowanie',
  embed: 'embeddingi',
  'mcp-query': 'zapytanie MCP',
  finale: 'indeks gotowy',
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function activityTrayTooltip(state: ActivityState): string {
  if (state.kind === 'idle') return 'Pomnia'
  const label = TRAY_KIND[state.kind]
  const progress =
    state.done != null && state.total != null && state.total > 0 ? ` ${state.done}/${state.total}` : ''
  const detail = state.detail ? ` — ${truncate(state.detail, 36)}` : ''
  return `Pomnia — ${label}${progress}${detail}`
}

export function activityMenuLabel(state: ActivityState): string | null {
  if (state.kind === 'idle') return null
  return activityTrayTooltip(state).replace(/^Pomnia — /, 'Trwa: ')
}

type BroadcastFn = (channel: 'activity:update' | 'activity:idle', payload?: ActivityState) => void

/** Post-distill celebration pulse on the flow diagram (~2.5s). */
export const PIPELINE_FINALE_MS = 2600

const PIPELINE_KINDS: ActivityKind[] = ['distill', 'embed', 'indexing']
const SESSION_STEP_CAP = 32

function sessionStepKey(state: ActivityState): string {
  return `${state.kind}|${state.phase ?? ''}|${state.done ?? ''}|${state.total ?? ''}|${state.detail ?? ''}`
}

class ActivityManager {
  private state: ActivityState = { kind: 'idle' }
  private broadcast: BroadcastFn | null = null
  private onChange: (() => void) | null = null
  private finaleTimer: ReturnType<typeof setTimeout> | null = null
  private sessionSamples: Array<{ state: ActivityState; at: number }> = []

  wire(broadcast: BroadcastFn, onChange?: () => void): void {
    this.broadcast = broadcast
    this.onChange = onChange ?? null
  }

  get(): ActivityState {
    return { ...this.state }
  }

  private recordSessionSample(): void {
    const snapshot = this.get()
    if (snapshot.kind === 'idle') return
    const last = this.sessionSamples[this.sessionSamples.length - 1]
    if (last && sessionStepKey(last.state) === sessionStepKey(snapshot)) return
    this.sessionSamples.push({ state: snapshot, at: Date.now() })
    if (this.sessionSamples.length > SESSION_STEP_CAP) this.sessionSamples.shift()
  }

  private resetSession(): void {
    this.sessionSamples = []
  }

  private persistSession(): void {
    if (this.sessionSamples.length === 0) return
    const replay = buildReplayFromSession(this.sessionSamples, Date.now())
    this.resetSession()
    if (!replay) return
    void saveLastActivityReplay(replay).catch(() => {})
  }

  private clearFinaleTimer(): void {
    if (this.finaleTimer) {
      clearTimeout(this.finaleTimer)
      this.finaleTimer = null
    }
  }

  update(patch: ActivityUpdate): void {
    this.clearFinaleTimer()
    this.state = { ...patch }
    this.recordSessionSample()
    this.broadcast?.('activity:update', this.get())
    this.onChange?.()
  }

  /** Clear only when the current kind matches — avoids clobbering a newer operation. */
  idle(expected?: ActivityKind | ActivityKind[]): void {
    const kinds = expected == null ? undefined : Array.isArray(expected) ? expected : [expected]
    if (kinds && !kinds.includes(this.state.kind)) return
    if (this.state.kind === 'idle') return
    this.persistSession()
    this.state = { kind: 'idle' }
    this.broadcast?.('activity:idle')
    this.onChange?.()
  }

  /** Clear brain pipeline activity (distill / embed / indexing) after run completes. */
  pipelineIdle(): void {
    if (this.state.kind === 'finale') return
    this.clearFinaleTimer()
    this.idle(PIPELINE_KINDS)
  }

  /** Brief flow-diagram finale after a successful distill + index / reindex. */
  pipelineFinale(): void {
    if (this.state.kind === 'mcp-query') return
    this.clearFinaleTimer()
    this.state = { kind: 'finale' }
    this.recordSessionSample()
    this.broadcast?.('activity:update', this.get())
    this.onChange?.()
    this.finaleTimer = setTimeout(() => {
      this.finaleTimer = null
      if (this.state.kind === 'finale') {
        this.persistSession()
        this.state = { kind: 'idle' }
        this.broadcast?.('activity:idle')
        this.onChange?.()
      }
    }, PIPELINE_FINALE_MS)
  }

  tooltip(): string {
    return activityTrayTooltip(this.state)
  }

  menuLine(): string | null {
    return activityMenuLabel(this.state)
  }
}

export const activity = new ActivityManager()
export type { LastActivityReplay } from './activityReplayStore.js'
