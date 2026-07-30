// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  pendingConversationIds,
  processedIdsAfterDistill,
} from '../brain/distillLedger.js'
import { DISTILLABLE_SOURCES, isDistillableSource } from '../brain/distillSources.js'

describe('distillLedger', () => {
  const convs = [
    { id: 'ok-sess' },
    { id: 'garbage-sess' },
    { id: 'stub-sess' },
    { id: 'failed-sess' },
  ]
  const notes = [
    { sessionId: 'ok-sess', quality: 'ok' as const },
    { sessionId: 'garbage-sess', quality: 'garbage' as const },
    { sessionId: 'stub-sess', quality: 'stub' as const },
  ]

  it('marks every conversation in the batch as processed, including stub/garbage', () => {
    const ids = processedIdsAfterDistill(convs, notes, ['failed-sess'])
    expect(ids.sort()).toEqual(['failed-sess', 'garbage-sess', 'ok-sess', 'stub-sess'])
  })

  it('does not require quality===ok to lock the ledger (regression)', () => {
    // Old buggy filter: only ok + not-worth → garbage/stub stayed pending forever.
    const okOnly = new Set(notes.filter((n) => n.quality === 'ok').map((n) => n.sessionId))
    const buggyPending = convs.filter((c) => !okOnly.has(c.id)).map((c) => c.id)
    expect(buggyPending).toContain('garbage-sess')
    expect(buggyPending).toContain('stub-sess')

    const ledger: Record<string, string> = {}
    const now = '2026-07-30T12:00:00.000Z'
    for (const id of processedIdsAfterDistill(convs, notes, ['failed-sess'])) {
      ledger[id] = now
    }
    expect(pendingConversationIds(convs, ledger)).toEqual([])
  })

  it('second run on the same set yields zero pending to distill', () => {
    const ledger: Record<string, string> = {}
    for (const id of processedIdsAfterDistill(convs, notes, ['failed-sess'])) {
      ledger[id] = '2026-07-30T12:00:00.000Z'
    }
    const stillPending = pendingConversationIds(convs, ledger)
    expect(stillPending).toEqual([])
    // Mimic brain:run pendingOnly filter — nothing left to send to distillAll.
    const secondBatch = convs.filter((c) => !ledger[c.id])
    expect(secondBatch).toHaveLength(0)
    expect(processedIdsAfterDistill(secondBatch, [])).toEqual([])
  })
})

describe('distillSources', () => {
  it('includes Antigravity Cascade chats alongside Claude/Cursor', () => {
    expect(DISTILLABLE_SOURCES).toContain('antigravity')
    expect(isDistillableSource('antigravity')).toBe(true)
    expect(isDistillableSource('claude-code')).toBe(true)
    expect(isDistillableSource('vscode')).toBe(false)
  })
})
