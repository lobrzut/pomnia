// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatBuildIdentity } from './buildInfo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('formatBuildIdentity', () => {
  it('formats version · sha · timestamp', () => {
    expect(formatBuildIdentity('0.1.44', '4155ea9', '2026-07-30 01:12', false)).toBe(
      '0.1.44 · 4155ea9 · 2026-07-30 01:12',
    )
  })

  it('appends +dirty when working tree was dirty at generate time', () => {
    expect(formatBuildIdentity('0.1.44', '4155ea9', '2026-07-30 01:12', true)).toBe(
      '0.1.44 · 4155ea9+dirty · 2026-07-30 01:12',
    )
  })
})

describe('generate-build-info.mjs', () => {
  it('writes src/buildInfo.ts with current package version and a short sha', () => {
    execFileSync(process.execPath, [join(root, 'scripts', 'generate-build-info.mjs')], {
      cwd: root,
      stdio: 'pipe',
    })
    const src = readFileSync(join(root, 'src', 'buildInfo.ts'), 'utf8')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
    expect(src).toContain(`BUILD_VERSION = ${JSON.stringify(pkg.version)}`)
    expect(src).toMatch(/BUILD_GIT_SHA = "[0-9a-f]{7,}"/)
    expect(src).toMatch(/BUILD_TIMESTAMP = "\d{4}-\d{2}-\d{2} \d{2}:\d{2}"/)
    expect(src).toContain('export function formatBuildIdentity')
  })
})
