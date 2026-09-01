import { describe, expect, it } from 'vitest'

import {
  afterCall,
  CALLS_BEFORE_NAG,
  freshState,
  isWritingTool,
  MS_BEFORE_NAG,
  NAG_COOLDOWN_MS,
  type UnsavedState,
} from './unsavedWork.js'

const T0 = 1_700_000_000_000
const on = { autoCheckpointEnabled: true }

/** Walk n non-writing calls forward, ending `elapsed` ms after the start. */
function run(state: UnsavedState, n: number, elapsed: number, opts = on): {
  state: UnsavedState
  reminders: string[]
} {
  const reminders: string[] = []
  let s = state
  for (let i = 1; i <= n; i++) {
    const d = afterCall({ tool: 'search_library', state: s, now: T0 + (elapsed * i) / n, ...opts })
    if (d.reminder) reminders.push(d.reminder)
    s = d.next
  }
  return { state: s, reminders }
}

describe('afterCall', () => {
  it('says nothing during a short burst of recall', () => {
    // A session that reads a lot and has decided nothing yet is not at fault.
    const { reminders } = run(freshState(T0), 30, 60_000)
    expect(reminders).toEqual([])
  })

  it('says nothing on an idle server with few calls', () => {
    const { reminders } = run(freshState(T0), 3, 4 * MS_BEFORE_NAG)
    expect(reminders).toEqual([])
  })

  it('reminds once both the call count and the quiet time are crossed', () => {
    const { reminders } = run(freshState(T0), CALLS_BEFORE_NAG + 2, MS_BEFORE_NAG + 60_000)
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toContain('checkpoint_session')
    expect(reminders[0]).toContain('not saved')
  })

  it('does not repeat itself inside the cooldown', () => {
    let s = freshState(T0)
    s = run(s, CALLS_BEFORE_NAG + 1, MS_BEFORE_NAG + 60_000).state
    // Already nagged above; keep calling well inside the cooldown.
    const again = afterCall({ tool: 'search_library', state: s, now: T0 + MS_BEFORE_NAG + 120_000, ...on })
    expect(again.reminder).toBeNull()
  })

  it('reminds again once the cooldown has passed', () => {
    let s = freshState(T0)
    s = run(s, CALLS_BEFORE_NAG + 1, MS_BEFORE_NAG + 60_000).state
    const later = afterCall({
      tool: 'search_library',
      state: s,
      now: T0 + MS_BEFORE_NAG + NAG_COOLDOWN_MS + 120_000,
      ...on,
    })
    expect(later.reminder).toContain('Pomnia:')
  })

  it('resets everything when a checkpoint lands', () => {
    let s = freshState(T0)
    s = run(s, CALLS_BEFORE_NAG + 1, MS_BEFORE_NAG + 60_000).state
    const d = afterCall({ tool: 'checkpoint_session', state: s, now: T0 + MS_BEFORE_NAG + 90_000, ...on })
    expect(d.reminder).toBeNull()
    expect(d.next.callsSinceWrite).toBe(0)
    expect(d.next.lastWriteAt).toBe(T0 + MS_BEFORE_NAG + 90_000)
  })

  it('stays quiet when the user has turned auto-checkpoint off', () => {
    // The setting is an instruction, not a preference to talk them out of.
    const { reminders } = run(freshState(T0), CALLS_BEFORE_NAG + 5, MS_BEFORE_NAG * 2, {
      autoCheckpointEnabled: false,
    })
    expect(reminders).toEqual([])
  })

  it('still counts calls while auto-checkpoint is off', () => {
    // So switching it back on does not start from zero and stay silent.
    const { state } = run(freshState(T0), 5, 60_000, { autoCheckpointEnabled: false })
    expect(state.callsSinceWrite).toBe(5)
  })

  it('counts memory as a write — it is durable too', () => {
    expect(isWritingTool('memory')).toBe(true)
    expect(isWritingTool('save_conversation')).toBe(true)
    expect(isWritingTool('search_library')).toBe(false)
  })

  it('reports the quiet time in minutes so the number means something', () => {
    // Stated directly rather than walked, so the number under test is the one
    // the assertion names.
    const d = afterCall({
      tool: 'search_library',
      state: { callsSinceWrite: CALLS_BEFORE_NAG, lastWriteAt: T0, lastNagAt: 0 },
      now: T0 + 40 * 60_000,
      ...on,
    })
    expect(d.reminder).toMatch(/in 40 minutes/)
    expect(d.reminder).toMatch(new RegExp(`\(${CALLS_BEFORE_NAG + 1} tool calls\)`))
  })
})
