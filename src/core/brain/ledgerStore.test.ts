// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The failure these lock down: the ledger lived outside the vault, so moving a
 * vault to another machine made ~250 already-distilled conversations look new
 * and queued them for a re-run on a local LLM — hours of GPU to regenerate
 * notes that were sitting in the same vault the whole time.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_OWNER,
  emptyLedger,
  ledgerPathInVault,
  loadLedgerForVault,
  markProcessedIn,
  ownerProcessed,
  parseLedger,
  reconcileWithNotes,
  sessionIdsFromNotes,
} from './ledgerStore.js'

function note(session: string, source = 'claude-code'): string {
  return `---\nsource: ${source}\nsession: ${session}\nproject: whatever\ndate: 2026-07-31\n---\n\n# body\n`
}

describe('parseLedger', () => {
  it('reads the legacy AppData shape as the default owner', () => {
    const l = parseLedger({ processed: { a: '2026-07-20T10:00:00Z' } })
    expect(ownerProcessed(l)).toEqual({ a: '2026-07-20T10:00:00Z' })
  })

  it('reads the owner-scoped shape', () => {
    const l = parseLedger({ schemaVersion: 2, owners: { alice: { processed: { x: 'ts' } } } })
    expect(ownerProcessed(l, 'alice')).toEqual({ x: 'ts' })
    // A default owner always exists so single-user code never hits undefined.
    expect(ownerProcessed(l)).toEqual({})
  })

  it('never throws on junk — a corrupt ledger costs a rebuild, not a crash', () => {
    for (const junk of [null, 42, 'nope', [], { owners: 'no' }, { processed: [] }]) {
      expect(ownerProcessed(parseLedger(junk))).toEqual({})
    }
  })
})

describe('markProcessedIn', () => {
  it('keeps the original timestamp for ids already recorded', () => {
    const first = markProcessedIn(emptyLedger(), ['a'], '2026-01-01T00:00:00Z')
    const second = markProcessedIn(first, ['a', 'b'], '2026-06-06T00:00:00Z')
    expect(ownerProcessed(second)).toEqual({
      a: '2026-01-01T00:00:00Z',
      b: '2026-06-06T00:00:00Z',
    })
  })

  it('keeps owners apart — one user’s run must not suppress another’s', () => {
    let l = markProcessedIn(emptyLedger(), ['shared-conv'], 'ts', 'alice')
    l = markProcessedIn(l, ['bob-conv'], 'ts', 'bob')
    expect(Object.keys(ownerProcessed(l, 'alice'))).toEqual(['shared-conv'])
    expect(Object.keys(ownerProcessed(l, 'bob'))).toEqual(['bob-conv'])
    expect(ownerProcessed(l, 'bob')['shared-conv']).toBeUndefined()
  })
})

describe('rebuilding from notes on disk', () => {
  let vault = ''

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), 'pomnia-ledger-'))
    mkdirSync(join(vault, 'distilled', '_weak'), { recursive: true })
    mkdirSync(join(vault, 'distilled', '_review'), { recursive: true })
    writeFileSync(join(vault, 'distilled', 'a.md'), note('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    writeFileSync(join(vault, 'distilled', 'b.md'), note('22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
    writeFileSync(join(vault, 'distilled', '_weak', 'c.md'), note('33333333-cccc-4ccc-8ccc-cccccccccccc'))
    writeFileSync(join(vault, 'distilled', '_review', 'd.md'), note('44444444-dddd-4ddd-8ddd-dddddddddddd'))
  })

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true })
    vault = ''
  })

  it('recovers session ids from quarantine buckets too — those were processed', async () => {
    const ids = await sessionIdsFromNotes(vault)
    expect(ids.sort()).toEqual([
      '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '33333333-cccc-4ccc-8ccc-cccccccccccc',
      '44444444-dddd-4ddd-8ddd-dddddddddddd',
    ])
  })

  it('returns nothing for a vault with no distilled folder', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'pomnia-bare-'))
    try {
      expect(await sessionIdsFromNotes(bare)).toEqual([])
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('builds a ledger from an empty start — the lost-ledger case', async () => {
    const r = await loadLedgerForVault(vault)
    expect(r.origin).toBe('rebuilt-from-notes')
    expect(r.recovered).toBe(4)
    expect(Object.keys(ownerProcessed(r.ledger))).toHaveLength(4)
  })

  it('migrates the legacy AppData ledger when the vault has none', async () => {
    const legacy = join(vault, 'legacy-appdata.json')
    writeFileSync(legacy, JSON.stringify({ processed: { 'only-in-appdata': 'ts' } }))

    const r = await loadLedgerForVault(vault, legacy)
    expect(r.origin).toBe('migrated-from-appdata')
    // Migrated ids survive, and notes on disk top the ledger up in the same pass.
    expect(ownerProcessed(r.ledger)['only-in-appdata']).toBe('ts')
    expect(Object.keys(ownerProcessed(r.ledger))).toHaveLength(5)
  })

  it('prefers the vault ledger over the legacy copy', async () => {
    mkdirSync(join(vault, 'state'), { recursive: true })
    writeFileSync(
      ledgerPathInVault(vault),
      JSON.stringify({ schemaVersion: 2, owners: { [DEFAULT_OWNER]: { processed: { 'in-vault': 'ts' } } } }),
    )
    const legacy = join(vault, 'legacy-appdata.json')
    writeFileSync(legacy, JSON.stringify({ processed: { 'stale-appdata': 'ts' } }))

    const r = await loadLedgerForVault(vault, legacy)
    expect(r.origin).toBe('vault')
    expect(ownerProcessed(r.ledger)['in-vault']).toBe('ts')
    expect(ownerProcessed(r.ledger)['stale-appdata']).toBeUndefined()
  })
})

describe('reconcileWithNotes is additive only', () => {
  /**
   * Conversations that distil to stub/garbage produce no note but must stay in
   * the ledger. Dropping entries that lack a note would put them back in the
   * queue on every run — the bug where the backlog never shrank.
   */
  it('keeps recorded ids that have no note on disk', () => {
    const ledger = markProcessedIn(emptyLedger(), ['garbage-conv'], 'ts')
    const { ledger: after, added } = reconcileWithNotes(ledger, ['note-conv'], 'ts2')
    expect(added).toEqual(['note-conv'])
    expect(ownerProcessed(after)['garbage-conv']).toBe('ts')
    expect(ownerProcessed(after)['note-conv']).toBe('ts2')
  })

  it('is a no-op when every note is already recorded', () => {
    const ledger = markProcessedIn(emptyLedger(), ['a', 'b'], 'ts')
    const { ledger: after, added } = reconcileWithNotes(ledger, ['a', 'b'])
    expect(added).toEqual([])
    expect(after).toBe(ledger)
  })
})
