// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which copy of the connect token wins when the two disagree.
 *
 * The token lives in two places: `app-settings.json`, written by the main
 * process, the installer and anything scripted against the app, and a
 * localStorage cache in the renderer. Every other setting hydrates
 * cache-first, which is right for a preference the user set in this window.
 *
 * A token is not a preference. It is minted on a server that can revoke or
 * rotate it, and the renderer cache has no way to hear about that. With
 * cache-first, a stale token survived every restart and was written back over
 * the good value in the file — so the app reported that it could not connect
 * while the working token sat on disk, being overwritten on each launch.
 *
 * The cache cannot legitimately be ahead: the setter writes both copies in one
 * call, so a token entered in the UI is already in the file by the time
 * anything reads it back.
 */

export interface ConnectTokenSources {
  /** From app-settings.json. Authoritative when present. */
  fileToken?: string | null
  /** The renderer's localStorage copy. */
  cachedToken?: string | null
}

export interface ConnectTokenResolution {
  /** The value to use. Empty string when neither source has one. */
  token: string
  /** True when the cache holds something else and must be rewritten. */
  refreshCache: boolean
}

function clean(v: string | null | undefined): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function resolveConnectToken(sources: ConnectTokenSources): ConnectTokenResolution {
  const file = clean(sources.fileToken)
  const cached = clean(sources.cachedToken)
  // An absent file value is a machine that has never written one, not a
  // deliberate erasure — keep the cache rather than logging the user out.
  if (!file) return { token: cached, refreshCache: false }
  return { token: file, refreshCache: file !== cached }
}
