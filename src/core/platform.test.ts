// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  machineDataRootLabel,
  pomniaUserDataExample,
  vaultFolderExample,
} from './platform.js'

describe('platform path examples', () => {
  it('names XDG on Linux and AppData on Windows', () => {
    expect(pomniaUserDataExample('linux')).toBe('~/.config/Pomnia')
    expect(pomniaUserDataExample('win32')).toBe('%AppData%\\Pomnia')
    expect(machineDataRootLabel('linux')).toBe('~/.config')
    expect(machineDataRootLabel('win32')).toBe('AppData')
  })

  it('uses ~/Vault on Unix and C:\\Vault on Windows', () => {
    expect(vaultFolderExample('linux')).toBe('~/Vault')
    expect(vaultFolderExample('darwin')).toBe('~/Vault')
    expect(vaultFolderExample('win32')).toBe('C:\\Vault')
  })
})
