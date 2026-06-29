import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BackupOptions, Conversation, DetectedSource, Message, OS } from '../model.js'
import { descriptorFor } from '../locations.js'
import { pathExists } from '../fsutil.js'
import { log } from '../log.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import type { Adapter } from './types.js'

const ID = 'cursor' as const

/** Lazy-load sql.js (WASM). Returns null if the dependency isn't installed. */
async function loadSql(): Promise<any | null> {
  try {
    const mod: any = await import('sql.js')
    const initSqlJs = mod.default ?? mod
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
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

/** Best-effort extraction of composers/chats from Cursor's state.vscdb. */
export async function readCursorConversations(root: string): Promise<Conversation[]> {
  const dbPath = path.join(root, 'globalStorage', 'state.vscdb')
  if (!(await pathExists(dbPath))) return []
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

  return [...convs.values()].filter((c) => c.messages.length > 0)
}

export const cursorAdapter: Adapter = {
  id: ID,
  label: 'Cursor',
  resolveRoot: (os: OS, home: string) => descriptorFor(ID)!.root(os, home),

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    if (d.installed) {
      try {
        d.conversations = (await readCursorConversations(d.root)).length
      } catch {
        d.conversations = undefined
      }
    }
    return d
  },

  collectConversations(root: string) {
    return readCursorConversations(root)
  },

  collectFiles(root: string, opts: BackupOptions) {
    return collectFilesFromDescriptor(ID, root, opts)
  }
}
