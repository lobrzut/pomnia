// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Tell the user when a newer release exists. Nothing more.
 *
 * The app shipped with no update path at all: whoever installed a build stayed
 * on it forever unless they thought to revisit the site. Every fix we make
 * would reach nobody who already has it — worse than the missing signature,
 * which only costs a scary dialog once.
 *
 * Deliberately notify-only. `autoDownload` is off and nothing installs itself:
 *
 *  - The installer is unsigned, so a silent background update would replace a
 *    running app with an unverifiable binary. Asking first is the honest shape
 *    for a product whose pitch is that you keep control.
 *  - electron-updater's NSIS path runs the installer on quit. Doing that
 *    without consent to an app holding an open encrypted vault is not a risk
 *    worth taking for convenience.
 *
 * Failure is silent by design here — a machine that is offline, behind a proxy,
 * or rate-limited by GitHub must not greet the user with an error they cannot
 * act on. The result is logged either way.
 */
import { log } from '@core/log.js'

export interface UpdateInfo {
  version: string
  releaseUrl: string
}

const RELEASES_URL = 'https://github.com/lobrzut/pomnia/releases/latest'

/** Semver compare limited to numeric x.y.z — the only shape this project ships. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const a = parse(candidate)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/**
 * Ask GitHub for the latest published release.
 *
 * Uses the public releases API rather than electron-updater so an unsigned
 * build stays free of an updater that expects to install things. No token: the
 * repo is public once released, and an unauthenticated call is enough for a
 * version string.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateInfo | null> {
  try {
    const r = await fetchImpl('https://api.github.com/repos/lobrzut/pomnia/releases/latest', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'pomnia-desktop' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) {
      log.info(`update check: HTTP ${r.status} — skipping`)
      return null
    }
    const j = (await r.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean }
    if (!j.tag_name || j.draft || j.prerelease) return null
    if (!isNewerVersion(j.tag_name, currentVersion)) {
      log.info(`update check: ${currentVersion} is current (latest ${j.tag_name})`)
      return null
    }
    return { version: j.tag_name.replace(/^v/, ''), releaseUrl: j.html_url || RELEASES_URL }
  } catch (err) {
    // Offline, proxied, or rate-limited. Not the user's problem to solve.
    log.info(`update check skipped: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
