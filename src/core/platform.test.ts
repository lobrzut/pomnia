// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { afterEach, describe, expect, it } from 'vitest'
import {
  appDataRoot,
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

/**
 * These assertions must hold on every OS. The earlier version read
 * XDG_CONFIG_HOME and %APPDATA% unconditionally, so it agreed with the caller's
 * home on a Windows dev box and contradicted it on a Linux CI runner — a test
 * that was green here and red there, for a reason neither machine reported.
 */
describe('appDataRoot answers about the home it is given', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env.XDG_CONFIG_HOME = saved.XDG_CONFIG_HOME
    process.env.APPDATA = saved.APPDATA
  })

  it('ignores the host XDG_CONFIG_HOME when asked about another home', () => {
    process.env.XDG_CONFIG_HOME = '/home/runner/.config'
    expect(appDataRoot('linux', '/home/alice')).toBe('/home/alice/.config')
  })

  it('ignores the host APPDATA when asked about another home', () => {
    process.env.APPDATA = 'C:\\Users\\runner\\AppData\\Roaming'
    expect(appDataRoot('win32', 'C:\\Users\\alice').replace(/\\/g, '/')).toBe(
      'C:/Users/alice/AppData/Roaming',
    )
  })

  it('places macOS data under Application Support', () => {
    expect(appDataRoot('darwin', '/Users/alice')).toBe('/Users/alice/Library/Application Support')
  })
})
