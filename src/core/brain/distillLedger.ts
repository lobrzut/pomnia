// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Distill ledger helpers — which conversation ids lock after a pipeline run.
 *
 * Quality (`ok` / `stub` / `garbage`) only chooses the note basket
 * (`distilled/` / `_weak/` / `_review/`). It must NOT decide whether the
 * session stays in the pending backlog — otherwise low-quality notes re-enter
 * forever (GPU waste, duplicates, quality flip-flops, queue never reaches 0).
 *
 * Default policy: one attempt per conversation in the batch.
 */

export interface LedgerConv {
  id: string
}

export interface LedgerNote {
  sessionId: string
  quality: 'ok' | 'stub' | 'garbage' | string
}

/**
 * Ids to write into distill-ledger.json after a run.
 * Marks every conversation that entered this batch — notes of any quality,
 * pre-filter skips, and failed LLM calls alike.
 */
export function processedIdsAfterDistill(
  convs: LedgerConv[],
  _notes: LedgerNote[] = [],
  _failedIds: string[] = [],
): string[] {
  return [...new Set(convs.map((c) => c.id))]
}

/** Pending chats = live ids not present in the ledger map. */
export function pendingConversationIds(
  convs: LedgerConv[],
  processed: Record<string, string>,
): string[] {
  return convs.filter((c) => !processed[c.id]).map((c) => c.id)
}
