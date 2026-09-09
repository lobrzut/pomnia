#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Upload the built Windows installer to a GitHub release — with its checksum.
 *
 * Default: create a **draft**. Incomplete drafts never become releases/latest.
 * Pass `--publish` only after every platform is on the tag; that path runs the
 * shared completeness checker and undrafts only when it passes (F10).
 *
 *   node scripts/publish-release.mjs            # create draft
 *   node scripts/publish-release.mjs --publish  # create + promote if complete
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectBrainCoreAssets,
  collectLinuxDesktopAssets,
  validateUpdateManifest,
} from './lib/release-assets.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const wantPublish = args.has('--publish')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim()
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = `v${version}`
const releaseDir = join(root, 'release')

if (sh('git', ['status', '--porcelain'])) {
  die('working tree is dirty — release assets must match a committed state')
}

const exe = join(releaseDir, `Pomnia-${version}-setup.exe`)
if (!existsSync(exe)) die(`missing ${exe} — run npm run release:win first`)

const latestYml = join(releaseDir, 'latest.yml')
if (!existsSync(latestYml)) die('missing release/latest.yml — electron-builder should emit it beside the installer')
const ymlBody = readFileSync(latestYml, 'utf8')
const ymlCheck = validateUpdateManifest(ymlBody, {
  version,
  mustInclude: [`Pomnia-${version}-setup.exe`],
})
if (!ymlCheck.ok) die(`latest.yml: ${ymlCheck.error} — stale build directory`)

const blockmap = `${exe}.blockmap`
const assets = [exe, latestYml, ...(existsSync(blockmap) ? [blockmap] : [])]

const sha256 = createHash('sha256').update(readFileSync(exe)).digest('hex').toUpperCase()
const shaFile = join(releaseDir, `Pomnia-${version}-setup.exe.sha256`)
writeFileSync(shaFile, `${sha256}  Pomnia-${version}-setup.exe\n`, 'utf8')
assets.push(shaFile)

const sizeMb = (readFileSync(exe).length / 1024 / 1024).toFixed(2)
const sha = sh('git', ['rev-parse', '--short', 'HEAD'])

let notes = `Pomnia ${version}

**Windows installer** · ${sizeMb} MB · built from \`${sha}\`

This build is **not code-signed**, so Windows shows “Windows protected your PC”.
Choose **More info → Run anyway**, or verify the file first:

\`\`\`powershell
Get-FileHash Pomnia-${version}-setup.exe -Algorithm SHA256
\`\`\`

\`\`\`
${sha256}
\`\`\`

Pomnia checks for newer releases and tells you — it never installs anything by itself.
`

// Optional Linux / brain-core in the same directory — shared validator with attach.
const names = readdirSync(releaseDir)
const hasLinuxDesktop =
  names.some((n) => /\.(AppImage|deb)$/i.test(n)) || names.includes('latest-linux.yml')
if (hasLinuxDesktop) {
  const linux = collectLinuxDesktopAssets({ releaseDir, version, requireManifest: true })
  if (!linux.ok) {
    for (const e of linux.errors) console.error(`✗ ${e}`)
    die('refusing to publish with invalid Linux assets in release/')
  }
  assets.push(...linux.assets)
  notes += `

**Linux** · AppImage/deb also in this release (unsigned).

\`\`\`bash
chmod +x Pomnia-${version}.AppImage && ./Pomnia-${version}.AppImage
\`\`\`
`
}

const brain = collectBrainCoreAssets({ releaseDir, version })
if (!brain.ok) {
  for (const e of brain.errors) console.error(`✗ ${e}`)
  die('refusing to publish with invalid brain-core assets in release/')
}
if (brain.present) {
  assets.push(...brain.assets)
  notes += `

**Server** · \`pomnia-brain-core-${version}-linux-x64.tar.gz\` (curl|sh / bootstrap).
`
}

// Deduplicate
const seen = new Set()
for (let i = assets.length - 1; i >= 0; i--) {
  if (seen.has(assets[i])) assets.splice(i, 1)
  else seen.add(assets[i])
}

console.log(`tag        ${tag}`)
console.log(`commit     ${sha}`)
console.log(`installer  ${sizeMb} MB`)
console.log(`sha256     ${sha256}`)
console.log(`assets     ${assets.map((a) => a.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')).join(', ')}`)
console.log(`mode       DRAFT first${wantPublish ? ' (then promote if complete)' : ''}`)

try {
  sh('gh', ['release', 'view', tag])
  die(`release ${tag} already exists — bump the version, or use attach:*-release / promote:release`)
} catch {
  // Not found is the expected path.
}

sh('gh', [
  'release',
  'create',
  tag,
  ...assets,
  '--title',
  `Pomnia ${version}`,
  '--notes',
  notes,
  '--draft',
])

console.log(`\n✔ release ${tag} created as a draft`)

if (!wantPublish) {
  console.log(`  attach other platforms, then: npm run promote:release -- --tag ${tag}`)
  process.exit(0)
}

try {
  execFileSync(
    process.execPath,
    ['--import', 'tsx', join(root, 'scripts', 'promote-release.mjs'), '--tag', tag],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
} catch {
  die(
    `${tag} stays a draft — not every platform is on the release yet.\n` +
      '  That is intentional: an incomplete tag must not become releases/latest.\n' +
      '  Attach Linux/macOS/brain-core, then npm run promote:release -- --tag ' +
      tag,
  )
}
