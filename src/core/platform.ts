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

/** Per-OS application-data roots, resolved against a given home directory. */
export function appDataRoot(targetOS: OS, home: string): string {
  switch (targetOS) {
    case 'win32':
      // %APPDATA%
      return process.platform === 'win32' && process.env.APPDATA
        ? process.env.APPDATA
        : path.win32.join(home, 'AppData', 'Roaming')
    case 'darwin':
      return path.posix.join(home, 'Library', 'Application Support')
    case 'linux':
      return process.env.XDG_CONFIG_HOME || path.posix.join(home, '.config')
  }
}

/** Returns the path module matching a target OS (for building paths for *other* platforms). */
export function pathFor(targetOS: OS): path.PlatformPath {
  return targetOS === 'win32' ? path.win32 : path.posix
}

/** Normalize any path to forward-slash form for portable storage in the vault. */
export function toPortable(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Convert a portable (forward-slash) path back to the native separator. */
export function fromPortable(p: string, targetOS: OS = currentOS()): string {
  return targetOS === 'win32' ? p.replace(/\//g, '\\') : p
}
