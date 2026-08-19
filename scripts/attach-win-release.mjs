#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Attach the Windows installer to an existing GitHub Release tag.
 *
 * The mirror of attach-linux-release.mjs, and the gap that let v0.1.61–v0.1.63
 * ship Linux-only. `publish:release` is create-or-refuse by design ("release
 * vX already exists — bump the version or delete it first"), which was right
 * when Windows went first and CI attached Linux afterwards. CI now creates the
 * release itself so `curl | sh` can resolve the tarball off `releases/latest`,
 * so by the time the installer is built the release is already there and
 * `publish:release` refuses — leaving no supported way to add Windows, and a
 * `releases/latest` that the site's download buttons point at with nothing on
 * it for Windows.
 *
 * Refuses rather than guesses, same checks as publish-release.mjs: no
 * installer, a latest.yml naming another build, or a missing release all stop
 * the run with the reason.
 *
 *   npm run attach:win-release
 *   npm run attach:win-release -- --tag v0.1.63
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

const exe = join(releaseDir, `Pomnia-${version}-setup.exe`)
if (!existsSync(exe)) die(`missing ${exe} — run npm run build:win first`)

// release/ accumulates every installer ever built here, so "a setup.exe exists"
// is not the same as "this version was built". latest.yml is the one file
// electron-builder rewrites per pack, so it is what catches a stale directory.
const latestYml = join(releaseDir, 'latest.yml')
if (!existsSync(latestYml)) die('missing release/latest.yml — electron-builder should emit it beside the installer')
if (!readFileSync(latestYml, 'utf8').includes(`Pomnia-${version}-setup.exe`)) {
  die('latest.yml names a different artifact than the installer — stale build directory')
}

const sha256 = createHash('sha256').update(readFileSync(exe)).digest('hex').toUpperCase()
const shaFile = join(releaseDir, `Pomnia-${version}-setup.exe.sha256`)
writeFileSync(shaFile, `${sha256}  Pomnia-${version}-setup.exe\n`, 'utf8')

const blockmap = `${exe}.blockmap`
const assets = [exe, latestYml, shaFile, ...(existsSync(blockmap) ? [blockmap] : [])]

try {
  sh('gh', ['release', 'view', tag])
} catch {
  die(`release ${tag} does not exist — push the tag (CI creates it) or run publish:release`)
}

console.log(`tag        ${tag}`)
console.log(`installer  ${(readFileSync(exe).length / 1024 / 1024).toFixed(2)} MB`)
console.log(`sha256     ${sha256}`)
console.log(`assets     ${assets.map((a) => a.replace(`${releaseDir}\\`, '').replace(`${releaseDir}/`, '')).join(', ')}`)

sh('gh', ['release', 'upload', tag, ...assets, '--clobber'])
console.log(`\n✔ uploaded Windows assets to ${tag}`)

// Uploading is not the same as being reachable, and this whole script exists
// because nobody checked the second thing. Inherit stdio so a failure names the
// missing assets here rather than sending someone off to re-run the check.
try {
  execFileSync('node', [join(root, 'scripts', 'check-release-complete.mjs'), '--tag', tag], {
    cwd: root,
    stdio: 'inherit',
  })
} catch {
  process.exit(1)
}
