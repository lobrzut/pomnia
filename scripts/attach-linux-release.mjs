#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Attach Linux desktop artifacts to an existing GitHub Release tag.
 *
 * Target version is derived from --tag (not from whatever sits in release/).
 * Refuses mixed versions, a stale .sha256 sidecar, or a latest-linux.yml that
 * points at another build. Always re-hashes binaries before upload.
 *
 *   npm run attach:linux-release
 *   npm run attach:linux-release -- --tag v0.1.82
 *   npm run attach:linux-release -- --tag v0.1.82 --dry-run
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectBrainCoreAssets,
  collectLinuxDesktopAssets,
  versionFromTag,
} from './lib/release-assets.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const dryRun = args.includes('--dry-run')
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : `v${pkgVersion}`
const version = versionFromTag(tag)
const releaseDir = join(root, 'release')

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

if (!existsSync(releaseDir)) die('missing release/ — place AppImage/deb from CI here')

const linux = collectLinuxDesktopAssets({ releaseDir, version, requireManifest: true })
const brain = collectBrainCoreAssets({ releaseDir, version })

if (!linux.ok || !brain.ok) {
  for (const e of [...linux.errors, ...brain.errors]) console.error(`✗ ${e}`)
  die('refusing to upload — fix release/ (version, sha256, manifest) first')
}

const assets = [...linux.assets, ...brain.assets]
const plan = [...linux.plan, ...brain.plan]

console.log(`tag     ${tag}`)
console.log(`version ${version}`)
console.log(`dry-run ${dryRun}`)
console.log('plan:')
for (const row of plan) {
  const rel = row.path.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')
  console.log(`  - ${row.role.padEnd(14)} ${rel}${row.note ? `  (${row.note})` : ''}`)
}
console.log(`assets  ${assets.length}`)

if (dryRun) {
  console.log('\n✔ dry-run OK — no upload')
  process.exit(0)
}

try {
  sh('gh', ['release', 'view', tag])
} catch {
  die(`release ${tag} does not exist — create a draft first (publish:release) or push the tag`)
}

sh('gh', ['release', 'upload', tag, ...assets, '--clobber'])
console.log(`\n✔ uploaded Linux assets to ${tag}`)
console.log(`  next: when Windows+macOS+brain-core are all present → npm run promote:release -- --tag ${tag}`)
