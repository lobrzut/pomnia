// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Keep vault I/O inside the vault root even when a path segment is a symlink
 * or Windows junction that points outside.
 *
 * `safeVaultPath` rejects `..` in the peer string. That is not enough after
 * `join`: reading or writing follows links. Walk each segment with lstat; if a
 * link's realpath leaves the root, refuse. For a not-yet-created leaf, the
 * nearest existing parent must stay inside the root.
 */

import { promises as fs } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

export type SafeFsRejection = 'symlink-escape' | 'outside-root' | 'io-error'

export type SafeAbsResult =
  | { ok: true; abs: string }
  | { ok: false; reason: SafeFsRejection; detail?: string }

function insideRoot(rootReal: string, candidateReal: string): boolean {
  const root = resolve(rootReal)
  const cand = resolve(candidateReal)
  if (cand === root) return true
  const prefix = root.endsWith(sep) ? root : root + sep
  return cand.startsWith(prefix)
}

/**
 * Resolve `relative` (POSIX segments, already validated by safeVaultPath) to an
 * absolute path that is guaranteed not to escape `vaultRoot` via symlinks.
 */
export async function resolveSafeVaultAbs(
  vaultRoot: string,
  relative: string,
): Promise<SafeAbsResult> {
  let rootReal: string
  try {
    rootReal = await fs.realpath(vaultRoot)
  } catch (e) {
    return { ok: false, reason: 'io-error', detail: (e as Error).message }
  }

  const segments = relative.split('/').filter(Boolean)
  let current = rootReal

  for (let i = 0; i < segments.length; i++) {
    const next = join(current, segments[i])
    let st: Awaited<ReturnType<typeof fs.lstat>>
    try {
      st = await fs.lstat(next)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { ok: false, reason: 'io-error', detail: (e as Error).message }
      }
      // Remainder does not exist — parent `current` is the boundary.
      if (!insideRoot(rootReal, current)) {
        return { ok: false, reason: 'outside-root' }
      }
      return { ok: true, abs: join(current, ...segments.slice(i)) }
    }

    if (st.isSymbolicLink()) {
      let target: string
      try {
        target = await fs.realpath(next)
      } catch (e) {
        return { ok: false, reason: 'io-error', detail: (e as Error).message }
      }
      if (!insideRoot(rootReal, target)) {
        return { ok: false, reason: 'symlink-escape', detail: relative }
      }
      current = target
      continue
    }

    try {
      current = await fs.realpath(next)
    } catch {
      current = next
    }
    if (!insideRoot(rootReal, current)) {
      return { ok: false, reason: 'outside-root' }
    }
  }

  if (!insideRoot(rootReal, current)) {
    return { ok: false, reason: 'outside-root' }
  }
  return { ok: true, abs: current }
}

/** True when `abs` (already realpathed or not) lies under realpath(vaultRoot). */
export async function assertInsideVault(vaultRoot: string, abs: string): Promise<SafeAbsResult> {
  try {
    const rootReal = await fs.realpath(vaultRoot)
    let cand = abs
    try {
      cand = await fs.realpath(abs)
    } catch {
      // May not exist — check parent.
      const parent = dirname(abs)
      const parentReal = await fs.realpath(parent)
      if (!insideRoot(rootReal, parentReal)) {
        return { ok: false, reason: 'outside-root' }
      }
      return { ok: true, abs }
    }
    if (!insideRoot(rootReal, cand)) {
      return { ok: false, reason: 'outside-root' }
    }
    return { ok: true, abs: cand }
  } catch (e) {
    return { ok: false, reason: 'io-error', detail: (e as Error).message }
  }
}
