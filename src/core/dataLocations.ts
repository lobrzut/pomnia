// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Honest OS paths for vault + Brain data — shared by doctor CLI, main IPC,
 * and docs. Electron's `app.getPath('userData')` already lands under XDG on
 * Linux (`~/.config/Pomnia`); this module names that contract so UI/docs do
 * not keep saying AppData / C:\Vault on a Linux box.
 */
import { join, posix } from 'node:path'
import type { OS } from './model.js'
import { appDataRoot, currentOS, homeDir } from './platform.js'

export type InstallForm = 'appimage' | 'deb' | 'nsis' | 'dmg' | 'dev' | 'unknown'

/** Example path shown in vault create/unlock placeholders. */
export function defaultVaultPathExample(os: OS = currentOS(), home?: string): string {
  if (os === 'win32') return 'C:\\Vault'
  // Always posix — tests and docs may ask for linux paths while the host is Windows.
  const h = (home ?? (os === currentOS() ? homeDir() : '/home/user')).replace(/\\/g, '/')
  return posix.join(h, 'Vault')
}

/** Shorter hint for labels that sit in long sentences (tilde form on Unix). */
export function defaultVaultPathHint(os: OS = currentOS()): string {
  if (os === 'win32') return 'C:\\Vault'
  return '~/Vault'
}

/** Where Pomnia keeps settings, logs, and the rebuildable search index. */
export function pomniaUserDataDir(os: OS = currentOS(), home: string = homeDir()): string {
  const root = appDataRoot(os, home)
  if (os === 'win32') return join(root, 'Pomnia')
  return posix.join(root.replace(/\\/g, '/'), 'Pomnia')
}

export function brainCoreDataDirUnder(userData: string): string {
  return join(userData, 'brain-core-data')
}

export function libraryDbPathUnder(userData: string): string {
  return join(brainCoreDataDirUnder(userData), 'vectordb', 'library.db')
}

export function logsDirUnder(userData: string): string {
  return join(userData, 'logs')
}

/**
 * Best-effort packaging form. AppImage sets `APPIMAGE`; deb usually lands under
 * `/usr` / `/opt`. Dev = unpackaged Electron. Never invents auto-update support.
 */
export function detectInstallForm(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
): InstallForm {
  if (platform === 'win32') return 'nsis'
  if (platform === 'darwin') return 'dmg'
  if (platform === 'linux') {
    if (env.APPIMAGE) return 'appimage'
    const p = execPath.replace(/\\/g, '/')
    if (p.startsWith('/usr/') || p.startsWith('/opt/')) return 'deb'
    return 'unknown'
  }
  return 'unknown'
}

export interface DataLocationsSnapshot {
  platform: OS
  installForm: InstallForm
  userDataDir: string
  brainCoreDataDir: string
  libraryDbPath: string
  logsDir: string
  defaultVaultExample: string
  /** Open vault root, or null when locked / unknown. */
  vaultPath: string | null
  /**
   * Plaintext honesty: search index is NOT covered by the vault passphrase.
   * Same story as Windows AppData — name the Linux path instead of lying.
   */
  indexIsPlaintext: true
}

export function buildDataLocationsSnapshot(opts: {
  userDataDir: string
  vaultPath?: string | null
  platform?: OS
  installForm?: InstallForm
}): DataLocationsSnapshot {
  const platform = opts.platform ?? currentOS()
  const userDataDir = opts.userDataDir
  return {
    platform,
    installForm: opts.installForm ?? detectInstallForm(),
    userDataDir,
    brainCoreDataDir: brainCoreDataDirUnder(userDataDir),
    libraryDbPath: libraryDbPathUnder(userDataDir),
    logsDir: logsDirUnder(userDataDir),
    defaultVaultExample: defaultVaultPathExample(
      platform,
      platform === 'win32' ? undefined : platform === currentOS() ? homeDir() : '/home/user',
    ),
    vaultPath: opts.vaultPath ?? null,
    indexIsPlaintext: true,
  }
}
