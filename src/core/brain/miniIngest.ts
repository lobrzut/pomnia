// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Getting material into the memory from a Pomnia that has no memory of its own.
 *
 * The full app parses a document, writes a note into its vault, and the vault
 * is the answer. Mini has no vault on purpose — the memory lives on the server
 * the agents query, and a second encrypted store here would be a second thing
 * to disagree with it. So Mini needs a sink, and the sink is the server.
 *
 * It does not invent a protocol to get there. brain-core already accepts a
 * vault surface over `/sync/*`, that path is what replication runs on every
 * day, and it never deletes: files on the peer that are absent here come back
 * as extras rather than being removed. Mini therefore keeps a small staging
 * directory shaped like a vault surface, writes notes into `distilled/`, and
 * hands it to the same client replication uses.
 *
 * Writing needs an admin token. An agent token may read and write memory
 * through MCP, but `/sync/*` is a different door, and the server is right to
 * ask for the stronger credential before accepting a directory tree.
 */

import { syncVaultToReplica, type VaultSyncResult } from './vaultSync.js'

/** Where staged notes live inside the staging root. brain-core indexes it. */
export const STAGING_NOTES_DIR = 'distilled'

export type IngestPushResult =
  | { ok: true; result: VaultSyncResult }
  | { ok: false; reason: 'no-target' | 'no-token' | 'nothing-staged' | 'failed'; detail: string }

export interface IngestPushOptions {
  /** Local directory shaped like a vault surface. */
  stagingRoot: string
  /** The brain-core base URL — not the MCP endpoint. */
  target: string
  /** Admin token. `/sync/*` refuses an agent one, and it is right to. */
  adminToken?: string
  /** How many notes are staged; 0 means there is nothing to send. */
  staged: number
  onProgress?: (done: number, total: number, path: string) => void
  signal?: AbortSignal
  syncImpl?: typeof syncVaultToReplica
}

/**
 * Push what is staged, or say precisely why not.
 *
 * Each refusal is a different thing to do about it, which is the whole reason
 * they are separate: no server means fill in the address, no token means paste
 * an admin one, nothing staged means the parse produced no notes and the push
 * was never the problem.
 */
export async function pushStagedNotes(opts: IngestPushOptions): Promise<IngestPushResult> {
  const target = opts.target.trim()
  if (!target) return { ok: false, reason: 'no-target', detail: 'no brain server configured' }

  const token = opts.adminToken?.trim()
  if (!token) {
    return {
      ok: false,
      reason: 'no-token',
      detail: 'sending files needs an admin token; an agent token cannot write to /sync',
    }
  }
  if (opts.staged <= 0) {
    return { ok: false, reason: 'nothing-staged', detail: 'no notes were produced to send' }
  }

  const sync = opts.syncImpl ?? syncVaultToReplica
  try {
    const result = await sync({
      vaultRoot: opts.stagingRoot,
      target,
      token,
      onProgress: opts.onProgress,
      signal: opts.signal,
    })
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: (e as Error).message }
  }
}

/**
 * A filename for a note that will sit beside notes from every other source.
 *
 * Readable, so it can be recognised months later, and ending in a short hash of
 * the source bytes, so the same document always lands on the same name.
 *
 * The date used to lead the name, on the reasoning that two imports of one book
 * should not silently become one file. That was backwards. Re-importing a book
 * after fixing its extraction left three copies on the server — one empty, one
 * of nine pages, one of a hundred and six — and search returned the same book
 * three times at three qualities. Identity is the source bytes, not the day, so
 * the hash decides the name and the sync replaces instead of accumulating. Two
 * genuinely different files cannot collide, because their bytes differ.
 *
 * Everything the filesystem or the sync protocol could trip on is replaced
 * rather than stripped: stripping turns two different titles into one name.
 */
export function stagedNoteName(sourceName: string, sourceSha?: string): string {
  const base = sourceName
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .slice(0, 80)
    // Trim the separators off both ends. A name that is nothing but them is
    // not a name, and Windows silently drops a trailing dot or space — after
    // which the file on disk is not the file the manifest names.
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
  const stem = base || 'import'
  // No hash means a conversation, which has no source file: the name is just
  // the title, and writeNote still refuses to overwrite a different note.
  return sourceSha ? `${stem}__${sourceSha.slice(0, 12)}.md` : `${stem}.md`
}
