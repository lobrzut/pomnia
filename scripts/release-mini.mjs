#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Pack the Pomnia Mini zip for the current product version.
 *
 * Mini is not its own version line. `release:win` owns the bump and the
 * "Release X.Y.Z" commit. This script never runs `npm version`. Packing Mini
 * by hand-bumping and calling `pack:win` / `build:win` is the bypass this
 * exists to refuse.
 *
 * The release asset is `release/mini/PomniaMini-<version>.zip`. Unpack that
 * once and run `PomniaMini.exe`. The portable exe is a different target
 * (`build:mini:win`) and is not what this script produces.
 *
 *   npm run release:mini                 # gates, then the zip (backfill; no bump)
 *   npm run release:mini -- --dry-run    # gates only
 *   npm run release:mini -- --check-clean
 *
 * `release:win` calls `npm run release:mini -- --pack-only` after its own
 * gates and the Release commit. `--pack-only` still refuses a dirty tree and
 * a bundle that is not Mini. It is not a way to ship the full installer.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectMiniAssets, miniZipFileName } from './lib/release-assets.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const checkCleanOnly = args.has('--check-clean')
const dryRun = args.has('--dry-run')
const packOnly = args.has('--pack-only')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function run(cmd) {
  console.log(`\n→ ${cmd}\n`)
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: process.env })
}

function gitOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim()
}

/** Same rule as release:win. Ignored paths (src/buildInfo.ts, release/) do not count. */
function assertCleanTree() {
  const porcelain = gitOut('git status --porcelain')
  if (porcelain) {
    console.error('release:mini refused: working tree is not clean.\n')
    console.error(porcelain)
    console.error('\nCommit or stash everything first (including untracked files).')
    console.error('Ignored files (e.g. src/buildInfo.ts) are fine and do not block.')
    process.exit(1)
  }
  try {
    execSync('git diff --quiet', { cwd: root, stdio: 'pipe' })
    execSync('git diff --cached --quiet', { cwd: root, stdio: 'pipe' })
  } catch {
    console.error('release:mini refused: git diff / git diff --cached is not empty.')
    process.exit(1)
  }
}

if (dryRun && packOnly) die('pass either --dry-run or --pack-only, not both')
if (checkCleanOnly && (dryRun || packOnly)) die('--check-clean does not combine with other flags')

assertCleanTree()
if (checkCleanOnly) {
  console.log('✔ release:mini --check-clean: working tree is clean')
  process.exit(0)
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const bc = JSON.parse(readFileSync(join(root, 'packages', 'brain-core', 'package.json'), 'utf8'))
if (bc.version !== version) {
  die(
    `brain-core is ${bc.version} but the app is ${version} — they move together in release:win; ` +
      'fix that mismatch before packing Mini',
  )
}

const zipName = miniZipFileName(version)
console.log(`Pomnia Mini ${version} — packing ${zipName}`)
console.log('no version bump (that is release:win)')

if (!packOnly) {
  // Same preflight as release:win, without the bump. A Mini zip from a tree
  // that has not passed typecheck/test/golden is how a full app gets labeled
  // Mini and shipped.
  run('npm rebuild better-sqlite3')
  run('npm run build:brain-core && npm run build:doc-parser')
  run('npm run typecheck')
  run('npm test')
  assertCleanTree()
  console.log('✔ tree still clean after generate:build-info')
  run('npm run test:golden')
}

if (dryRun) {
  console.log('\n✔ release:mini --dry-run complete (skipped pack)')
  process.exit(0)
}

if (process.platform !== 'win32') {
  die(
    `release:mini packs a Windows zip (native modules) and must run on Windows. This machine is ${process.platform}.\n` +
      '  On the Windows machine, from a clean checkout of this version:\n' +
      '    npm run release:mini\n' +
      '    npm run attach:mini-release',
  )
}

// Zip only. `build:mini:win` also packs the portable exe; that exe is not the
// release asset, and producing it here is how the two get mixed up.
run('npm run build:doc-parser && npm run stage:tessdata && npm run generate:build-info')
run('npm run build:mini:bundle')

assertMiniBundle(root)

run('npm run pack:mini:zip')

const mini = collectMiniAssets({ releaseDir: join(root, 'release', 'mini'), version })
if (!mini.ok || !mini.present) {
  for (const e of mini.errors) console.error(`✗ ${e}`)
  die(`expected release/mini/${zipName} — electron-builder did not emit the Mini zip`)
}

console.log(`\n✔ release:mini complete — release/mini/${zipName} (${mini.sizeMb} MB)`)
console.log(`  sha256 ${mini.sha256}`)
console.log('  unpack that zip once and run PomniaMini.exe')
console.log(`  upload: npm run attach:mini-release`)

/**
 * `--mode mini` is load-bearing. Without `.env.mini`, electron-vite builds the
 * full app and the zip would still be named PomniaMini. The full app's userData
 * path is `pomnia`; Mini's is `pomnia-mini`, and a full build constant-folds
 * that branch away.
 */
function assertMiniBundle(rootDir) {
  const mainDir = join(rootDir, 'out', 'main')
  if (!existsSync(mainDir)) die('missing out/main — the Mini bundle did not build')
  let hit = false
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p)
        continue
      }
      if (!name.endsWith('.js')) continue
      if (readFileSync(p, 'utf8').includes('pomnia-mini')) hit = true
    }
  }
  walk(mainDir)
  if (!hit) {
    die(
      'out/main has no pomnia-mini userData path — this bundle is not Mini.\n' +
        '  .env.mini must be applied (--mode mini, envDir at the repo root). Refusing to pack it.',
    )
  }
  console.log('✔ bundle is Mini (pomnia-mini userData)')
}
