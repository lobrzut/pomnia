// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * When is a client's Pomnia block worth rewriting?
 *
 * Two wrong answers, both of which this project has now shipped.
 *
 * "When the URL differs" was the original rule. It reads as an obvious
 * optimisation and quietly made upgrades unable to repair anything else: a
 * Claude Desktop entry held the right address beside both Windows faults fixed
 * in 0.1.71, and three releases carried the fix without being able to apply it.
 *
 * "When the block differs from what we would generate" was the correction, and
 * it overshot. It rewrites on any difference, so a bug in the generator would
 * propagate itself to six configs automatically, and a deliberate hand edit is
 * flattened at the next status check. The narrow rule was accidentally
 * protecting against both.
 *
 * So: rewrite on a *defect*, not on a difference. Each case below is a failure
 * that has actually been observed, and anything else is left alone — including
 * configurations that are merely not what this generator would have written.
 * Someone else's edit is their business until it stops working.
 */

export type OS = 'win32' | 'darwin' | 'linux'

export interface RepairContext {
  /** Base URL of the brain this app is pointed at. */
  brainUrl: string
  target: 'embedded' | 'remote'
  os: OS
}

/** Why this block must be rewritten, in words, or null to leave it alone. */
export type RepairReason =
  | 'missing'
  | 'points-elsewhere'
  | 'no-url'
  | 'no-token'
  | 'windows-npx-path'
  | 'windows-header-space'

export interface RepairVerdict {
  reason: RepairReason
  detail: string
}

const strip = (u: string): string => u.trim().replace(/\/+$/, '').replace(/\/mcp$/i, '')

function sameBrain(configured: string | undefined, expected: string): boolean {
  if (!configured) return false
  try {
    const a = new URL(strip(configured))
    const b = new URL(strip(expected))
    const local = (h: string): boolean => h === 'localhost' || h === '127.0.0.1' || h === '::1'
    const host = a.hostname === b.hostname || (local(a.hostname) && local(b.hostname))
    return host && a.port === b.port
  } catch {
    return strip(configured) === strip(expected)
  }
}

/**
 * A stdio entry's `--header` value, if it has one.
 *
 * `Authorization: Bearer x` carries a space that cmd.exe splits, so the server
 * receives an empty header, answers 401, and mcp-remote dies inside OAuth
 * registration with an error naming none of that.
 */
function headerArg(srv: Record<string, unknown>): string | undefined {
  if (!Array.isArray(srv.args)) return undefined
  const i = srv.args.indexOf('--header')
  const v = i >= 0 ? srv.args[i + 1] : undefined
  return typeof v === 'string' ? v : undefined
}

function isStdio(srv: Record<string, unknown>): boolean {
  return typeof srv.command === 'string'
}

export function repairReason(
  entry: unknown,
  found: { url?: string; token?: string },
  ctx: RepairContext,
): RepairVerdict | null {
  if (!entry || typeof entry !== 'object') {
    return { reason: 'missing', detail: 'no Pomnia block in this config' }
  }
  const srv = entry as Record<string, unknown>

  if (!found.url) {
    return { reason: 'no-url', detail: 'the block has no URL this app can read' }
  }
  if (!sameBrain(found.url, ctx.brainUrl)) {
    return {
      reason: 'points-elsewhere',
      detail: `points at ${found.url}, not ${ctx.brainUrl}`,
    }
  }
  if (ctx.target === 'remote' && !found.token) {
    return { reason: 'no-token', detail: 'a remote brain needs a token and this block has none' }
  }

  if (ctx.os === 'win32' && isStdio(srv)) {
    const cmd = String(srv.command ?? '')
    if (/^npx(\.cmd)?$/i.test(cmd.split(/[\\/]/).pop() || '')) {
      return {
        reason: 'windows-npx-path',
        detail: "`command: npx` resolves to a path with a space; cmd.exe fails with 'C:\\Program' is not recognized",
      }
    }
    const header = headerArg(srv)
    if (header && /^Authorization:\s+\S/.test(header)) {
      return {
        reason: 'windows-header-space',
        detail: 'cmd.exe splits this header on its space and the server receives an empty Authorization',
      }
    }
  }

  return null
}
