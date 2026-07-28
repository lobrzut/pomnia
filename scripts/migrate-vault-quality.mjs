#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Migrate legacy distilled notes by quality → path.
 *
 *   node scripts/migrate-vault-quality.mjs [--vault C:\\Vault] [--apply] [--seed N]
 *
 * --dry-run is DEFAULT. --apply writes quality/quality_score_ts + moves files.
 *
 * Rules:
 *   HAS quality: label  → TRUST LABEL, ignore quality_score (dual 0–10 / 0–100 scales)
 *   NO quality label    → scoreFields (TS), asymmetric thresholds, write quality_score_ts
 *   Never overwrite existing quality_score.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const runner = join(here, 'migrate-vault-quality-main.ts')
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
