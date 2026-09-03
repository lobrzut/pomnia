// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Talk to the skills on the server over the replication endpoints.
 *
 * `/sync/manifest` lists, `/sync/fetch` reads one file, `/sync/file` writes
 * one. All three want the admin token — the same one the import already uses,
 * held in main and never handed to the renderer.
 *
 * Writing goes through `isSafeSkillPath` first. The path arrives from a window
 * and decides which file on someone else's machine gets replaced, so a value
 * that climbs out of `skills/` is refused rather than normalised: normalising
 * an attempt to escape turns it into a successful write somewhere unexpected.
 */

import { createHash } from 'node:crypto'

import { brainBaseUrl } from '@core/brain/brainTarget.js'
import { isSafeSkillPath, skillsFromManifest, type RemoteSkill } from '@core/brain/remoteSkills.js'

export type SkillsResult<T> = T | { error: 'no-target' | 'no-token' | 'unsafe-path' | 'failed'; detail: string }

async function post(
  base: string,
  path: string,
  token: string,
  body: unknown,
  timeoutMs = 60_000,
): Promise<unknown> {
  const r = await fetch(`${brainBaseUrl(base)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  return text ? JSON.parse(text) : {}
}

function guard(url?: string, token?: string): { error: 'no-target' | 'no-token'; detail: string } | null {
  if (!url?.trim()) return { error: 'no-target', detail: 'no brain server configured' }
  if (!token?.trim()) {
    return { error: 'no-token', detail: 'reading and writing skills needs an admin token' }
  }
  return null
}

export async function listRemoteSkills(
  url?: string,
  token?: string,
): Promise<SkillsResult<{ skills: RemoteSkill[] }>> {
  const bad = guard(url, token)
  if (bad) return bad
  try {
    const m = (await post(url!, '/sync/manifest', token!.trim(), {}, 120_000)) as { entries?: unknown }
    return { skills: skillsFromManifest(m?.entries) }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

export async function readRemoteSkill(
  path: string,
  url?: string,
  token?: string,
): Promise<SkillsResult<{ path: string; content: string }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafeSkillPath(path)) return { error: 'unsafe-path', detail: path }
  try {
    const f = (await post(url!, '/sync/fetch', token!.trim(), { path })) as {
      contentBase64?: string
    }
    return { path, content: Buffer.from(f?.contentBase64 ?? '', 'base64').toString('utf8') }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

export async function writeRemoteSkill(
  path: string,
  content: string,
  url?: string,
  token?: string,
): Promise<SkillsResult<{ path: string; unchanged: boolean }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafeSkillPath(path)) return { error: 'unsafe-path', detail: path }
  try {
    const buf = Buffer.from(content, 'utf8')
    const applied = (await post(url!, '/sync/file', token!.trim(), {
      path,
      sha256: createHash('sha256').update(buf).digest('hex'),
      contentBase64: buf.toString('base64'),
    })) as { ok?: boolean; reason?: string; unchanged?: boolean }
    if (applied?.ok === false) {
      return { error: 'failed', detail: applied.reason ?? 'server refused the write' }
    }
    return { path, unchanged: applied?.unchanged === true }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}
