// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Rewrite the Pomnia-managed MCP server block in agent configs that already
 * exist. Leaves unrelated servers (e.g. comfyui) untouched. Does not create
 * new client files.
 */
import { promises as fs } from 'node:fs'
import { CLIENTS, buildSnippet, type BrainTarget, type ClientId } from './snippet.js'
import type { OS } from '../model.js'

export const MCP_MANAGED_KEYS = [
  'pomnia',
  'pomnia-vault',
  'pomnia-library',
  'brain-rag',
  'brain-vault',
  'brain-library',
] as const

function pickUrl(srv: unknown): string | undefined {
  if (!srv || typeof srv !== 'object') return undefined
  const o = srv as Record<string, unknown>
  if (typeof o.url === 'string') return o.url
  if (typeof o.serverUrl === 'string') return o.serverUrl
  if (Array.isArray(o.args)) {
    const arg = o.args.find((a) => typeof a === 'string' && /^https?:\/\//.test(a))
    if (typeof arg === 'string') return arg
  }
  return undefined
}

function managedUrl(mcp: Record<string, unknown>): string | undefined {
  for (const key of MCP_MANAGED_KEYS) {
    const url = pickUrl(mcp[key])
    if (url) return url
  }
  return undefined
}

export function mergeManagedServers(
  existing: Record<string, unknown>,
  nextManaged: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing }
  for (const key of MCP_MANAGED_KEYS) delete out[key]
  return { ...out, ...nextManaged }
}

export interface SyncMcpResult {
  updated: Array<{ id: ClientId; path: string; from?: string; to: string }>
  skipped: Array<{ id: ClientId; reason: string }>
}

/** Deterministic shape for comparison: key order must not decide equality. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = stable(o[k])
        return acc
      }, {})
  }
  return v
}

/**
 * Does the managed part of this config already say exactly what we would write?
 *
 * Only the keys we manage are compared. Someone else's servers in the same
 * file are theirs, and a difference there is not a reason to rewrite ours.
 */
function sameManagedBlock(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(next)) {
    if (JSON.stringify(stable(current[key])) !== JSON.stringify(stable(next[key]))) return false
  }
  return true
}

export async function syncManagedMcpConfigs(opts: {
  brainUrl: string
  target: BrainTarget
  token?: string
  os?: OS
  home?: string
}): Promise<SyncMcpResult> {
  const os = opts.os ?? (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux')
  const home = opts.home ?? process.env.HOME ?? process.env.USERPROFILE ?? ''
  const updated: SyncMcpResult['updated'] = []
  const skipped: SyncMcpResult['skipped'] = []
  const brainUrl = opts.brainUrl.trim()
  if (!brainUrl) return { updated, skipped }

  for (const spec of CLIENTS) {
    const filePath = spec.configPath(os, home)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      skipped.push({ id: spec.id, reason: 'config file does not exist' })
      continue
    }
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      skipped.push({ id: spec.id, reason: 'could not parse JSON' })
      continue
    }
    if (!data || typeof data !== 'object') {
      skipped.push({ id: spec.id, reason: 'not an object' })
      continue
    }
    const root = data as Record<string, unknown>
    const mcp = (root[spec.mcpKey] as Record<string, unknown> | undefined) ?? {}
    if (typeof mcp !== 'object' || Array.isArray(mcp)) {
      skipped.push({ id: spec.id, reason: `expected object at ${spec.mcpKey}` })
      continue
    }
    const current = managedUrl(mcp)
    if (!current) {
      skipped.push({ id: spec.id, reason: 'no Pomnia-managed server block' })
      continue
    }
    const snippet = buildSnippet(
      spec.id,
      brainUrl,
      os,
      home,
      opts.target === 'remote' ? opts.token : undefined,
      opts.target,
    )
    const nextManaged = JSON.parse(snippet.mergeJson) as Record<string, unknown>

    // Compare the whole block, not just the address.
    //
    // This used to skip whenever the URL already matched, which sounds right
    // and quietly made upgrades unable to repair anything else. A Claude
    // Desktop entry written by an older build kept `command: "npx"` and a
    // `--header "Authorization: Bearer …"` with a space in it -- the two
    // Windows faults fixed in 0.1.71, which between them produce
    // `'C:\Program' is not recognized` and an empty Authorization header. The
    // address in that entry was perfectly correct, so every later version
    // looked at it, agreed, and left the break in place. The user upgrades,
    // nothing changes, and MCP is broken again for reasons the app has already
    // been taught to fix.
    //
    // Stable key order both sides, so a rewrite means a real difference rather
    // than JSON.stringify visiting properties in another order.
    if (sameManagedBlock(mcp, nextManaged)) {
      skipped.push({ id: spec.id, reason: 'already correct' })
      continue
    }

    const merged = mergeManagedServers(mcp, nextManaged)
    const nextRoot = { ...root, [spec.mcpKey]: merged }
    await fs.writeFile(filePath, `${JSON.stringify(nextRoot, null, 2)}\n`, 'utf8')
    updated.push({ id: spec.id, path: filePath, from: current, to: `${brainUrl.replace(/\/+$/, '')}/mcp` })
  }
  return { updated, skipped }
}
