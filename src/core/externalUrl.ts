// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which URLs the app is willing to hand to the operating system.
 *
 * shell.openExternal does not open a browser — it asks the OS to run whatever
 * is registered for the scheme. Every link Pomnia opens is a web page, so
 * anything else is a mistake at best.
 */

/** http(s) only. Anything unparseable, schemeless or exotic is refused. */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
