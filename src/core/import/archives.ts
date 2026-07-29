// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Import knowledge the user ALREADY has — official export archives from other
 * assistants — into Pomnia's normalized model, so they flow through the same
 * Distill → Pre-index → Deploy pipeline. This is the on-ramp: "draw from the
 * knowledge you already have somewhere."
 *
 * Supported:
 *   - Claude.ai export   (conversations.json: [{uuid,name,chat_messages:[{sender,text|content}]}])
 *   - ChatGPT export     (conversations.json: [{title,mapping:{id:{message:{author,content.parts}}}}])
 *   - Gemini Takeout     (My Activity/Gemini Apps/MyActivity.json — activity log → group by chat id)
 *   - Grok / generic     (best-effort conversation extraction)
 *   - generic JSON/JSONL/MD/TXT
 *
 * ZIP archives are unpacked in-memory with fflate (pure JS, no native deps).
 */
import { createHash } from 'node:crypto'
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

function contentId(source: string, title: string, messages: Message[]): string {
  const h = createHash('sha256')
  h.update(source).update('\0').update(title).update('\0')
  for (const m of messages) h.update(m.role).update('\0').update(m.text).update('\0')
  return `imp-${h.digest('hex').slice(0, 32)}`
}

/** Content fingerprint for import dedup (source + title + role/text — not ts/meta). */
export function conversationFingerprint(c: Conversation): string {
  const h = createHash('sha256')
  h.update(c.source).update('\0').update(c.title).update('\0')
  for (const m of c.messages) h.update(m.role).update('\0').update(m.text).update('\0')
  return h.digest('hex').slice(0, 32)
}

export interface ClassifyImportResult {
  toWrite: Conversation[]
  added: number
  updated: number
  skipped: number
}

/** Classify conversations against existing id→fingerprint map (from vault snapshots). */
export function classifyImportConversations(
  conversations: Conversation[],
  existingFingerprints: Map<string, string>,
): ClassifyImportResult {
  const toWrite: Conversation[] = []
  let added = 0
  let updated = 0
  let skipped = 0
  for (const c of conversations) {
    const fp = conversationFingerprint(c)
    const prev = existingFingerprints.get(c.id)
    if (prev === undefined) {
      added++
      toWrite.push(c)
    } else if (prev !== fp) {
      updated++
      toWrite.push(c)
    } else {
      skipped++
    }
  }
  return { toWrite, added, updated, skipped }
}

/** Sidecar / metadata files in Claude.ai (and similar) zips — not conversations. */
const SKIP_ZIP_BASENAMES = new Set([
  'users.json',
  'projects.json',
  'memories.json',
  'memory.json',
  'billing.json',
  'account.json',
  'profile.json',
])

function basenameLower(entryPath: string): string {
  const norm = entryPath.replace(/\\/g, '/')
  const base = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm
  return base.toLowerCase()
}

function txt(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return sanitizeUnicode(v)
  if (Array.isArray(v))
    return v
      .map((p) => {
        if (typeof p === 'string') return p
        const o = p as { text?: string; thinking?: string; type?: string }
        if (typeof o.text === 'string') return o.text
        if (o.type === 'thinking' && typeof o.thinking === 'string') return o.thinking
        return ''
      })
      .filter(Boolean)
      .join('\n')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return sanitizeUnicode(o.text)
    if (o.parts || o.content) return txt(o.parts ?? o.content)
  }
  return ''
}

/** Prefer non-empty text; Claude often ships `text: ""` with real body in `content[]`. */
function messageBody(m: Record<string, unknown>): string {
  const direct = typeof m.text === 'string' ? m.text : ''
  if (direct.trim()) return sanitizeUnicode(direct)
  return txt(m.content ?? m.parts ?? m.message)
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
      text: messageBody(m),
      ts: isoFrom(m.created_at)
    }))
    const project =
      typeof c.project_uuid === 'string' && c.project_uuid
        ? c.project_uuid
        : typeof c.project === 'string'
          ? c.project
          : undefined
    const title = String(c.name || c.title || '')
    const conv = finalize({
      id: String(c.uuid || c.id || contentId('claude-ai', title, messages)),
      source: 'claude-ai',
      title,
      createdAt: isoFrom(c.created_at),
      updatedAt: isoFrom(c.updated_at),
      project,
      messages,
      meta: project ? { project_uuid: project } : undefined
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
    const title = String(c.title || '')
    const conv = finalize({
      id: String(c.id || c.conversation_id || contentId('chatgpt', title, messages)),
      source: 'chatgpt',
      title,
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
        text: messageBody(m),
        ts: isoFrom(m.created_at ?? m.create_time ?? m.timestamp)
      }
    })
    const title = String(item.title || item.name || '')
    const conv = finalize({
      id: String(item.id || item.uuid || contentId(source, title, messages)),
      source,
      title,
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
      const text = messageBody(o)
      if (text.trim()) messages.push({ role: (role === 'user' || role === 'human' ? 'user' : 'assistant') as Role, text })
    } catch {
      /* skip */
    }
  }
  const title = path.basename(name)
  const id = contentId(source, title, messages)
  const conv = finalize({ id, source, title, messages })
  return conv ? [conv] : []
}

/** Pull plain text out of Gemini Takeout request/response JSON blobs. */
function geminiBlobText(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return ''
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        return geminiBlobText(JSON.parse(s))
      } catch {
        return sanitizeUnicode(s)
      }
    }
    return sanitizeUnicode(s)
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return geminiBlobText(item)
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          if (typeof o.text === 'string') return o.text
          if (Array.isArray(o.parts)) return geminiBlobText(o.parts)
          if (o.text !== undefined) return geminiBlobText(o.text)
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (typeof o.text === 'string') return sanitizeUnicode(o.text)
    if (o.parts) return geminiBlobText(o.parts)
    if (o.request || o.response) return geminiBlobText(o.request ?? o.response)
  }
  return ''
}

function geminiConversationId(titleUrl: unknown, fallback: string): string {
  if (typeof titleUrl !== 'string' || !titleUrl) return fallback
  const m =
    titleUrl.match(/\/app\/(?:c\/)?([^/?#]+)/i) ||
    titleUrl.match(/[?&]c(?:onversation)?=([^&#]+)/i) ||
    titleUrl.match(/\/chat\/([^/?#]+)/i)
  return m?.[1] ? decodeURIComponent(m[1]) : fallback
}

function isGeminiActivityEntry(item: Record<string, unknown>): boolean {
  const products = item.products
  if (Array.isArray(products) && products.some((p) => /gemini/i.test(String(p)))) return true
  if (typeof item.header === 'string' && /gemini/i.test(item.header)) return true
  if (typeof item.titleUrl === 'string' && /gemini\.google\.com/i.test(item.titleUrl)) return true
  return false
}

/**
 * Google Takeout → My Activity → Gemini Apps → MyActivity.json
 * Activity log (not threaded chats): group by conversation id from titleUrl.
 */
export function parseGeminiActivity(arr: Record<string, unknown>[]): Conversation[] {
  type Bucket = { id: string; title: string; createdAt?: string; updatedAt?: string; messages: Message[] }
  const buckets = new Map<string, Bucket>()

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i]
    if (!item || typeof item !== 'object') continue
    if (!isGeminiActivityEntry(item) && !item.details && !item.userInteractions && !item.titleUrl) {
      // Allow plain Takeout rows that still have details/interactions.
      if (!item.time && !item.title) continue
    }

    const id = geminiConversationId(item.titleUrl, `gemini-${i}`)
    let bucket = buckets.get(id)
    if (!bucket) {
      bucket = { id, title: '', createdAt: undefined, updatedAt: undefined, messages: [] }
      buckets.set(id, bucket)
    }

    const ts = isoFrom(item.time)
    if (ts) {
      if (!bucket.createdAt || ts < bucket.createdAt) bucket.createdAt = ts
      if (!bucket.updatedAt || ts > bucket.updatedAt) bucket.updatedAt = ts
    }

    const details = item.details as { name?: string; value?: string }[] | undefined
    if (Array.isArray(details)) {
      for (const d of details) {
        const name = String(d?.name || '')
        const value = typeof d?.value === 'string' ? sanitizeUnicode(d.value) : ''
        if (!value.trim()) continue
        if (/^request$/i.test(name) || /^prompt$/i.test(name)) {
          bucket.messages.push({ role: 'user', text: value, ts })
        } else if (/^response$/i.test(name)) {
          bucket.messages.push({ role: 'assistant', text: value, ts })
        }
      }
    }

    const interactions = item.userInteractions as Record<string, unknown>[] | undefined
    if (Array.isArray(interactions)) {
      for (const row of interactions) {
        const ui = (row?.userInteraction ?? row) as Record<string, unknown>
        const req = geminiBlobText(ui?.request)
        const res = geminiBlobText(ui?.response)
        if (req.trim()) bucket.messages.push({ role: 'user', text: req, ts })
        if (res.trim()) bucket.messages.push({ role: 'assistant', text: res, ts })
      }
    }

    // Fallback: title often holds the user prompt when details are missing.
    if (!details?.length && !interactions?.length) {
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      if (title && !/^used gemini/i.test(title) && !/^gemini apps$/i.test(title)) {
        bucket.messages.push({ role: 'user', text: sanitizeUnicode(title), ts })
      }
    }

    if (!bucket.title) {
      const t = typeof item.title === 'string' ? item.title.trim() : ''
      if (t && !/^used gemini/i.test(t)) bucket.title = t.slice(0, 80)
    }
  }

  const out: Conversation[] = []
  for (const b of buckets.values()) {
    // Keep chronological order within a conversation.
    b.messages.sort((a, c) => (a.ts || '').localeCompare(c.ts || ''))
    const conv = finalize({
      id: b.id,
      source: 'gemini',
      title: b.title,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      messages: b.messages
    })
    if (conv) out.push(conv)
  }
  return out
}

function looksLikeGeminiActivity(json: unknown, name: string): boolean {
  const n = name.toLowerCase().replace(/\\/g, '/')
  if (/myactivity\.json$/.test(n) || /gemini apps/.test(n) || /my activity/.test(n)) return true
  if (!Array.isArray(json) || json.length === 0) return false
  const sample = json.slice(0, 8) as Record<string, unknown>[]
  return sample.some((x) => x && typeof x === 'object' && isGeminiActivityEntry(x))
}

function detectSource(name: string, json: unknown): SourceId {
  const n = name.toLowerCase().replace(/\\/g, '/')
  if (/grok/.test(n)) return 'grok'
  if (looksLikeGeminiActivity(json, n) || /gemini|takeout/.test(n)) return 'gemini'
  const arr = asConvArray(json)
  if (arr.some((x) => x?.mapping)) return 'chatgpt'
  if (arr.some((x) => x?.chat_messages)) return 'claude-ai'
  if (/chatgpt|openai/.test(n)) return 'chatgpt'
  if (/claude/.test(n)) return 'claude-ai'
  return 'generic'
}

function routeJson(json: unknown, name: string): Conversation[] {
  if (looksLikeGeminiActivity(json, name)) {
    return parseGeminiActivity(asConvArray(json))
  }
  const source = detectSource(name, json)
  const arr = asConvArray(json)
  if (source === 'chatgpt' || arr.some((x) => x?.mapping)) return parseChatGPT(arr)
  if (source === 'claude-ai' || arr.some((x) => x?.chat_messages)) return parseClaudeAi(arr)
  if (source === 'gemini') return parseGeminiActivity(arr)
  return parseGeneric(arr, source)
}

/** Which zip entries look like conversation payloads (skip Claude sidecars). */
function zipJsonEntries(names: string[]): string[] {
  const jsonish = names.filter((n) => /\.jsonl?$/i.test(n) && !SKIP_ZIP_BASENAMES.has(basenameLower(n)))
  const preferred = jsonish.filter((n) => {
    const b = basenameLower(n)
    return b === 'conversations.json' || b === 'conversation.json' || b === 'myactivity.json'
  })
  if (preferred.length) return preferred
  // No canonical file — keep remaining json/jsonl (Gemini nested paths, Grok, etc.)
  return jsonish
}

/** Parse a single file's bytes (zip / json / jsonl / md) into conversations. */
export function parseExportBuffer(buf: Uint8Array, filename: string): ImportResult {
  const conversations: Conversation[] = []
  const isZip = buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b // "PK"

  if (isZip) {
    const files = unzipSync(buf)
    const names = zipJsonEntries(Object.keys(files))
    for (const n of names) {
      const text = strFromU8(files[n])
      try {
        // Detect from entry path AND archive name (Claude zip often named data-….zip).
        const detectName = `${filename} ${n}`
        if (n.toLowerCase().endsWith('.jsonl')) {
          conversations.push(...parseJsonl(text, detectSource(detectName, null), n))
        } else {
          conversations.push(...routeJson(JSON.parse(text), detectName))
        }
      } catch {
        /* skip malformed entry */
      }
    }
  } else {
    const text = strFromU8(buf)
    const lower = filename.toLowerCase()
    if (lower.endsWith('.jsonl')) conversations.push(...parseJsonl(text, detectSource(filename, null), filename))
    else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const title = path.basename(filename)
      const messages: Message[] = [{ role: 'user', text: sanitizeUnicode(text) }]
      const conv = finalize({
        id: contentId('generic', title, messages),
        source: 'generic',
        title,
        messages
      })
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
