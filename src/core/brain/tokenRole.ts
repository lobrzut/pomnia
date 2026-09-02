// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ask the server what a token is, instead of asking the user.
 *
 * brain-core has two roles. An `agent` token goes into MCP client configs and
 * may read and write memory; an `admin` token may mint those and change how the
 * server tells agents to behave. They are not interchangeable, and Mini used to
 * express that as two password fields side by side — which is precisely how the
 * wrong one gets pasted. The app itself made that mistake in code: "New token"
 * sent the agent token as the credential for creating tokens.
 *
 * The distinction is real, so it stays; what goes is asking the person to
 * classify a secret by eye. `GET /admin/tokens` answers 200 only for an admin
 * token, which is a definitive test costing one request.
 *
 * Deliberately does not report "invalid". A token that is not admin may still
 * be a perfectly good agent token, and whether it works for MCP is a question
 * the connection status already answers, visibly, a second later.
 */

export type TokenRole = 'admin' | 'not-admin' | 'unreachable'

export async function probeTokenRole(opts: {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{ role: TokenRole; detail: string }> {
  const token = opts.token.trim()
  if (!token) return { role: 'not-admin', detail: 'no token given' }

  const doFetch = opts.fetchImpl ?? fetch
  try {
    const r = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/admin/tokens`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
    if (r.status === 200) return { role: 'admin', detail: 'admin API accepted it' }
    if (r.status === 401 || r.status === 403) {
      return { role: 'not-admin', detail: `admin API refused it (${r.status})` }
    }
    // A 404 means this server has no admin API — an older brain-core, or
    // something else entirely. That is not evidence about the token, and
    // guessing 'admin' from it would hand the token to a mint call that fails.
    return { role: 'not-admin', detail: `admin API answered ${r.status}` }
  } catch (e) {
    return { role: 'unreachable', detail: (e as Error).message }
  }
}
