// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * When a Cursor backup cannot read chats, the Chats list would otherwise stay
 * empty with a generic "run a backup" hint — the backup already ran.
 */

export interface CursorEmptySource {
  id: string
  unreadableChats?: 'cursor-db-too-large'
}

export interface CursorEmptySnapshot {
  source: { id: string }
  stats: { conversations: number }
}

export type CursorEmptyListReason = 'db-too-large' | 'backup-zero'

export function cursorEmptyListReason(input: {
  conversationCount: number
  sources: CursorEmptySource[]
  snapshots: CursorEmptySnapshot[]
}): CursorEmptyListReason | null {
  if (input.conversationCount > 0) return null
  const flagged = input.sources.some(
    (s) => s.id === 'cursor' && s.unreadableChats === 'cursor-db-too-large',
  )
  if (flagged) return 'db-too-large'
  const cursorSnaps = input.snapshots.filter((s) => s.source.id === 'cursor')
  if (cursorSnaps.length > 0 && cursorSnaps.every((s) => s.stats.conversations === 0)) {
    return 'backup-zero'
  }
  return null
}
