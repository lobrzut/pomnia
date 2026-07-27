// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Cross-platform path translation — the heart of "backup on Windows, restore on Mac".
 *
 * Two distinct problems are solved here:
 *
 *  1. Claude Code project-dir encoding. Claude Code stores each project under
 *     `~/.claude/projects/<encoded-cwd>/` where the cwd has every `/`, `\` and `:`
 *     replaced by `-`. Example (Windows):
 *         C:\Users\Alice\PROJEKTY   →   C--Users-Admin-PROJEKTY
 *     The same project on macOS would be:
 *         /Users/jane/PROJEKTY    →   -Users-jane-PROJEKTY
 *     The encoding is lossy (a literal `-` is indistinguishable from a separator),
 *     so decode is best-effort and any remap is reported as a warning, never silent.
 *
 *  2. Absolute paths embedded inside captured config/JSON (home dir, username,
 *     drive letters). We rewrite the *origin* machine's home/user to the *target*
 *     machine's, across all separator styles.
 */
import type { OS } from './model.js'

export interface HostContext {
  os: OS
  home: string // e.g. C:\Users\Alice  or  /Users/jane
  user: string // e.g. Admin / jane
}

/** Replicate Claude Code's project-dir encoding. */
export function encodeClaudeProject(cwd: string): string {
  return cwd.replace(/[/\\:]/g, '-')
}

/**
 * Best-effort decode of a Claude Code encoded project dir back to an absolute path
 * on the target OS, given the target home. We can't recover the original perfectly,
 * but for the common case (project lives under the user's home/drive) we can rebuild
 * a sensible target path. Returns null when we can't make a confident guess.
 */
export function remapClaudeProject(
  encoded: string,
  origin: HostContext,
  target: HostContext
): { encoded: string; confident: boolean } {
  const originHomeEnc = encodeClaudeProject(origin.home)
  if (encoded.startsWith(originHomeEnc)) {
    const tail = encoded.slice(originHomeEnc.length) // e.g. "-PROJEKTY"
    const targetHomeEnc = encodeClaudeProject(target.home)
    return { encoded: targetHomeEnc + tail, confident: true }
  }
  // Windows drive-letter form "C--..." → try swapping the leading drive segment
  // for the target home when the username matches.
  if (/^[A-Za-z]--/.test(encoded) && origin.user && target.user) {
    const swapped = encoded.replace(
      new RegExp(`-${escapeRe(origin.user)}-`),
      `-${target.user}-`
    )
    if (swapped !== encoded) return { encoded: swapped, confident: false }
  }
  return { encoded, confident: false }
}

/**
 * Rewrite absolute path references inside a text/JSON config from origin → target.
 * Handles: forward-slash, back-slash, JSON-escaped back-slash (`\\`), and the
 * username token on its own. Returns the rewritten text + whether anything changed.
 */
export function remapTextPaths(
  text: string,
  origin: HostContext,
  target: HostContext
): { text: string; changed: boolean } {
  let out = text
  let changed = false

  const variants = (p: string): string[] => {
    const fwd = p.replace(/\\/g, '/')
    const back = p.replace(/\//g, '\\')
    const jsonBack = back.replace(/\\/g, '\\\\')
    return Array.from(new Set([p, fwd, back, jsonBack]))
  }

  const replacements: Array<[string, string]> = []
  // Home dir (longest/most-specific first).
  for (const ov of variants(origin.home)) {
    const tv =
      target.os === 'win32'
        ? ov.includes('/')
          ? target.home.replace(/\\/g, '/')
          : ov.includes('\\\\')
            ? target.home.replace(/\\/g, '\\\\')
            : target.home
        : target.home
    replacements.push([ov, tv])
  }
  // Bare username as a fallback (only if distinct).
  if (origin.user && target.user && origin.user !== target.user) {
    replacements.push([origin.user, target.user])
  }

  // Apply longest origin strings first to avoid partial clobbering.
  replacements.sort((a, b) => b[0].length - a[0].length)
  for (const [from, to] of replacements) {
    if (!from) continue
    if (out.includes(from)) {
      out = out.split(from).join(to)
      changed = true
    }
  }
  return { text: out, changed }
}

/** Should this captured config likely be path-remapped? (helper for adapters) */
export function looksLikeTextConfig(relPath: string): boolean {
  return /\.(json|jsonl|md|yml|yaml|toml|ini|cfg|conf|txt|xml|env)$/i.test(relPath)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
