// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Distill inbox: JSON conversation files under vault/state/distill-inbox/.
 * Desktop Connect→enqueue can drop files here later; CLI/admin can POST bodies.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import type { DistillConversation, DistillMessage, DistillRole } from './types.js'

export const DISTILL_INBOX_REL = 'state/distill-inbox' as const
export const DISTILL_LEDGER_REL = 'state/distill-ledger.json' as const

function isRole(r: unknown): r is DistillRole {
  return r === 'user' || r === 'assistant' || r === 'system' || r === 'tool'
}

export function parseConversation(raw: unknown): DistillConversation | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return null
  const source =
    typeof o.source === 'string' && o.source.trim() ? o.source.trim() : 'generic'
  if (!Array.isArray(o.messages)) return null
  const messages: DistillMessage[] = []
  for (const m of o.messages) {
    if (!m || typeof m !== 'object') continue
    const msg = m as Record<string, unknown>
    if (!isRole(msg.role)) continue
    const text =
      typeof msg.text === 'string'
        ? msg.text
        : typeof msg.content === 'string'
          ? msg.content
          : ''
    if (!text) continue
    messages.push({
      role: msg.role,
      text,
      ts: typeof msg.ts === 'string' ? msg.ts : undefined,
    })
  }
  return {
    id: o.id,
    source,
    title: typeof o.title === 'string' ? o.title : o.id,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : undefined,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    messages,
  }
}

export async function loadInbox(vaultRoot: string): Promise<{
  conversations: DistillConversation[]
  files: string[]
}> {
  const dir = join(vaultRoot, DISTILL_INBOX_REL)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return { conversations: [], files: [] }
  }
  const conversations: DistillConversation[] = []
  const files: string[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue
    const path = join(dir, name)
    try {
      const text = await fs.readFile(path, 'utf8')
      const conv = parseConversation(JSON.parse(text))
      if (conv) {
        conversations.push(conv)
        files.push(path)
      }
    } catch {
      /* skip bad file */
    }
  }
  return { conversations, files }
}

export async function archiveInboxFiles(files: string[], vaultRoot: string): Promise<void> {
  const doneDir = join(vaultRoot, DISTILL_INBOX_REL, '_done')
  await fs.mkdir(doneDir, { recursive: true })
  for (const f of files) {
    const base = f.replace(/^.*[/\\]/, '')
    try {
      await fs.rename(f, join(doneDir, base))
    } catch {
      /* leave in place on failure */
    }
  }
}

export interface DistillLedgerFile {
  processed: Record<string, string>
  updatedAt?: string
}

export async function readDistillLedger(vaultRoot: string): Promise<DistillLedgerFile> {
  const path = join(vaultRoot, DISTILL_LEDGER_REL)
  try {
    const j = JSON.parse(await fs.readFile(path, 'utf8')) as DistillLedgerFile
    return { processed: j.processed && typeof j.processed === 'object' ? j.processed : {} }
  } catch {
    return { processed: {} }
  }
}

export async function markDistillProcessed(
  vaultRoot: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  const cur = await readDistillLedger(vaultRoot)
  const now = new Date().toISOString()
  for (const id of ids) cur.processed[id] = now
  cur.updatedAt = now
  const path = join(vaultRoot, DISTILL_LEDGER_REL)
  await fs.mkdir(join(vaultRoot, 'state'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(cur, null, 2) + '\n', 'utf8')
}

export function pendingOnly(
  convs: DistillConversation[],
  processed: Record<string, string>,
): DistillConversation[] {
  return convs.filter((c) => !processed[c.id])
}
