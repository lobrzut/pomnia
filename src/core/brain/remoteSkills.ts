// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Skills and prompts that live on the server, for a client with no vault.
 *
 * This used to read `/sync/manifest` and pick the `skills/` rows out of it.
 * That worked, and against the real vault it cost 59.6 seconds and 2.8 MB,
 * because a manifest is a sha256 of every file in the vault and all we wanted
 * was a list of names. It also reported 8044 entries where there are 1259
 * skills: backups and `.bak` files belong in a replication manifest by design.
 *
 * brain-core 0.1.80 answers the question directly on `/admin/skills` and
 * `/admin/prompts`, using the same code its MCP tools use, so what Mini shows
 * and what an agent sees cannot drift apart.
 *
 * The path checks below are a copy of the server's. The server's is the one
 * that matters — it guards the disk — but refusing a bad path here means the
 * user gets told why instead of watching a request fail.
 */

/** Why a call could not be made, or was refused. */
export type RemoteLibraryError =
  | 'no-target'
  | 'no-token'
  | 'unauthorized'
  | 'server-too-old'
  | 'unsafe-path'
  | 'not-found'
  | 'failed'

export interface RemoteSkillRow {
  /** Relative to the skills root: `brain/x.md` or `cli/<category>/<name>/SKILL.md`. */
  path: string
  kind: 'own' | 'cli'
  name: string
  category?: string
  description?: string
}

export interface RemoteSkillsSummary {
  own: RemoteSkillRow[]
  categories: { category: string; count: number }[]
  cliCount: number
}

export interface RemotePrompt {
  name: string
  description?: string
  arguments: { name: string; description?: string; required: boolean }[]
  size: number
}

function isBadSegment(seg: string): boolean {
  return seg === '' || seg === '.' || seg === '..'
}

/** `brain/<name>.md`, `cli/<name>/SKILL.md`, `cli/<category>/<name>/SKILL.md` — nothing else. */
export function isSafeSkillRel(rel: string): boolean {
  if (!rel || rel.includes('\\') || rel.startsWith('/')) return false
  const parts = rel.split('/')
  if (parts.some(isBadSegment)) return false
  if (parts.some((p) => p.startsWith('_') || p.startsWith('.'))) return false
  if (parts[0] === 'brain') return parts.length === 2 && parts[1].endsWith('.md')
  if (parts[0] === 'cli') {
    return (parts.length === 3 || parts.length === 4) && parts[parts.length - 1] === 'SKILL.md'
  }
  return false
}

/** A prompt is one file in one directory, so its name is one plain segment. */
export function isSafePromptName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) && !name.endsWith('.md') && !name.includes('..')
}

/** Where a skill's file sits, given the shape the server reported. */
export function skillPath(row: { kind: 'own' | 'cli'; name: string; category?: string }): string {
  if (row.kind === 'own') return `brain/${row.name}.md`
  return row.category ? `cli/${row.category}/${row.name}/SKILL.md` : `cli/${row.name}/SKILL.md`
}

interface RawSummary {
  own?: { skills?: { name?: unknown; description?: unknown }[] }
  cli?: { count?: unknown; categories?: { category?: unknown; count?: unknown }[] }
}

/** Read the summary brain-core returns, tolerating a server that answers less than expected. */
export function summaryFromResponse(raw: unknown): RemoteSkillsSummary {
  const r = (raw ?? {}) as RawSummary
  const own: RemoteSkillRow[] = []
  for (const s of r.own?.skills ?? []) {
    if (typeof s?.name !== 'string') continue
    own.push({
      path: `brain/${s.name}.md`,
      kind: 'own',
      name: s.name,
      description: typeof s.description === 'string' ? s.description : undefined,
    })
  }
  const categories: { category: string; count: number }[] = []
  for (const c of r.cli?.categories ?? []) {
    if (typeof c?.category !== 'string') continue
    categories.push({ category: c.category, count: typeof c.count === 'number' ? c.count : 0 })
  }
  return {
    own: own.sort((a, b) => a.name.localeCompare(b.name)),
    categories,
    cliCount: typeof r.cli?.count === 'number' ? r.cli.count : 0,
  }
}

interface RawRow {
  kind?: unknown
  name?: unknown
  category?: unknown
  description?: unknown
}

/** Read one page of a narrowed listing. */
export function rowsFromResponse(raw: unknown): {
  rows: RemoteSkillRow[]
  total: number
  nextOffset?: number
} {
  const r = (raw ?? {}) as { skills?: RawRow[]; total?: unknown; nextOffset?: unknown }
  const rows: RemoteSkillRow[] = []
  for (const s of r.skills ?? []) {
    if (typeof s?.name !== 'string') continue
    const kind = s.kind === 'own' ? 'own' : 'cli'
    const category = typeof s.category === 'string' ? s.category : undefined
    rows.push({
      path: skillPath({ kind, name: s.name, category }),
      kind,
      name: s.name,
      category,
      description: typeof s.description === 'string' ? s.description : undefined,
    })
  }
  return {
    rows,
    total: typeof r.total === 'number' ? r.total : rows.length,
    nextOffset: typeof r.nextOffset === 'number' ? r.nextOffset : undefined,
  }
}

/** Read the prompt list, dropping anything that does not carry a usable name. */
export function promptsFromResponse(raw: unknown): RemotePrompt[] {
  const r = (raw ?? {}) as { prompts?: unknown[] }
  const out: RemotePrompt[] = []
  for (const p of r.prompts ?? []) {
    const row = p as { name?: unknown; description?: unknown; arguments?: unknown; size?: unknown }
    if (typeof row?.name !== 'string') continue
    const args: RemotePrompt['arguments'] = []
    if (Array.isArray(row.arguments)) {
      for (const a of row.arguments as { name?: unknown; description?: unknown; required?: unknown }[]) {
        if (typeof a?.name !== 'string') continue
        args.push({
          name: a.name,
          description: typeof a.description === 'string' ? a.description : undefined,
          required: a.required === true,
        })
      }
    }
    out.push({
      name: row.name,
      description: typeof row.description === 'string' ? row.description : undefined,
      arguments: args,
      size: typeof row.size === 'number' ? row.size : 0,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
