// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Compare MCP URLs by host+port. A LAN box that still answers is not
 * "this app's brain" when the user chose embedded (127.0.0.1:7862).
 */

export function normalizeLoopbackHost(host: string): string {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '::1' || h === '[::1]') return '127.0.0.1'
  return h
}

export function parseBrainEndpoint(url: string): { host: string; port: string } | null {
  try {
    const u = new URL(url.includes('://') ? url : `http://${url}`)
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    return { host: normalizeLoopbackHost(u.hostname), port }
  } catch {
    return null
  }
}

/** True only when both URLs name the same host:port (localhost ≡ 127.0.0.1). */
export function urlsPointAtSameBrain(configured: string | undefined, expectedBase: string | undefined): boolean {
  if (!configured?.trim() || !expectedBase?.trim()) return false
  const expected = expectedBase.includes('/mcp') ? expectedBase : `${expectedBase.replace(/\/+$/, '')}/mcp`
  const a = parseBrainEndpoint(configured)
  const b = parseBrainEndpoint(expected)
  if (!a || !b) return false
  return a.host === b.host && a.port === b.port
}
