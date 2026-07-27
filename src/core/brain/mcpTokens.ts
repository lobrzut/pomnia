// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Manage MCP Bearer tokens on Brain from Pomnia.
 *
 * Brain exposes POST /api/mcp/tokens to create new named tokens. The endpoint
 * itself is gated by the same session/Bearer auth as the rest of /api, so this
 * requires a bootstrap token — one you already generated in the dashboard
 * (or via cookie session there). Pomnia uses that as the admin token and can
 * mint per-client tokens without the user having to open the dashboard again.
 *
 * A minted token is returned verbatim once, on creation, in the response body —
 * the server never exposes it again after that, only its name and creation ts.
 */

interface AuthOpts {
  /** Bearer token used to authorize the /api/mcp/tokens/* call. */
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

/** POST /api/mcp/tokens with { name } — returns { name, token, created }.
 *  Throws with the HTTP status if the admin token is invalid or the name is
 *  taken. The full new token is returned only here; save it before rotating. */
export async function createMcpToken(
  baseUrl: string,
  name: string,
  opts: AuthOpts = {},
): Promise<McpTokenEntry> {
  const base = baseUrl.replace(/\/$/, '')
  const clean = name.trim()
  if (!clean) throw new Error('token name is empty')
  const r = await fetch(`${base}/api/mcp/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...authHeaders(opts),
    },
    body: JSON.stringify({ name: clean }),
  })
  if (!r.ok) {
    let detail = ''
    try {
      const j = (await r.json()) as { detail?: string; error?: string }
      detail = j.detail ?? j.error ?? ''
    } catch {
      /* keep empty */
    }
    throw new Error(`POST /api/mcp/tokens → ${r.status}${detail ? ` (${detail})` : ''}`)
  }
  const j = (await r.json()) as McpTokenEntry
  if (!j.token) throw new Error('brain returned no token in the response')
  return j
}
