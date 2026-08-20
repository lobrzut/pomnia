// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * MCP tool: save_conversation
 *
 * Byte-identical port of Python `dashboard/mcp_rag.py::save_conversation`.
 *
 * Writes a structured markdown note into `<vault>/sessions/<date>_<src>_<slug>_<time>.md`
 * with YAML frontmatter and a fixed section layout (Summary, Decisions, Root causes,
 * Solutions, optional Attempts/Files/Commands/Endpoints/Errors, Facts, Open questions).
 * Optional sections render only when there's content, to avoid noisy near-empty notes.
 *
 * Schema layout MUST match Python — save_conversation is called by agents (Claude
 * Code, Cursor, Antigravity), whose calls we don't control. A drift breaks their
 * saves silently.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const saveConversationSchema = {
  type: 'object' as const,
  properties: {
    source: { type: 'string' },
    topic: { type: 'string' },
    summary: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    solutions: { type: 'array', items: { type: 'string' } },
    root_causes: { type: 'array', items: { type: 'string' } },
    attempts_failed: { type: 'array', items: { type: 'string' } },
    files_touched: { type: 'array', items: { type: 'string' } },
    commands_run: { type: 'array', items: { type: 'string' } },
    endpoints_urls_ips: { type: 'array', items: { type: 'string' } },
    errors_seen: { type: 'array', items: { type: 'string' } },
    facts: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    msg_count: { type: 'integer', default: 0 },
  },
  required: ['source', 'topic', 'summary'],
}

const argsSchema = z.object({
  source: z.string().optional().default('unknown'),
  topic: z.string().optional().default('untitled'),
  summary: z.string().optional().default(''),
  decisions: z.array(z.string()).optional().default([]),
  solutions: z.array(z.string()).optional().default([]),
  root_causes: z.array(z.string()).optional().default([]),
  attempts_failed: z.array(z.string()).optional().default([]),
  files_touched: z.array(z.string()).optional().default([]),
  commands_run: z.array(z.string()).optional().default([]),
  endpoints_urls_ips: z.array(z.string()).optional().default([]),
  errors_seen: z.array(z.string()).optional().default([]),
  facts: z.array(z.string()).optional().default([]),
  open_questions: z.array(z.string()).optional().default([]),
  msg_count: z.number().int().optional().default(0),
})

export interface SaveConversationDeps {
  /** Root of the vault (contains `sessions/` subdir; created if missing). */
  vaultRoot: string
}

function bullets(items: string[]): string {
  if (items.length === 0) return '- _(none)_'
  return items.map((x) => `- ${x}`).join('\n')
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return ''
  return `\n## ${title}\n${bullets(items)}\n`
}

/** Slugify a topic for the filename — alphanumerics + underscores only, ≤60 chars. */
function slugify(topic: string): string {
  const s = topic.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60).replace(/^_+|_+$/g, '')
  return s.length > 0 ? s : 'session'
}

/** Local date/time strings matching Python `strftime("%Y-%m-%d")` and `"%H-%M"`. */
function nowParts(): { date: string; time: string } {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}-${pad(d.getMinutes())}`,
  }
}

export interface SaveConversationResult {
  text: string
  /** Absolute path of the written session note. */
  path: string
}

export async function runSaveConversation(
  args: unknown,
  deps: SaveConversationDeps,
): Promise<SaveConversationResult> {
  const a = argsSchema.parse(args)
  const src = a.source.trim().toLowerCase() || 'unknown'
  const topic = a.topic.trim() || 'untitled'
  const summary = a.summary.trim()

  const slug = slugify(topic)
  const { date, time } = nowParts()
  const filename = `${date}_${src}_${slug}_${time}.md`

  const sessionsDir = join(deps.vaultRoot, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  const outPath = join(sessionsDir, filename)

  const content =
    `---\n` +
    `source: ${src}\n` +
    `project: ${topic}\n` +
    `date: ${date}\n` +
    `session_id: ${time}\n` +
    `msg_count: ${a.msg_count}\n` +
    `saved_via: mcp_save_conversation\n` +
    `schema_version: 2\n` +
    `---\n\n` +
    `# ${date} · ${src} · ${topic}\n\n` +
    `## Summary\n${summary}\n\n` +
    `## Decisions\n${bullets(a.decisions)}\n\n` +
    `## Root causes\n${bullets(a.root_causes)}\n\n` +
    `## Solutions\n${bullets(a.solutions)}\n` +
    section('Attempts that failed', a.attempts_failed) +
    section('Files touched', a.files_touched) +
    section('Commands run', a.commands_run) +
    section('Endpoints / URLs / IPs', a.endpoints_urls_ips) +
    section('Errors seen', a.errors_seen) +
    `\n## Facts\n${bullets(a.facts)}\n\n` +
    `## Open questions\n${bullets(a.open_questions)}\n`

  // session_id is minute-resolution, so two saves in the same minute with the
  // same source and topic land on the same path - and rename() replaces what is
  // already there without a word. Both calls were told the save succeeded while
  // only the second note survived. In a memory product that is the worst way to
  // fail: the thing whose whole job is not to forget, quietly forgetting, with
  // a tick beside it. Never replace a note that already exists.
  let finalPath = outPath
  let finalName = filename
  for (let n = 2; existsSync(finalPath) && n < 1000; n++) {
    finalName = filename.replace(/\.md$/, `-${n}.md`)
    finalPath = join(sessionsDir, finalName)
  }

  // fsync before rename, for the reason vault.ts already learned the hard way:
  // rename is atomic against readers and says nothing about durability. The
  // manifest that came back as 55 KB of zeros after a power cut was written
  // exactly like the line below used to be.
  const tmp = finalPath + '.tmp'
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, content, null, 'utf-8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, finalPath)

  return {
    path: finalPath,
    text:
      `✓ Saved to vault/sessions/${finalName}\n` +
      `Indexing for search_library in the background.\n` +
      `Will appear on knowledge graph within 30s.`,
  }
}
