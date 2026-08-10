#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Attach Linux desktop artifacts to an existing GitHub Release tag.
 *
 * Windows remains the path of `publish:release` (setup.exe + latest.yml).
 * Linux AppImage/deb are built on ubuntu-latest (see release-linux.yml).
 * Download the Actions artifact, drop files into release/, then:
 *
 *   npm run attach:linux-release
 *   npm run attach:linux-release -- --tag v0.1.58
 *
 * Refuses if no .AppImage/.deb is present. Does not create the release —
 * create/publish Windows first, or let the Linux workflow create a draft on tag.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : `v${version}`
const releaseDir = join(root, 'release')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim()
}

if (!existsSync(releaseDir)) die('missing release/ — place AppImage/deb from CI here')

const names = readdirSync(releaseDir)
const linuxFiles = names.filter((n) => n.endsWith('.AppImage') || n.endsWith('.deb'))
if (!linuxFiles.length) {
  die('no .AppImage or .deb in release/ — download pomnia-linux from Actions first')
}

const assets = []
for (const name of linuxFiles) {
  const full = join(releaseDir, name)
  assets.push(full)
  const shaFile = join(releaseDir, `${name}.sha256`)
  if (!existsSync(shaFile)) {
    const hex = createHash('sha256').update(readFileSync(full)).digest('hex').toUpperCase()
    writeFileSync(shaFile, `${hex}  ${name}\n`, 'utf8')
  }
  assets.push(shaFile)
}

const latestLinux = join(releaseDir, 'latest-linux.yml')
if (existsSync(latestLinux)) assets.push(latestLinux)

try {
  sh('gh', ['release', 'view', tag])
} catch {
  die(`release ${tag} does not exist — create it (publish:release) or push the tag first`)
}

console.log(`tag     ${tag}`)
console.log(`assets  ${assets.map((a) => a.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')).join(', ')}`)

sh('gh', ['release', 'upload', tag, ...assets, '--clobber'])
console.log(`\n✔ uploaded Linux assets to ${tag}`)
