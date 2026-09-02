// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Mint an agent Bearer token on brain-core from Pomnia.
 *
 * This used to POST /api/mcp/tokens on the retired Python hub's dashboard, on
 * its own port. brain-core has neither: one port, and the route is
 * POST /admin/tokens. Against a real server the old call returned 404 — or,
 * because the caller also rewrote the port to 7860, never reached anything at
 * all and surfaced as `TypeError: fetch failed`.
 *
 * Two roles exist and the distinction matters. This mints `agent`: the token
 * that goes into MCP client configs and may read and write memory. Creating it
 * requires an `admin` token, which must never be pasted into those configs —
 * it would put the right to change server behaviour and mint further tokens
 * into six files on disk.
 *
 * The secret is returned exactly once, on creation. There is no read-back
 * route, so save it before rotating anything.
 */

interface AuthOpts {
  /** An **admin** token. An agent token cannot create tokens. */
  token?: string
}

function authHeaders(opts: AuthOpts): Record<string, string> {
  return opts.token ? { Authorization: `Bearer ${opts.token}` } : {}
}

export interface McpTokenEntry {
  name: string
  created: string
  /** Only present on the response of createMcpToken — never in list*(). */
  token?: string
}

/** POST /admin/tokens with { name, role: 'agent' }. Throws with the HTTP
 *  status if the admin token is missing or wrong, or the name is taken. */
export async function createMcpToken(
  baseUrl: string,
  name: string,
  opts: AuthOpts = {},
): Promise<McpTokenEntry> {
  const base = baseUrl.replace(/\/$/, '')
  const clean = name.trim()
  if (!clean) throw new Error('token name is empty')
  const r = await fetch(`${base}/admin/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...authHeaders(opts),
    },
    body: JSON.stringify({ name: clean, role: 'agent' }),
  })
  if (!r.ok) {
    let detail = ''
    try {
      const j = (await r.json()) as { detail?: string; error?: string }
      detail = j.detail ?? j.error ?? ''
    } catch {
      /* keep empty */
    }
    // 401 here means the token supplied was not an admin one — the single
    // most likely mistake, since the field next to this button holds an agent
    // token. Say that, rather than a bare status.
    const hint = r.status === 401 || r.status === 403 ? ' — needs an admin token, not an agent one' : ''
    throw new Error(`POST /admin/tokens → ${r.status}${detail ? ` (${detail})` : ''}${hint}`)
  }
  // brain-core answers { token, summary: { name, created } }; the old hub
  // answered a flat entry. Accept either, so a mixed fleet keeps working.
  const j = (await r.json()) as McpTokenEntry & { summary?: { name: string; created: string } }
  if (!j.token) throw new Error('brain returned no token in the response')
  return { name: j.summary?.name ?? j.name, created: j.summary?.created ?? j.created, token: j.token }
}
