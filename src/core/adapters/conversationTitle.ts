// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * A conversation's title, taken from its first user message.
 *
 * Clients wrap that message in metadata before the person's actual words:
 * `<timestamp>Sunday, Aug 30, 2026, 9:52 PM (UTC+2)</timestamp>`, environment
 * blocks, reminders. Taking the first 80 characters therefore titled the
 * conversation with the clock.
 *
 * On a live vault this had reached 406 of 2192 distilled notes — 18.5% named
 * after when they happened instead of what they were about. The filename is
 * also what the index scores keyword matches against, at the highest keyword
 * weight there is, so those notes carried a strong signal for the word
 * "timestamp" and none at all for their subject. They were, in practice,
 * findable by accident only.
 *
 * Only leading blocks are removed, and only for the title. The message text
 * itself is never altered — a person who pastes XML into the middle of a
 * question still gets it distilled intact.
 */

/** `<tag …>…</tag>` or a bare `<tag …>` at the very start of what is left. */
const LEADING_BLOCK = /^\s*<([a-zA-Z][\w-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/
const LEADING_TAG = /^\s*<[a-zA-Z][\w-]*\b[^>]*\/?>/

/** Longest a title may be. Same bound the adapters used before. */
export const MAX_TITLE = 80

/**
 * Returns the title, or undefined when nothing usable is left — in which case
 * the caller should fall back to the conversation id. An id is opaque; a date
 * dressed up as a subject is worse, because it looks like it means something.
 */
export function conversationTitle(text: string): string | undefined {
  let rest = text
  for (;;) {
    // Whole blocks first. Stripping a bare opening tag when a matching close
    // exists would eat the tag and leave its contents plus a stray `</...>`,
    // and the block pattern can never match again after that.
    const block = rest.replace(LEADING_BLOCK, '')
    if (block !== rest) {
      rest = block
      continue
    }
    const tag = rest.replace(LEADING_TAG, '')
    if (tag === rest) break
    rest = tag
  }
  const title = rest.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
  return title.length > 0 ? title : undefined
}
