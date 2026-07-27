// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BackupOptions, Conversation, DetectedSource, Message, OS } from '../model.js'
import { descriptorFor } from '../locations.js'
import { homeDir } from '../platform.js'
import { pathExists, walk } from '../fsutil.js'
import { log } from '../log.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import { queryItemTable, vscdbPath } from './vscdb.js'
import type { Adapter, CollectedFile } from './types.js'
import { DEFAULT_MAX_FILE } from './types.js'

const ID = 'antigravity' as const

/** Cascade transcripts + per-session DBs live here (not under %APPDATA%/Antigravity). */
export function geminiAntigravityRoot(home: string): string {
  return path.join(home, '.gemini', 'antigravity')
}

function transcriptPath(brainRoot: string, sessionId: string): string {
  return path.join(brainRoot, sessionId, '.system_generated', 'logs', 'transcript.jsonl')
}

function stripXmlBlocks(text: string): string {
  const req = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i)
  if (req) return req[1].replace(/\s+/g, ' ').trim()
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function roleFromLine(obj: Record<string, unknown>): Message['role'] | null {
  const type = String(obj.type ?? '')
  const source = String(obj.source ?? '')
  if (type === 'USER_INPUT' || source === 'USER_EXPLICIT') return 'user'
  if (source === 'MODEL' || type.includes('PLANNER') || type.includes('RESPONSE')) return 'assistant'
  if (type === 'CONVERSATION_HISTORY' || (source === 'SYSTEM' && !obj.content)) return null
  if (typeof obj.content === 'string' && obj.content.trim()) {
    if (source.includes('USER')) return 'user'
    return 'assistant'
  }
  return null
}

function textFromLine(obj: Record<string, unknown>): string {
  if (typeof obj.content !== 'string') return ''
  return stripXmlBlocks(obj.content)
}

/** Parse Cascade transcript.jsonl files under ~/.gemini/antigravity/brain/<session>/. */
export async function readAntigravityTranscripts(home: string): Promise<Conversation[]> {
  const brainRoot = path.join(geminiAntigravityRoot(home), 'brain')
  if (!(await pathExists(brainRoot))) return []

  const convs: Conversation[] = []
  for (const ent of await fs.readdir(brainRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'tempmediaStorage') continue
    const sessionId = ent.name
    const tpath = transcriptPath(brainRoot, sessionId)
    if (!(await pathExists(tpath))) continue

    const messages: Message[] = []
    let createdAt: string | undefined
    let title: string | undefined

    let raw: string
    try {
      raw = await fs.readFile(tpath, 'utf8')
    } catch {
      continue
    }

    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(t)
      } catch {
        continue
      }
      const ts = typeof obj.created_at === 'string' ? obj.created_at : undefined
      if (ts && !createdAt) createdAt = ts
      const role = roleFromLine(obj)
      const text = textFromLine(obj)
      if (!role || !text) continue
      messages.push({ role, text, ts })
      if (role === 'user' && !title) title = text.slice(0, 80)
    }

    if (messages.length) {
      convs.push({
        id: sessionId,
        source: ID,
        title: title || sessionId.slice(0, 8),
        messages,
        createdAt
      })
    }
  }
  return convs
}

/** Optional titles from IDE state.vscdb when User profile exists. */
async function titlesFromVscdb(appRoot: string): Promise<Map<string, string>> {
  const db = vscdbPath(appRoot, 'User')
  if (!(await pathExists(db))) return new Map()
  const rows = await queryItemTable(db, "key = 'chat.ChatSessionStore.index'")
  const out = new Map<string, string>()
  for (const { value } of rows) {
    try {
      const v = JSON.parse(value) as { entries?: Record<string, { title?: string; sessionId?: string }> }
      for (const [id, ent] of Object.entries(v.entries ?? {})) {
        const title = ent?.title?.trim()
        if (title) out.set(ent.sessionId ?? id, title.slice(0, 80))
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

export async function readAntigravityConversations(appRoot: string, home = homeDir()): Promise<Conversation[]> {
  const convs = await readAntigravityTranscripts(home)
  const titles = await titlesFromVscdb(appRoot)
  for (const c of convs) {
    const t = titles.get(c.id)
    if (t && (c.title === c.id.slice(0, 8) || !c.title)) c.title = t
  }
  return convs
}

async function collectGeminiFiles(home: string, opts: BackupOptions): Promise<CollectedFile[]> {
  const root = geminiAntigravityRoot(home)
  if (!(await pathExists(root))) return []
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE
  const exclude = ['tempmediaStorage']
  const keepTop = ['brain', 'conversations', 'knowledge', 'annotations', 'mcp_config.json', 'installation_id']
  const files: CollectedFile[] = []
  for await (const f of walk(root, { exclude, keepTop, maxFileBytes })) {
    files.push({
      ...f,
      relPath: path.posix.join('gemini', f.relPath.replace(/\\/g, '/')),
      pathSensitive: false
    })
  }
  return files
}

export const antigravityAdapter: Adapter = {
  id: ID,
  label: 'Antigravity',
  resolveRoot: (os: OS, home: string) => descriptorFor(ID)!.root(os, home),

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    if (d.installed) {
      try {
        d.conversations = (await readAntigravityConversations(d.root)).length
      } catch (e) {
        log.warn('antigravity conversation probe failed:', (e as Error).message)
      }
      if ((d.conversations ?? 0) > 0) {
        d.notes = [
          ...(d.notes ?? []),
          'Chats parsed from ~/.gemini/antigravity/brain/*/transcript.jsonl'
        ]
      }
    }
    return d
  },

  collectConversations(root: string) {
    return readAntigravityConversations(root)
  },

  async collectFiles(root: string, opts: BackupOptions) {
    const appFiles = await collectFilesFromDescriptor(ID, root, opts)
    const geminiFiles = await collectGeminiFiles(homeDir(), opts)
    return [...appFiles, ...geminiFiles]
  }
}
