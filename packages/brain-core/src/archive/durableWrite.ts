// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Power-loss-safe file replace — the path vault.ts uses for manifest.cvb.
 *
 * A rename publishes metadata immediately while the bytes may still sit in the
 * page cache. fsync before rename is the half that mattered on 17 August 2026
 * (manifest.cvb came back full-length, all zeros). The `.prev` spare is the
 * other half: open() can fall back when the primary is unreadable.
 *
 * One implementation for vault + archive + credential stores. Do not invent a
 * second writer. Unique tmp names so concurrent writers never share `.tmp`.
 */

import { randomBytes } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export type DurableWriteOpts = {
  /** File mode at creation. Credentials use 0o600 so they are never briefly world-readable. */
  mode?: number
  onPrevCopyError?: (err: Error) => void
}

function uniqueTmp(file: string): string {
  return `${file}.${randomBytes(6).toString('hex')}.tmp`
}

function fsyncDir(dir: string): void {
  try {
    const dh = openSync(dir, 'r')
    try {
      fsyncSync(dh)
    } finally {
      closeSync(dh)
    }
  } catch {
    // Windows / some network FS refuse directory sync; file sync already ran.
  }
}

/**
 * Write so the published name never points at bytes that are still in cache.
 */
export async function atomicWrite(file: string, data: Buffer, opts?: { mode?: number }): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = uniqueTmp(file)
  const fd = openSync(tmp, 'w', opts?.mode)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
  fsyncDir(dirname(file))
}

/** Sync counterpart for call sites that cannot await (panel library editor). */
export function atomicWriteSync(file: string, data: Buffer, opts?: { mode?: number }): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = uniqueTmp(file)
  const fd = openSync(tmp, 'w', opts?.mode)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
  fsyncDir(dirname(file))
}

/**
 * Keep the version we are replacing as `path.prev`, then atomicWrite the new one.
 *
 * Copy before write — the moment worth surviving is the one in the middle.
 * Missing primary (first write) is ordinary. Any other spare-copy failure is
 * reported via `onPrevCopyError` when provided; the new write still proceeds —
 * refusing to save because the spare failed would recreate the exact failure
 * mode this guards against.
 */
export async function writeFileKeepingPrev(
  file: string,
  data: Buffer,
  opts?: DurableWriteOpts,
): Promise<void> {
  try {
    await fs.copyFile(file, `${file}.prev`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      opts?.onPrevCopyError?.(e as Error)
    }
  }
  await atomicWrite(file, data, { mode: opts?.mode })
}

export function writeFileKeepingPrevSync(file: string, data: Buffer, opts?: DurableWriteOpts): void {
  try {
    copyFileSync(file, `${file}.prev`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      opts?.onPrevCopyError?.(e as Error)
    }
  }
  atomicWriteSync(file, data, { mode: opts?.mode })
}

/**
 * Read primary; if unreadable, try `path.prev`.
 * Returns which copy was used so callers can warn.
 */
export async function readFileWithPrevFallback(
  file: string,
): Promise<{ data: Buffer; from: 'primary' | 'prev' }> {
  try {
    return { data: await fs.readFile(file), from: 'primary' }
  } catch (primary) {
    try {
      return { data: await fs.readFile(`${file}.prev`), from: 'prev' }
    } catch {
      throw primary
    }
  }
}
