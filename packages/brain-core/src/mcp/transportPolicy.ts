// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Explicit HTTP transport policy (audit F12).
 *
 * brain-core speaks plain HTTP by design (TLS belongs on a reverse proxy or
 * WireGuard). That is intentional for loopback / embedded clients. Remotely,
 * sending passwords or bearer tokens over plain HTTP is unsafe — we do not
 * invent a production redirect here; we detect the case so UI can warn, and
 * Secure cookies follow `requestIsHttps` + trusted proxies (F02).
 */

/** True for hosts that count as local transport under this policy. */
export function isLoopbackHostname(hostname: string): boolean {
  let h = hostname.trim().toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

/**
 * True when `url` (or origin) is `http:` and the host is not loopback.
 * Invalid / empty input → false (no false alarm while typing).
 */
export function isInsecureRemoteHttpUrl(url: string): boolean {
  const raw = url.trim()
  if (!raw) return false
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`)
    if (u.protocol !== 'http:') return false
    return !isLoopbackHostname(u.hostname)
  } catch {
    return false
  }
}
