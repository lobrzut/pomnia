/**
 * Ensure portable vault knowledge sidecar exists and is seeded from AppData once.
 *
 * Layout next to header.json / skills/:
 *   USER.md, distilled/, sessions/
 *
 * Vault crypto only touches .cvb / header; these plaintext trees are ignored by
 * Vault.open/create (same as skills/). library.db stays in AppData (rebuildable).
 */
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  brainVaultLegacyRoot,
  portableKnowledgePresent,
} from './brainPaths.js'

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const ent of entries) {
    const from = join(src, ent.name)
    const to = join(dest, ent.name)
    if (ent.isDirectory()) await copyDir(from, to)
    else if (ent.isFile()) await fs.copyFile(from, to)
  }
}

/**
 * After vault create/open: mkdir distilled/sessions, and if empty migrate once
 * from brain-core-data/vault/{USER.md,distilled,sessions}. Never deletes AppData.
 */
export async function ensurePortableKnowledge(encryptedVaultPath: string): Promise<string> {
  const distilled = join(encryptedVaultPath, 'distilled')
  const sessions = join(encryptedVaultPath, 'sessions')
  await fs.mkdir(distilled, { recursive: true })
  await fs.mkdir(sessions, { recursive: true })

  if (portableKnowledgePresent(encryptedVaultPath)) {
    return encryptedVaultPath
  }

  const legacy = brainVaultLegacyRoot()
  const legacyUser = join(legacy, 'USER.md')
  const legacyDistilled = join(legacy, 'distilled')
  const legacySessions = join(legacy, 'sessions')

  try {
    console.info('[pomnia] migrating knowledge → portable vault', encryptedVaultPath)
    if (existsSync(legacyUser)) {
      await fs.copyFile(legacyUser, join(encryptedVaultPath, 'USER.md'))
    }
    if (existsSync(legacyDistilled)) {
      await copyDir(legacyDistilled, distilled)
    }
    if (existsSync(legacySessions)) {
      await copyDir(legacySessions, sessions)
    }
  } catch (err) {
    console.warn('[pomnia] knowledge migrate failed', err)
  }

  // Marker so we do not re-copy on every open when legacy was empty.
  // Dotfile → skipped by brain-core indexer.
  try {
    await fs.writeFile(join(encryptedVaultPath, '.portable-knowledge'), '1\n', 'utf8')
  } catch (err) {
    console.warn('[pomnia] portable-knowledge marker failed', err)
  }

  return encryptedVaultPath
}
