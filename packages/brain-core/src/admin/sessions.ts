// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Panel sessions.
 *
 * In memory on purpose. A restart logs everyone out, which is honest — the
 * server has no other state that survives it either — and it means a stolen
 * session file is not a thing that exists. For a single-operator box the cost
 * is one login after an upgrade.
 *
 * Two secrets per session, and the second one is the reason cookies are safe
 * to use here at all:
 *
 *   sid    HttpOnly cookie. The browser attaches it; script cannot read it, so
 *          an XSS anywhere on this origin cannot exfiltrate the session.
 *   csrf   returned in the login response body and echoed back in a header on
 *          every mutation. A cross-site page can make the browser *send* the
 *          cookie, but it cannot read this value to put in the header.
 *
 * SameSite=Strict already blocks the cross-site request in every browser that
 * matters. The CSRF token is the belt to that's braces: it also covers the
 * same-site-but-untrusted case, and it costs one header.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { TokenRole } from '../mcp/auth.js'

export interface Session {
  id: string
  csrf: string
  username: string
  role: TokenRole
  createdAt: number
  lastSeen: number
}

export const SESSION_COOKIE = 'pomnia_sid'
export const CSRF_HEADER = 'x-pomnia-csrf'

/** Idle logout. Long enough to work uninterrupted, short enough to matter. */
const IDLE_MS = 8 * 60 * 60 * 1000
/** Absolute cap regardless of activity — a session should not outlive a week. */
const MAX_MS = 7 * 24 * 60 * 60 * 1000

function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a ?? '', 'utf8')
  const y = Buffer.from(b ?? '', 'utf8')
  // timingSafeEqual throws on length mismatch, which would leak length by
  // exception. Compare lengths first, then always run the comparison.
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export interface SessionStore {
  create(username: string, role: TokenRole): Session
  get(sid: string | undefined): Session | null
  /** Validates the CSRF token for a state-changing request. */
  checkCsrf(session: Session, presented: string | undefined): boolean
  destroy(sid: string | undefined): void
  /** Drop every session for a user — after a password change or deletion. */
  destroyUser(username: string): number
  count(): number
}

export function createSessionStore(now: () => number = Date.now): SessionStore {
  const sessions = new Map<string, Session>()

  function sweep(): void {
    const t = now()
    for (const [id, s] of sessions) {
      if (t - s.lastSeen > IDLE_MS || t - s.createdAt > MAX_MS) sessions.delete(id)
    }
  }

  return {
    create(username, role) {
      sweep()
      const s: Session = {
        id: randomBytes(32).toString('base64url'),
        csrf: randomBytes(32).toString('base64url'),
        username,
        role,
        createdAt: now(),
        lastSeen: now(),
      }
      sessions.set(s.id, s)
      return s
    },

    get(sid) {
      if (!sid) return null
      const s = sessions.get(sid)
      if (!s) return null
      const t = now()
      if (t - s.lastSeen > IDLE_MS || t - s.createdAt > MAX_MS) {
        sessions.delete(sid)
        return null
      }
      s.lastSeen = t
      return s
    },

    checkCsrf(session, presented) {
      return !!presented && constantTimeEqual(session.csrf, presented)
    },

    destroy(sid) {
      if (sid) sessions.delete(sid)
    },

    destroyUser(username) {
      let n = 0
      for (const [id, s] of sessions) {
        if (s.username === username) {
          sessions.delete(id)
          n++
        }
      }
      return n
    },

    count() {
      sweep()
      return sessions.size
    },
  }
}

/** Parse one cookie by name. No dependency for something this small. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

/**
 * `Secure` only over HTTPS: setting it on a plain-HTTP LAN deployment would
 * make the browser drop the cookie and the panel would look broken with no
 * explanation. The README says to terminate TLS in front; this follows what
 * actually happened rather than what was recommended.
 */
export function sessionCookie(sid: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${sid}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(IDLE_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/admin', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
