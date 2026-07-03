/**
 * Vault storage config — where markdown notes live on disk and how they're read.
 *
 * The vault stays as plain markdown files (see modern-db-future-consideration
 * memory: modern DB is roadmap, not MVP). Portability across Obsidian /
 * VS Code / plain grep is intentional.
 */

import { join } from 'node:path'

export interface VaultConfig {
  /** Root of the vault. Typically `<dataDir>/vault`. */
  root: string
  /** Subdir under root where distilled notes land. Read + write. */
  distilledDir: string
  /** Subdir where raw session transcripts land. Write-mostly. */
  sessionsDir: string
  /** Special note that gets injected into agent context on every request. */
  userProfilePath: string
}

export function defaultVaultConfig(dataDir: string): VaultConfig {
  const root = join(dataDir, 'vault')
  return {
    root,
    distilledDir: join(root, 'distilled'),
    sessionsDir: join(root, 'sessions'),
    userProfilePath: join(root, 'USER.md'),
  }
}
