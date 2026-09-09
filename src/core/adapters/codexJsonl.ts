// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Parser for Codex CLI / Codex Desktop rollout transcripts.
 *
 * Codex writes one JSONL per session under `~/.codex/sessions/<yyyy>/<mm>/<dd>/`,
 * named `rollout-<iso>-<uuid>.jsonl`. The envelope resembles Claude Code's —
 * one JSON object per line, a `type`, a timestamp — but the payload does not,
 * and four differences decide what this file does. All four were measured
 * against 19 real sessions totalling 26,913 lines, not guessed from a sample:
 *
 * 1. `event_msg` with `item_completed` is the bulk of the file (12,222 of those
 *    lines) and *repeats* items already emitted as `response_item`. Anything
 *    that harvests every record carrying text doubles the whole conversation.
 *    Only `response_item` is read here.
 *
 * 2. `reasoning` items (442) carry `encrypted_content`: a long opaque blob the
 *    reader cannot decrypt and search cannot index. Storing it would grow the
 *    vault with ciphertext that is worse than useless — it is noise that looks
 *    like content. Dropped, and `summary` is taken instead when present, since
 *    that part is plain text.
 *
 * 3. `role: "developer"` is not a participant. It is Codex injecting its own
 *    `<app-context>` briefing, and the same is true of the `<recommended_plugins>`
 *    catalogue that arrives as a user turn. Both are the harness talking to
 *    itself; keeping them would put text the user never wrote into their memory.
 *
 * 4. Content blocks are `output_text` / `input_text`, not Anthropic's `text`.
 *    The shared `extractText` handles them through its generic `.text` fallback,
 *    which is why it is reused rather than re-implemented.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { Conversation, Message, Role, SourceId } from '../model.js'
import { pathExists } from '../fsutil.js'
import { extractText } from './claudeJsonl.js'

/** Harness-authored turns that arrive dressed as conversation. */
const INJECTED_PREFIXES = ['<app-context>', '<recommended_plugins>', '<user_instructions>']

function isInjected(text: string): boolean {
  const head = text.trimStart()
  return INJECTED_PREFIXES.some((p) => head.startsWith(p))
}

/**
 * Unwrap a slash-command envelope, keeping what the user actually said.
 *
 * A `/command` arrives as `<command-name>…</command-name>` plus
 * `<command-message>` and `<command-args>`, and the instruction the user wrote
 * is inside the args. Dropping the whole turn — the obvious move, since the
 * envelope is plainly machinery — would throw away the instruction with it;
 * measured on this vault, 14 turns carried real briefings that way. Keeping the
 * envelope is no better: it becomes the conversation's title, which is how a
 * list of sessions ends up reading `<command-name>/remote-control</command-name>`.
 */
function unwrapCommand(text: string): string {
  if (!text.trimStart().startsWith('<command-name>')) return text
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)
  if (args && args[1].trim()) return args[1].trim()
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text)
  return name ? name[1].trim() : text
}

/** Codex roles that map onto ours; `developer` is deliberately absent. */
function roleOf(raw: unknown): Role | null {
  if (raw === 'user') return 'user'
  if (raw === 'assistant') return 'assistant'
  if (raw === 'system') return 'system'
  return null
}

/**
 * Parse one rollout file into a Conversation, or null when it holds no
 * conversation — a session that was opened and abandoned leaves a file with
 * metadata and nothing said.
 */
export async function parseCodexRollout(
  file: string,
  source: SourceId
): Promise<Conversation | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }

  const messages: Message[] = []
  // The filename carries the uuid, so it is a usable id even if meta is absent.
  let sessionId = path.basename(file).replace(/^rollout-/, '').replace(/\.jsonl$/i, '')
  let cwd: string | undefined
  let model: string | undefined
  let cliVersion: string | undefined
  let originator: string | undefined

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }

    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : undefined
    const payload =
      obj.payload && typeof obj.payload === 'object' ? (obj.payload as Record<string, unknown>) : {}

    if (obj.type === 'session_meta') {
      if (typeof payload.session_id === 'string') sessionId = payload.session_id
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.cli_version === 'string') cliVersion = payload.cli_version
      if (typeof payload.originator === 'string') originator = payload.originator
      continue
    }

    if (obj.type === 'turn_context') {
      // Carries the model actually used, which session_meta does not.
      if (typeof payload.model === 'string') model = payload.model
      if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd
      continue
    }

    // Everything below lives on response_item. event_msg repeats it; see (1).
    if (obj.type !== 'response_item') continue

    if (payload.type === 'message') {
      const role = roleOf(payload.role)
      if (!role) continue
      const raw = extractText(payload.content)
      if (!raw.trim() || isInjected(raw)) continue
      messages.push({ role, text: unwrapCommand(raw), ts })
      continue
    }

    if (payload.type === 'reasoning') {
      // `encrypted_content` is deliberately not read; see (2).
      const summary = extractText(payload.summary)
      if (summary.trim()) messages.push({ role: 'assistant', text: summary, ts })
      continue
    }

    if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
      const name = typeof payload.name === 'string' ? payload.name : 'tool'
      const args = payload.input ?? payload.arguments
      const argText = typeof args === 'string' ? args : extractText(args)
      const trimmed = argText.length > 200 ? argText.slice(0, 200) + '…' : argText
      messages.push({ role: 'assistant', text: `⟦tool: ${name} ${trimmed}⟧`, ts })
      continue
    }

    if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
      const out = typeof payload.output === 'string' ? payload.output : extractText(payload.output)
      if (!out.trim()) continue
      const trimmed = out.length > 400 ? out.slice(0, 400) + '…' : out
      messages.push({ role: 'assistant', text: `⟦result: ${trimmed}⟧`, ts })
    }
  }

  if (messages.length === 0) return null

  const firstUser = messages.find((m) => m.role === 'user')
  const title =
    (firstUser?.text ?? messages[0].text).replace(/\s+/g, ' ').trim().slice(0, 80) || sessionId

  return {
    id: sessionId,
    source,
    title,
    project: cwd,
    createdAt: messages[0].ts,
    updatedAt: messages[messages.length - 1].ts,
    messages,
    meta: { model, cwd, file: path.basename(file), cliVersion, originator }
  }
}

/**
 * Walk `~/.codex/sessions` and parse every rollout under it.
 *
 * The tree is dated — `<yyyy>/<mm>/<dd>/rollout-*.jsonl` — so the recursion is
 * over directories rather than a flat read. Only `rollout-*` files are taken:
 * the same tree holds other bookkeeping this parser has no business reading.
 */
export async function parseCodexTree(dir: string, source: SourceId): Promise<Conversation[]> {
  const out: Conversation[] = []
  if (!(await pathExists(dir))) return out

  async function recurse(d: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const abs = path.join(d, e.name)
      if (e.isDirectory()) await recurse(abs)
      else if (e.isFile() && /^rollout-.*\.jsonl$/i.test(e.name)) {
        const conv = await parseCodexRollout(abs, source)
        if (conv) out.push(conv)
      }
    }
  }

  await recurse(dir)
  return out
}
