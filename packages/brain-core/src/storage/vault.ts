/**
 * Vault storage config — where markdown notes live on disk and how they're read.
 *
 * The vault stays as plain markdown files (see modern-db-future-consideration
 * memory: modern DB is roadmap, not MVP). Portability across Obsidian /
 * VS Code / plain grep is intentional.
 */

import { mkdirSync } from 'node:fs'
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
  /** Document library root (`sources/` + `extracted/`). */
  libraryDir: string
  librarySourcesDir: string
  libraryExtractedDir: string
}

export function defaultVaultConfig(dataDir: string): VaultConfig {
  const root = join(dataDir, 'vault')
  const libraryDir = join(root, 'library')
  return {
    root,
    distilledDir: join(root, 'distilled'),
    sessionsDir: join(root, 'sessions'),
    userProfilePath: join(root, 'USER.md'),
    libraryDir,
    librarySourcesDir: join(libraryDir, 'sources'),
    libraryExtractedDir: join(libraryDir, 'extracted'),
  }
}

/** Create vault/library dirs if missing (metadata only — blobs live in encrypted .pomnia). */
export function ensureLibraryDirs(config: VaultConfig): void {
  mkdirSync(config.librarySourcesDir, { recursive: true })
  mkdirSync(config.libraryExtractedDir, { recursive: true })
}
