// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import type { SourceId } from '../model.js'

/**
 * Live assistant sources the distill pipeline can turn into Conversation[].
 * Keep in sync with adapters that implement collectConversations for real chats
 * (JSONL / Cascade transcripts / agent DBs) — not opaque-profile-only tools.
 */
export const DISTILLABLE_SOURCES: readonly SourceId[] = [
  'claude-code',
  'cursor',
  'claude-desktop',
  'antigravity',
] as const

const DISTILLABLE_SET = new Set<SourceId>(DISTILLABLE_SOURCES)

export function isDistillableSource(id: SourceId): boolean {
  return DISTILLABLE_SET.has(id)
}
