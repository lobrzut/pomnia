// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which bearer talks to Brain.
 *
 * Two fields, two jobs, after the connect flow splits them:
 *
 *   `replicaToken`  admin. `connect:tokenAdopt` writes it after GET /admin/tokens
 *                   accepts the paste, and a successful mint writes the
 *                   credential it just used, so the field can then be replaced
 *                   with the agent token. It never goes back to the renderer.
 *                   Vault writes, /admin/skills, /admin/prompts,
 *                   /admin/behaviour and ingest all need it.
 *   `connectToken`  the field. After that paste the renderer replaces it with
 *                   the minted agent token, which is what MCP configs and
 *                   agent probes must send. Before adopt — a fresh Mini
 *                   install was the case — the field may itself still be the
 *                   admin token.
 *
 * Reading one field for both jobs is how each half breaks. Agent calls that
 * prefer `replicaToken` send an admin token into client configs. Admin calls
 * that prefer `connectToken` send the agent token and the server answers 401.
 */

export interface BrainTokens {
  connectToken?: string
  replicaToken?: string
}

function trim(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t ? t : undefined
}

/** Agent operations. The field wins; a stored admin token is only a fallback. */
export function serverToken(s: BrainTokens, explicit?: string): string | undefined {
  return trim(s.connectToken) || trim(s.replicaToken) || trim(explicit)
}

/**
 * Admin operations. The stored admin token wins, so a field that now holds
 * the minted agent token is not what /admin/* sees. The field is the fallback
 * for an install that has not stored a separate admin token yet.
 */
export function adminToken(s: BrainTokens, explicit?: string): string | undefined {
  return trim(s.replicaToken) || trim(s.connectToken) || trim(explicit)
}
