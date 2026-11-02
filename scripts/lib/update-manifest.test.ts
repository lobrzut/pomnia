// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import {
  mergeMacUpdateManifests,
  reconcileUpdateManifest,
  unmetManifestClaims,
} from './update-manifest.ts'

const linuxYml = `version: 0.1.91
files:
  - url: Pomnia-0.1.91.AppImage
    sha512: abc=
    size: 10
    blockMapSize: 99
path: Pomnia-0.1.91.AppImage
sha512: abc=
releaseDate: '2026-09-23T00:00:00.000Z'
`

describe('reconcileUpdateManifest', () => {
  it('drops blockMapSize when the blockmap is not on disk', () => {
    const r = reconcileUpdateManifest(linuxYml, new Set(['Pomnia-0.1.91.AppImage', 'latest-linux.yml']))
    expect(r.body).not.toMatch(/blockMapSize/)
    expect(r.blockmaps).toEqual([])
    expect(unmetManifestClaims(r.body, ['Pomnia-0.1.91.AppImage', 'latest-linux.yml'])).toEqual([])
  })

  it('keeps blockMapSize when the blockmap will be uploaded', () => {
    const present = new Set(['Pomnia-0.1.91.AppImage', 'Pomnia-0.1.91.AppImage.blockmap'])
    const r = reconcileUpdateManifest(linuxYml, present)
    expect(r.body).toMatch(/blockMapSize/)
    expect(r.blockmaps).toEqual(['Pomnia-0.1.91.AppImage.blockmap'])
    expect(unmetManifestClaims(r.body, ['Pomnia-0.1.91.AppImage'])).toEqual([
      'Pomnia-0.1.91.AppImage.blockmap',
    ])
  })
})

describe('mergeMacUpdateManifests', () => {
  it('lists both architectures and points path at arm64', () => {
    const arm = `version: 0.1.91
files:
  - url: Pomnia-0.1.91-arm64.dmg
    sha512: YXJt
    size: 20
path: Pomnia-0.1.91-arm64.dmg
sha512: YXJt
releaseDate: '2026-09-23T00:00:00.000Z'
`
    const intel = `version: 0.1.91
files:
  - url: Pomnia-0.1.91-x64.dmg
    sha512: eDY0
    size: 21
    blockMapSize: 4
path: Pomnia-0.1.91-x64.dmg
sha512: eDY0
releaseDate: '2026-09-26T00:00:00.000Z'
`
    const merged = mergeMacUpdateManifests([arm, intel])
    expect(merged).toMatch(/^version: 0.1.91/m)
    expect(merged).toContain('url: Pomnia-0.1.91-arm64.dmg')
    expect(merged).toContain('url: Pomnia-0.1.91-x64.dmg')
    expect(merged).toMatch(/^path: Pomnia-0\.1\.91-arm64\.dmg$/m)
    expect(merged).toContain("releaseDate: '2026-09-26T00:00:00.000Z'")
  })
})
