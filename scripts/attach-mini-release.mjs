#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Attach the Pomnia Mini zip to an existing GitHub Release tag.
 *
 * Same shape as attach:win-release: the release already exists (Windows
 * installer first, or CI created the draft), and publish:release will not
 * add a file to it. The asset is `PomniaMini-<version>.zip` plus its
 * SHA-256 sidecar — not the portable exe, and not a zip named `*-portable.zip`.
 *
 *   npm run attach:mini-release
 *   npm run attach:mini-release -- --tag v0.1.91
 *   npm run attach:mini-release -- --dry-run
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatReleaseCommit } from './lib/release-guard.ts'
import { rewriteReleaseNotes } from './lib/release-notes.ts'
import { preflightReleaseUpload } from './lib/release-preflight.ts'
import { collectMiniAssets, versionFromTag } from './lib/release-assets.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const dryRun = args.includes('--dry-run')
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : `v${pkgVersion}`
const version = versionFromTag(tag)
const releaseDir = join(root, 'release', 'mini')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim()
}

if (tagIdx >= 0 && args[tagIdx + 1] && version !== pkgVersion) {
  console.warn(
    `! tag ${tag} → version ${version}, but package.json is ${pkgVersion} — attaching for the tag version`,
  )
}

const mini = collectMiniAssets({ releaseDir, version })
if (!mini.ok) {
  for (const e of mini.errors) console.error(`✗ ${e}`)
  die('refusing to upload — fix release/mini first')
}
if (!mini.present) {
  die(`missing release/mini/PomniaMini-${version}.zip — run npm run release:mini first`)
}

console.log(`tag     ${tag}`)
console.log(`version ${version}`)
console.log(`dry-run ${dryRun}`)
console.log(`zip     ${mini.sizeMb} MB`)
console.log(`sha256  ${mini.sha256}`)
console.log('plan:')
for (const row of mini.plan) {
  const rel = row.path.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')
  console.log(`  - ${row.role.padEnd(14)} ${rel}${row.note ? `  (${row.note})` : ''}`)
}
console.log('download  unpack PomniaMini-' + version + '.zip once, then run PomniaMini.exe')

if (dryRun) {
  console.log('\n✔ dry-run OK — no upload')
  process.exit(0)
}

const gate = preflightReleaseUpload({ cwd: root, tag, version })
if (!gate.ok) die(gate.error)
const commitFile = join(root, 'release', `pomnia-${version}.commit`)
writeFileSync(commitFile, formatReleaseCommit(gate.head), 'utf8')
const assets = [...mini.assets, commitFile]

sh('gh', ['release', 'upload', tag, ...assets, '--clobber'])
console.log(`\n✔ uploaded Pomnia Mini zip to ${tag}`)

try {
  rewriteReleaseNotes({ cwd: root, tag })
  console.log('✔ release notes list every SHA-256 sidecar, in lowercase')
} catch (e) {
  die(e instanceof Error ? e.message : String(e))
}

try {
  execFileSync(
    process.execPath,
    ['--import', 'tsx', join(root, 'scripts', 'check-release-complete.mjs'), '--tag', tag],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
} catch {
  process.exit(1)
}
