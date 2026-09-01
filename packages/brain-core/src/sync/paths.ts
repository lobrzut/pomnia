// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Path validation for vault replication.
 *
 * This is the only place in Pomnia where a remote peer names a file that gets
 * written to disk, so it is the only place where a bad name is a compromise
 * rather than an error. Everything here is a rejection rule; the caller may
 * write nothing that has not come back from `safeVaultPath`.
 *
 * Deny by default: an unrecognised top-level directory is refused rather than
 * created, so widening what replicates is a deliberate edit here.
 */

import { isAbsolute, normalize, sep } from 'node:path'

/**
 * Directories that replicate. Blobs are deliberately absent: 2.51 GB of
 * encrypted content-addressed data that the replica's RAG never reads, and
 * shipping them would turn every sync into a backup run.
 */
export const SYNC_DIRS = [
  'sessions',
  'distilled',
  'notes',
  'digests',
  'skills',
  'chats',
  'state',
  // Indexed since 0.1.71, so it has to travel too: a directory that is
  // searchable on one machine and unreplicable to the next is a note you
  // can find exactly once, from exactly one desk.
  'sprawy',
] as const

/**
 * Files allowed at the vault root.
 *
 * `state/distill-ledger.json` is not listed here — it lives under SYNC_DIRS
 * `state/` and is merged as a set-union of conversation ids on apply (see
 * ledgerMerge.ts). Putting it in SYNC_ROOT_FILES would be the wrong path.
 */
export const SYNC_ROOT_FILES = ['USER.md', 'AGENTS.md'] as const

/**
 * `USER-2.md` for a diverged `USER.md`.
 *
 * When both sides changed a file, receive.ts keeps the local copy and writes the
 * incoming one beside it with a numeric suffix. That sibling then has to pass
 * this same validator — and for the two files allowed at the vault root it did
 * not, because `USER-2.md` is not itself in SYNC_ROOT_FILES. The result was that
 * the root files were the only ones that could never be reconciled: every push
 * after a divergence failed with `conflict path refused: not-synced-dir`, and
 * kept failing, while the notes around them synced normally.
 *
 * `USER.md` is the profile every agent reads at the start of every session, so
 * "the one file that cannot heal" was the worst possible choice.
 */
function isRootConflictCopy(name: string): boolean {
  return (SYNC_ROOT_FILES as readonly string[]).some((allowed) => {
    const dot = allowed.lastIndexOf('.')
    const stem = dot > 0 ? allowed.slice(0, dot) : allowed
    const ext = dot > 0 ? allowed.slice(dot) : ''
    if (!name.startsWith(`${stem}-`) || !name.endsWith(ext)) return false
    const middle = name.slice(stem.length + 1, name.length - ext.length)
    return /^\d+$/.test(middle)
  })
}

/**
 * Distillation ledger — lives under `state/` (already in SYNC_DIRS), not the
 * vault root. Named here because surface sync merges it by set-union of ids
 * rather than treating it like an ordinary file. See ledgerMerge.ts.
 */
export const DISTILL_LEDGER_REL = 'state/distill-ledger.json' as const

/** Per-file ceiling. A vault note is kilobytes; a megabyte is already odd. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Only text-ish payloads replicate — the index is built from markdown. */
const ALLOWED_EXT = /\.(md|markdown|txt|json|ya?ml)$/i

export type PathRejection =
  | 'empty'
  | 'absolute'
  | 'traversal'
  | 'backslash'
  | 'illegal-char'
  | 'not-synced-dir'
  | 'bad-extension'
  | 'too-deep'
  | 'machine-state'

/**
 * Files that belong to the machine, not to the memory.
 *
 * state/ replicates because the distillation ledger lives there and travelling
 * with the notes is the point of it. The ownership marker is in the same folder
 * and is the opposite: it records *which machine owns this vault*. Accepting one
 * over the network hands the sender's answer to the receiver, so a push would
 * overwrite the receiver's record of owning its own vault — and the server would
 * then read it, see someone else's name, and quietly demote itself to read-only
 * against a corpus it holds.
 *
 * The marker exists to stop two Pomnias forking one memory, which already
 * happened here and cost 99 files nobody noticed for months. Letting it
 * replicate would make that mechanism the cause.
 */
const MACHINE_STATE_FILES = new Set(['vault-writer.json'])

/**
 * Generated catalogues, keyed by exact relative path.
 *
 * skills/index.json lists every skill with a `localPath` — an absolute path on
 * the machine that wrote it, `C:\Vault\skills\…` on one side and
 * `/var/lib/pomnia/vault/skills/…` on the other. It therefore cannot ever agree
 * across two machines: the file's whole job is to record where it was made.
 *
 * Replicating it produced a conflict on literally every sync. On the live vault
 * it had reached index-19.json, and those nineteen copies held five distinct
 * contents between them — the rest were re-recordings of a disagreement that
 * had already been recorded, which is what conflict dedup now prevents. But
 * dedup only slows this file down; it can never settle, because each side is
 * right about its own paths.
 *
 * Every machine regenerates this from its own skills directory, so nothing is
 * lost by never sending it. Same principle as the ownership marker above: this
 * describes the machine, not the memory.
 */
const GENERATED_FILES = new Set(['skills/index.json'])

export type PathVerdict = { ok: true; relative: string } | { ok: false; reason: PathRejection }

/** Deeper than this is not a vault layout we produce. */
const MAX_DEPTH = 6

/**
 * Characters no path segment may contain, on any platform we run on.
 *
 * `< > : " | ? *` are reserved by Win32 (`:` also opens an alternate data
 * stream); `/` and `\` are separators; controls truncate paths in syscalls.
 * Everything else — any letter in any script — is just a filename.
 */
const ILLEGAL_IN_SEGMENT = new RegExp('[<>:"|?*/\\\\]')

/** Reserved device names — opening one on Windows talks to hardware. */
const WIN32_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

/**
 * Validate a peer-supplied relative path.
 *
 * Returns the path in POSIX form for storage/comparison; the caller joins it
 * onto the vault root itself. Never returns anything derived from the input
 * without having proved each segment.
 */
export function safeVaultPath(input: string): PathVerdict {
  // Deliberately not trimmed. Trimming would silently rewrite the peer's path,
  // and " x.md" / "x.md " are exactly the pair Windows collapses into one file.
  const raw = input ?? ''
  if (!raw.trim()) return { ok: false, reason: 'empty' }
  // Reject before normalising: on Windows `normalize` turns `a\b` into `a\b`
  // and would let a backslash-separated traversal through a POSIX-only check.
  if (raw.includes('\\')) return { ok: false, reason: 'backslash' }
  if (raw.startsWith('/') || isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    return { ok: false, reason: 'absolute' }
  }
  // NUL and control characters truncate paths in some syscalls.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: 'illegal-char' }

  const segments = raw.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return { ok: false, reason: 'traversal' }
  }
  if (segments.length > MAX_DEPTH) return { ok: false, reason: 'too-deep' }
  for (const s of segments) {
    // Deny the characters that are dangerous, rather than allowing the letters
    // we happened to think of. An allow-list of Polish diacritics refused three
    // real notes in the live vault — Turkish `ı`, a superscript `²`, and
    // small-caps `ꜱᴇʀᴜᴍ` — none of which are a path problem. The risk is in
    // separators, redirection and stream syntax, not in a letter's alphabet.
    if (ILLEGAL_IN_SEGMENT.test(s)) return { ok: false, reason: 'illegal-char' }
    // Trailing dot/space is stripped by Windows, so `a.` and `a` are the same
    // file — a rename that the sender did not ask for.
    if (/[. ]$/.test(s)) return { ok: false, reason: 'illegal-char' }
    // `nul.md` is not a file on Windows; it is the null device.
    if (WIN32_RESERVED.test(s)) return { ok: false, reason: 'illegal-char' }
  }

  const head = segments[0]
  const isRootFile =
    segments.length === 1 &&
    ((SYNC_ROOT_FILES as readonly string[]).includes(head) || isRootConflictCopy(head))
  if (!isRootFile && !(SYNC_DIRS as readonly string[]).includes(head)) {
    return { ok: false, reason: 'not-synced-dir' }
  }
  if (!isRootFile && segments.length < 2) return { ok: false, reason: 'not-synced-dir' }
  if (!ALLOWED_EXT.test(segments[segments.length - 1])) {
    return { ok: false, reason: 'bad-extension' }
  }
  if (head === 'state' && MACHINE_STATE_FILES.has(segments[segments.length - 1])) {
    return { ok: false, reason: 'machine-state' }
  }
  if (GENERATED_FILES.has(raw)) return { ok: false, reason: 'machine-state' }

  // Belt and braces: after all of the above, normalising must be a no-op.
  const normalized = normalize(raw).split(sep).join('/')
  if (normalized !== raw) return { ok: false, reason: 'traversal' }

  return { ok: true, relative: raw }
}
