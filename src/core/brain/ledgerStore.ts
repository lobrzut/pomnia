// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Where the distill ledger lives, and how it survives losing it.
 *
 * The ledger records which conversation ids have already been through the
 * distill pipeline. It used to sit in `%APPDATA%\pomnia\distill-ledger.json` —
 * outside the vault, so it did not travel with the data. Moving a vault to a
 * new machine therefore made every conversation look new and re-milled ~250 of
 * them on a local LLM: hours of GPU to reproduce notes that were already in the
 * vault, sitting right next to the ledger that had been left behind.
 *
 * Two changes fix that class of loss:
 *
 * 1. It lives in the vault (`<vaultRoot>/state/`), so it moves with the notes.
 * 2. It is rebuildable. Distilled notes carry `session: <uuid>` in frontmatter,
 *    and those uuids ARE the ledger keys — so a missing ledger costs a folder
 *    scan, not a re-run.
 *
 * The owner map is here for the server version: today everything writes under
 * `default`, but a multi-user deployment can key by real owner without a file
 * move or a schema migration. One shared ledger across users would let one
 * person's run suppress another's.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/** Single-user deployments write here. A server assigns real owner ids. */
export const DEFAULT_OWNER = 'default'

export const LEDGER_SCHEMA_VERSION = 2

/** conversation id → ISO timestamp of the run that processed it */
export type ProcessedMap = Record<string, string>

export interface LedgerOwner {
  processed: ProcessedMap
}

export interface DistillLedgerFile {
  schemaVersion: number
  owners: Record<string, LedgerOwner>
}

/** `<vaultRoot>/state/distill-ledger.json` — plaintext, beside USER.md. */
export function ledgerPathInVault(vaultRoot: string): string {
  return join(vaultRoot, 'state', 'distill-ledger.json')
}

export function emptyLedger(): DistillLedgerFile {
  return { schemaVersion: LEDGER_SCHEMA_VERSION, owners: { [DEFAULT_OWNER]: { processed: {} } } }
}

/**
 * Accept both shapes: v1 was a bare `{ processed: {...} }` in AppData. Anything
 * unrecognisable becomes an empty ledger rather than throwing — a corrupt
 * ledger must cost a rebuild, never a crash on vault open.
 */
export function parseLedger(raw: unknown): DistillLedgerFile {
  if (!raw || typeof raw !== 'object') return emptyLedger()
  const o = raw as Record<string, unknown>

  if (o.owners && typeof o.owners === 'object') {
    const owners: Record<string, LedgerOwner> = {}
    for (const [id, val] of Object.entries(o.owners as Record<string, unknown>)) {
      const processed = (val as { processed?: unknown })?.processed
      owners[id] = { processed: isProcessedMap(processed) ? processed : {} }
    }
    if (!owners[DEFAULT_OWNER]) owners[DEFAULT_OWNER] = { processed: {} }
    return { schemaVersion: LEDGER_SCHEMA_VERSION, owners }
  }

  // v1 — bare processed map, everything belongs to the single local user.
  if (isProcessedMap(o.processed)) {
    return { schemaVersion: LEDGER_SCHEMA_VERSION, owners: { [DEFAULT_OWNER]: { processed: o.processed } } }
  }
  return emptyLedger()
}

function isProcessedMap(v: unknown): v is ProcessedMap {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function ownerProcessed(ledger: DistillLedgerFile, owner = DEFAULT_OWNER): ProcessedMap {
  return ledger.owners[owner]?.processed ?? {}
}

/** Add ids under `owner`, keeping the timestamp already recorded for an id. */
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

/**
 * Conversation ids recoverable from notes on disk.
 *
 * Reads `distilled/` including `_weak/` and `_review/`: a note that landed in
 * quarantine still means its conversation was processed. Only the frontmatter
 * head is parsed — these files can be long.
 */
export async function sessionIdsFromNotes(vaultRoot: string): Promise<string[]> {
  const ids = new Set<string>()
  const root = join(vaultRoot, 'distilled')

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // folder absent on a fresh vault — nothing to recover, not an error
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(p)
      } else if (e.name.endsWith('.md')) {
        try {
          const head = (await fs.readFile(p, 'utf8')).slice(0, 800)
          const m = FRONTMATTER_SESSION.exec(head)
          if (m?.[1]) ids.add(m[1])
        } catch {
          // Unreadable note: skip it. Recovering most ids still beats re-milling
          // everything, and a hard failure here would block vault open.
        }
      }
    }
  }

  await walk(root)
  return [...ids]
}

export interface ReconcileResult {
  ledger: DistillLedgerFile
  /** Ids present in notes but missing from the ledger — the recovered ones. */
  added: string[]
}

/**
 * Fold ids recovered from notes into the ledger. **Additive only.**
 *
 * Never drop a ledger entry that has no note on disk. Conversations that
 * distil to `stub`/`garbage` deliberately produce no note yet must stay
 * recorded — that is exactly the bug where the queue never shrank because
 * those conversations came back on every run.
 */
export function reconcileWithNotes(
  ledger: DistillLedgerFile,
  noteIds: string[],
  when = new Date().toISOString(),
  owner = DEFAULT_OWNER,
): ReconcileResult {
  const known = ownerProcessed(ledger, owner)
  const added = noteIds.filter((id) => !known[id])
  if (added.length === 0) return { ledger, added }
  return { ledger: markProcessedIn(ledger, added, when, owner), added }
}

export async function readLedgerFile(path: string): Promise<DistillLedgerFile | null> {
  try {
    return parseLedger(JSON.parse(await fs.readFile(path, 'utf8')))
  } catch {
    return null
  }
}

export async function writeLedgerFile(path: string, ledger: DistillLedgerFile): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(ledger, null, 2), 'utf8')
}

export interface LoadLedgerResult {
  ledger: DistillLedgerFile
  /** Where it came from — surfaced so the UI can say what actually happened. */
  origin: 'vault' | 'migrated-from-appdata' | 'rebuilt-from-notes' | 'empty'
  /** Ids recovered by scanning notes during this load. */
  recovered: number
}

/**
 * Load the ledger for a vault, healing it if it is missing or short.
 *
 * Order: vault file → legacy AppData file → whatever the notes can prove.
 * The notes pass runs in every case, so a ledger that predates some notes gets
 * topped up instead of quietly under-reporting.
 */
export async function loadLedgerForVault(
  vaultRoot: string,
  legacyAppDataPath?: string,
  owner = DEFAULT_OWNER,
): Promise<LoadLedgerResult> {
  const vaultPath = ledgerPathInVault(vaultRoot)

  let ledger = await readLedgerFile(vaultPath)
  let origin: LoadLedgerResult['origin'] = ledger ? 'vault' : 'empty'

  if (!ledger && legacyAppDataPath) {
    const legacy = await readLedgerFile(legacyAppDataPath)
    if (legacy) {
      ledger = legacy
      origin = 'migrated-from-appdata'
    }
  }
  if (!ledger) ledger = emptyLedger()

  const noteIds = await sessionIdsFromNotes(vaultRoot)
  const { ledger: healed, added } = reconcileWithNotes(ledger, noteIds, undefined, owner)
  if (origin === 'empty' && added.length > 0) origin = 'rebuilt-from-notes'

  return { ledger: healed, origin, recovered: added.length }
}
