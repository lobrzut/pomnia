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

/** Write distilled notes into a target directory (e.g. .../brain/data/vault/distilled). */
export async function deployFilesystem(notes: DistilledNote[], targetDir: string): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true })
  const written: string[] = []
  for (const n of notes) {
    const file = path.join(targetDir, noteFilename(n))
    await fs.writeFile(file, n.markdown, 'utf8')
    written.push(file)
  }
  log.info('deployed', written.length, 'notes →', targetDir)
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
    const r = await fetch(`${baseUrl}/api/library/reindex`, {
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
