// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Bearer auth for non-loopback deployments.
 *
 * config/index.ts has always documented this as "Skipped when host ===
 * 127.0.0.1 (localhost trust, Pomnia-embedded mode); enforced otherwise" — but
 * nothing enforced it. Starting the daemon with `--host 0.0.0.0` published the
 * whole MCP surface, including the vault search and note-writing tools, to
 * anyone on the network.
 *
 * Behaviour mirrors the Python `pipeline/mcp_auth_proxy.py` so one tokens file
 * serves both while the two coexist:
 *
 *   <dataDir>/mcp-tokens.json
 *   [ { "name": "claude-code-laptop", "token": "btk_…", "created": "…" }, … ]
 *
 * The file is re-read on change, so tokens can be added or revoked without a
 * restart — revocation that needs a restart tends not to happen.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'

export interface AuthResult {
  ok: boolean
  /** Token name on success — safe to log. The raw token never is. */
  name?: string
  reason?: 'no_header' | 'bad_token' | 'no_tokens_configured' | 'rate_limited'
  retryAfterSec?: number
}

/** Loopback deployments are trusted: the port is not reachable off-box. */
export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

function digest(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest()
}

/**
 * Constant-time compare over fixed-length digests. Comparing the raw strings
 * would leak token length through timing and through the early-exit on length.
 */
function sameToken(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b))
}

interface TokenEntry {
  name: string
  token: string
}

export interface AuthGate {
  /** False for loopback binds — callers can skip the check entirely. */
  readonly required: boolean
  check(req: IncomingMessage): Promise<AuthResult>
  /**
   * Same token comparison as `check`, but records nothing against the rate
   * limit. For surfaces where an anonymous request is expected rather than
   * suspicious — the status page — so page views cannot lock out agents.
   */
  peek(req: IncomingMessage): Promise<boolean>
  /** Count of currently loaded tokens — for startup logging and /healthz. */
  tokenCount(): Promise<number>
}

export interface AuthGateOptions {
  host: string
  tokensFile: string
  maxFailsPerMinute: number
  /** Test seam. */
  now?: () => number
}

export function createAuthGate(opts: AuthGateOptions): AuthGate {
  const now = opts.now ?? Date.now
  const required = !isLoopbackHost(opts.host)

  let cached: TokenEntry[] = []
  let cachedMtimeMs = -1
  let checkedAt = 0

  async function loadTokens(): Promise<TokenEntry[]> {
    const t = now()
    // Cheap guard so a burst of requests does not stat() per request.
    if (t - checkedAt < 2000) return cached
    checkedAt = t
    let mtimeMs: number
    try {
      mtimeMs = (await stat(opts.tokensFile)).mtimeMs
    } catch {
      cached = []
      cachedMtimeMs = -1
      return cached
    }
    if (mtimeMs === cachedMtimeMs) return cached
    try {
      const raw = await readFile(opts.tokensFile, 'utf8')
      const parsed = JSON.parse(raw.replace(/^﻿/, '')) as unknown
      cached = Array.isArray(parsed)
        ? parsed
            .filter((e): e is TokenEntry => !!e && typeof e === 'object' && typeof (e as TokenEntry).token === 'string')
            .map((e) => ({ name: typeof e.name === 'string' ? e.name : '?', token: e.token }))
        : []
      cachedMtimeMs = mtimeMs
    } catch {
      // Unreadable or malformed: treat as "no tokens", i.e. deny everything.
      // Failing open here would turn a typo into an open MCP server.
      cached = []
      cachedMtimeMs = mtimeMs
    }
    return cached
  }

  /** Sliding-window failure counter per client address. */
  const fails = new Map<string, number[]>()

  function clientKey(req: IncomingMessage): string {
    const fwd = req.headers['x-forwarded-for']
    const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]
    return (first?.trim() || req.socket.remoteAddress || 'unknown').toLowerCase()
  }

  function rateLimited(key: string): number {
    const t = now()
    const win = (fails.get(key) ?? []).filter((ts) => t - ts < 60_000)
    fails.set(key, win)
    if (win.length < opts.maxFailsPerMinute) return 0
    return Math.ceil((60_000 - (t - win[0]!)) / 1000)
  }

  function registerFail(key: string): void {
    const t = now()
    const win = (fails.get(key) ?? []).filter((ts) => t - ts < 60_000)
    win.push(t)
    fails.set(key, win)
  }

  return {
    required,

    async tokenCount() {
      return (await loadTokens()).length
    },

    /**
     * Is this request carrying a valid token? — asked without consequences.
     *
     * `check` registers a failure on every miss, which is right for an endpoint
     * where a miss is an attempt. The status page is not that: it serves anyone
     * who opens the address, so routing it through `check` would let ordinary
     * page views burn the rate-limit budget and lock out the agents. Same
     * comparison, no bookkeeping.
     */
    async peek(req: IncomingMessage): Promise<boolean> {
      if (!required) return true
      const header = req.headers.authorization ?? ''
      if (!/^bearer\s+/i.test(header)) return false
      const presented = header.replace(/^bearer\s+/i, '').trim()
      for (const entry of await loadTokens()) {
        if (sameToken(presented, entry.token)) return true
      }
      return false
    },

    async check(req: IncomingMessage): Promise<AuthResult> {
      if (!required) return { ok: true, name: 'loopback' }

      const key = clientKey(req)
      const header = req.headers.authorization ?? ''

      // A valid token is checked BEFORE the rate limit and bypasses it. The
      // limit exists to make guessing pointless, and a correct token is not a
      // guess — refusing it because someone behind the same address burned the
      // budget is a self-inflicted outage, which is the likelier event by far.
      if (/^bearer\s+/i.test(header)) {
        const presented = header.replace(/^bearer\s+/i, '').trim()
        for (const entry of await loadTokens()) {
          if (sameToken(presented, entry.token)) return { ok: true, name: entry.name }
        }
      }

      registerFail(key)
      const wait = rateLimited(key)
      if (wait > 0) return { ok: false, reason: 'rate_limited', retryAfterSec: wait }

      if (!/^bearer\s+/i.test(header)) return { ok: false, reason: 'no_header' }
      // Distinguished from bad_token so a deploy with no tokens file is
      // diagnosable from the logs instead of looking like a client problem.
      if ((await loadTokens()).length === 0) return { ok: false, reason: 'no_tokens_configured' }
      return { ok: false, reason: 'bad_token' }
    },
  }
}
