#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Prepare release/ after a pack, before anything is uploaded.
 *
 *   - lowercase SHA-256 sidecar for every binary
 *   - latest*.yml no longer claims a blockmap that was not produced
 *   - pomnia-<version>.commit records the tagged commit
 *   - PomniaMini-win-x64.zip is a copy of the versioned Mini zip, when that
 *     zip exists (stable name for pomnia.ai)
 *
 * Linux Mini's stable name (PomniaMini-linux-x64.AppImage) is copied the same
 * way once that AppImage is in release/. It is not required.
 *
 *   GIT_COMMIT=<40 hex> npx tsx scripts/seal-release-dir.mjs
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatReleaseCommit } from './lib/release-guard.ts'
import {
  STABLE_MINI_LINUX_APPIMAGE,
  STABLE_MINI_WIN_ZIP,
  computeSha256Hex,
  formatSha256Line,
  miniZipFileName,
} from './lib/release-assets.ts'
import { reconcileUpdateManifest } from './lib/update-manifest.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const commit = (process.env.GIT_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).trim()

const BINARY = /\.(AppImage|deb|exe|dmg|zip|blockmap)$|\.tar\.gz$/

function sealDir(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (!statSync(full).isFile()) continue
    if (name.endsWith('.sha256') || name.endsWith('.yml')) continue
    if (!BINARY.test(name)) continue
    writeFileSync(`${full}.sha256`, formatSha256Line(computeSha256Hex(readFileSync(full)), name), 'utf8')
    console.log(`sha256  ${name}`)
  }
  for (const yml of ['latest.yml', 'latest-linux.yml', 'latest-mac.yml']) {
    const path = join(dir, yml)
    if (!existsSync(path)) continue
    const present = new Set(readdirSync(dir))
    const before = readFileSync(path, 'utf8')
    const reconciled = reconcileUpdateManifest(before, present)
    if (reconciled.body !== before) {
      writeFileSync(path, reconciled.body, 'utf8')
      console.log(`manifest  ${yml} dropped a blockmap the pack did not produce`)
    } else {
      console.log(`manifest  ${yml}`)
    }
  }
}

const releaseDir = join(root, 'release')
sealDir(releaseDir)
sealDir(join(releaseDir, 'mini'))

try {
  writeFileSync(join(releaseDir, `pomnia-${version}.commit`), formatReleaseCommit(commit), 'utf8')
} catch (e) {
  die(e instanceof Error ? e.message : String(e))
}
console.log(`commit  ${commit}`)

function alias(src, destName) {
  if (!existsSync(src)) return
  const dest = join(releaseDir, destName)
  copyFileSync(src, dest)
  writeFileSync(dest + '.sha256', formatSha256Line(computeSha256Hex(readFileSync(dest)), destName), 'utf8')
  console.log(`alias   ${destName}`)
}

alias(join(releaseDir, 'mini', miniZipFileName(version)), STABLE_MINI_WIN_ZIP)
// Present only after the Mini Linux pack (open PR) produces an AppImage.
const miniAppImages = existsSync(join(releaseDir, 'mini'))
  ? readdirSync(join(releaseDir, 'mini')).filter((n) => n.endsWith('.AppImage'))
  : []
if (miniAppImages.length === 1) alias(join(releaseDir, 'mini', miniAppImages[0]), STABLE_MINI_LINUX_APPIMAGE)
else if (miniAppImages.length > 1) die(`more than one Mini AppImage in release/mini: ${miniAppImages.join(', ')}`)

console.log('✔ release directory sealed')
