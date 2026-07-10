import { promises as fs } from 'fs'
import { join } from 'path'
import { PIPELINE_FINALE_MS, type ActivityKind, type ActivityState } from './activity.js'

export interface ActivityReplayStep {
  kind: Exclude<ActivityKind, 'idle'>
  phase?: string
  done?: number
  total?: number
  detail?: string
  durationMs: number
}

export interface LastActivityReplay {
  completedAt: string
  steps: ActivityReplayStep[]
}

const MIN_STEP_MS = 700
const MAX_STEP_MS = 4500
const DEFAULT_STEP_MS = 1400

let replayFilePath: string | null = null
let cachedLastReplay: LastActivityReplay | null = null
let pendingSave: Promise<void> | null = null

export async function flushActivityReplayStore(): Promise<void> {
  if (pendingSave) await pendingSave
}

export function initActivityReplayStore(userData: string): void {
  replayFilePath = join(userData, 'last-activity-replay.json')
}

export function getLastActivityReplay(): LastActivityReplay | null {
  return cachedLastReplay
}

function stepKey(state: ActivityState): string {
  return `${state.kind}|${state.phase ?? ''}|${state.done ?? ''}|${state.total ?? ''}|${state.detail ?? ''}`
}

function clampDuration(ms: number): number {
  return Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, ms))
}

/** Turn captured session samples into a replay timeline with per-step durations. */
export function buildReplayFromSession(
  samples: Array<{ state: ActivityState; at: number }>,
  endedAt: number,
): LastActivityReplay | null {
  const meaningful = samples.filter((s) => s.state.kind !== 'idle')
  if (meaningful.length === 0) return null

  const steps: ActivityReplayStep[] = []
  for (let i = 0; i < meaningful.length; i++) {
    const { state, at } = meaningful[i]
    const nextAt = i + 1 < meaningful.length ? meaningful[i + 1].at : endedAt
    const raw = nextAt - at
    const durationMs =
      state.kind === 'finale'
        ? PIPELINE_FINALE_MS
        : clampDuration(raw > 0 ? raw : DEFAULT_STEP_MS)

    const last = steps[steps.length - 1]
    const candidate: ActivityReplayStep = {
      kind: state.kind as Exclude<ActivityKind, 'idle'>,
      phase: state.phase,
      done: state.done,
      total: state.total,
      detail: state.detail,
      durationMs,
    }
    if (last && stepKey(last) === stepKey(candidate)) continue
    steps.push(candidate)
  }

  if (steps.length === 0) return null
  return { completedAt: new Date(endedAt).toISOString(), steps }
}

export async function loadLastActivityReplay(): Promise<LastActivityReplay | null> {
  if (!replayFilePath) return null
  try {
    const raw = await fs.readFile(replayFilePath, 'utf8')
    const parsed = JSON.parse(raw) as LastActivityReplay
    if (!parsed?.steps?.length) return null
    cachedLastReplay = parsed
    return parsed
  } catch {
    cachedLastReplay = null
    return null
  }
}

export async function saveLastActivityReplay(replay: LastActivityReplay): Promise<void> {
  cachedLastReplay = replay
  if (!replayFilePath) return
  pendingSave = fs.writeFile(replayFilePath, JSON.stringify(replay, null, 2), 'utf8')
  await pendingSave
  pendingSave = null
}
