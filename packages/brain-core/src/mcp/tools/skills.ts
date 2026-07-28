// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Local skills tools — list / get from filesystem.
 *
 * Layout under skillsRoot (portable vault sidecar or legacy brain vault):
 *   brain/<name>.md
 *   cli/<name>/SKILL.md
 *
 * list_skills(scope: 'own' | 'cli' | 'all') — preferred.
 * list_cli_skills — deprecated alias for scope:'cli'.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

export const listSkillsSchema = {
  type: 'object' as const,
  properties: {
    scope: {
      type: 'string' as const,
      enum: ['own', 'cli', 'all'],
      description:
        "own = brain/*.md workflow skills; cli = cli/*/SKILL.md packages; all = both (default)",
    },
  },
}
export const listCliSkillsSchema = { type: 'object' as const, properties: {} }
export const getSkillSchema = {
  type: 'object' as const,
  properties: { name: { type: 'string' } },
  required: ['name'] as string[],
}

export interface SkillsDeps {
  skillsRoot: string
}

interface SkillMeta {
  kind: 'brain' | 'cli'
  name: string
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

function isJunkSkillName(name: string): boolean {
  if (!name || name.startsWith('.')) return true
  if (name.includes('.bak')) return true
  return false
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
    const name = basename(ent.name, '.md')
    let description: string | undefined
    try {
      const raw = readFileSync(file, 'utf8')
      description = parseFrontmatter(raw).description
    } catch {
      /* ignore */
    }
    out.push({ kind: 'brain', name, description, path: file })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function listCli(skillsRoot: string): SkillMeta[] {
  const dir = join(skillsRoot, 'cli')
  if (!existsSync(dir)) return []
  const out: SkillMeta[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    if (isJunkSkillName(ent.name) || ent.name === '_backups' || ent.name === '__pycache__') continue
    const file = join(dir, ent.name, 'SKILL.md')
    if (!existsSync(file)) continue
    let description: string | undefined
    try {
      const raw = readFileSync(file, 'utf8')
      const fm = parseFrontmatter(raw)
      description = fm.description
    } catch {
      /* ignore */
    }
    out.push({ kind: 'cli', name: ent.name, description, path: file })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function resolveSkillsRoot(deps: SkillsDeps): string {
  return deps.skillsRoot
}

function parseScope(args: unknown): 'own' | 'cli' | 'all' {
  if (!args || typeof args !== 'object') return 'all'
  const scope = (args as { scope?: unknown }).scope
  if (scope === 'own' || scope === 'cli' || scope === 'all') return scope
  return 'all'
}

function formatList(root: string, skills: SkillMeta[], scope: string): string {
  if (skills.length === 0) {
    return JSON.stringify(
      {
        skills: [],
        skillsRoot: root,
        scope,
        hint:
          scope === 'cli'
            ? 'No cli/*/SKILL.md found'
            : scope === 'own'
              ? 'No brain/*.md skills found'
              : 'No skills found',
      },
      null,
      2,
    )
  }
  return JSON.stringify(
    {
      skillsRoot: root,
      scope,
      skills: skills.map((s) =>
        s.kind === 'brain'
          ? { kind: 'own', name: s.name, description: s.description, file: `${s.name}.md` }
          : { kind: 'cli', id: s.name, name: s.name, description: s.description },
      ),
    },
    null,
    2,
  )
}

/**
 * List skills. Prefer scope: own | cli | all (default all).
 * Previously listed only brain/*.md — callers that need CLI packages must pass scope.
 */
export function runListSkills(args: unknown, deps: SkillsDeps): string {
  const root = resolveSkillsRoot(deps)
  const scope = parseScope(args)
  const skills: SkillMeta[] = []
  if (scope === 'own' || scope === 'all') skills.push(...listBrain(root))
  if (scope === 'cli' || scope === 'all') skills.push(...listCli(root))
  return formatList(root, skills, scope)
}

/** @deprecated Prefer list_skills({ scope: 'cli' }). Kept for backward compatibility. */
export function runListCliSkills(_args: unknown, deps: SkillsDeps): string {
  return runListSkills({ scope: 'cli' }, deps)
}

export function runGetSkill(args: unknown, deps: SkillsDeps): string {
  const root = resolveSkillsRoot(deps)
  const name = args && typeof args === 'object' && 'name' in args ? String((args as { name: unknown }).name).trim() : ''
  if (!name) throw new Error('get_skill requires name')

  const brainFile = join(root, 'brain', `${name}.md`)
  const cliFile = join(root, 'cli', name, 'SKILL.md')

  let file: string | null = null
  let kind: 'brain' | 'cli' | null = null
  if (existsSync(brainFile) && statSync(brainFile).isFile()) {
    file = brainFile
    kind = 'brain'
  } else if (existsSync(cliFile)) {
    file = cliFile
    kind = 'cli'
  } else {
    // Case-insensitive fallback for cli folder names
    const cliDir = join(root, 'cli')
    if (existsSync(cliDir)) {
      const match = readdirSync(cliDir, { withFileTypes: true }).find(
        (e) => e.isDirectory() && e.name.toLowerCase() === name.toLowerCase(),
      )
      if (match) {
        const p = join(cliDir, match.name, 'SKILL.md')
        if (existsSync(p)) {
          file = p
          kind = 'cli'
        }
      }
    }
  }

  if (!file || !kind) {
    return JSON.stringify({ error: `skill not found: ${name}`, skillsRoot: root })
  }

  const content = readFileSync(file, 'utf8')
  const fm = parseFrontmatter(content)
  return JSON.stringify(
    {
      name: fm.name ?? name,
      kind,
      description: fm.description,
      path: file,
      content,
    },
    null,
    2,
  )
}
