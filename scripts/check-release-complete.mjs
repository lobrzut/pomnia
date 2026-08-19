#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Assert that `releases/latest` serves every platform we point people at.
 *
 * One URL has three audiences and no owner:
 *
 *  - the site's "Download for Windows" buttons and the JSON-LD `downloadUrl`
 *  - Linux desktop (AppImage/deb + latest-linux.yml)
 *  - `curl | sh`, which resolves the brain-core tarball off `releases/latest`
 *    (packages/brain-core/deploy/bootstrap.sh)
 *
 * v0.1.61–v0.1.63 were published from CI with Linux assets only, so
 * `releases/latest` moved off v0.1.60 and every Windows CTA started landing on
 * a page with no installer on it. Nothing failed — the release was created
 * successfully, the tarball resolved, CI was green. The defect was only visible
 * to someone who clicked the button, which is the worst place to find it.
 *
 * So: verify rather than announce. Refuses rather than guesses — an incomplete
 * release is an error here, not a warning, and the message names the assets
 * that are missing rather than saying the release is bad.
 *
 *   node scripts/check-release-complete.mjs             # whatever /latest resolves to
 *   node scripts/check-release-complete.mjs --tag v0.1.63
 */
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const tag = tagIdx >= 0 ? args[tagIdx + 1] : null

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// `gh` rather than fetch: it carries the token in CI (rate limits) and is
// already how publish-release.mjs and attach-linux-release.mjs talk to GitHub.
let release
try {
  if (tag) {
    // `gh api releases/tags/<tag>` 404s on a draft, which is exactly when this
    // check is worth running: assets arrive from three machines over several
    // minutes, and the point is to know the set is complete *before* the
    // release goes live. The old path turned "still a draft" into "could not
    // read the release" and exited 1 without checking a single asset — a guard
    // that fails for a reason unrelated to what it guards.
    const raw = execFileSync('gh', ['release', 'view', tag, '--json', 'assets,isDraft,isPrerelease,tagName'], {
      encoding: 'utf8',
    })
    const v = JSON.parse(raw)
    release = { tag_name: v.tagName, draft: v.isDraft, prerelease: v.isPrerelease, assets: v.assets ?? [] }
  } else {
    release = JSON.parse(execFileSync('gh', ['api', 'repos/lobrzut/pomnia/releases/latest'], { encoding: 'utf8' }))
  }
} catch (e) {
  die(`could not read the release from GitHub — ${e.message}`)
}

const names = (release.assets ?? []).map((a) => a.name)

// Each entry is a promise the project already makes somewhere public, so a
// missing one is a broken promise and not a stylistic gap.
const required = [
  ['Windows installer', /-setup\.exe$/, 'the site\u2019s "Download for Windows" CTA lands here'],
  ['Windows blockmap', /-setup\.exe\.blockmap$/, 'differential download metadata'],
  ['Windows SHA-256', /-setup\.exe\.sha256$/, 'the site promises a checksum for every release'],
  ['Windows latest.yml', /^latest\.yml$/, 'update manifest carrying the installer sha512'],
  ['Linux AppImage', /\.AppImage$/, 'Linux desktop download'],
  ['Linux deb', /\.deb$/, 'Linux desktop download'],
  ['Linux SHA-256', /\.(AppImage|deb)\.sha256$/, 'same checksum promise as Windows'],
  ['Linux latest-linux.yml', /^latest-linux\.yml$/, 'Linux update manifest'],
  ['macOS Intel DMG', /-x64\.dmg$/, 'Intel Macs — cross-compiled builds shipped arm64 natives and died on first query'],
  ['macOS Apple Silicon DMG', /-arm64\.dmg$/, 'every Mac sold since 2020'],
  ['macOS SHA-256', /\.dmg\.sha256$/, 'same checksum promise as Windows and Linux'],
  ['brain-core tarball', /^pomnia-brain-core-.*-linux-x64\.tar\.gz$/, 'curl | sh resolves this from releases/latest'],
  ['brain-core SHA-256', /^pomnia-brain-core-.*-linux-x64\.tar\.gz\.sha256$/, 'bootstrap.sh verifies the tarball with it'],
]

console.log(`release ${release.tag_name}  draft=${release.draft} prerelease=${release.prerelease}`)
console.log(`assets  ${names.length}`)
console.log('')

const missing = []
for (const [label, pattern, why] of required) {
  const hit = names.find((n) => pattern.test(n))
  if (hit) console.log(`  ✓ ${label.padEnd(24)} ${hit}`)
  else {
    console.error(`  ✗ ${label.padEnd(24)} MISSING — ${why}`)
    missing.push(label)
  }
}
console.log('')

// A draft or prerelease is never what `releases/latest` serves, so checking a
// tag that carries every asset still tells you nothing about what visitors get.
if (!tag && (release.draft || release.prerelease)) {
  die('the GitHub API returned a draft/prerelease as latest — that should be impossible')
}

if (missing.length) {
  die(
    `${release.tag_name} is incomplete: ${missing.join(', ')}.\n` +
      '  Every platform must be reachable from one releases/latest. Either attach the\n' +
      '  missing artifacts to this tag, or do not let this tag be latest.',
  )
}

console.log(`✔ ${release.tag_name} serves Windows, macOS, Linux desktop and the curl|sh tarball`)
