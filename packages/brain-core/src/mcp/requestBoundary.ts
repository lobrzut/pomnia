// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Loopback bind is not the same as a safe request.
 *
 * Binding 127.0.0.1 keeps the port off the LAN, but DNS rebinding and a foreign
 * Origin can still make a browser talk to that port while believing it is
 * talking to another site. The Host/Origin check is the barrier that the bind
 * address alone does not provide (audit F01).
 */
import type { IncomingMessage } from 'node:http'

import { isLoopbackHost } from './auth.js'

export type BoundaryResult =
  | { ok: true }
  | { ok: false; reason: 'bad_host' | 'bad_origin' }

/** Strip brackets and optional port from a Host / authority value. */
export function hostNameOnly(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (!s) return ''
  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    return end > 0 ? s.slice(1, end) : s
  }
  // host:port — but not IPv6 without brackets (rare in Host headers)
  const colon = s.lastIndexOf(':')
  if (colon > 0 && /^\d+$/.test(s.slice(colon + 1))) return s.slice(0, colon)
  return s
}

function originHost(origin: string): string | null {
  try {
    const u = new URL(origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return hostNameOnly(u.host)
  } catch {
    return null
  }
}

/**
 * When the daemon listens on loopback, require a loopback Host and (if present)
 * a loopback Origin. Clients with no Origin (MCP SDKs, curl) stay allowed once
 * Host is local — that is the local safe policy. A bearer on LAN is unchanged:
 * this gate runs only for loopback binds.
 */
export function checkLoopbackRequestBoundary(req: IncomingMessage): BoundaryResult {
  const hostHeader = req.headers.host
  if (typeof hostHeader !== 'string' || !hostHeader.trim()) {
    return { ok: false, reason: 'bad_host' }
  }
  if (!isLoopbackHost(hostNameOnly(hostHeader))) {
    return { ok: false, reason: 'bad_host' }
  }

  const originRaw = req.headers.origin
  if (originRaw === undefined) return { ok: true }
  const origin = Array.isArray(originRaw) ? originRaw[0] : originRaw
  if (origin === null || origin === '' || origin === 'null') {
    // Opaque origins are not a local desktop panel; refuse them on loopback.
    return { ok: false, reason: 'bad_origin' }
  }
  const oh = originHost(origin)
  if (!oh || !isLoopbackHost(oh)) return { ok: false, reason: 'bad_origin' }
  return { ok: true }
}
