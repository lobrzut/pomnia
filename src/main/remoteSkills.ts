// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Talk to the skills and prompts on the server.
 *
 * All of it goes through `/admin/*` with the admin token, which is held in
 * main and never handed to the renderer. The previous route was
 * `/sync/manifest` — replication — and it cost a minute and 2.8 MB to draw a
 * list of names.
 *
 * Every failure has to arrive as something the window can explain. A token
 * that has been revoked or rotated is the ordinary case here, not an
 * exceptional one: the server answers 401, and "the server did not answer" is
 * both wrong and unactionable. So the HTTP status becomes a reason before it
 * leaves this file, and a 404 on a route that exists in 0.1.80 is reported as
 * an old server rather than as a mystery.
 */

import { brainBaseUrl } from '@core/brain/brainTarget.js'
import {
  isSafePromptName,
  isSafeSkillRel,
  promptsFromResponse,
  rowsFromResponse,
  summaryFromResponse,
  type RemoteLibraryError,
  type RemotePrompt,
  type RemoteSkillRow,
  type RemoteSkillsSummary,
} from '@core/brain/remoteSkills.js'

export type LibraryResult<T> = T | { error: RemoteLibraryError; detail: string }

class HttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail)
  }
}

async function post(
  base: string,
  path: string,
  token: string,
  body: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const r = await fetch(`${brainBaseUrl(base)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await r.text()
  if (!r.ok) throw new HttpError(r.status, text ? text.slice(0, 300) : `HTTP ${r.status}`)
  return text ? JSON.parse(text) : {}
}

/**
 * Turn a failure into something the window can put in front of the user.
 *
 * 401 and 403 are the two that matter. A token stops working for ordinary
 * reasons — it was rotated, it was revoked, it was an agent token all along —
 * and each has an obvious next step, which the user can only take if we say
 * which one happened.
 */
function reason(e: unknown): { error: RemoteLibraryError; detail: string } {
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return { error: 'unauthorized', detail: e.message }
    if (e.status === 404) return { error: 'server-too-old', detail: e.message }
    if (e.status === 400) return { error: 'unsafe-path', detail: e.message }
  }
  return { error: 'failed', detail: (e as Error)?.message ?? String(e) }
}

function guard(url?: string, token?: string): { error: RemoteLibraryError; detail: string } | null {
  if (!url?.trim()) return { error: 'no-target', detail: 'no brain server configured' }
  if (!token?.trim()) {
    return { error: 'no-token', detail: 'reading and writing skills needs an admin token' }
  }
  return null
}

export async function listRemoteSkills(
  url?: string,
  token?: string,
): Promise<LibraryResult<RemoteSkillsSummary>> {
  const bad = guard(url, token)
  if (bad) return bad
  try {
    return summaryFromResponse(await post(url!, '/admin/skills', token!.trim(), {}))
  } catch (e) {
    return reason(e)
  }
}

export async function listRemoteSkillsIn(
  opts: { category?: string; query?: string; offset?: number },
  url?: string,
  token?: string,
): Promise<LibraryResult<{ rows: RemoteSkillRow[]; total: number; nextOffset?: number }>> {
  const bad = guard(url, token)
  if (bad) return bad
  try {
    return rowsFromResponse(
      await post(url!, '/admin/skills', token!.trim(), {
        category: opts.category,
        query: opts.query,
        offset: opts.offset ?? 0,
        limit: 200,
      }),
    )
  } catch (e) {
    return reason(e)
  }
}

export async function readRemoteSkill(
  path: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ path: string; content: string }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafeSkillRel(path)) return { error: 'unsafe-path', detail: path }
  try {
    const r = (await post(url!, '/admin/skills/read', token!.trim(), { path })) as { content?: string }
    return { path, content: r?.content ?? '' }
  } catch (e) {
    return reason(e)
  }
}

export async function writeRemoteSkill(
  path: string,
  content: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ path: string; unchanged: boolean }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafeSkillRel(path)) return { error: 'unsafe-path', detail: path }
  try {
    const r = (await post(url!, '/admin/skills/write', token!.trim(), { path, content })) as {
      unchanged?: boolean
    }
    return { path, unchanged: r?.unchanged === true }
  } catch (e) {
    return reason(e)
  }
}

export async function deleteRemoteSkill(
  path: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ path: string }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafeSkillRel(path)) return { error: 'unsafe-path', detail: path }
  try {
    await post(url!, '/admin/skills/delete', token!.trim(), { path })
    return { path }
  } catch (e) {
    return reason(e)
  }
}

export async function listRemotePrompts(
  url?: string,
  token?: string,
): Promise<LibraryResult<{ prompts: RemotePrompt[] }>> {
  const bad = guard(url, token)
  if (bad) return bad
  try {
    return { prompts: promptsFromResponse(await post(url!, '/admin/prompts', token!.trim(), {})) }
  } catch (e) {
    return reason(e)
  }
}

export async function readRemotePrompt(
  name: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ name: string; content: string }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafePromptName(name)) return { error: 'unsafe-path', detail: name }
  try {
    const r = (await post(url!, '/admin/prompts/read', token!.trim(), { name })) as { content?: string }
    return { name, content: r?.content ?? '' }
  } catch (e) {
    return reason(e)
  }
}

export async function writeRemotePrompt(
  name: string,
  content: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ name: string; unchanged: boolean; created: boolean }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafePromptName(name)) return { error: 'unsafe-path', detail: name }
  try {
    const r = (await post(url!, '/admin/prompts/write', token!.trim(), { name, content })) as {
      unchanged?: boolean
      created?: boolean
    }
    return { name, unchanged: r?.unchanged === true, created: r?.created === true }
  } catch (e) {
    return reason(e)
  }
}

export async function deleteRemotePrompt(
  name: string,
  url?: string,
  token?: string,
): Promise<LibraryResult<{ name: string }>> {
  const bad = guard(url, token)
  if (bad) return bad
  if (!isSafePromptName(name)) return { error: 'unsafe-path', detail: name }
  try {
    await post(url!, '/admin/prompts/delete', token!.trim(), { name })
    return { name }
  } catch (e) {
    return reason(e)
  }
}
