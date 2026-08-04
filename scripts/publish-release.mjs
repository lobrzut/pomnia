#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Upload the built installer to a GitHub release — with its checksum.
 *
 * Releases used to carry the .exe alone. electron-builder writes latest.yml
 * next to it, holding the artifact's sha512, and that file never left the
 * machine. So there was no way for anyone to verify a download, and the
 * landing page now promises exactly that ("every release publishes its
 * SHA-256"). A promise nobody can check is the same defect as a green toast
 * over an empty index.
 *
 * Refuses rather than guesses: no artifact, dirty tree, or a tag that already
 * exists all stop the run with the reason.
 *
 *   node scripts/publish-release.mjs            # create the release, draft
 *   node scripts/publish-release.mjs --publish  # publish it immediately
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const draft = !args.has('--publish')

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

// latest.yml is what makes the download checkable. Without it the release is
// an unverifiable binary and the site's checksum promise is false.
const latestYml = join(releaseDir, 'latest.yml')
if (!existsSync(latestYml)) die('missing release/latest.yml — electron-builder should emit it beside the installer')
if (!readFileSync(latestYml, 'utf8').includes(`Pomnia-${version}-setup.exe`)) {
  die('latest.yml names a different artifact than the installer — stale build directory')
}

const blockmap = `${exe}.blockmap`
const assets = [exe, latestYml, ...(existsSync(blockmap) ? [blockmap] : [])]

// SHA-256 alongside the yml's sha512: it is what people actually paste into
// Get-FileHash / sha256sum, and the site tells them to.
const sha256 = createHash('sha256').update(readFileSync(exe)).digest('hex').toUpperCase()
const shaFile = join(releaseDir, `Pomnia-${version}-setup.exe.sha256`)
writeFileSync(shaFile, `${sha256}  Pomnia-${version}-setup.exe\n`, 'utf8')
assets.push(shaFile)

const sizeMb = (readFileSync(exe).length / 1024 / 1024).toFixed(2)
const sha = sh('git', ['rev-parse', '--short', 'HEAD'])

const notes = `Pomnia ${version}

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

console.log(`tag        ${tag}`)
console.log(`commit     ${sha}`)
console.log(`installer  ${sizeMb} MB`)
console.log(`sha256     ${sha256}`)
console.log(`assets     ${assets.map((a) => a.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')).join(', ')}`)
console.log(`mode       ${draft ? 'DRAFT (pass --publish to release)' : 'PUBLISH'}`)

const existing = readdirSync(releaseDir)
if (!existing.length) die('release/ is empty')

try {
  sh('gh', ['release', 'view', tag])
  die(`release ${tag} already exists — bump the version or delete it first`)
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
  ...(draft ? ['--draft'] : []),
])

console.log(`\n✔ release ${tag} created${draft ? ' as a draft' : ''}`)
