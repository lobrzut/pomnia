// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Local skills tools — list / get from the filesystem.
 *
 * Layout under skillsRoot:
 *   brain/<name>.md                 — the user's own workflow skills
 *   cli/<name>/SKILL.md             — a package, uncategorised
 *   cli/<category>/<name>/SKILL.md  — a package inside a category
 *
 * Both cli layouts are real and both are read. The categorised one appeared
 * when 1244 packages were sorted into eight folders; a reader that knows only
 * the flat form sees none of them, which is exactly what happened — the
 * running server carried a hand-applied patch while the source did not, and
 * one container recreate would have taken all 1244 away.
 *
 * `list_skills` answers with a *summary* unless asked for something narrower.
 * The full catalogue is 1259 entries and 388 kB — near a hundred thousand
 * tokens, which is not a listing, it is the end of the caller's context
 * window. Categories with counts cost about a kilobyte and tell an agent what
 * to ask for next.
 */
import { readdirSync, readFileSync, existsSync, statSync, type Dirent } from 'node:fs'
import { join, basename } from 'node:path'

/** Above this, a listing stops being an answer and becomes a context leak. */
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

export const listSkillsSchema = {
  type: 'object' as const,
  properties: {
    scope: {
      type: 'string' as const,
      enum: ['own', 'cli', 'all'],
      description: 'own = brain/*.md workflow skills; cli = cli packages; all = both (default)',
    },
    category: {
      type: 'string' as const,
      description:
        'Return the skills in one cli category instead of the summary. Names come from the summary.',
    },
    query: {
      type: 'string' as const,
      description: 'Return only skills whose name or description contains this text.',
    },
    limit: {
      type: 'number' as const,
      description: `Max skills to return when filtering (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
    },
    offset: {
      type: 'number' as const,
      description: 'Skip this many results — page with nextOffset.',
    },
  },
}
export const listCliSkillsSchema = { type: 'object' as const, properties: {} }
export const getSkillSchema = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string' as const,
      description: 'Skill name, or category/name when two categories use the same name.',
    },
  },
  required: ['name'] as string[],
}

export interface SkillsDeps {
  skillsRoot: string
}

interface SkillMeta {
  kind: 'brain' | 'cli'
  name: string
  /** Only for cli skills that live under a category folder. */
  category?: string
  description?: string
  path: string
}

function parseFrontmatter(raw: string): { description?: string; name?: string } {
  if (!raw.startsWith('---')) return {}
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = raw.slice(3, end)
  const out: { description?: string; name?: string } = {}
  // description: "..." or description: >- multi-line (take first non-empty continuation)
  const descMatch = block.match(/^description:\s*(?:>-?\s*)?(?:"([^"]*)"|'([^']*)'|(.+))?$/m)
  if (descMatch) {
    let d = (descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? '').trim()
    if (!d || d === '>-' || d === '>') {
      const after = block.slice(block.indexOf('description:'))
      const lines = after.split('\n').slice(1)
      const parts: string[] = []
      for (const line of lines) {
        if (/^\S/.test(line) && !/^\s/.test(line)) break
        const t = line.trim()
        if (t) parts.push(t)
      }
      d = parts.join(' ')
    }
    if (d) out.description = d.replace(/\s+/g, ' ').slice(0, 240)
  }
  const nameMatch = block.match(/^name:\s*["']?([^\n"']+)/m)
  if (nameMatch) out.name = nameMatch[1].trim()
  return out
}

/**
 * Names that are bookkeeping rather than skills.
 *
 * The leading underscore matters more than it looks: the vault holds
 * `_backup-cli-before-categorize-...`, a full copy of every package. Walking
 * into it would list all 1244 of them twice.
 */
function isJunkSkillName(name: string): boolean {
  if (!name) return true
  if (name.startsWith('.') || name.startsWith('_')) return true
  if (name.includes('.bak')) return true
  if (name === '__pycache__' || name === 'node_modules') return true
  return false
}

function describeFile(file: string): string | undefined {
  try {
    return parseFrontmatter(readFileSync(file, 'utf8')).description
  } catch {
    return undefined
  }
}

function listBrain(skillsRoot: string): SkillMeta[] {
  const dir = join(skillsRoot, 'brain')
  if (!existsSync(dir)) return []
  const out: SkillMeta[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile()) continue
    if (!ent.name.endsWith('.md')) continue
    if (isJunkSkillName(ent.name)) continue
    const file = join(dir, ent.name)
    out.push({
      kind: 'brain',
      name: basename(ent.name, '.md'),
      description: describeFile(file),
      path: file,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** A skill nested deeper than this is a tree we decline to crawl. */
const CLI_MAX_DEPTH = 2

/**
 * Walk `cli/`, accepting a skill at either depth.
 *
 * A directory holding SKILL.md is a skill; a directory without one, at the
 * top level, is a category.
 */
function listCli(skillsRoot: string): SkillMeta[] {
  const root = join(skillsRoot, 'cli')
  if (!existsSync(root)) return []
  const out: SkillMeta[] = []

  const walk = (base: string, depth: number, category?: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(base, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      if (isJunkSkillName(ent.name)) continue
      const skillDir = join(base, ent.name)
      const file = join(skillDir, 'SKILL.md')
      if (existsSync(file)) {
        out.push({
          kind: 'cli',
          name: ent.name,
          category,
          description: describeFile(file),
          path: file,
        })
      } else if (depth < CLI_MAX_DEPTH) {
        walk(skillDir, depth + 1, ent.name)
      }
    }
  }

  walk(root, 1)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function parseScope(args: unknown): 'own' | 'cli' | 'all' {
  if (!args || typeof args !== 'object') return 'all'
  const scope = (args as { scope?: unknown }).scope
  if (scope === 'own' || scope === 'cli' || scope === 'all') return scope
  return 'all'
}

function parseStr(args: unknown, key: string): string {
  if (!args || typeof args !== 'object') return ''
  const v = (args as Record<string, unknown>)[key]
  return typeof v === 'string' ? v.trim() : ''
}

function parseNum(args: unknown, key: string, fallback: number): number {
  if (!args || typeof args !== 'object') return fallback
  const v = (args as Record<string, unknown>)[key]
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

function wire(s: SkillMeta): Record<string, unknown> {
  return s.kind === 'brain'
    ? { kind: 'own', name: s.name, description: s.description, file: `${s.name}.md` }
    : { kind: 'cli', name: s.name, category: s.category, description: s.description }
}

const UNCATEGORISED = '(uncategorised)'

function categoryCounts(cli: SkillMeta[]): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const s of cli) {
    const key = s.category ?? UNCATEGORISED
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}

/**
 * List skills.
 *
 * Without `category` or `query` the cli half is summarised, never enumerated.
 * `own` is always returned in full — a handful of entries the user wrote
 * himself, three kilobytes, and the ones an agent should reach for first.
 */
export function runListSkills(args: unknown, deps: SkillsDeps): string {
  const root = deps.skillsRoot
  const scope = parseScope(args)
  const category = parseStr(args, 'category')
  const query = parseStr(args, 'query').toLowerCase()
  const wantOwn = scope === 'own' || scope === 'all'
  const wantCli = scope === 'cli' || scope === 'all'

  const own = wantOwn ? listBrain(root) : []
  const cli = wantCli || category ? listCli(root) : []

  // Narrowed: return the skills themselves, paged.
  if (category || query) {
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseNum(args, 'limit', DEFAULT_LIMIT)))
    const offset = parseNum(args, 'offset', 0)
    const cat = category.toLowerCase()
    const pool = [...(category ? [] : own), ...cli].filter((s) => {
      if (cat && (s.kind !== 'cli' || (s.category ?? '').toLowerCase() !== cat)) return false
      if (!query) return true
      return `${s.name} ${s.description ?? ''}`.toLowerCase().includes(query)
    })
    const page = pool.slice(offset, offset + limit)
    const body: Record<string, unknown> = {
      skillsRoot: root,
      scope,
      total: pool.length,
      offset,
      shown: page.length,
      skills: page.map(wire),
    }
    if (category) body.category = category
    if (query) body.query = query
    if (offset + page.length < pool.length) body.nextOffset = offset + page.length
    if (pool.length === 0) {
      body.hint = category
        ? `no cli category named "${category}" — call list_skills with no arguments to see the categories`
        : `nothing matched "${query}"`
    }
    return JSON.stringify(body, null, 2)
  }

  // Summary.
  const body: Record<string, unknown> = { skillsRoot: root, scope }
  if (wantOwn) body.own = { count: own.length, skills: own.map(wire) }
  if (wantCli) {
    body.cli = {
      count: cli.length,
      categories: categoryCounts(cli),
      hint:
        cli.length === 0
          ? 'no cli/**/SKILL.md packages found'
          : 'the full cli catalogue is too large to return at once — call again with { category } or { query }, then get_skill by name',
    }
  }
  return JSON.stringify(body, null, 2)
}

/** @deprecated Prefer list_skills({ scope: 'cli' }). Kept for backward compatibility. */
export function runListCliSkills(_args: unknown, deps: SkillsDeps): string {
  return runListSkills({ scope: 'cli' }, deps)
}

/** Locate one skill by name, accepting `category/name` and any letter case. */
function findSkill(root: string, name: string): SkillMeta | { matches: SkillMeta[] } | null {
  const slash = name.indexOf('/')
  const bare = slash >= 0 ? name.slice(slash + 1) : name
  const wantCat = slash >= 0 ? name.slice(0, slash).toLowerCase() : ''
  if (!bare) return null

  if (!wantCat) {
    const brainFile = join(root, 'brain', `${bare}.md`)
    if (existsSync(brainFile) && statSync(brainFile).isFile()) {
      return { kind: 'brain', name: bare, description: describeFile(brainFile), path: brainFile }
    }
  }

  // Fall back to a walk: it also answers case-insensitively and across
  // categories, and 1244 stat calls cost less than a wrong "not found".
  const matches = listCli(root).filter(
    (s) =>
      s.name.toLowerCase() === bare.toLowerCase() &&
      (!wantCat || (s.category ?? '').toLowerCase() === wantCat),
  )
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return { matches }

  if (wantCat) return null
  return listBrain(root).find((s) => s.name.toLowerCase() === bare.toLowerCase()) ?? null
}

export function runGetSkill(args: unknown, deps: SkillsDeps): string {
  const root = deps.skillsRoot
  const name = parseStr(args, 'name')
  if (!name) throw new Error('get_skill requires name')

  const found = findSkill(root, name)
  if (!found) {
    return JSON.stringify({
      error: `skill not found: ${name}`,
      skillsRoot: root,
      hint: 'discover names with list_skills — it lists categories first',
    })
  }
  if ('matches' in found) {
    // Two categories use this name. Answering with one of them silently would
    // hand the agent a skill it did not ask for.
    return JSON.stringify(
      {
        error: `ambiguous skill name: ${name}`,
        skillsRoot: root,
        candidates: found.matches.map((s) => (s.category ? `${s.category}/${s.name}` : s.name)),
        hint: 'call get_skill with category/name',
      },
      null,
      2,
    )
  }

  const content = readFileSync(found.path, 'utf8')
  const fm = parseFrontmatter(content)
  return JSON.stringify(
    {
      name: fm.name ?? found.name,
      kind: found.kind,
      category: found.category,
      description: fm.description,
      path: found.path,
      content,
    },
    null,
    2,
  )
}
