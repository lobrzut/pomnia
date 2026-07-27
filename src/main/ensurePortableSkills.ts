// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ensure portable vault skills sidecar exists and is seeded from legacy if needed.
 *
 * Layout: `<encryptedVaultPath>/skills/{brain,cli}/` — plaintext next to header.json.
 * Vault crypto only touches .cvb / header; skills/ is ignored by Vault.open/create.
 */
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  brainSkillsDir,
  brainSkillsLegacyDir,
  portableSkillsPresent,
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
 * After vault create/open: mkdir `<vault>/skills`, and if empty copy from
 * brain-core-data/vault/skills (one-time migrate).
 */
export async function ensurePortableSkills(encryptedVaultPath: string): Promise<string> {
  const target = brainSkillsDir(encryptedVaultPath)
  await fs.mkdir(target, { recursive: true })

  if (portableSkillsPresent(encryptedVaultPath)) {
    return target
  }

  const legacy = brainSkillsLegacyDir()
  if (!existsSync(legacy)) {
    await fs.mkdir(join(target, 'brain'), { recursive: true })
    await fs.mkdir(join(target, 'cli'), { recursive: true })
    return target
  }

  try {
    console.info('[pomnia] migrating skills → portable sidecar', target)
    await copyDir(legacy, target)
  } catch (err) {
    console.warn('[pomnia] skills migrate failed', err)
  }
  return target
}
