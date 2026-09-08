// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assessReleaseAssets,
  belongsToVersion,
  collectLinuxDesktopAssets,
  computeSha256Hex,
  ensureMatchingSha256,
  formatSha256Line,
  parseSha256Line,
  validateUpdateManifest,
  versionFromTag,
} from './release-assets.ts'

describe('versionFromTag', () => {
  it('strips leading v', () => {
    expect(versionFromTag('v0.1.82')).toBe('0.1.82')
    expect(versionFromTag('0.1.82')).toBe('0.1.82')
  })
})

describe('belongsToVersion', () => {
  it('matches desktop and brain-core naming', () => {
    expect(belongsToVersion('Pomnia-0.1.82.AppImage', '0.1.82')).toBe(true)
    expect(belongsToVersion('Pomnia-0.1.82.deb', '0.1.82')).toBe(true)
    expect(belongsToVersion('pomnia_0.1.82_amd64.deb', '0.1.82')).toBe(true)
    expect(belongsToVersion('pomnia-brain-core-0.1.82-linux-x64.tar.gz', '0.1.82')).toBe(true)
    expect(belongsToVersion('Pomnia-0.1.81.AppImage', '0.1.82')).toBe(false)
  })
})

describe('assessReleaseAssets', () => {
  const version = '0.1.82'
  const complete = [
    'Pomnia-0.1.82-setup.exe',
    'Pomnia-0.1.82-setup.exe.blockmap',
    'Pomnia-0.1.82-setup.exe.sha256',
    'latest.yml',
    'Pomnia-0.1.82.AppImage',
    'Pomnia-0.1.82.deb',
    'Pomnia-0.1.82.AppImage.sha256',
    'latest-linux.yml',
    'Pomnia-0.1.82-x64.dmg',
    'Pomnia-0.1.82-arm64.dmg',
    'Pomnia-0.1.82-x64.dmg.sha256',
    'pomnia-brain-core-0.1.82-linux-x64.tar.gz',
    'pomnia-brain-core-0.1.82-linux-x64.tar.gz.sha256',
  ]

  it('passes a full version-matched set', () => {
    const r = assessReleaseAssets(complete, version)
    expect(r.complete).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('refuses green regex on old assets (F10)', () => {
    const stale = [
      'Pomnia-0.1.70-setup.exe',
      'Pomnia-0.1.70-setup.exe.blockmap',
      'Pomnia-0.1.70-setup.exe.sha256',
      'latest.yml',
      'Pomnia-0.1.70.AppImage',
      'Pomnia-0.1.70.deb',
      'Pomnia-0.1.70.AppImage.sha256',
      'latest-linux.yml',
      'Pomnia-0.1.70-x64.dmg',
      'Pomnia-0.1.70-arm64.dmg',
      'Pomnia-0.1.70-x64.dmg.sha256',
      'pomnia-brain-core-0.1.70-linux-x64.tar.gz',
      'pomnia-brain-core-0.1.70-linux-x64.tar.gz.sha256',
    ]
    const r = assessReleaseAssets(stale, version)
    expect(r.complete).toBe(false)
    expect(r.missing).toContain('Windows installer')
    expect(r.missing).toContain('brain-core tarball')
    expect(r.missing).toContain('Linux AppImage')
  })

  it('names missing Linux server assets like public v0.1.82', () => {
    const r = assessReleaseAssets(
      complete.filter(
        (n) =>
          n.includes('setup') ||
          n === 'latest.yml' ||
          n.includes('.dmg'),
      ),
      version,
    )
    expect(r.missing).toEqual(
      expect.arrayContaining([
        'Linux AppImage',
        'Linux deb',
        'Linux latest-linux.yml',
        'brain-core tarball',
        'brain-core SHA-256',
      ]),
    )
  })
})

describe('SHA-256 sidecars', () => {
  it('parses and formats uppercase hex', () => {
    const hex = 'A'.repeat(64)
    expect(parseSha256Line(formatSha256Line(hex, 'a.bin'))).toEqual({
      hex,
      fileName: 'a.bin',
    })
  })

  it('refuses a stale sidecar next to a swapped binary (F18)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-rel-'))
    const file = join(dir, 'Pomnia-0.1.82.AppImage')
    writeFileSync(file, 'new-bytes')
    const real = computeSha256Hex('new-bytes')
    const stale = createHash('sha256').update('old-bytes').digest('hex').toUpperCase()
    writeFileSync(`${file}.sha256`, formatSha256Line(stale, 'Pomnia-0.1.82.AppImage'))
    const r = ensureMatchingSha256({ filePath: file })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/SHA-256 mismatch/)
    expect(r.hex).toBe(real)
  })
})

describe('validateUpdateManifest', () => {
  it('requires version and artifact name', () => {
    expect(validateUpdateManifest('version: 0.1.82\npath: Pomnia-0.1.82.AppImage\n', {
      version: '0.1.82',
      mustInclude: ['Pomnia-0.1.82.AppImage'],
    }).ok).toBe(true)
    expect(validateUpdateManifest('version: 0.1.70\npath: Pomnia-0.1.70.AppImage\n', {
      version: '0.1.82',
      mustInclude: ['Pomnia-0.1.82.AppImage'],
    }).ok).toBe(false)
  })
})

describe('collectLinuxDesktopAssets', () => {
  function stage(version: string, opts?: { foreign?: boolean; badSha?: boolean; badYml?: boolean }) {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-linux-'))
    const app = `Pomnia-${version}.AppImage`
    const deb = `Pomnia-${version}.deb`
    writeFileSync(join(dir, app), `app-${version}`)
    writeFileSync(join(dir, deb), `deb-${version}`)
    writeFileSync(
      join(dir, 'latest-linux.yml'),
      opts?.badYml
        ? 'version: 0.0.1\npath: other.AppImage\n'
        : `version: ${version}\npath: ${app}\nfiles:\n  - url: ${app}\n`,
    )
    if (opts?.foreign) {
      writeFileSync(join(dir, 'Pomnia-0.1.70.AppImage'), 'old')
    }
    if (opts?.badSha) {
      writeFileSync(join(dir, `${app}.sha256`), formatSha256Line('B'.repeat(64), app))
    }
    return dir
  }

  it('builds a plan for a clean directory', () => {
    const dir = stage('0.1.82')
    const r = collectLinuxDesktopAssets({ releaseDir: dir, version: '0.1.82' })
    expect(r.ok).toBe(true)
    expect(r.assets.some((p) => p.endsWith('.AppImage'))).toBe(true)
    expect(r.assets.some((p) => p.endsWith('latest-linux.yml'))).toBe(true)
    expect(r.plan.map((p) => p.role).sort()).toEqual(['appimage', 'deb', 'manifest'])
  })

  it('refuses mixed versions', () => {
    const dir = stage('0.1.82', { foreign: true })
    const r = collectLinuxDesktopAssets({ releaseDir: dir, version: '0.1.82' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/mixed Linux versions/)
  })

  it('refuses stale sha and bad manifest', () => {
    const dir = stage('0.1.82', { badSha: true, badYml: true })
    const r = collectLinuxDesktopAssets({ releaseDir: dir, version: '0.1.82' })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/SHA-256 mismatch/)
    expect(r.errors.join('\n')).toMatch(/latest-linux\.yml/)
  })
})
