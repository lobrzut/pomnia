// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Send agent-behaviour settings to a brain-core running elsewhere.
 *
 * The handshake phrase and auto-checkpoint are not app preferences — they are
 * server behaviour. brain-core injects the phrase into every tool description
 * an agent reads, and refuses `checkpoint_session` when auto-checkpoint is off.
 * The desktop configured them by calling `setHandshake()` on the brain-core it
 * had started itself, which works for an embedded brain and does nothing at all
 * for a remote one.
 *
 * So on a remote target both toggles were decoration: they wrote a local file
 * that nothing on the answering side ever read, while the UI showed them as
 * settings that had been applied. The server has accepted these over
 * `PUT /admin/behaviour` the whole time; nobody was calling it.
 *
 * Needs an admin token — the same one replication uses. An agent token cannot
 * change how the server behaves, which is correct: those live in six client
 * configs and are meant only to read and write memory.
 */

import { brainBaseUrl } from './brainTarget.js'

export interface RemoteBehaviour {
  handshakePhrase?: string
  handshakeEnabled?: boolean
  autoCheckpointEnabled?: boolean
}

export type BehaviourPushResult =
  | { ok: true; applied: RemoteBehaviour }
  | { ok: false; reason: 'no-url' | 'no-token' | 'rejected' | 'unreachable'; detail: string }

/** `http://host:7865/admin` or `…/mcp` → `http://host:7865`. */
export const behaviourBaseUrl = brainBaseUrl

/**
 * Only the fields that were actually asked for.
 *
 * Sending the whole object would overwrite settings this app never showed —
 * `instanceLabel` among them — with whatever it happens to hold locally.
 */
export function behaviourPayload(next: RemoteBehaviour): RemoteBehaviour {
  const out: RemoteBehaviour = {}
  if (typeof next.handshakePhrase === 'string' && next.handshakePhrase.trim()) {
    out.handshakePhrase = next.handshakePhrase.trim()
  }
  if (typeof next.handshakeEnabled === 'boolean') out.handshakeEnabled = next.handshakeEnabled
  if (typeof next.autoCheckpointEnabled === 'boolean') {
    out.autoCheckpointEnabled = next.autoCheckpointEnabled
  }
  return out
}

export async function pushRemoteBehaviour(opts: {
  brainUrl?: string
  adminToken?: string
  next: RemoteBehaviour
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<BehaviourPushResult> {
  const url = (opts.brainUrl ?? '').trim()
  if (!url) return { ok: false, reason: 'no-url', detail: 'no remote brain configured' }
  const token = (opts.adminToken ?? '').trim()
  if (!token) {
    return {
      ok: false,
      reason: 'no-token',
      detail: 'changing server behaviour needs an admin token, not an agent one',
    }
  }
  const payload = behaviourPayload(opts.next)
  if (Object.keys(payload).length === 0) {
    return { ok: true, applied: {} }
  }

  const doFetch = opts.fetchImpl ?? fetch
  try {
    const r = await doFetch(`${behaviourBaseUrl(url)}/admin/behaviour`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
    if (!r.ok) {
      // Say what the server said. "Could not save" over a 400 that explains
      // exactly which field is wrong is the kind of message that costs an hour.
      let detail = `HTTP ${r.status}`
      try {
        const body = (await r.json()) as { detail?: string; error?: string }
        if (body?.detail || body?.error) detail = `${detail}: ${body.detail ?? body.error}`
      } catch {
        /* body was not JSON; the status alone is what we have */
      }
      return { ok: false, reason: 'rejected', detail }
    }
    return { ok: true, applied: payload }
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: (e as Error).message }
  }
}
