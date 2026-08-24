// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Human-facing vault location for /admin → Sejf.
 *
 * Env hints (POMNIA_VAULT_SMB / HOST_PATH / LABEL) are optional. When empty or
 * junk (migration notes, non-UNC placeholders), the UI builds from real paths
 * alone — never invents "e2e", C:\Vault, or "ustaw Sejf".
 */

export interface VaultLocationFields {
  /** Absolute vault root as seen by the daemon (usually the container mount). */
  path: string
  /** Host bind path when it differs from path (operator hint). */
  hostPath: string | null
  /** Optional short label from POMNIA_VAULT_LABEL (sanitized). */
  label: string | null
  /**
   * Optional one-line override from POMNIA_VAULT_WHERE only.
   * Prefer letting the panel compose from smbPath / hostPath when unset.
   */
  where: string | null
  /** Real Windows/SMB UNC from POMNIA_VAULT_SMB or VAULT_SMB_UNC (else null). */
  smbPath: string | null
}

/** True UNC share path — not a parenthetical note. */
export function looksLikeUnc(s: string): boolean {
  return /^\\\\[^\\]+\\/.test(s) || /^\/\/[^/]+\//.test(s)
}

/** Drop migration / placeholder labels that must never reach product UI. */
export function sanitizeVaultLabel(raw: string | null | undefined): string | null {
  const t = raw?.trim() || null
  if (!t) return null
  if (/e2e/i.test(t)) return null
  if (/ustaw\s+Sejf/i.test(t)) return null
  if (/katalog\s+testowy/i.test(t)) return null
  if (/C:\\Vault/i.test(t)) return null
  if (/^\(.*\)$/.test(t)) return null
  return t
}

/** Keep only a real UNC; discard notes like "(tylko lokalny…)". */
export function sanitizeSmbPath(raw: string | null | undefined): string | null {
  const t = raw?.trim() || null
  if (!t) return null
  if (!looksLikeUnc(t)) return null
  return t
}

/**
 * Optional prose override. Empty when unset — the panel shows paths instead.
 * Never synthesizes e2e / Desktop / Sejf comparison copy.
 */
export function deriveVaultWhere(opts: {
  label: string | null
  smbPath: string | null
  hostPath: string | null
  hostLabel?: string | null
}): string | null {
  void opts
  return null
}

export function resolveVaultLocation(
  vaultRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): VaultLocationFields {
  const path = vaultRoot.trim() || ''
  const hostHint =
    env.POMNIA_VAULT_HOST_PATH?.trim() || env.BRAIN_VAULT_HOST_PATH?.trim() || null
  const hostPath = hostHint && hostHint !== path ? hostHint : null
  const label = sanitizeVaultLabel(env.POMNIA_VAULT_LABEL)
  const smbPath = sanitizeSmbPath(env.POMNIA_VAULT_SMB || env.VAULT_SMB_UNC)
  const whereExplicit = env.POMNIA_VAULT_WHERE?.trim() || null
  // Explicit override only — never invent product marketing from env heuristics.
  const where = whereExplicit || null
  return { path, hostPath, label, where, smbPath }
}
