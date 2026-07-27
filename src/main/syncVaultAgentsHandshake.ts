// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Keep vault/AGENTS.md Handshake section in sync with Pomnia Settings phrase.
 * Agents that only load MCP (or AGENTS via get_user_profile) still see the exact phrase.
 */
import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { upsertVaultAgentsHandshake } from '../core/brain/snippet.js'
import { brainVaultRoot } from './brainPaths.js'
import { getHandshakePhrase, isHandshakeEnabled } from './handshake.js'

export async function syncVaultAgentsHandshake(
  encryptedVaultPath?: string | null,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const root = brainVaultRoot(encryptedVaultPath)
  const path = join(root, 'AGENTS.md')
  try {
    let existing = ''
    if (existsSync(path)) {
      existing = await fs.readFile(path, 'utf8')
    }
    const next = upsertVaultAgentsHandshake(existing, {
      handshakePhrase: getHandshakePhrase(),
      handshakeEnabled: isHandshakeEnabled(),
    })
    if (next === existing) return { ok: true, path }
    await fs.writeFile(path, next, 'utf8')
    return { ok: true, path }
  } catch (e) {
    return { ok: false, path, error: e instanceof Error ? e.message : String(e) }
  }
}
