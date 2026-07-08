/**
 * Global background-operation state — shared by IPC, tray tooltip, and renderer banners.
 */

export type ActivityKind = 'idle' | 'distill' | 'doc-import' | 'brain-start' | 'indexing' | 'embed'

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

class ActivityManager {
  private state: ActivityState = { kind: 'idle' }
  private broadcast: BroadcastFn | null = null
  private onChange: (() => void) | null = null

  wire(broadcast: BroadcastFn, onChange?: () => void): void {
    this.broadcast = broadcast
    this.onChange = onChange ?? null
  }

  get(): ActivityState {
    return { ...this.state }
  }

  update(patch: ActivityUpdate): void {
    this.state = { ...patch }
    this.broadcast?.('activity:update', this.get())
    this.onChange?.()
  }

  /** Clear only when the current kind matches — avoids clobbering a newer operation. */
  idle(expected?: ActivityKind | ActivityKind[]): void {
    const kinds = expected == null ? undefined : Array.isArray(expected) ? expected : [expected]
    if (kinds && !kinds.includes(this.state.kind)) return
    if (this.state.kind === 'idle') return
    this.state = { kind: 'idle' }
    this.broadcast?.('activity:idle')
    this.onChange?.()
  }

  /** Clear brain pipeline activity (distill / embed / indexing) after run completes. */
  pipelineIdle(): void {
    this.idle(['distill', 'embed', 'indexing'])
  }

  tooltip(): string {
    return activityTrayTooltip(this.state)
  }

  menuLine(): string | null {
    return activityMenuLabel(this.state)
  }
}

export const activity = new ActivityManager()
