// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { countSkillsSplitAt } from './skillsScan.js'

/**
 * Embedded brain-core data root.
 *
 * `library.db` (vectordb) stays here always — rebuildable from the plaintext
 * vault tree via reindex. Do not move the SQLite index into the portable vault
 * folder (binary, machine-local ABI / Ollama model pinning).
 */
export function brainCoreDataDir(): string {
  return join(app.getPath('userData'), 'brain-core-data')
}

/**
 * Currently open encrypted vault folder (`…/MyVault.pomnia`), or null when locked.
 * When set, plaintext Brain knowledge (USER.md, distilled/, sessions/) lives here
 * alongside skills/ + header.json — one folder to travel.
 */
let openEncryptedVaultPath: string | null = null

export function getOpenEncryptedVaultPath(): string | null {
  return openEncryptedVaultPath
}

/** Call on vault open/create (path) and lock (null). Does not wipe AppData. */
export function setOpenEncryptedVaultPath(path: string | null): void {
  openEncryptedVaultPath = path
}

/** Legacy AppData plaintext vault — fallback when no encrypted vault is open. */
export function brainVaultLegacyRoot(): string {
  return join(brainCoreDataDir(), 'vault')
}

/**
 * Vault root used by MCP + distill + reindex (`distilled/`, `sessions/`, `USER.md`).
 *
 * Prefer the open encrypted vault folder; else AppData `brain-core-data/vault`.
 * Optional override matches `brainSkillsDir(encryptedVaultPath?)`.
 */
export function brainVaultRoot(encryptedVaultPath?: string | null): string {
  const p = encryptedVaultPath !== undefined ? encryptedVaultPath : openEncryptedVaultPath
  if (p) return p
  return brainVaultLegacyRoot()
}

/** Where host-side distill writes notes for the embedded MCP index. */
export function brainVaultDistilledDir(encryptedVaultPath?: string | null): string {
  return join(brainVaultRoot(encryptedVaultPath), 'distilled')
}

/**
 * Legacy skills dir — lived under brain-core-data before portable sidecar.
 * Kept as fallback when no encrypted vault is open.
 */
export function brainSkillsLegacyDir(): string {
  return join(brainVaultLegacyRoot(), 'skills')
}

/**
 * Skills root for MCP + sync.
 *
 * Prefer `<encryptedVaultPath>/skills` (plaintext sidecar next to header.json /
 * blobs / snapshots) so copying the vault folder moves skills with it.
 * Fallback: brain-core-data/vault/skills (legacy).
 */
export function brainSkillsDir(encryptedVaultPath?: string | null): string {
  const p = encryptedVaultPath !== undefined ? encryptedVaultPath : openEncryptedVaultPath
  if (p) return join(p, 'skills')
  return brainSkillsLegacyDir()
}

/** True when portable sidecar already has countable skills (not empty dirs). */
export function portableSkillsPresent(encryptedVaultPath: string): boolean {
  return countLocalSkills(encryptedVaultPath) > 0
}

function dirHasEntries(dir: string): boolean {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
}

/**
 * True when portable vault already has knowledge (or a one-shot migrate marker).
 * Marker is a dotfile so reindex skips it.
 */
export function portableKnowledgePresent(encryptedVaultPath: string): boolean {
  return (
    existsSync(join(encryptedVaultPath, 'USER.md')) ||
    existsSync(join(encryptedVaultPath, '.portable-knowledge')) ||
    dirHasEntries(join(encryptedVaultPath, 'distilled')) ||
    dirHasEntries(join(encryptedVaultPath, 'sessions'))
  )
}

/**
 * Count brain/*.md + cli/.../SKILL.md under the active skills root.
 * Skips `*.bak*`, dotfiles, `_backups`. Prefer {@link countSkillsSplit} for UI.
 */
export function countLocalSkills(encryptedVaultPath?: string | null): number {
  return countSkillsSplit(encryptedVaultPath).total
}

/** Split own (brain/*.md) vs imported (cli/.../SKILL.md) for Dashboard. */
export function countSkillsSplit(encryptedVaultPath?: string | null): {
  own: number
  imported: number
  total: number
} {
  return countSkillsSplitAt(brainSkillsDir(encryptedVaultPath))
}

/** Count .md notes under distilled/ (skips `_review`). */
export function countDistilledNotes(encryptedVaultPath?: string | null): number {
  const root = brainVaultDistilledDir(encryptedVaultPath)
  if (!existsSync(root)) return 0
  let n = 0
  const walk = (dir: string): void => {
    let ents
    try {
      ents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '_review' || ent.name.startsWith('.')) continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.md')) n++
    }
  }
  walk(root)
  return n
}
