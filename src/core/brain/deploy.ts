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

export function noteFilename(n: DistilledNote): string {
  return `${n.date}_${n.source}_${slug(n.title)}_${n.sessionId.slice(0, 8)}.md`
}

/** Write distilled notes into a target directory (e.g. .../brain/data/vault/distilled).
 *  Notes that failed the quality gate (stub/garbage) go into a `_review/`
 *  subfolder instead of the main dir — kept for manual review, not lost, but
 *  out of the searchable vault by default so they don't pollute RAG results. */
export async function deployFilesystem(notes: DistilledNote[], targetDir: string): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true })
  const reviewDir = path.join(targetDir, '_review')
  let reviewMade = false
  const written: string[] = []
  for (const n of notes) {
    const lowQuality = n.quality === 'stub' || n.quality === 'garbage'
    if (lowQuality && !reviewMade) {
      await fs.mkdir(reviewDir, { recursive: true })
      reviewMade = true
    }
    const file = path.join(lowQuality ? reviewDir : targetDir, noteFilename(n))
    await fs.writeFile(file, n.markdown, 'utf8')
    written.push(file)
  }
  const reviewed = written.length - notes.filter((n) => n.quality === 'ok').length
  log.info('deployed', notes.filter((n) => n.quality === 'ok').length, 'notes →', targetDir,
    reviewed ? `(${reviewed} low-quality → _review/)` : '')
  return written
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
export async function triggerReindex(baseUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/library/reindex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

/** Copy finished .md notes from a local staging dir into Brain's vault/distilled tree. */
export async function deployDistilledFiles(notesDir: string, targetDir: string): Promise<number> {
  await fs.mkdir(targetDir, { recursive: true })
  let copied = 0
  for (const name of await fs.readdir(notesDir)) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue
    await fs.copyFile(path.join(notesDir, name), path.join(targetDir, name))
    copied++
  }
  const reviewSrc = path.join(notesDir, '_review')
  if (
    await fs
      .access(reviewSrc)
      .then(() => true)
      .catch(() => false)
  ) {
    const reviewDst = path.join(targetDir, '_review')
    await fs.mkdir(reviewDst, { recursive: true })
    for (const name of await fs.readdir(reviewSrc)) {
      if (!name.endsWith('.md')) continue
      await fs.copyFile(path.join(reviewSrc, name), path.join(reviewDst, name))
      copied++
    }
  }
  log.info('deployed', copied, 'distilled files →', targetDir)
  return copied
}

/** POST pre-distilled markdown to Brain dashboard (KVM / homelab). */
export async function deployDistilledHttp(
  notesDir: string,
  dashboardUrl: string
): Promise<{ ok: number; failed: number; api: 'save-note' | 'none' }> {
  const base = dashboardUrl.replace(/\/+$/, '')
  let ok = 0
  let failed = 0
  let api: 'save-note' | 'none' = 'none'
  for (const name of await fs.readdir(notesDir)) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue
    const markdown = await fs.readFile(path.join(notesDir, name), 'utf8')
    try {
      const r = await fetch(`${base}/api/vault/save-note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
    const http = await deployDistilledHttp(opts.notesDir, dashboardUrl)
    httpOk = http.ok
    httpFailed = http.failed
    method = http.api === 'none' ? 'none' : 'http'
    copied = httpOk
  }

  const reindex = opts.reindex !== false && method !== 'none' ? await triggerReindex(dashboardUrl) : false
  return { copied, httpOk, httpFailed, method, reindex }
}
