// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdtemp, mkdir, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCursorConversations } from './adapters/cursor.js'
import { cursorEmptyListReason } from './cursorEmptyCapture.js'

describe('cursorEmptyListReason', () => {
  it('explains an empty chat list when Cursor DB parse was skipped', () => {
    expect(
      cursorEmptyListReason({
        conversationCount: 0,
        sources: [{ id: 'cursor', unreadableChats: 'cursor-db-too-large' }],
        snapshots: [],
      }),
    ).toBe('db-too-large')
  })

  it('explains a sealed Cursor snapshot that stored 0 chats', () => {
    expect(
      cursorEmptyListReason({
        conversationCount: 0,
        sources: [],
        snapshots: [{ source: { id: 'cursor' }, stats: { conversations: 0 } }],
      }),
    ).toBe('backup-zero')
  })

  it('stays quiet when other chats are already in the list', () => {
    expect(
      cursorEmptyListReason({
        conversationCount: 3,
        sources: [{ id: 'cursor', unreadableChats: 'cursor-db-too-large' }],
        snapshots: [{ source: { id: 'cursor' }, stats: { conversations: 0 } }],
      }),
    ).toBeNull()
  })

  it('stays quiet when the empty list is not a Cursor backup', () => {
    expect(
      cursorEmptyListReason({
        conversationCount: 0,
        sources: [{ id: 'claude-desktop' }],
        snapshots: [{ source: { id: 'claude-desktop' }, stats: { conversations: 0 } }],
      }),
    ).toBeNull()
  })
})

describe('readCursorConversations oversized state.vscdb', () => {
  it('returns no chats when the database is over the in-app parse cap and there are no transcripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pomnia-cursor-db-'))
    const home = await mkdtemp(join(tmpdir(), 'pomnia-cursor-home-'))
    const dbDir = join(root, 'globalStorage')
    await mkdir(dbDir, { recursive: true })
    const fh = await open(join(dbDir, 'state.vscdb'), 'w')
    // Sparse file: stat size is over the cap, but the reader returns before loading it.
    await fh.truncate(256 * 1024 * 1024 + 1)
    await fh.close()

    const convs = await readCursorConversations(root, home)
    expect(convs).toEqual([])
  })
})
