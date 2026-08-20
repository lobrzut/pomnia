// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  buildDataLocationsSnapshot,
  defaultVaultPathExample,
  defaultVaultPathHint,
  detectInstallForm,
  libraryDbPathUnder,
  pomniaUserDataDir,
} from './dataLocations.js'

describe('dataLocations', () => {
  it('names Windows vs Linux vault examples', () => {
    expect(defaultVaultPathExample('win32', 'C:\\Users\\Alice')).toBe('C:\\Vault')
    expect(defaultVaultPathExample('linux', '/home/alice')).toBe('/home/alice/Vault')
    expect(defaultVaultPathHint('linux')).toBe('~/Vault')
    expect(defaultVaultPathHint('win32')).toBe('C:\\Vault')
  })

  // Lower case, and Linux is the only platform where that is observable:
  // app.getName() falls back to package.json `name` because no top-level
  // productName exists, so a real install has ~/.config/pomnia. The
  // capitalised spelling this used to assert is a directory that is not there.
  it('resolves XDG-style userData on Linux, lower case', () => {
    const ud = pomniaUserDataDir('linux', '/home/alice')
    expect(ud.replace(/\\/g, '/')).toBe('/home/alice/.config/pomnia')
    expect(libraryDbPathUnder(ud).replace(/\\/g, '/')).toContain(
      '/home/alice/.config/pomnia/brain-core-data/vectordb/library.db',
    )
  })

  it('detects AppImage vs deb vs nsis honestly', () => {
    expect(detectInstallForm('win32', {}, 'C:\\Program Files\\Pomnia\\Pomnia.exe')).toBe('nsis')
    expect(detectInstallForm('linux', { APPIMAGE: '/tmp/Pomnia.AppImage' }, '/tmp/.mount_Pomnia/Pomnia')).toBe(
      'appimage',
    )
    expect(detectInstallForm('linux', {}, '/usr/bin/Pomnia')).toBe('deb')
    expect(detectInstallForm('linux', {}, '/home/alice/dev/pomnia/node_modules/electron/dist/electron')).toBe(
      'unknown',
    )
  })

  it('builds a snapshot that admits plaintext index', () => {
    const s = buildDataLocationsSnapshot({
      userDataDir: '/home/alice/.config/pomnia',
      vaultPath: '/home/alice/Vault',
      platform: 'linux',
      installForm: 'appimage',
    })
    expect(s.indexIsPlaintext).toBe(true)
    expect(s.installForm).toBe('appimage')
    expect(s.libraryDbPath.replace(/\\/g, '/')).toContain('library.db')
    expect(s.defaultVaultExample.replace(/\\/g, '/')).toMatch(/Vault$/)
  })
})
