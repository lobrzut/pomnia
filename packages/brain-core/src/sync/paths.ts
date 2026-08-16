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
] as const

/** Files allowed at the vault root. */
export const SYNC_ROOT_FILES = ['USER.md', 'AGENTS.md'] as const

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
    segments.length === 1 && (SYNC_ROOT_FILES as readonly string[]).includes(head)
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

  // Belt and braces: after all of the above, normalising must be a no-op.
  const normalized = normalize(raw).split(sep).join('/')
  if (normalized !== raw) return { ok: false, reason: 'traversal' }

  return { ok: true, relative: raw }
}
