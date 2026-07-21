import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Embedded brain-core data root (`library.db`, vault, …). */
export function brainCoreDataDir(): string {
  return join(app.getPath('userData'), 'brain-core-data')
}

/** Vault root used by MCP (`distilled/`, `sessions/`, `USER.md`, …). */
export function brainVaultRoot(): string {
  return join(brainCoreDataDir(), 'vault')
}

/** Where host-side distill writes notes for the embedded MCP index. */
export function brainVaultDistilledDir(): string {
  return join(brainVaultRoot(), 'distilled')
}

/**
 * Legacy skills dir — lived under brain-core-data before portable sidecar.
 * Kept as fallback when no encrypted vault is open.
 */
export function brainSkillsLegacyDir(): string {
  return join(brainVaultRoot(), 'skills')
}

/**
 * Skills root for MCP + sync.
 *
 * Prefer `<encryptedVaultPath>/skills` (plaintext sidecar next to header.json /
 * blobs / snapshots) so copying the vault folder moves skills with it.
 * Fallback: brain-core-data/vault/skills (legacy).
 */
export function brainSkillsDir(encryptedVaultPath?: string | null): string {
  if (encryptedVaultPath) return join(encryptedVaultPath, 'skills')
  return brainSkillsLegacyDir()
}

/** True when portable sidecar already has skills content. */
export function portableSkillsPresent(encryptedVaultPath: string): boolean {
  const root = brainSkillsDir(encryptedVaultPath)
  return (
    existsSync(join(root, 'brain')) ||
    existsSync(join(root, 'cli')) ||
    existsSync(join(root, 'index.json'))
  )
}
