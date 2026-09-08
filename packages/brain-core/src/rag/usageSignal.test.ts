import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UsageSignal, readUsageSignal } from './usageSignal.js'

let vault: string
const min = (n: number): number => n * 60_000

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'pomnia-usage-'))
})
afterEach(() => {
  rmSync(vault, { recursive: true, force: true })
})

describe('UsageSignal — the pair nobody else can see', () => {
  it('pairs a search with a save that follows it', () => {
    const u = new UsageSignal(vault)
    u.searched('token minting', 0)
    const n = u.saved('sessions/2026-09-08_tokenrole.md', 'checkpoint_session', min(12))
    expect(n).toBe(1)
    const log = readUsageSignal(vault)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      query: 'token minting',
      saved: 'sessions/2026-09-08_tokenrole.md',
      via: 'checkpoint_session',
      gapMin: 12,
    })
  })

  it('does not pair a save that comes long after the search', () => {
    const u = new UsageSignal(vault)
    u.searched('coś', 0)
    // 25 minutes later: recall, not research about that query.
    expect(u.saved('sessions/x.md', 'memory', min(25))).toBe(0)
    expect(readUsageSignal(vault)).toEqual([])
  })

  it('pairs several recent searches with one save', () => {
    const u = new UsageSignal(vault)
    u.searched('reranker', 0)
    u.searched('cross-encoder', min(2))
    expect(u.saved('sessions/rerank.md', 'save_conversation', min(5))).toBe(2)
    expect(readUsageSignal(vault).map((p) => p.query).sort()).toEqual(['cross-encoder', 'reranker'])
  })

  it('spends a search once, so a burst of saves does not flood the log', () => {
    const u = new UsageSignal(vault)
    u.searched('jedno pytanie', 0)
    expect(u.saved('a.md', 'memory', min(1))).toBe(1)
    // Second save, same window, but the search is already spent.
    expect(u.saved('b.md', 'memory', min(2))).toBe(0)
    expect(readUsageSignal(vault)).toHaveLength(1)
  })

  it('caps how many pending searches it holds', () => {
    const u = new UsageSignal(vault)
    for (let i = 0; i < 30; i++) u.searched(`q${i}`, i * 1000)
    const n = u.saved('x.md', 'memory', 30 * 1000)
    expect(n).toBeLessThanOrEqual(20)
  })

  it('ignores an empty query', () => {
    const u = new UsageSignal(vault)
    u.searched('   ', 0)
    expect(u.saved('x.md', 'memory', min(1))).toBe(0)
  })

  it('appends across saves rather than overwriting', () => {
    const u = new UsageSignal(vault)
    u.searched('a', 0)
    u.saved('a.md', 'memory', min(1))
    u.searched('b', min(2))
    u.saved('b.md', 'memory', min(3))
    expect(readUsageSignal(vault)).toHaveLength(2)
  })

  it('records nothing but never throws when the save has no prior search', () => {
    const u = new UsageSignal(vault)
    expect(u.saved('x.md', 'memory', min(1))).toBe(0)
    expect(readUsageSignal(vault)).toEqual([])
  })

  it('survives a torn final line when reading back', () => {
    const u = new UsageSignal(vault)
    u.searched('a', 0)
    u.saved('a.md', 'memory', min(1))
    // Corrupt the tail the way a crash mid-append would.
    const file = join(vault, 'state', 'usage-signal.jsonl')
    const fs = require('node:fs')
    fs.appendFileSync(file, '{"query":"b","sav')
    expect(readUsageSignal(vault)).toHaveLength(1)
  })
})
