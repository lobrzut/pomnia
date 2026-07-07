/**
 * Import knowledge the user ALREADY has — official export archives from other
 * assistants — into Pomnia's normalized model, so they flow through the same
 * Distill → Pre-index → Deploy pipeline. This is the on-ramp: "draw from the
 * knowledge you already have somewhere."
 *
 * Supported:
 *   - Claude.ai export   (conversations.json: [{uuid,name,chat_messages:[{sender,text|content}]}])
 *   - ChatGPT export     (conversations.json: [{title,mapping:{id:{message:{author,content.parts}}}}])
 *   - Grok / Gemini      (best-effort generic conversation extraction)
 *   - generic JSON/JSONL/MD/TXT
 *
 * ZIP archives are unpacked in-memory with fflate (pure JS, no native deps).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import type { Conversation, Message, Role, SourceId } from '../model.js'
import { sanitizeUnicode } from '../brain/distill.js'

export interface ImportResult {
  conversations: Conversation[]
  detected: string
  perSource: Record<string, number>
}

let counter = 0
const rid = () => `imp-${Date.now().toString(36)}-${(counter++).toString(36)}`

function txt(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return sanitizeUnicode(v)
  if (Array.isArray(v))
    return v
      .map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? ''))
      .filter(Boolean)
      .join('\n')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return sanitizeUnicode(o.text)
    if (o.parts || o.content) return txt(o.parts ?? o.content)
  }
  return ''
}

function isoFrom(v: unknown): string | undefined {
  if (typeof v === 'number') return new Date(v * (v > 1e12 ? 1 : 1000)).toISOString()
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

function asConvArray(j: unknown): Record<string, unknown>[] {
  if (Array.isArray(j)) return j as Record<string, unknown>[]
  const o = j as Record<string, unknown>
  for (const k of ['conversations', 'data', 'items', 'chats']) {
    if (Array.isArray(o?.[k])) return o[k] as Record<string, unknown>[]
  }
  return o && typeof o === 'object' ? [o] : []
}

function finalize(c: Conversation): Conversation | null {
  c.messages = c.messages.filter((m) => m.text.trim())
  if (!c.messages.length) return null
  if (!c.title) c.title = c.messages.find((m) => m.role === 'user')?.text.slice(0, 80) || c.id
  c.title = c.title.replace(/\s+/g, ' ').slice(0, 80)
  return c
}

function parseClaudeAi(arr: Record<string, unknown>[]): Conversation[] {
  const out: Conversation[] = []
  for (const c of arr) {
    const raw = (c.chat_messages || c.messages) as Record<string, unknown>[] | undefined
    if (!Array.isArray(raw)) continue
    const messages: Message[] = raw.map((m) => ({
      role: (m.sender === 'human' || m.role === 'user' ? 'user' : 'assistant') as Role,
      text: txt(m.text ?? m.content),
      ts: isoFrom(m.created_at)
    }))
    const conv = finalize({
      id: String(c.uuid || c.id || rid()),
      source: 'claude-ai',
      title: String(c.name || c.title || ''),
      createdAt: isoFrom(c.created_at),
      updatedAt: isoFrom(c.updated_at),
      messages
    })
    if (conv) out.push(conv)
  }
  return out
}

function parseChatGPT(arr: Record<string, unknown>[]): Conversation[] {
  const out: Conversation[] = []
  for (const c of arr) {
    const mapping = c.mapping as Record<string, { message?: any }> | undefined
    if (!mapping) continue
    const nodes = Object.values(mapping)
      .filter((n) => n.message && n.message.content)
      .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0))
    const messages: Message[] = []
    for (const n of nodes) {
      const role = n.message.author?.role
      if (role === 'system' || role === 'tool') continue
      const text = txt(n.message.content?.parts ?? n.message.content)
      if (text.trim()) messages.push({ role: role === 'user' ? 'user' : 'assistant', text, ts: isoFrom(n.message.create_time) })
    }
    const conv = finalize({
      id: String(c.id || c.conversation_id || rid()),
      source: 'chatgpt',
      title: String(c.title || ''),
      createdAt: isoFrom(c.create_time),
      updatedAt: isoFrom(c.update_time),
      messages
    })
    if (conv) out.push(conv)
  }
  return out
}

/** Best-effort: each item is a conversation with some array of messages. */
function parseGeneric(arr: Record<string, unknown>[], source: SourceId): Conversation[] {
  const out: Conversation[] = []
  for (const item of arr) {
    const raw = (item.messages || item.chat_messages || item.conversation || item.responses || item.turns) as
      | Record<string, unknown>[]
      | undefined
    if (!Array.isArray(raw)) continue
    const messages: Message[] = raw.map((m) => {
      const role = (m.role || m.sender || (m.author as { role?: string })?.role || (m.from as string)) as string
      return {
        role: (role === 'user' || role === 'human' ? 'user' : role === 'system' ? 'system' : 'assistant') as Role,
        text: txt(m.text ?? m.content ?? m.message ?? m.parts),
        ts: isoFrom(m.created_at ?? m.create_time ?? m.timestamp)
      }
    })
    const conv = finalize({
      id: String(item.id || item.uuid || rid()),
      source,
      title: String(item.title || item.name || ''),
      createdAt: isoFrom(item.created_at ?? item.create_time),
      messages
    })
    if (conv) out.push(conv)
  }
  return out
}

function parseJsonl(text: string, source: SourceId, name: string): Conversation[] {
  const messages: Message[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t) as Record<string, unknown>
      const role = (o.role || o.sender || (o.author as { role?: string })?.role) as string
      const text = txt(o.text ?? o.content ?? o.message)
      if (text.trim()) messages.push({ role: (role === 'user' || role === 'human' ? 'user' : 'assistant') as Role, text })
    } catch {
      /* skip */
    }
  }
  const conv = finalize({ id: rid(), source, title: path.basename(name), messages })
  return conv ? [conv] : []
}

function detectSource(name: string, json: unknown): SourceId {
  const n = name.toLowerCase()
  if (/grok/.test(n)) return 'grok'
  if (/gemini|takeout/.test(n)) return 'gemini'
  const arr = asConvArray(json)
  if (arr.some((x) => x?.mapping)) return 'chatgpt'
  if (arr.some((x) => x?.chat_messages)) return 'claude-ai'
  if (/chatgpt|openai/.test(n)) return 'chatgpt'
  if (/claude/.test(n)) return 'claude-ai'
  return 'generic'
}

function routeJson(json: unknown, name: string): Conversation[] {
  const source = detectSource(name, json)
  const arr = asConvArray(json)
  if (source === 'chatgpt' || arr.some((x) => x?.mapping)) return parseChatGPT(arr)
  if (source === 'claude-ai' || arr.some((x) => x?.chat_messages)) return parseClaudeAi(arr)
  return parseGeneric(arr, source)
}

/** Parse a single file's bytes (zip / json / jsonl / md) into conversations. */
export function parseExportBuffer(buf: Uint8Array, filename: string): ImportResult {
  const conversations: Conversation[] = []
  const isZip = buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b // "PK"

  if (isZip) {
    const files = unzipSync(buf)
    // Prefer conversations.json; otherwise any *.json.
    const names = Object.keys(files).sort((a, b) =>
      (/conversations?\.json$/i.test(b) ? 1 : 0) - (/conversations?\.json$/i.test(a) ? 1 : 0)
    )
    for (const n of names) {
      if (!/\.jsonl?$/i.test(n)) continue
      const text = strFromU8(files[n])
      try {
        if (n.toLowerCase().endsWith('.jsonl')) conversations.push(...parseJsonl(text, detectSource(filename, null), n))
        else conversations.push(...routeJson(JSON.parse(text), filename || n))
      } catch {
        /* skip malformed entry */
      }
    }
  } else {
    const text = strFromU8(buf)
    const lower = filename.toLowerCase()
    if (lower.endsWith('.jsonl')) conversations.push(...parseJsonl(text, detectSource(filename, null), filename))
    else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const conv = finalize({ id: rid(), source: 'generic', title: path.basename(filename), messages: [{ role: 'user', text: sanitizeUnicode(text) }] })
      if (conv) conversations.push(conv)
    } else {
      try {
        conversations.push(...routeJson(JSON.parse(text), filename))
      } catch {
        /* not json */
      }
    }
  }

  const perSource: Record<string, number> = {}
  for (const c of conversations) perSource[c.source] = (perSource[c.source] || 0) + 1
  const detected = Object.keys(perSource).join('+') || 'none'
  return { conversations, detected, perSource }
}

/** Read and parse a single export file from disk. */
export async function parseExportFile(file: string): Promise<ImportResult> {
  const buf = await fs.readFile(file)
  return parseExportBuffer(new Uint8Array(buf), path.basename(file))
}

/** Parse a file or every export-like file in a directory. */
export async function parseExportPath(p: string): Promise<ImportResult> {
  const st = await fs.stat(p)
  if (st.isFile()) return parseExportFile(p)
  const entries = await fs.readdir(p)
  const all: Conversation[] = []
  for (const e of entries) {
    if (!/\.(zip|json|jsonl|md|txt)$/i.test(e)) continue
    const r = await parseExportFile(path.join(p, e))
    all.push(...r.conversations)
  }
  const perSource: Record<string, number> = {}
  for (const c of all) perSource[c.source] = (perSource[c.source] || 0) + 1
  return { conversations: all, detected: Object.keys(perSource).join('+') || 'none', perSource }
}
