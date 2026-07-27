// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * MCP tool: checkpoint_session
 *
 * Hybrid continuity bridge — agent may call WITHOUT user phrase when a
 * milestone lands (decision, fix+path, error+command, architecture change).
 * Distinct from save_conversation (user-gated „zapisz do Pomnia”).
 *
 * Writes to `<vault>/sessions/checkpoints/<date>_ckpt_<src>_<slug>_<time>.md`.
 * Quality gate: refuse when none of decisions / files_touched / errors_seen /
 * commands_run has substance (no-op clear refuse, no empty file).
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const checkpointSessionSchema = {
  type: 'object' as const,
  properties: {
    source: { type: 'string' },
    topic: { type: 'string' },
    summary: { type: 'string' },
    milestone: {
      type: 'string',
      enum: ['decision', 'fix', 'error', 'architecture'],
      description:
        'Why this checkpoint: decision | fix (with paths) | error (+ commands) | architecture change',
    },
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
  milestone: z.enum(['decision', 'fix', 'error', 'architecture']).optional(),
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

export interface CheckpointSessionDeps {
  vaultRoot: string
  /** When false, refuse — Settings autoCheckpointEnabled OFF. Default true. */
  autoCheckpointEnabled?: boolean
}

function bullets(items: string[]): string {
  if (items.length === 0) return '- _(none)_'
  return items.map((x) => `- ${x}`).join('\n')
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return ''
  return `\n## ${title}\n${bullets(items)}\n`
}

function slugify(topic: string): string {
  const s = topic.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60).replace(/^_+|_+$/g, '')
  return s.length > 0 ? s : 'checkpoint'
}

function nowParts(): { date: string; time: string } {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}-${pad(d.getMinutes())}`,
  }
}

function nonempty(items: string[]): string[] {
  return items.map((x) => x.trim()).filter(Boolean)
}

/**
 * Quality gate — at least one milestone signal must be present.
 * Empty checkpoints are refused (no file written).
 */
export function hasCheckpointSubstance(args: {
  decisions?: string[]
  files_touched?: string[]
  errors_seen?: string[]
  commands_run?: string[]
}): boolean {
  return (
    nonempty(args.decisions ?? []).length > 0 ||
    nonempty(args.files_touched ?? []).length > 0 ||
    nonempty(args.errors_seen ?? []).length > 0 ||
    nonempty(args.commands_run ?? []).length > 0
  )
}

export const CHECKPOINT_EMPTY_REFUSE =
  'refused: checkpoint empty — need at least one of decisions / files_touched / errors_seen / commands_run (no file written).'

export const CHECKPOINT_DISABLED_REFUSE =
  'refused: autoCheckpointEnabled is OFF in Pomnia Settings — do not auto-checkpoint. User can still save_conversation with „zapisz do Pomnia” / „save to Pomnia”.'

export interface CheckpointSessionResult {
  text: string
  /** Absolute path when written; null when refused. */
  path: string | null
  refused: boolean
}

export async function runCheckpointSession(
  args: unknown,
  deps: CheckpointSessionDeps,
): Promise<CheckpointSessionResult> {
  if (deps.autoCheckpointEnabled === false) {
    return { text: CHECKPOINT_DISABLED_REFUSE, path: null, refused: true }
  }

  const a = argsSchema.parse(args)
  const decisions = nonempty(a.decisions)
  const files_touched = nonempty(a.files_touched)
  const errors_seen = nonempty(a.errors_seen)
  const commands_run = nonempty(a.commands_run)
  const solutions = nonempty(a.solutions)
  const root_causes = nonempty(a.root_causes)
  const attempts_failed = nonempty(a.attempts_failed)
  const endpoints_urls_ips = nonempty(a.endpoints_urls_ips)
  const facts = nonempty(a.facts)
  const open_questions = nonempty(a.open_questions)

  if (
    !hasCheckpointSubstance({
      decisions,
      files_touched,
      errors_seen,
      commands_run,
    })
  ) {
    return { text: CHECKPOINT_EMPTY_REFUSE, path: null, refused: true }
  }

  const src = a.source.trim().toLowerCase() || 'unknown'
  const topic = a.topic.trim() || 'untitled'
  const summary = a.summary.trim() || '(checkpoint)'
  const milestone = a.milestone ?? 'decision'

  const slug = slugify(topic)
  const { date, time } = nowParts()
  const filename = `${date}_ckpt_${src}_${slug}_${time}.md`

  const checkpointsDir = join(deps.vaultRoot, 'sessions', 'checkpoints')
  mkdirSync(checkpointsDir, { recursive: true })
  const outPath = join(checkpointsDir, filename)

  const content =
    `---\n` +
    `source: ${src}\n` +
    `project: ${topic}\n` +
    `date: ${date}\n` +
    `session_id: ${time}\n` +
    `msg_count: ${a.msg_count}\n` +
    `kind: checkpoint\n` +
    `milestone: ${milestone}\n` +
    `saved_via: mcp_checkpoint_session\n` +
    `schema_version: 1\n` +
    `---\n\n` +
    `# ${date} · checkpoint · ${src} · ${topic}\n\n` +
    `## Milestone\n${milestone}\n\n` +
    `## Summary\n${summary}\n\n` +
    `## Decisions\n${bullets(decisions)}\n\n` +
    `## Root causes\n${bullets(root_causes)}\n\n` +
    `## Solutions\n${bullets(solutions)}\n` +
    section('Attempts that failed', attempts_failed) +
    section('Files touched', files_touched) +
    section('Commands run', commands_run) +
    section('Endpoints / URLs / IPs', endpoints_urls_ips) +
    section('Errors seen', errors_seen) +
    `\n## Facts\n${bullets(facts)}\n\n` +
    `## Open questions\n${bullets(open_questions)}\n`

  const tmp = outPath + '.tmp'
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, outPath)

  return {
    path: outPath,
    refused: false,
    text:
      `✓ Checkpoint saved to vault/sessions/checkpoints/${filename}\n` +
      `Indexing for search_library in the background.\n` +
      `Conscious full save still needs „zapisz do Pomnia” → save_conversation.`,
  }
}
