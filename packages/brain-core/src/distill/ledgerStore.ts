// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Distill ledger under vault/state/ — same shape Desktop uses (schema v2).
 * Prevents re-milling conversations already written to distilled/.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_OWNER = 'default'
export const LEDGER_SCHEMA_VERSION = 2

export type ProcessedMap = Record<string, string>

export interface DistillLedgerFile {
  schemaVersion: number
  owners: Record<string, { processed: ProcessedMap }>
}

export function ledgerPathInVault(vaultRoot: string): string {
  return join(vaultRoot, 'state', 'distill-ledger.json')
}

export function emptyLedger(): DistillLedgerFile {
  return { schemaVersion: LEDGER_SCHEMA_VERSION, owners: { [DEFAULT_OWNER]: { processed: {} } } }
}

export function parseLedger(raw: unknown): DistillLedgerFile {
  if (!raw || typeof raw !== 'object') return emptyLedger()
  const o = raw as Record<string, unknown>
  if (o.owners && typeof o.owners === 'object') {
    const owners: DistillLedgerFile['owners'] = {}
    for (const [id, val] of Object.entries(o.owners as Record<string, unknown>)) {
      const processed = (val as { processed?: unknown })?.processed
      owners[id] = {
        processed:
          processed && typeof processed === 'object' && !Array.isArray(processed)
            ? (processed as ProcessedMap)
            : {},
      }
    }
    if (!owners[DEFAULT_OWNER]) owners[DEFAULT_OWNER] = { processed: {} }
    return { schemaVersion: LEDGER_SCHEMA_VERSION, owners }
  }
  if (o.processed && typeof o.processed === 'object') {
    return {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      owners: { [DEFAULT_OWNER]: { processed: o.processed as ProcessedMap } },
    }
  }
  return emptyLedger()
}

export async function loadLedger(vaultRoot: string): Promise<DistillLedgerFile> {
  const path = ledgerPathInVault(vaultRoot)
  try {
    const text = await fs.readFile(path, 'utf8')
    return parseLedger(JSON.parse(text))
  } catch {
    return emptyLedger()
  }
}

export async function saveLedger(vaultRoot: string, ledger: DistillLedgerFile): Promise<void> {
  const path = ledgerPathInVault(vaultRoot)
  await fs.mkdir(join(vaultRoot, 'state'), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, path)
}

export function ownerProcessed(ledger: DistillLedgerFile, owner = DEFAULT_OWNER): ProcessedMap {
  return ledger.owners[owner]?.processed ?? {}
}

export function markProcessedIn(
  ledger: DistillLedgerFile,
  ids: string[],
  when = new Date().toISOString(),
  owner = DEFAULT_OWNER,
): DistillLedgerFile {
  const owners = { ...ledger.owners }
  const processed = { ...(owners[owner]?.processed ?? {}) }
  for (const id of ids) if (!processed[id]) processed[id] = when
  owners[owner] = { processed }
  return { schemaVersion: LEDGER_SCHEMA_VERSION, owners }
}

const FRONTMATTER_SESSION = /^session:\s*(\S+)\s*$/m

/** Recover processed ids from existing distilled notes (ledger rebuild). */
export async function sessionIdsFromNotes(vaultRoot: string): Promise<string[]> {
  const ids = new Set<string>()
  const root = join(vaultRoot, 'distilled')

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p)
        continue
      }
      if (!e.name.endsWith('.md')) continue
      try {
        const head = (await fs.readFile(p, 'utf8')).slice(0, 2048)
        const m = head.match(FRONTMATTER_SESSION)
        if (m?.[1]) ids.add(m[1])
      } catch {
        /* skip unreadable */
      }
    }
  }

  await walk(root)
  return [...ids]
}
