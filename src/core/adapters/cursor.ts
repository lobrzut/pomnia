// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { conversationTitle } from './conversationTitle.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BackupOptions, Conversation, DetectedSource, Message, OS } from '../model.js'
import { descriptorFor } from '../locations.js'
import { pathExists, walk } from '../fsutil.js'
import { homeDir } from '../platform.js'
import { log } from '../log.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import type { Adapter, CollectedFile } from './types.js'
import { DEFAULT_MAX_FILE } from './types.js'

const execFileAsync = promisify(execFile)
const ID = 'cursor' as const

/** sql.js loads the whole DB into RAM; large files also stall the Electron main process on readFile. */
const MAX_CURSOR_DB_BYTES = 256 * 1024 * 1024

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.round(n / 1024)} KB`
}

export function cursorDbPath(root: string): string {
  return path.join(root, 'globalStorage', 'state.vscdb')
}

/** Cursor Agent mode transcripts live outside AppData (per project). */
export function cursorProjectsRoot(home = homeDir()): string {
  return path.join(home, '.cursor', 'projects')
}

export async function cursorDbStat(root: string): Promise<{ size: number; path: string } | null> {
  const dbPath = cursorDbPath(root)
  if (!(await pathExists(dbPath))) return null
  const st = await fs.stat(dbPath)
  return { size: st.size, path: dbPath }
}

export async function isCursorDbTooLarge(root: string): Promise<boolean> {
  const st = await cursorDbStat(root)
  return !!st && st.size > MAX_CURSOR_DB_BYTES
}

/** Lazy-load sql.js (WASM). Returns null if the dependency isn't installed. */
async function loadSql(): Promise<any | null> {
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const initSqlJs = require('sql.js')
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    return await initSqlJs({ locateFile: () => wasmPath })
  } catch (e) {
    log.warn('sql.js unavailable — Cursor chat extraction skipped (raw DB still captured):', (e as Error).message)
    return null
  }
}

function richToText(v: any): string {
  if (typeof v === 'string') return v
  if (!v || typeof v !== 'object') return ''
  if (typeof v.text === 'string') return v.text
  // ProseMirror-ish rich text: walk content nodes.
  if (Array.isArray(v.content)) return v.content.map(richToText).filter(Boolean).join('')
  if (Array.isArray(v.root?.children)) return v.root.children.map(richToText).filter(Boolean).join('\n')
  if (Array.isArray(v.children)) return v.children.map(richToText).filter(Boolean).join('')
  return ''
}

function bubbleRole(type: unknown): Message['role'] {
  // Cursor convention: 1 = user, 2 = assistant.
  return type === 1 || type === '1' ? 'user' : 'assistant'
}

function agentContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) parts.push(b.text)
  }
  return parts.join('\n').trim()
}

/**
 * Count composerData keys without loading the whole DB into JS heap (sql.js).
 * Tries node:sqlite (Node 22+), then system `sqlite3` CLI.
 */
export async function countCursorComposersLight(dbPath: string): Promise<number | null> {
  const sql =
    "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'composerData:%'"

  try {
    const mod: any = await import('node:sqlite')
    const DatabaseSync = mod.DatabaseSync
    if (DatabaseSync) {
      const db = new DatabaseSync(dbPath, { readOnly: true })
      try {
        const row = db.prepare(sql).get() as Record<string, number> | undefined
        const n = row ? Number(Object.values(row)[0] ?? 0) : 0
        return Number.isFinite(n) ? n : null
      } finally {
        try {
          db.close()
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* node:sqlite unavailable — try CLI */
  }

  try {
    const { stdout } = await execFileAsync('sqlite3', [dbPath, sql], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    })
    const n = parseInt(String(stdout).trim(), 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Parent agent sessions only — skip subagents/<uuid>.jsonl. */
export async function listCursorAgentTranscriptFiles(
  home = homeDir()
): Promise<Array<{ id: string; project: string; file: string }>> {
  const projectsRoot = cursorProjectsRoot(home)
  if (!(await pathExists(projectsRoot))) return []

  const out: Array<{ id: string; project: string; file: string }> = []
  let projects: import('node:fs').Dirent[]
  try {
    projects = await fs.readdir(projectsRoot, { withFileTypes: true })
  } catch {
    return []
  }

  for (const proj of projects) {
    if (!proj.isDirectory()) continue
    const atRoot = path.join(projectsRoot, proj.name, 'agent-transcripts')
    if (!(await pathExists(atRoot))) continue
    let sessions: import('node:fs').Dirent[]
    try {
      sessions = await fs.readdir(atRoot, { withFileTypes: true })
    } catch {
      continue
    }
    for (const sess of sessions) {
      if (!sess.isDirectory()) continue
      const id = sess.name
      const file = path.join(atRoot, id, `${id}.jsonl`)
      if (await pathExists(file)) out.push({ id, project: proj.name, file })
    }
  }
  return out
}

/** Parse Cursor agent-transcripts JSONL (role + message.content[]). */
export async function readCursorAgentTranscripts(home = homeDir()): Promise<Conversation[]> {
  const files = await listCursorAgentTranscriptFiles(home)
  const byId = new Map<string, Conversation>()

  for (const { id, project, file } of files) {
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }

    const messages: Message[] = []
    let title: string | undefined
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t) continue
      let obj: { role?: string; message?: { content?: unknown } }
      try {
        obj = JSON.parse(t)
      } catch {
        continue
      }
      const roleRaw = String(obj.role ?? '')
      const role: Message['role'] | null =
        roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system' || roleRaw === 'tool'
          ? roleRaw
          : null
      const text = agentContentText(obj.message?.content)
      if (!role || !text) continue
      messages.push({ role, text })
      if (role === 'user' && !title) title = conversationTitle(text)
    }

    if (!messages.length) continue
    const existing = byId.get(id)
    // Same session id can appear under multiple project folders — keep richer copy.
    if (!existing || messages.length > existing.messages.length) {
      byId.set(id, {
        id,
        source: ID,
        title: title || id.slice(0, 8),
        project,
        messages,
        meta: { origin: 'agent-transcripts' }
      })
    }
  }

  return [...byId.values()]
}

/** Best-effort extraction of composers/chats from Cursor's state.vscdb. */
export async function readCursorVscdbConversations(root: string): Promise<Conversation[]> {
  const st = await cursorDbStat(root)
  if (!st) return []
  if (st.size > MAX_CURSOR_DB_BYTES) {
    log.warn(
      `Cursor DB too large (${fmtBytes(st.size)} > ${fmtBytes(MAX_CURSOR_DB_BYTES)}) — skip sql.js parse; using agent-transcripts if present`
    )
    return []
  }
  const dbPath = st.path
  const SQL = await loadSql()
  if (!SQL) return []

  let db: any
  try {
    db = new SQL.Database(await fs.readFile(dbPath))
  } catch (e) {
    log.warn('could not open Cursor DB:', (e as Error).message)
    return []
  }

  const convs = new Map<string, Conversation>()
  const ensure = (cid: string): Conversation => {
    let c = convs.get(cid)
    if (!c) {
      c = { id: cid, source: ID, title: cid.slice(0, 8), messages: [] }
      convs.set(cid, c)
    }
    return c
  }

  const queryKV = (sql: string): Array<{ key: string; value: string }> => {
    try {
      const res = db.exec(sql)
      if (!res.length) return []
      return res[0].values.map((row: any[]) => ({ key: String(row[0]), value: String(row[1]) }))
    } catch {
      return []
    }
  }

  // cursorDiskKV holds composers + message bubbles in recent Cursor versions.
  for (const { key, value } of queryKV(
    "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' OR key LIKE 'bubbleId:%'"
  )) {
    try {
      const v = JSON.parse(value)
      if (key.startsWith('composerData:')) {
        const cid = key.slice('composerData:'.length)
        const c = ensure(cid)
        c.title = (v.name || v.title || c.title || cid).toString().slice(0, 80)
        c.createdAt = v.createdAt ? new Date(v.createdAt).toISOString() : c.createdAt
        if (Array.isArray(v.conversation)) {
          for (const m of v.conversation) {
            const text = m.text || richToText(m.richText) || richToText(m)
            if (text?.trim()) c.messages.push({ role: bubbleRole(m.type), text })
          }
        }
      } else {
        // bubbleId:<composerId>:<bubbleId>
        const parts = key.split(':')
        const cid = parts[1] ?? 'unknown'
        const text = v.text || richToText(v.richText) || richToText(v)
        if (text?.trim()) ensure(cid).messages.push({ role: bubbleRole(v.type), text })
      }
    } catch {
      /* skip malformed row */
    }
  }

  // Older Cursor: ItemTable → composer.composerData with allComposers + chat history.
  for (const { value } of queryKV(
    "SELECT key, value FROM ItemTable WHERE key IN ('composer.composerData','workbench.panel.aichat.view.aichat.chatdata')"
  )) {
    try {
      const v = JSON.parse(value)
      const lists = [v.allComposers, v.tabs, v.chats].filter(Array.isArray)
      for (const list of lists) {
        for (const item of list) {
          const cid = item.composerId || item.id || item.tabId || JSON.stringify(item).slice(0, 16)
          const c = ensure(String(cid))
          if (item.name || item.title) c.title = String(item.name || item.title).slice(0, 80)
          const msgs = item.conversation || item.messages || item.bubbles || []
          for (const m of msgs) {
            const text = m.text || richToText(m.richText) || richToText(m)
            if (text?.trim()) c.messages.push({ role: bubbleRole(m.type), text })
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  try {
    db.close()
  } catch {
    /* ignore */
  }

  return [...convs.values()]
    .filter((c) => c.messages.length > 0)
    .map((c) => ({ ...c, meta: { ...c.meta, origin: 'state.vscdb' } }))
}

function mergeConversations(a: Conversation[], b: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>()
  for (const c of [...a, ...b]) {
    const prev = map.get(c.id)
    if (!prev || c.messages.length > prev.messages.length) map.set(c.id, c)
  }
  return [...map.values()]
}

/** Full Cursor conversation set: state.vscdb (when parseable) ∪ ~/.cursor/.../agent-transcripts. */
export async function readCursorConversations(root: string, home = homeDir()): Promise<Conversation[]> {
  const [fromDb, fromAgents] = await Promise.all([
    readCursorVscdbConversations(root),
    readCursorAgentTranscripts(home)
  ])
  return mergeConversations(fromDb, fromAgents)
}

async function collectAgentTranscriptFiles(home: string, opts: BackupOptions): Promise<CollectedFile[]> {
  const root = cursorProjectsRoot(home)
  if (!(await pathExists(root))) return []
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE
  const files: CollectedFile[] = []
  for await (const f of walk(root, { maxFileBytes })) {
    // Keep parent transcripts + skip obvious junk; include subagents for fidelity.
    if (!f.relPath.includes('agent-transcripts/')) continue
    if (!f.relPath.endsWith('.jsonl')) continue
    files.push({
      ...f,
      relPath: path.posix.join('cursor-agent-transcripts', f.relPath.replace(/\\/g, '/')),
      pathSensitive: false
    })
  }
  return files
}

export const cursorAdapter: Adapter = {
  id: ID,
  label: 'Cursor',
  resolveRoot: (os: OS, home: string) => descriptorFor(ID)!.root(os, home),

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    if (!d.installed) return d

    const st = await cursorDbStat(d.root)
    // dirSize skips files > DEFAULT_MAX_FILE — fold oversized state.vscdb back in.
    if (st && st.size > DEFAULT_MAX_FILE) d.sizeBytes += st.size

    const agents = await readCursorAgentTranscripts(homeDir()).catch(() => [] as Conversation[])
    const agentCount = agents.length
    const tooLarge = !!(st && st.size > MAX_CURSOR_DB_BYTES)

    if (tooLarge) {
      const light = st ? await countCursorComposersLight(st.path) : null
      // Prefer parseable agent-transcripts (messages). Light COUNT is keys only — may include empty shells.
      if (agentCount > 0) d.conversations = agentCount
      else if (light != null) d.conversations = light
      else d.conversations = undefined
      const bits = [
        `state.vscdb is ${fmtBytes(st!.size)} — full in-app SQLite parse skipped (sql.js would freeze).`
      ]
      if (agentCount > 0) bits.push(`${agentCount} chats from ~/.cursor/projects/*/agent-transcripts.`)
      if (light != null) bits.push(`${light} composerData keys (light SQLite probe; not fully parsed).`)
      if (agentCount === 0 && light == null) {
        bits.push('Chat count unknown — no agent-transcripts and no sqlite probe; DB too large for sql.js.')
      }
      d.notes = [...(d.notes ?? []), ...bits]
      return d
    }

    try {
      d.conversations = (await readCursorConversations(d.root)).length
    } catch {
      d.conversations = agentCount > 0 ? agentCount : undefined
    }
    if (agentCount > 0) {
      d.notes = [
        ...(d.notes ?? []),
        `Includes ${agentCount} agent-transcript session(s) under ~/.cursor/projects`
      ]
    }
    return d
  },

  collectConversations(root: string) {
    return readCursorConversations(root)
  },

  async collectFiles(root: string, opts: BackupOptions) {
    const appFiles = await collectFilesFromDescriptor(ID, root, opts)
    const agentFiles = await collectAgentTranscriptFiles(homeDir(), opts)
    return [...appFiles, ...agentFiles]
  }
}
