// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Tell the agent when nothing has been written to the vault for a long time.
 *
 * Pomnia cannot force a save. It is an MCP server: it sees tool calls, not the
 * agent's remaining context, and by the time a context window ends the agent is
 * simply gone — no shutdown, no last call, nothing to hook. A session can spend
 * an hour making decisions and end with the vault untouched, which is exactly
 * what happens today, because saving depends on the agent remembering to.
 *
 * The one channel that reliably reaches an agent mid-session is the text it
 * already reads: tool results. So state the fact, in the result of whatever it
 * called anyway. No new tool to discover, no client support required, works the
 * same in Cursor, Claude, Gemini and anything else on the wire.
 *
 * This is a property of the vault, not of one conversation. The server has no
 * session identity — several agents share one process — but "nothing has been
 * saved in 40 minutes and 18 calls" is true and actionable for whoever reads it.
 * That is why the counters are global and deliberately so.
 *
 * Both thresholds must trip. Calls alone would nag a burst of recall in a
 * session with nothing worth keeping yet; time alone would nag an idle server.
 */

/** Calls since the last write before nagging is warranted. */
export const CALLS_BEFORE_NAG = 12
/** …and this long, so a fast burst of recall is not treated as a session. */
export const MS_BEFORE_NAG = 25 * 60 * 1000
/** Do not repeat the reminder more often than this. */
export const NAG_COOLDOWN_MS = 10 * 60 * 1000

export interface UnsavedState {
  /** Tool calls since the last successful write to the vault. */
  callsSinceWrite: number
  /** Epoch ms of the last write, or of process start when there has been none. */
  lastWriteAt: number
  /** Epoch ms of the last reminder, or 0. */
  lastNagAt: number
}

export function freshState(now: number): UnsavedState {
  return { callsSinceWrite: 0, lastWriteAt: now, lastNagAt: 0 }
}

/** A tool that puts something durable in the vault resets the count. */
export function isWritingTool(name: string): boolean {
  return name === 'save_conversation' || name === 'checkpoint_session' || name === 'memory'
}

export interface NagDecision {
  /** Text to append to the tool result, or null. */
  reminder: string | null
  /** State to carry forward. */
  next: UnsavedState
}

/**
 * Decide after a call has been served.
 *
 * `autoCheckpointEnabled` off means the user has said not to write unprompted;
 * nagging them to anyway would be arguing with a setting.
 */
export function afterCall(opts: {
  tool: string
  state: UnsavedState
  now: number
  autoCheckpointEnabled: boolean
}): NagDecision {
  const { tool, state, now } = opts

  if (isWritingTool(tool)) {
    return { reminder: null, next: { callsSinceWrite: 0, lastWriteAt: now, lastNagAt: 0 } }
  }

  const next: UnsavedState = { ...state, callsSinceWrite: state.callsSinceWrite + 1 }
  if (!opts.autoCheckpointEnabled) return { reminder: null, next }

  const quietMs = now - state.lastWriteAt
  if (next.callsSinceWrite < CALLS_BEFORE_NAG || quietMs < MS_BEFORE_NAG) {
    return { reminder: null, next }
  }
  if (state.lastNagAt > 0 && now - state.lastNagAt < NAG_COOLDOWN_MS) {
    return { reminder: null, next }
  }

  const minutes = Math.round(quietMs / 60_000)
  return {
    reminder:
      `\n\n---\nPomnia: nothing has been written to the vault in ${minutes} minutes ` +
      `(${next.callsSinceWrite} tool calls). Whatever this session decided is not saved ` +
      `yet, and this server has no way to save it for you once your context ends. ` +
      `If a decision, a fix with a file path, or an error and its command have landed, ` +
      `call checkpoint_session now — it is cheap, and unlike the conversation it survives.`,
    next: { ...next, lastNagAt: now },
  }
}
