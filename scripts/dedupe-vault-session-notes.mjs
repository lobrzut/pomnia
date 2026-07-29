#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Dedupe distilled notes that share an 8-char sessionId filename suffix.
 *
 *   node scripts/dedupe-vault-session-notes.mjs [--vault C:\\Vault] [--apply]
 *
 * --dry-run is DEFAULT. --apply deletes duplicate files (keeps one per session).
 *
 * After --apply, reindex the library (deleted files leave library.db stale).
 *
 * Identity: source + sessionId (FS key = trailing `_${sessionId8}.md` across
 * distilled/, distilled/_weak/, distilled/_review/).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const runner = join(here, 'dedupe-vault-session-notes-main.ts')
const tsxCli = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const args = process.argv.slice(2)
let status
if (existsSync(tsxCli)) {
  const r = spawnSync(process.execPath, [tsxCli, runner, ...args], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  })
  status = r.status
} else {
  const r = spawnSync(process.execPath, ['--import', 'tsx', runner, ...args], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  })
  status = r.status
}
process.exit(status ?? 1)
