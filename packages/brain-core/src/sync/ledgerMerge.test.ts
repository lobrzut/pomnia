// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  mergeDistillLedgerBytes,
  parseDistillLedger,
  unionDistillLedgers,
} from './ledgerMerge.js'

describe('unionDistillLedgers', () => {
  it('is a set-union of ids — never drops either side', () => {
    const a = parseDistillLedger({
      schemaVersion: 2,
      owners: { default: { processed: { a: 't1', shared: 't-local' } } },
    })
    const b = parseDistillLedger({
      schemaVersion: 2,
      owners: { default: { processed: { b: 't2', shared: 't-remote' } } },
    })
    const u = unionDistillLedgers(a, b)
    expect(Object.keys(u.owners.default.processed).sort()).toEqual(['a', 'b', 'shared'])
    // Local timestamp wins when both already know the id.
    expect(u.owners.default.processed.shared).toBe('t-local')
  })

  it('accepts v1 bare processed maps', () => {
    const a = parseDistillLedger({ processed: { old: 't0' } })
    const b = parseDistillLedger({ processed: { neu: 't1' } })
    const u = unionDistillLedgers(a, b)
    expect(Object.keys(u.owners.default.processed).sort()).toEqual(['neu', 'old'])
  })
})

describe('mergeDistillLedgerBytes', () => {
  it('never replaces — empty local takes incoming ids', () => {
    const incoming = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        owners: { default: { processed: { only: '2026-01-01T00:00:00.000Z' } } },
      }),
      'utf8',
    )
    const out = JSON.parse(mergeDistillLedgerBytes(null, incoming).toString('utf8'))
    expect(out.owners.default.processed.only).toBeTruthy()
  })
})
