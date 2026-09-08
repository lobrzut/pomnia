#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Assert that a release tag (or releases/latest) serves every platform we
 * point people at — with version-bound asset names.
 *
 * One URL has three audiences and no owner:
 *
 *  - the site's "Download for Windows" buttons and the JSON-LD `downloadUrl`
 *  - Linux desktop (AppImage/deb + latest-linux.yml)
 *  - `curl | sh`, which resolves the brain-core tarball off `releases/latest`
 *    (packages/brain-core/deploy/bootstrap.sh)
 *
 * A missing class OR an asset from another version fails the check. Uploading
 * an old tarball only to satisfy a loose regex is not a fix.
 *
 *   node scripts/check-release-complete.mjs             # whatever /latest resolves to
 *   node scripts/check-release-complete.mjs --tag v0.1.82
 */
import { execFileSync } from 'node:child_process'

import { assessReleaseAssets, versionFromTag } from './lib/release-assets.ts'

const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const tagArg = tagIdx >= 0 ? args[tagIdx + 1] : null

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

let release
try {
  if (tagArg) {
    // `gh release view` works on drafts; the API tags path 404s them.
    const raw = execFileSync('gh', ['release', 'view', tagArg, '--json', 'assets,isDraft,isPrerelease,tagName'], {
      encoding: 'utf8',
    })
    const v = JSON.parse(raw)
    release = {
      tag_name: v.tagName,
      draft: v.isDraft,
      prerelease: v.isPrerelease,
      assets: (v.assets ?? []).map((a) => ({ name: a.name })),
    }
  } else {
    release = JSON.parse(
      execFileSync('gh', ['api', 'repos/lobrzut/pomnia/releases/latest'], { encoding: 'utf8' }),
    )
  }
} catch (e) {
  die(`could not read the release from GitHub — ${e.message}`)
}

const version = versionFromTag(release.tag_name)
const names = (release.assets ?? []).map((a) => a.name)
const assessment = assessReleaseAssets(names, version)

console.log(`release ${release.tag_name}  draft=${release.draft} prerelease=${release.prerelease}`)
console.log(`version ${version}`)
console.log(`assets  ${names.length}`)
console.log('')

for (const row of assessment.rows) {
  if (row.hit) console.log(`  ✓ ${row.label.padEnd(24)} ${row.hit}`)
  else console.error(`  ✗ ${row.label.padEnd(24)} MISSING — ${row.why}`)
}
console.log('')

if (!tagArg && (release.draft || release.prerelease)) {
  die('the GitHub API returned a draft/prerelease as latest — that should be impossible')
}

if (!assessment.complete) {
  die(
    `${release.tag_name} is incomplete for ${version}: ${assessment.missing.join(', ')}.\n` +
      '  Every platform must be reachable from one releases/latest, with assets that\n' +
      '  match this version (not leftovers from an older tag). Keep the release as a\n' +
      '  draft until complete, then: npm run promote:release -- --tag ' +
      release.tag_name,
  )
}

console.log(`✔ ${release.tag_name} serves Windows, macOS, Linux desktop and the curl|sh tarball (${version})`)
