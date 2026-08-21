// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Refuse to start on a vault that used to have content and is now empty.
 *
 * The hazard is a network mount that is not up yet. `--vault-root
 * /mnt/nas/vault` points at an ordinary empty directory until the mount lands,
 * and everything downstream behaves correctly on it: the directory is created,
 * the vault is claimed, `state/vault-writer.json` is written, notes are saved.
 * Then the real share mounts on top and all of it disappears — with no error
 * anywhere, because nothing did anything wrong.
 *
 * systemd's `RequiresMountsFor=` is the right fix for that deployment and the
 * unit should carry it, but the guard belongs here too: a unit is one way to
 * start this process, an operator running the binary by hand is another, and
 * the failure destroys data either way.
 *
 * The stamp lives in `dataDir`, deliberately never on the vault itself —
 * a marker stored inside the thing it is watching disappears together with it.
 *
 * It costs one small file and catches three separate accidents: an unmounted
 * share, a deleted vault, and a mistyped path after a run that worked.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Subdirectories whose markdown makes up the corpus. */
const NOTE_DIRS = ['distilled', 'sessions', 'notes', 'digests']

export interface VaultStamp {
  /** Vault root this stamp describes. A different root is a different vault. */
  root: string
  /** Markdown files counted the last time the server opened it. */
  notes: number
  /** ISO timestamp, for the message a human reads. */
  at: string
}

export type PresenceVerdict =
  | { ok: true; notes: number }
  | { ok: false; notes: number; stamp: VaultStamp; message: string }

export function stampPath(dataDir: string): string {
  return join(dataDir, 'vault-presence.json')
}

/** Markdown across the corpus directories. Cheap: one level, no recursion. */
export function countVaultNotes(vaultRoot: string): number {
  let n = 0
  for (const sub of NOTE_DIRS) {
    const dir = join(vaultRoot, sub)
    try {
      if (!statSync(dir).isDirectory()) continue
      for (const f of readdirSync(dir)) if (f.endsWith('.md')) n++
    } catch {
      /* absent directory contributes nothing */
    }
  }
  return n
}

export function readStamp(dataDir: string): VaultStamp | null {
  try {
    const o = JSON.parse(readFileSync(stampPath(dataDir), 'utf8')) as Partial<VaultStamp>
    if (typeof o.root !== 'string' || typeof o.notes !== 'number') return null
    return { root: o.root, notes: o.notes, at: typeof o.at === 'string' ? o.at : '' }
  } catch {
    return null
  }
}

export function writeStamp(dataDir: string, root: string, notes: number): void {
  try {
    const stamp: VaultStamp = { root, notes, at: new Date().toISOString() }
    writeFileSync(stampPath(dataDir), JSON.stringify(stamp, null, 2) + '\n', 'utf8')
  } catch {
    // Best effort. A stamp that cannot be written must not stop the server —
    // it only means the next start has nothing to compare against.
  }
}

/**
 * Compare what is on disk now with what was there last time.
 *
 * Refuses only on the one shape that cannot be an honest state: the same root,
 * previously non-empty, now with nothing in it. A first run has no stamp; a new
 * vault at a new path has a stamp for a different root; an operator who really
 * did empty the vault gets a message naming the file to delete.
 */
export function checkVaultPresence(vaultRoot: string, dataDir: string): PresenceVerdict {
  const notes = countVaultNotes(vaultRoot)
  const stamp = readStamp(dataDir)

  if (!stamp || stamp.root !== vaultRoot || stamp.notes === 0 || notes > 0) {
    return { ok: true, notes }
  }

  const missingRoot = !existsSync(vaultRoot)
  const cause = missingRoot
    ? 'the directory does not exist'
    : 'the directory is there but has no notes in it'

  return {
    ok: false,
    notes,
    stamp,
    message:
      `vault at ${vaultRoot} held ${stamp.notes} note(s) on ${stamp.at.slice(0, 19)} ` +
      `and is empty now — ${cause}.\n` +
      `  If this path is a network mount, it is probably not mounted yet. Starting\n` +
      `  anyway would claim the empty directory as a fresh vault and write into it,\n` +
      `  and the real share would then mount on top and hide everything written.\n` +
      `  Check the mount, or delete ${stampPath(dataDir)} if the vault really is empty now.`,
  }
}
