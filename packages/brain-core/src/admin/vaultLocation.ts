// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Human-facing vault location for /admin → Vault.
 *
 * Operators (and helluk) need "where is my memory", not only container bind
 * paths. Compose sets POMNIA_VAULT_LABEL / POMNIA_VAULT_SMB; we never invent
 * Sejf when the bind is the e2e test folder.
 *
 * Host vendor is optional via POMNIA_HOST_LABEL (QNAP | Synology | PC | …).
 * Empty = vendor-agnostic “Na hoście Pomni”.
 */

export interface VaultLocationFields {
  /** Absolute vault root as seen by the daemon (usually the container mount). */
  path: string
  /** Host bind path when it differs from path (operator hint). */
  hostPath: string | null
  /** Short label from POMNIA_VAULT_LABEL (e.g. "katalog testowy (e2e)"). */
  label: string | null
  /** One Polish sentence: where the memory actually lives. */
  where: string | null
  /** Windows / SMB hint from POMNIA_VAULT_SMB or VAULT_SMB_UNC. */
  smbPath: string | null
}

/** Vendor-agnostic default; override with POMNIA_HOST_LABEL. */
export function hostPlace(hostLabel: string | null | undefined): string {
  const t = hostLabel?.trim()
  if (!t) return 'Na hoście Pomni'
  return `Na ${t}`
}

function looksLikeUnc(s: string): boolean {
  return /^\\\\[^\\]/.test(s) || /^\/\/[^/]/.test(s)
}

function looksLikeE2e(hostPath: string | null, label: string | null): boolean {
  if (label && /e2e/i.test(label)) return true
  if (hostPath && /pomnia-kvm\/vault|Container\/pomnia-kvm/i.test(hostPath)) return true
  return false
}

function looksLikeSejf(hostPath: string | null, smbPath: string | null): boolean {
  if (smbPath && looksLikeUnc(smbPath) && /Sejf/i.test(smbPath)) return true
  if (hostPath && /Pomnia\/Sejf|\/Sejf\b/i.test(hostPath)) return true
  return false
}

/** Build the one-sentence "where" line from env hints — never claim Sejf for e2e. */
export function deriveVaultWhere(opts: {
  label: string | null
  smbPath: string | null
  hostPath: string | null
  hostLabel?: string | null
}): string | null {
  const { label, smbPath, hostPath } = opts
  const place = hostPlace(opts.hostLabel)
  if (looksLikeE2e(hostPath, label)) {
    return (
      `${place}, katalog testowy (e2e) — to nie vault z Windows (C:\\Vault)` +
      ' i nie share produkcyjny (Sejf).'
    )
  }
  if (looksLikeSejf(hostPath, smbPath)) {
    const share = label && !/e2e/i.test(label) ? label : 'Pomnia\\Sejf'
    return smbPath && looksLikeUnc(smbPath)
      ? `${place}: share ${share} (${smbPath}).`
      : `${place}: share ${share}.`
  }
  if (label) return `Lokalizacja: ${label}.`
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
  const label = env.POMNIA_VAULT_LABEL?.trim() || null
  const smbPath = env.POMNIA_VAULT_SMB?.trim() || env.VAULT_SMB_UNC?.trim() || null
  const hostLabel = env.POMNIA_HOST_LABEL?.trim() || null
  const whereExplicit = env.POMNIA_VAULT_WHERE?.trim() || null
  const where =
    whereExplicit || deriveVaultWhere({ label, smbPath, hostPath, hostLabel })
  return { path, hostPath, label, where, smbPath }
}
