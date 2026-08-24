#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Strict Windows release pipeline — only allowed path to the installer.
 *
 * Order (abort on first failure):
 * 1. refuse uncommitted / untracked changes (ignored files e.g. src/buildInfo.ts do not count)
 * 2. build @pomnia/brain-core + @pomnia/doc-parser (types/dist needed by typecheck on fresh clone)
 * 3. typecheck (regenerates buildInfo first)
 * 4. tests (regenerates buildInfo first)
 * 5. golden path — index coverage / search / handshake / rules (read-only)
 * 6. npm version patch --no-git-tag-version + commit "Release X.Y.Z"
 * 7. npm run build:win  (generates buildInfo from the Release commit, then packs)
 *
 * Flags:
 *   --check-clean  only step 1 (exit 0 if clean)
 *   --dry-run      steps 1–5 only (no version bump / pack)
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const checkCleanOnly = args.has('--check-clean')
const dryRun = args.has('--dry-run')

function run(cmd) {
  console.log(`\n→ ${cmd}\n`)
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: process.env })
}

function gitOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim()
}

/** Step 1: clean tracked/untracked tree. Ignored paths (src/buildInfo.ts) never appear in porcelain. */
function assertCleanTree() {
  const porcelain = gitOut('git status --porcelain')
  if (porcelain) {
    console.error('release:win refused: working tree is not clean.\n')
    console.error(porcelain)
    console.error('\nCommit or stash everything first (including untracked files).')
    console.error('Ignored files (e.g. src/buildInfo.ts) are fine and do not block.')
    process.exit(1)
  }

  // Belt-and-suspenders: staged + unstaged diffs must also be empty
  try {
    execSync('git diff --quiet', { cwd: root, stdio: 'pipe' })
    execSync('git diff --cached --quiet', { cwd: root, stdio: 'pipe' })
  } catch {
    console.error('release:win refused: git diff / git diff --cached is not empty.')
    process.exit(1)
  }
}

assertCleanTree()
if (checkCleanOnly) {
  console.log('✔ release:win --check-clean: working tree is clean')
  process.exit(0)
}

// The previous release left better-sqlite3 compiled for Electron's ABI: step 7
// stages brain-core, which runs @electron/rebuild against the root node_modules.
// Node then refuses the binding it finds -- "NODE_MODULE_VERSION 130 ... requires
// 137" -- and 34 tests fail at once, which reads as a code regression and is not.
// Rebuilding for Node here makes a second consecutive release run behave like the
// first; step 7 rebuilds it for Electron again when it needs to.
run('npm rebuild better-sqlite3')
run('npm run build:brain-core && npm run build:doc-parser')
run('npm run typecheck')
run('npm test')

// After generate:build-info (via typecheck/test), ignored buildInfo must not dirty porcelain
assertCleanTree()
console.log('✔ tree still clean after generate:build-info')

// The memory gate is read-only, so run it here rather than only inside build:win.
// It used to fire at the very last step of a real pack, which meant a passing
// dry-run said nothing about the one check that guards the product's promise —
// and that is exactly what "release:win --dry-run passes" was taken to mean.
run('npm run test:golden')

if (dryRun) {
  console.log('\n✔ release:win --dry-run complete (skipped version bump + pack)')
  process.exit(0)
}

run('npm version patch --no-git-tag-version')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

// The workspace package has to move with the app. `npm version patch` touches
// the root manifest only, so brain-core kept the previous number and reported
// it over MCP and /healthz — a version that matches no release, which is the
// exact defect version.ts exists to prevent. Bumped in lockstep, and the
// staging script verifies the running runtime agrees before it finishes.
const bcPath = join(root, 'packages', 'brain-core', 'package.json')
const bc = JSON.parse(readFileSync(bcPath, 'utf8'))
if (bc.version !== version) {
  writeFileSync(bcPath, JSON.stringify({ ...bc, version }, null, 2) + '\n', 'utf8')
  console.log(`brain-core ${bc.version} -> ${version}`)
}

run('git add package.json package-lock.json packages/brain-core/package.json')
run(`git commit -m "Release ${version}"`)

console.log(`\nRelease commit ready (${version}). Building installer with buildInfo from this commit…\n`)
run('npm run build:win')

console.log(`\n✔ release:win complete — Pomnia ${version}`)
