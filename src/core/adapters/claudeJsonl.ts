// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Shared parser for Claude Code / Claude Desktop JSONL transcripts. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Conversation, Message, Role, SourceId } from '../model.js'
import { pathExists } from '../fsutil.js'

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v)
    return s && s.length > 200 ? s.slice(0, 200) + '…' : s ?? ''
  } catch {
    return ''
  }
}

/** Flatten Anthropic message content (string | array of blocks) into plain text. */
export function extractText(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>
          if (p.type === 'text' && typeof p.text === 'string') return p.text
          if (p.type === 'tool_use') return `⟦tool: ${String(p.name ?? '')} ${safeJson(p.input)}⟧`
          if (p.type === 'tool_result') return `⟦result: ${extractText(p.content)}⟧`
          if (typeof p.text === 'string') return p.text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof content === 'object') {
    const c = content as Record<string, unknown>
    if (typeof c.text === 'string') return c.text
    if (c.content != null) return extractText(c.content)
  }
  return ''
}

/** Parse a single JSONL transcript file into a Conversation (or null if empty). */
export async function parseJsonlFile(
  file: string,
  source: SourceId,
  project?: string
): Promise<Conversation | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  const messages: Message[] = []
  let sessionId = path.basename(file).replace(/\.jsonl$/i, '')
  let model: string | undefined
  let cwd: string | undefined

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    if (typeof obj.sessionId === 'string') sessionId = obj.sessionId
    if (typeof obj.cwd === 'string') cwd = obj.cwd
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : undefined
    const type = obj.type

    if ((type === 'user' || type === 'assistant') && obj.message) {
      const msg = obj.message as Record<string, unknown>
      if (typeof msg.model === 'string') model = msg.model
      const text = extractText(msg.content)
      if (text.trim()) messages.push({ role: type as Role, text, ts })
    } else if (type === 'queue-operation' && obj.operation === 'enqueue' && typeof obj.content === 'string') {
      // A user prompt queued by the CLI.
      if (obj.content.trim()) messages.push({ role: 'user', text: obj.content, ts })
    } else if (type === 'system' && typeof obj.content === 'string') {
      if (obj.content.trim()) messages.push({ role: 'system', text: obj.content, ts })
    }
  }

  if (messages.length === 0) return null
  const firstUser = messages.find((m) => m.role === 'user')
  const title = (firstUser?.text ?? messages[0].text).replace(/\s+/g, ' ').trim().slice(0, 80) || sessionId
  return {
    id: sessionId,
    source,
    title,
    project: project ?? cwd,
    createdAt: messages[0].ts,
    updatedAt: messages[messages.length - 1].ts,
    messages,
    meta: { model, cwd, file: path.basename(file) }
  }
}

/** Parse every *.jsonl under a directory tree into conversations. */
export async function parseJsonlTree(dir: string, source: SourceId): Promise<Conversation[]> {
  const out: Conversation[] = []
  if (!(await pathExists(dir))) return out
  async function recurse(d: string, project?: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const abs = path.join(d, e.name)
      if (e.isDirectory()) await recurse(abs, e.name)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.jsonl')) {
        const conv = await parseJsonlFile(abs, source, project)
        if (conv) out.push(conv)
      }
    }
  }
  await recurse(dir)
  return out
}
