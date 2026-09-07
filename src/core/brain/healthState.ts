// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Is Pomnia actually reachable, and does it still accept our credentials?
 *
 * The app already knew the answer and kept it to itself. A token gets revoked
 * or rotated, every screen starts failing, and the first sign of it is an agent
 * answering from nothing in the middle of a conversation — because the memory
 * it was supposed to consult was never connected. That is the worst possible
 * moment to find out, and it is the one this exists to prevent.
 *
 * The state machine is here, apart from the timer and the fetch, because the
 * rules about *when to speak* are the part worth testing. Two of them:
 *
 *   - Announce transitions, never states. A tray that repeats "still broken"
 *     every minute trains you to ignore the tray, which costs more than saying
 *     nothing would have.
 *   - One unreachable poll is not an outage. A laptop suspends, a wifi drops,
 *     a server restarts; a single failed probe is normal life, so it takes
 *     agreement across polls before it is worth interrupting anyone.
 */

export type HealthState = 'ok' | 'no-target' | 'unauthorized' | 'unreachable'

/** How many consecutive bad probes before we accept a fault is real. */
export const FAILURES_BEFORE_ALARM = 2

export interface WatchMemory {
  /** The last state we told anybody about. `null` before the first verdict. */
  announced: HealthState | null
  /** Consecutive probes agreeing on the current candidate. */
  streak: number
  candidate: HealthState | null
}

export function freshMemory(): WatchMemory {
  return { announced: null, streak: 0, candidate: null }
}

export interface Verdict {
  /** What to remember for the next probe. */
  memory: WatchMemory
  /** Set when the user should be told something changed. */
  announce: HealthState | null
  /** True when this announcement is the recovery from a fault. */
  recovered: boolean
}

/**
 * Fold one probe into the memory and decide whether to speak.
 *
 * `unauthorized` alarms immediately: the server answered, clearly, that the
 * credential is no longer good. Waiting for a second opinion on a definite
 * answer only delays the fix. `unreachable` is the one that needs corroboration.
 */
export function observe(memory: WatchMemory, probe: HealthState): Verdict {
  const streak = memory.candidate === probe ? memory.streak + 1 : 1
  const next: WatchMemory = { ...memory, candidate: probe, streak }

  const settled =
    probe === 'unreachable' ? streak >= FAILURES_BEFORE_ALARM : true

  if (!settled) return { memory: next, announce: null, recovered: false }
  if (memory.announced === probe) return { memory: next, announce: null, recovered: false }

  // The very first verdict is worth saying only when something is wrong;
  // announcing "ok" at startup is a notification nobody asked for.
  if (memory.announced === null && probe === 'ok') {
    return { memory: { ...next, announced: 'ok' }, announce: null, recovered: false }
  }

  return {
    memory: { ...next, announced: probe },
    announce: probe,
    recovered: probe === 'ok',
  }
}

/** Classify one HTTP outcome. Kept separate so the caller owns the fetch. */
export function classify(input: {
  hasTarget: boolean
  hasToken: boolean
  /** Undefined when the request never got an answer. */
  status?: number
}): HealthState {
  if (!input.hasTarget) return 'no-target'
  if (!input.hasToken) return 'unauthorized'
  if (input.status === undefined) return 'unreachable'
  if (input.status === 401 || input.status === 403) return 'unauthorized'
  // Anything the server actually answered — including a 500 — means the server
  // is there. A broken server is a different problem from a missing one, and
  // reporting it as "unreachable" would send the user looking at their network.
  return input.status >= 200 && input.status < 500 ? 'ok' : 'unreachable'
}
