// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Should this machine be told its notes are not reaching the server?
 *
 * Pointing Brain at a remote server does not move the local vault. The desktop
 * keeps distilling into its own, the agents read the server's, and neither side
 * is wrong by itself — only the pair is. The drift is slow and produces no
 * error: on one install the local vault sat 78 sessions behind 589 for weeks,
 * and it surfaced by counting files, not from anything the app said.
 *
 * Both halves of the answer are already in settings, so the check costs no
 * network call and cannot be flaky.
 */

export interface VaultSyncWarningInput {
  /** 'remote' means agents read a server, not this machine's embedded brain. */
  brainTarget?: 'embedded' | 'remote'
  /** Where that server lives. Empty means nothing is configured yet. */
  brainMcpUrl?: string
  /** Whether distilled notes are pushed to it automatically. */
  replicaAutoSync?: boolean
}

/**
 * True only when a divergence is actually being created: agents read a server
 * this machine never sends to.
 *
 * Embedded targets are excluded because there is only one vault, and a missing
 * server URL is an unfinished setup rather than a drift — warning about either
 * would spend the user's attention on a situation that is not going wrong.
 */
export function shouldWarnVaultNotSynced(s: VaultSyncWarningInput): boolean {
  if ((s.brainTarget ?? 'embedded') !== 'remote') return false
  if (!s.brainMcpUrl?.trim()) return false
  return s.replicaAutoSync !== true
}
