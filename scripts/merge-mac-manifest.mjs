#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Merge per-arch macOS update manifests into release/latest-mac.yml.
 *
 *   npx tsx scripts/merge-mac-manifest.mjs release/latest-mac-arm64.yml release/latest-mac-x64.yml
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mergeMacUpdateManifests } from './lib/update-manifest.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const inputs = process.argv.slice(2)
if (inputs.length < 2) {
  console.error('usage: merge-mac-manifest.mjs <arm64.yml> <x64.yml> [more...]')
  process.exit(1)
}
const merged = mergeMacUpdateManifests(inputs.map((p) => readFileSync(p, 'utf8')))
const out = join(root, 'release', 'latest-mac.yml')
writeFileSync(out, merged, 'utf8')
console.log(`✔ wrote ${out}`)
