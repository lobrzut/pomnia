// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Deploy distilled knowledge to Brain. Two backends:
 *
 *  - filesystem : write finished notes into Brain's vault dir (local path, mount,
 *                 or an MCP/synced folder), then optionally trigger a reindex.
 *                 This keeps distillation on the host — Brain only embeds.
 *  - dashboard  : POST raw conversations to Brain's /api/vault/save-chat (Brain
 *                 distills). Fallback when host-side distillation isn't wanted.
 *
 * For a desktop install on the GPU box → Brain VM, the practical filesystem deploy
 * is rsync/scp of the notes dir + an HTTP reindex; that's documented in the README.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Conversation } from '../model.js'
import type { DistilledNote } from './distill.js'
import {
  destinationForQuality,
  destDir,
  parseFrontmatterQuality,
  type QualityDestination,
} from './qualityGate.js'
import { log } from '../log.js'

function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 48) || 'untitled'
  )
}

/**
 * Logical note identity is source + sessionId.
 * On disk the stable key is the 8-char sessionId suffix in the filename
 * (`…_${sessionId.slice(0,8)}.md`) — date/title may change on re-distill.
 */
export function sessionIdFileSuffix(sessionId: string): string {
  return sessionId.slice(0, 8)
}

export function noteFilename(n: DistilledNote): string {
  // Readable name may include date/title; identity key is the trailing sessionId8.
  return `${n.date}_${n.source}_${slug(n.title)}_${sessionIdFileSuffix(n.sessionId)}.md`
}

/** Filename ends with `_${sessionId8}.md` (existing vault convention). */
export function matchesSessionNote(filename: string, sessionId: string): boolean {
  const base = path.basename(filename)
  return base.endsWith(`_${sessionIdFileSuffix(sessionId)}.md`)
}

function basketDirs(targetDir: string): string[] {
  return [targetDir, path.join(targetDir, '_weak'), path.join(targetDir, '_review')]
}

/**
 * Delete every prior note for this session across distilled/_weak/_review,
 * regardless of date/title in the filename. Call before writing the new note.
 */
export async function removePriorSessionNotes(
  targetDir: string,
  sessionId: string,
): Promise<string[]> {
  const removed: string[] = []
  const suffix = `_${sessionIdFileSuffix(sessionId)}.md`
  for (const dir of basketDirs(targetDir)) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith(suffix)) continue
      const file = path.join(dir, name)
      try {
        await fs.unlink(file)
        removed.push(file)
      } catch {
        /* raced / already gone */
      }
    }
  }
  return removed
}

function destForNote(n: DistilledNote): QualityDestination {
  return destinationForQuality(n.quality)
}

/** Write distilled notes into a target directory (e.g. .../brain/data/vault/distilled).
 *  Quality gate (both vocabularies):
 *    stub|garbage → `_review/` (not indexed)
 *    weak         → `_weak/`   (indexed, ranking penalty)
 *    ok|solid|good → main dir
 */
export async function deployFilesystem(notes: DistilledNote[], targetDir: string): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true })
  const made = new Set<string>()
  const written: string[] = []
  for (const n of notes) {
    const dest = destForNote(n)
    const dir = destDir(targetDir, dest)
    if (dest !== 'keep' && !made.has(dest)) {
      await fs.mkdir(dir, { recursive: true })
      made.add(dest)
    }
    // Identity = source + sessionId; FS key = 8-char sessionId suffix across all baskets.
    await removePriorSessionNotes(targetDir, n.sessionId)
    const name = noteFilename(n)
    const file = path.join(dir, name)
    await fs.writeFile(file, n.markdown, 'utf8')
    written.push(file)
  }
  const ok = notes.filter((n) => destForNote(n) === 'keep').length
  const reviewed = notes.filter((n) => destForNote(n) === 'review').length
  const weak = notes.filter((n) => destForNote(n) === 'weak').length
  log.info(
    'deployed',
    ok,
    'notes →',
    targetDir,
    reviewed ? `(${reviewed} → _review/)` : '',
    weak ? `(${weak} → _weak/)` : '',
  )
  return written
}

/**
 * Copy a single .md note into distilled/ honoring frontmatter quality.
 * Used by deployDistilledFiles and manual vault sync so no write path bypasses
 * the gate.
 */
export async function copyNoteThroughQualityGate(
  srcPath: string,
  distilledRoot: string,
  markdown?: string,
): Promise<{ dest: QualityDestination; path: string }> {
  const text = markdown ?? (await fs.readFile(srcPath, 'utf8'))
  const quality = parseFrontmatterQuality(text)
  const dest = destinationForQuality(quality)
  const dir = destDir(distilledRoot, dest)
  await fs.mkdir(dir, { recursive: true })
  const name = path.basename(srcPath)
  const out = path.join(dir, name)
  await fs.writeFile(out, text, 'utf8')
  return { dest, path: out }
}

/** Push raw conversations to Brain's dashboard; Brain distills + stores them. */
export async function deployDashboard(
  conversations: Conversation[],
  baseUrl: string
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const c of conversations) {
    try {
      const r = await fetch(`${baseUrl}/api/vault/save-chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: c.title,
          model: c.meta?.model,
          messages: c.messages.map((m) => ({ role: m.role, content: m.text }))
        }),
        signal: AbortSignal.timeout(60_000)
      })
      r.ok ? ok++ : failed++
    } catch {
      failed++
    }
  }
  return { ok, failed }
}

/** Ask Brain to (re)embed the vault + library into its vector DB. */
export async function triggerReindex(baseUrl: string, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
    const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/library/reindex`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(15_000)
    })
    return r.ok
  } catch {
    return false
  }
}

/** MCP gateway (:7862) → dashboard API (:7860). */
export function dashboardUrlFromBrainUrl(brainUrl: string): string {
  try {
    const u = new URL(brainUrl)
    u.port = '7860'
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return brainUrl.replace(/:7862\b/, ':7860').replace(/\/+$/, '')
  }
}

/**
 * Copy finished .md notes from a local staging dir into Brain's vault/distilled
 * tree — every file goes through the quality gate (frontmatter → _review/_weak/).
 * Also mirrors existing `_review/` and `_weak/` subdirs from staging.
 */
export async function deployDistilledFiles(notesDir: string, targetDir: string): Promise<number> {
  await fs.mkdir(targetDir, { recursive: true })
  let copied = 0
  for (const name of await fs.readdir(notesDir)) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue
    await copyNoteThroughQualityGate(path.join(notesDir, name), targetDir)
    copied++
  }
  for (const sub of ['_review', '_weak'] as const) {
    const src = path.join(notesDir, sub)
    if (
      !(await fs
        .access(src)
        .then(() => true)
        .catch(() => false))
    ) {
      continue
    }
    const dst = path.join(targetDir, sub)
    await fs.mkdir(dst, { recursive: true })
    for (const name of await fs.readdir(src)) {
      if (!name.endsWith('.md')) continue
      await fs.copyFile(path.join(src, name), path.join(dst, name))
      copied++
    }
  }
  log.info('deployed', copied, 'distilled files →', targetDir)
  return copied
}

/** POST pre-distilled markdown to Brain dashboard (KVM / homelab). */
export async function deployDistilledHttp(
  notesDir: string,
  dashboardUrl: string,
  token?: string
): Promise<{ ok: number; failed: number; api: 'save-note' | 'none' }> {
  const base = dashboardUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
  let ok = 0
  let failed = 0
  let api: 'save-note' | 'none' = 'none'
  for (const name of await fs.readdir(notesDir)) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue
    const markdown = await fs.readFile(path.join(notesDir, name), 'utf8')
    try {
      const r = await fetch(`${base}/api/vault/save-note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ markdown, filename: name }),
        signal: AbortSignal.timeout(60_000)
      })
      if (r.status === 404 && api === 'none') {
        log.warn('Brain save-note API not found — use filesystem deploy target or mount SMB share')
        return { ok: 0, failed: 1, api: 'none' }
      }
      api = 'save-note'
      r.ok ? ok++ : failed++
    } catch (e) {
      failed++
      log.warn('save-note failed:', name, (e as Error).message)
    }
  }
  return { ok, failed, api }
}

export interface DeployDistilledResult {
  copied: number
  httpOk: number
  httpFailed: number
  method: 'filesystem' | 'http' | 'none'
  reindex: boolean
}

/**
 * Push host-distilled notes to a remote Brain (KVM/homelab).
 * Prefers filesystem target (SMB/NFS mount); falls back to HTTP save-note API.
 */
export async function deployDistilledToBrain(opts: {
  notesDir: string
  dashboardUrl: string
  filesystemTarget?: string
  reindex?: boolean
  token?: string
}): Promise<DeployDistilledResult> {
  const dashboardUrl = dashboardUrlFromBrainUrl(opts.dashboardUrl)
  let copied = 0
  let httpOk = 0
  let httpFailed = 0
  let method: DeployDistilledResult['method'] = 'none'

  if (opts.filesystemTarget) {
    copied = await deployDistilledFiles(opts.notesDir, opts.filesystemTarget)
    method = 'filesystem'
  } else {
    const http = await deployDistilledHttp(opts.notesDir, dashboardUrl, opts.token)
    httpOk = http.ok
    httpFailed = http.failed
    method = http.api === 'none' ? 'none' : 'http'
    copied = httpOk
  }

  const reindex =
    opts.reindex !== false && method !== 'none'
      ? await triggerReindex(dashboardUrl, opts.token)
      : false
  return { copied, httpOk, httpFailed, method, reindex }
}
