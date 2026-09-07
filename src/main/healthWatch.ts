// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Tell the user when Pomnia stops being connected, without being asked.
 *
 * Everything needed for this already existed and none of it reached anybody.
 * `replica.hasToken` said a token was saved, which stays true after it is
 * revoked. The tray set a tooltip and nothing else. And the one poller in the
 * app, mcpActivityPoll, is gated on `windowFocused` — so it stopped checking at
 * exactly the moment the user was not looking, which is the moment this
 * question matters.
 *
 * So this one runs on its own schedule whether or not a window is open, and it
 * runs *because* nobody is watching, not in spite of it.
 *
 * What it deliberately does not do is talk much. The decision of when to speak
 * lives in core/brain/healthState.ts and is tested there: transitions only,
 * never states; a repeated fault says nothing after the first time; and a
 * single unreachable probe is not an outage, because laptops suspend and
 * containers restart and a tray that cries wolf is a tray you stop reading.
 */

import { Notification } from 'electron'

import { brainBaseUrl } from '@core/brain/brainTarget.js'
import {
  classify,
  freshMemory,
  observe,
  type HealthState,
  type WatchMemory,
} from '@core/brain/healthState.js'
import { log } from '@core/index.js'

import { getAppSettings } from './appSettings.js'

/**
 * A minute is short enough that the user learns before the next conversation,
 * and long enough that a laptop on battery does not notice.
 */
const POLL_MS = 60_000

let timer: ReturnType<typeof setInterval> | null = null
let memory: WatchMemory = freshMemory()
let current: HealthState = 'ok'
let notify: ((state: HealthState, recovered: boolean) => void) | null = null

/** The last verdict, for the tray tooltip and the renderer. */
export function healthWatchState(): HealthState {
  return current
}

async function probe(): Promise<HealthState> {
  const s = getAppSettings()
  const url = (s.brainMcpUrl ?? '').trim()
  const token = (s.replicaToken ?? '').trim() || (s.connectToken ?? '').trim()

  if (!url) return classify({ hasTarget: false, hasToken: !!token })
  if (!token) return classify({ hasTarget: true, hasToken: false })

  try {
    // `/healthz` with a bearer is the cheapest question that exercises both
    // halves at once: can we reach it, and does it still accept us.
    const r = await fetch(`${brainBaseUrl(url)}/healthz`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    return classify({ hasTarget: true, hasToken: true, status: r.status })
  } catch {
    return classify({ hasTarget: true, hasToken: true })
  }
}

async function tick(): Promise<void> {
  const s = getAppSettings()
  // An embedded brain is a different question with its own reporting, and a
  // deliberately stopped one must not produce a warning every minute.
  if ((s.brainTarget ?? 'embedded') !== 'remote' && !s.brainMcpUrl?.trim()) return

  const state = await probe()
  const verdict = observe(memory, state)
  memory = verdict.memory
  current = state
  if (!verdict.announce) return
  log.info(`health watch: ${verdict.announce}${verdict.recovered ? ' (recovered)' : ''}`)
  notify?.(verdict.announce, verdict.recovered)
}

export function startHealthWatch(
  onAnnounce: (state: HealthState, recovered: boolean) => void,
): void {
  notify = onAnnounce
  if (timer) return
  timer = setInterval(() => void tick(), POLL_MS)
  // Not immediately: at launch the server may still be coming up, and the
  // first thing a user sees should not be a warning about a race they are
  // already losing on purpose.
  setTimeout(() => void tick(), 15_000)
}

export function stopHealthWatch(): void {
  if (timer) clearInterval(timer)
  timer = null
  notify = null
  memory = freshMemory()
}

/** Force a check now — after the user pastes a token, for instance. */
export async function checkHealthNow(): Promise<HealthState> {
  await tick()
  return current
}

/** Show it. Kept here so the caller does not have to know about Electron. */
export function showHealthNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  try {
    new Notification({ title, body, silent: false }).show()
  } catch (e) {
    // A notification that cannot be shown is not a reason to take the app down.
    log.warn('health notification failed:', (e as Error).message)
  }
}
