// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which brain a build is actually talking to, and whether its address can be
 * typed into.
 *
 * Both answers used to be computed inline in Connect.tsx, in two separate
 * expressions that were supposed to agree and did not. The address field
 * decided how it looked from the *effective* target and decided whether to
 * accept a keystroke from the *stored* one. In Mini those disagree by design —
 * Mini is pinned to 'remote' because it has no brain of its own, while the
 * stored target is still 'embedded', inherited from a full install or from the
 * plain default.
 *
 * So the field focused, showed a cursor, accepted no text and reported no
 * error. That is the worst failure mode a form has: nothing to read, nothing
 * to search for, and the only conclusion available to the user is that the
 * program is broken. It is also unreachable by any test that does not render
 * the page — which is why the rule lives here now, as a value both the markup
 * and the guard read, rather than as two expressions that must be kept in step
 * by whoever edits them next.
 */

import type { BrainTarget } from './snippet.js'

export interface TargetInputs {
  /** Mini has no embedded brain, so 'embedded' is not a state it can be in. */
  mini: boolean
  /** Simple mode hides remote setup and keeps the full app on its own brain. */
  simpleMode: boolean
  /** What the user last chose, from settings. */
  stored: BrainTarget
}

/** The target that everything on screen — and every snippet — must agree on. */
export function resolveBrainTarget({ mini, simpleMode, stored }: TargetInputs): BrainTarget {
  if (mini) return 'remote'
  if (simpleMode) return 'embedded'
  return stored
}

/**
 * Can the address be edited?
 *
 * Only for a remote brain. The embedded one lives at a fixed loopback port
 * this app starts itself, so its address is a fact to display, not a setting.
 * Deliberately takes the *effective* target: passing the stored one is the
 * bug this module exists to prevent.
 */
export function canEditBrainUrl(effective: BrainTarget): boolean {
  return effective === 'remote'
}

/**
 * The server's own base URL: `http://host:7865/mcp` → `http://host:7865`.
 *
 * brain-core serves everything on one port — MCP, the admin API, the token
 * dashboard at the root. The desktop still carried a helper that rewrote the
 * port to 7860, which was the separate dashboard of the retired Python hub.
 * Against brain-core that address answers nothing, so 'New token' failed with
 * `TypeError: fetch failed` and 'Open token dashboard' opened a dead page —
 * while the error text helpfully advised opening :7860 by hand.
 */
export function brainBaseUrl(brainUrl: string): string {
  let base = brainUrl.trim().replace(/\/+$/, '')
  for (;;) {
    const stripped = base.replace(/\/(admin|mcp|status)$/i, '').replace(/\/+$/, '')
    if (stripped === base) return base
    base = stripped
  }
}
