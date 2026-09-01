// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import os from 'node:os'
import path from 'node:path'
import type { OS } from './model.js'

export function currentOS(): OS {
  const p = process.platform
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p
  // Treat anything else as linux-like for path purposes.
  return 'linux'
}

export function homeDir(): string {
  return os.homedir()
}

export function hostName(): string {
  return os.hostname()
}

export function userName(): string {
  try {
    return os.userInfo().username
  } catch {
    return process.env.USER || process.env.USERNAME || 'unknown'
  }
}

/**
 * Per-OS application-data roots, resolved against a given home directory.
 *
 * Ambient environment counts only when we are describing *this* machine's real
 * home. Asking "where would data live for /home/alice on Linux" must answer
 * from /home/alice, not from the host's XDG_CONFIG_HOME — the docs and the UI
 * ask exactly that when they describe another platform.
 *
 * The old version consulted the variable unconditionally, which is why its test
 * passed here and failed on CI: Windows has no XDG_CONFIG_HOME, a GitHub Linux
 * runner sets it, and the function quietly ignored the home it was handed.
 */
export function appDataRoot(targetOS: OS, home: string): string {
  const describingHost = targetOS === currentOS() && home === homeDir()
  switch (targetOS) {
    case 'win32':
      // %APPDATA%
      return describingHost && process.env.APPDATA
        ? process.env.APPDATA
        : path.win32.join(home, 'AppData', 'Roaming')
    case 'darwin':
      return path.posix.join(home, 'Library', 'Application Support')
    case 'linux':
      return describingHost && process.env.XDG_CONFIG_HOME
        ? process.env.XDG_CONFIG_HOME
        : path.posix.join(home, '.config')
  }
}

/** Normalize any path to forward-slash form for portable storage in the vault. */
export function toPortable(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Example Pomnia userData for docs/UI — not a live resolve.
 * Linux = XDG config (`~/.config/Pomnia`); Windows = `%AppData%\\Pomnia`.
 */
export function pomniaUserDataExample(targetOS: OS = currentOS()): string {
  switch (targetOS) {
    case 'win32':
      return '%AppData%\\Pomnia'
    case 'darwin':
      return '~/Library/Application Support/Pomnia'
    case 'linux':
      return '~/.config/Pomnia'
  }
}

/** Example vault folder path for labels (operator picks the real path). */
export function vaultFolderExample(targetOS: OS = currentOS()): string {
  switch (targetOS) {
    case 'win32':
      return 'C:\\Vault'
    case 'darwin':
      return '~/Vault'
    case 'linux':
      return '~/Vault'
  }
}

/** Short label for the machine-local data root (AppData / XDG). */
export function machineDataRootLabel(targetOS: OS = currentOS()): string {
  switch (targetOS) {
    case 'win32':
      return 'AppData'
    case 'darwin':
      return 'Application Support'
    case 'linux':
      return '~/.config'
  }
}
