// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Point at a note, instead of describing it and hoping.
 *
 * Retrieval is a guess. A good one — recall@5 is 82.8% on LoCoMo, 90.4% with
 * the reranker — but that still leaves roughly one question in ten where the
 * right note never reaches the answer, and *no way to fix it*. You cannot tell
 * `search_library` "not that one, the other one". There was nothing to point
 * at.
 *
 * MCP resources are the pointer. A client lists them, a person picks one, and
 * its contents are attached to the conversation with no retrieval in the path
 * at all. When you know what you want, guessing is a step to skip, not to
 * improve.
 *
 * The design decision worth naming: **templates here are views, not file
 * paths.** The obvious reading of `ListResourceTemplates` is a parameterised
 * path — `pomnia://file/{path}` — which is a file browser nobody asked for and
 * which forces the user to know the vault's layout. What a memory is asked for
 * is a *perspective*: this case, that day, the last week. So:
 *
 *   pomnia://sprawa/{nazwa}   one case file, current state
 *   pomnia://sesja/{data}     one day's work
 *   pomnia://recent/{dni}     what has been touched lately
 *
 * Only `sprawy/` and `sessions/` are addressable, and that is deliberate too.
 * `distilled/` is machine-written and reachable through search; `skills/` and
 * `prompts/` already have their own surfaces. What is left is the material a
 * person writes and later needs *by name*.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export const RESOURCE_SCHEME = 'pomnia'

/** Directories a URI may address, and what each one is for. */
const AREAS = {
  sprawa: { dir: 'sprawy', label: 'sprawa' },
  sesja: { dir: 'sessions', label: 'sesja' },
} as const

export type AreaName = keyof typeof AREAS

export interface ResourceEntry {
  uri: string
  name: string
  description?: string
  mimeType: string
}

/** `sprawy/rustyrat-CIT8-2025.md` → `pomnia://sprawa/rustyrat-CIT8-2025` */
export function uriFor(area: AreaName, name: string): string {
  return `${RESOURCE_SCHEME}://${area}/${encodeURIComponent(name)}`
}

export interface ParsedUri {
  area: AreaName | 'recent'
  /** The part after the area. A name, or a number of days for `recent`. */
  key: string
}

/**
 * Read a URI without trusting it.
 *
 * The name reaches a filesystem read, so it is checked the way every other
 * user-supplied path in this codebase is: refused if it could climb out,
 * never normalised into something that works.
 */
export function parseUri(uri: string): ParsedUri | null {
  const m = new RegExp(`^${RESOURCE_SCHEME}://([a-z]+)/(.+)$`).exec(uri.trim())
  if (!m) return null
  const area = m[1]
  let key: string
  try {
    key = decodeURIComponent(m[2])
  } catch {
    return null
  }
  if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) return null
  if (area === 'recent') return /^\d{1,4}$/.test(key) ? { area: 'recent', key } : null
  if (area in AREAS) return { area: area as AreaName, key }
  return null
}

/** First heading or first real line. Taken from the note, never invented. */
function titleOf(body: string, fallback: string): string {
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t || t === '---') continue
    if (t.startsWith('#')) return t.replace(/^#+\s*/, '').slice(0, 120)
    if (/^[a-z_]+:/i.test(t)) continue // frontmatter key
    return t.slice(0, 120)
  }
  return fallback
}

function listArea(vaultRoot: string, area: AreaName, limit: number): ResourceEntry[] {
  const dir = join(vaultRoot, AREAS[area].dir)
  if (!existsSync(dir)) return []
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('.'))
  } catch {
    return []
  }
  const rows = files
    .map((f) => {
      try {
        return { f, mtime: statSync(join(dir, f)).mtimeMs }
      } catch {
        return null
      }
    })
    .filter((r): r is { f: string; mtime: number } => r !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)

  const out: ResourceEntry[] = []
  for (const { f } of rows) {
    const name = basename(f, '.md')
    let description: string | undefined
    try {
      description = titleOf(readFileSync(join(dir, f), 'utf8'), name)
    } catch {
      /* a note that will not open is still worth listing by name */
    }
    out.push({
      uri: uriFor(area, name),
      name: `${AREAS[area].label}: ${name}`,
      description,
      mimeType: 'text/markdown',
    })
  }
  return out
}

/**
 * Everything addressable, newest first.
 *
 * `sessions/` runs to thousands of files on a working vault, so it is capped.
 * A resource list is a menu, and a menu of five thousand items is the same
 * mistake `list_skills` made — the fix there was categories, and the fix here
 * is recency plus a template for reaching further back.
 */
export const SESSION_LIST_LIMIT = 50

export function listResources(vaultRoot: string): ResourceEntry[] {
  if (!vaultRoot) return []
  return [
    // Cases first: few, hand-written, and the ones asked for by name.
    ...listArea(vaultRoot, 'sprawa', 200),
    ...listArea(vaultRoot, 'sesja', SESSION_LIST_LIMIT),
  ]
}

export interface ResourceTemplate {
  uriTemplate: string
  name: string
  description: string
  mimeType: string
}

export function listResourceTemplates(): ResourceTemplate[] {
  return [
    {
      uriTemplate: `${RESOURCE_SCHEME}://sprawa/{nazwa}`,
      name: 'Sprawa',
      description:
        'One case file by name — the note that says what the current state is. Names come from resources/list.',
      mimeType: 'text/markdown',
    },
    {
      uriTemplate: `${RESOURCE_SCHEME}://sesja/{nazwa}`,
      name: 'Sesja',
      description:
        'One saved session by name. Older sessions are not listed but are still addressable here.',
      mimeType: 'text/markdown',
    },
    {
      uriTemplate: `${RESOURCE_SCHEME}://recent/{dni}`,
      name: 'Ostatnie dni',
      description:
        'Everything written in the vault in the last N days, newest first — the answer to "what was I doing".',
      mimeType: 'text/markdown',
    },
  ]
}

export interface ResourceContents {
  uri: string
  mimeType: string
  text: string
}

/** Notes touched in the last N days, across the addressable areas. */
function readRecent(vaultRoot: string, days: number): string {
  const cutoff = Date.now() - days * 86_400_000
  const found: { area: AreaName; name: string; mtime: number }[] = []
  for (const area of Object.keys(AREAS) as AreaName[]) {
    const dir = join(vaultRoot, AREAS[area].dir)
    if (!existsSync(dir)) continue
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    } catch {
      continue
    }
    for (const f of files) {
      try {
        const st = statSync(join(dir, f))
        if (st.mtimeMs >= cutoff) {
          found.push({ area, name: basename(f, '.md'), mtime: st.mtimeMs })
        }
      } catch {
        /* skip */
      }
    }
  }
  found.sort((a, b) => b.mtime - a.mtime)
  if (found.length === 0) return `Nic nie zmieniało się w ciągu ostatnich ${days} dni.`
  // A list of pointers, not the contents: this is a menu, and inlining a week
  // of sessions would be the context-window mistake in a new place.
  return [
    `Zmienione w ciągu ostatnich ${days} dni (${found.length}):`,
    '',
    ...found.map((f) => `- ${uriFor(f.area, f.name)} — ${new Date(f.mtime).toISOString().slice(0, 10)}`),
  ].join('\n')
}

export function readResource(vaultRoot: string, uri: string): ResourceContents | { error: string } {
  const parsed = parseUri(uri)
  if (!parsed) return { error: `unreadable resource uri: ${uri}` }

  if (parsed.area === 'recent') {
    const days = Math.min(365, Math.max(1, Number(parsed.key)))
    return { uri, mimeType: 'text/markdown', text: readRecent(vaultRoot, days) }
  }

  const file = join(vaultRoot, AREAS[parsed.area].dir, `${parsed.key}.md`)
  if (!existsSync(file)) return { error: `no such resource: ${uri}` }
  try {
    return { uri, mimeType: 'text/markdown', text: readFileSync(file, 'utf8') }
  } catch (e) {
    return { error: `${uri}: ${(e as Error).message}` }
  }
}
