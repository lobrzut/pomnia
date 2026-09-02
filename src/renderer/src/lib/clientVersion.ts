// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Print a client's self-reported version.
 *
 * The card prefixed a `v` of its own, and some clients already send one —
 * antigravity reports "v1.0.0", which rendered as "vv1.0.0". The version comes
 * from the client's `initialize`, so its shape is the client's choice, not
 * ours: normalise on display rather than pretending it is uniform.
 */
export function formatClientVersion(version: string): string {
  const v = version.trim().replace(/^v+/i, '')
  return v ? `v${v}` : ''
}
