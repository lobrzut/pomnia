#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Promote a draft GitHub Release to latest — only when it is complete.
 *
 * Process (F10):
 *   draft → gather every platform → check:release → promote
 *
 * Never undraft an incomplete tag: releases/latest would move and break
 * Windows CTA / curl|sh / Linux desktop for whoever clicks next.
 *
 *   npm run promote:release -- --tag v0.1.82
 *   npm run promote:release -- --tag v0.1.82 --dry-run
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const tagIdx = args.indexOf('--tag')
const dryRun = args.includes('--dry-run')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

if (tagIdx < 0 || !args[tagIdx + 1]) {
  die('usage: node scripts/promote-release.mjs --tag vX.Y.Z [--dry-run]')
}

const tag = args[tagIdx + 1]

let view
try {
  view = JSON.parse(
    execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft,isPrerelease,tagName'], {
      cwd: root,
      encoding: 'utf8',
    }),
  )
} catch (e) {
  die(`could not read release ${tag} — ${e.message}`)
}

console.log(`tag     ${view.tagName}`)
console.log(`draft   ${view.isDraft}`)
console.log(`pre     ${view.isPrerelease}`)

try {
  execFileSync('npx', ['tsx', join(root, 'scripts', 'check-release-complete.mjs'), '--tag', tag], {
    cwd: root,
    stdio: 'inherit',
  })
} catch {
  die(`${tag} is incomplete — leave it as a draft and attach the missing assets first`)
}

if (!view.isDraft) {
  console.log(`✔ ${tag} is already published and complete`)
  process.exit(0)
}

if (dryRun) {
  console.log(`dry-run: would undraft ${tag} (becomes releases/latest if newest)`)
  process.exit(0)
}

execFileSync('gh', ['release', 'edit', tag, '--draft=false'], { cwd: root, stdio: 'inherit' })
console.log(`\n✔ published ${tag} — verify: npm run check:release`)
