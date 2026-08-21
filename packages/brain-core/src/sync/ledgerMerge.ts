// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Distill-ledger merge for surface sync.
 *
 * Two machines that each distilled a session must not both think the other
 * still needs to run it. The ledger travels with the notes; merging is
 * set-union of conversation ids only — never a replace, never a "newer wins".
 * Timestamps already recorded stay; a new id takes the incoming stamp.
 */

import { DISTILL_LEDGER_REL } from './paths.js'

export { DISTILL_LEDGER_REL }

const DEFAULT_OWNER = 'default'
const SCHEMA_VERSION = 2

type ProcessedMap = Record<string, string>
type LedgerOwner = { processed: ProcessedMap }
type DistillLedgerFile = {
  schemaVersion: number
  owners: Record<string, LedgerOwner>
}

function isProcessedMap(v: unknown): v is ProcessedMap {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function emptyLedger(): DistillLedgerFile {
  return { schemaVersion: SCHEMA_VERSION, owners: { [DEFAULT_OWNER]: { processed: {} } } }
}

/** Accept v2 owners map, v1 bare `{ processed }`, or garbage → empty. */
export function parseDistillLedger(raw: unknown): DistillLedgerFile {
  if (!raw || typeof raw !== 'object') return emptyLedger()
  const o = raw as Record<string, unknown>

  if (o.owners && typeof o.owners === 'object') {
    const owners: Record<string, LedgerOwner> = {}
    for (const [id, val] of Object.entries(o.owners as Record<string, unknown>)) {
      const processed = (val as { processed?: unknown })?.processed
      owners[id] = { processed: isProcessedMap(processed) ? processed : {} }
    }
    if (!owners[DEFAULT_OWNER]) owners[DEFAULT_OWNER] = { processed: {} }
    return { schemaVersion: SCHEMA_VERSION, owners }
  }

  if (isProcessedMap(o.processed)) {
    return {
      schemaVersion: SCHEMA_VERSION,
      owners: { [DEFAULT_OWNER]: { processed: o.processed } },
    }
  }
  return emptyLedger()
}

/**
 * Union processed ids per owner. Existing local timestamps win when both
 * sides already know an id — the fact of processing matters, not the clock.
 */
export function unionDistillLedgers(
  local: DistillLedgerFile,
  incoming: DistillLedgerFile,
): DistillLedgerFile {
  const ownerIds = new Set([...Object.keys(local.owners), ...Object.keys(incoming.owners)])
  const owners: Record<string, LedgerOwner> = {}
  for (const id of ownerIds) {
    const a = local.owners[id]?.processed ?? {}
    const b = incoming.owners[id]?.processed ?? {}
    const processed: ProcessedMap = { ...a }
    for (const [sid, when] of Object.entries(b)) {
      if (!processed[sid]) processed[sid] = when
    }
    owners[id] = { processed }
  }
  if (!owners[DEFAULT_OWNER]) owners[DEFAULT_OWNER] = { processed: {} }
  return { schemaVersion: SCHEMA_VERSION, owners }
}

export function serializeDistillLedger(ledger: DistillLedgerFile): Buffer {
  return Buffer.from(JSON.stringify(ledger, null, 2), 'utf8')
}

/** Parse two JSON buffers (or empty), return the union as UTF-8 bytes. */
export function mergeDistillLedgerBytes(localBuf: Buffer | null, incomingBuf: Buffer): Buffer {
  let local: DistillLedgerFile = emptyLedger()
  if (localBuf && localBuf.length > 0) {
    try {
      local = parseDistillLedger(JSON.parse(localBuf.toString('utf8')))
    } catch {
      local = emptyLedger()
    }
  }
  let incoming: DistillLedgerFile = emptyLedger()
  try {
    incoming = parseDistillLedger(JSON.parse(incomingBuf.toString('utf8')))
  } catch {
    incoming = emptyLedger()
  }
  return serializeDistillLedger(unionDistillLedgers(local, incoming))
}
