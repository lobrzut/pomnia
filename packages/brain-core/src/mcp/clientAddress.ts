// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Client identity for rate limits and Secure cookies.
 *
 * X-Forwarded-For / X-Forwarded-Proto are attacker-controlled unless the
 * immediate peer is an operator-configured reverse proxy that strips client
 * spoofing. Default: trust the socket only (audit F02).
 */
import type { IncomingMessage } from 'node:http'

function normalizeIp(ip: string): string {
  const s = ip.trim().toLowerCase()
  // Node often reports IPv4-mapped IPv6 as ::ffff:127.0.0.1
  if (s.startsWith('::ffff:')) return s.slice(7)
  return s
}

/** True when `remote` is one of the configured proxy addresses. */
export function isTrustedProxy(remote: string | undefined, trustedProxies: readonly string[]): boolean {
  if (!remote || trustedProxies.length === 0) return false
  const n = normalizeIp(remote)
  return trustedProxies.some((p) => normalizeIp(p) === n)
}

/**
 * Rate-limit / login budget key. Forwarded headers only when the peer is listed
 * in `trustedProxies`.
 */
export function clientAddress(
  req: IncomingMessage,
  trustedProxies: readonly string[] = [],
): string {
  const remote = normalizeIp(req.socket.remoteAddress || 'unknown')
  if (!isTrustedProxy(req.socket.remoteAddress, trustedProxies)) return remote

  const fwd = req.headers['x-forwarded-for']
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]
  const fromHeader = first?.trim()
  return fromHeader ? normalizeIp(fromHeader) : remote
}

/**
 * Whether the request should be treated as HTTPS for Secure cookies.
 * Forwarded proto is ignored unless the peer is a trusted proxy; otherwise use
 * the socket's TLS state when present.
 */
export function requestIsHttps(
  req: IncomingMessage,
  trustedProxies: readonly string[] = [],
): boolean {
  const encrypted = Boolean((req.socket as { encrypted?: boolean }).encrypted)
  if (!isTrustedProxy(req.socket.remoteAddress, trustedProxies)) return encrypted

  const proto = req.headers['x-forwarded-proto']
  const first = Array.isArray(proto) ? proto[0] : proto?.split(',')[0]
  return (first?.trim().toLowerCase() || (encrypted ? 'https' : 'http')) === 'https'
}
