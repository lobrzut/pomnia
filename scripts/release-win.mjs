#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Strict Windows release pipeline — only allowed path to the installer.
 *
 * Order (abort on first failure):
 * 1. refuse uncommitted / untracked changes
 * 2. typecheck
 * 3. tests
 * 4. npm version patch --no-git-tag-version + commit "Release X.Y.Z"
 * 5. npm run build:win  (generates buildInfo from the Release commit, then packs)
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd) {
  console.log(`\n→ ${cmd}\n`)
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: process.env })
}

function gitOut(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim()
}

const porcelain = gitOut('git status --porcelain')
if (porcelain) {
  console.error('release:win refused: working tree is not clean.\n')
  console.error(porcelain)
  console.error('\nCommit or stash everything first (including untracked files).')
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

run('npm run typecheck')
run('npm test')

run('npm version patch --no-git-tag-version')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
run('git add package.json package-lock.json')
run(`git commit -m "Release ${version}"`)

console.log(`\nRelease commit ready (${version}). Building installer with buildInfo from this commit…\n`)
run('npm run build:win')

console.log(`\n✔ release:win complete — Pomnia ${version}`)
