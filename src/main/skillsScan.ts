// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Scan portable vault skills sidecar for Dashboard counts + read-only UI.
 *
 * Layout: `<skillsRoot>/{brain,cli}/`
 *   - own (brain): `brain/<name>.md`
 *   - imported (cli): `cli/<name>/SKILL.md`
 *
 * Skips `*.bak*`, dotfiles, `_backups/`, `__pycache__/`.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

export type SkillScopeKind = 'own' | 'imported'

export interface LocalSkillEntry {
  kind: SkillScopeKind
  name: string
  description: string
  /** Path to the skill markdown file. */
  path: string
  /** Directory to open in Explorer (brain/ or cli/<name>/). */
  folderPath: string
  sizeBytes: number
  mtimeMs: number
}

export interface SkillsCountSplit {
  own: number
  imported: number
  total: number
}

const JUNK_DIR_NAMES = new Set(['__pycache__', '_backups', 'node_modules', '.git'])

function isJunkName(name: string): boolean {
  if (!name || name.startsWith('.')) return true
  if (name.includes('.bak')) return true
  if (name.endsWith('.pyc') || name.endsWith('.pyo')) return true
  if (JUNK_DIR_NAMES.has(name)) return true
  return false
}

function parseDescription(raw: string): string {
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end >= 0) {
      const block = raw.slice(3, end)
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
        if (d) return d.replace(/\s+/g, ' ').slice(0, 240)
      }
    }
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t === '---') continue
    if (t.startsWith('#')) return t.replace(/^#+\s*/, '').slice(0, 240)
    return t.slice(0, 240)
  }
  return ''
}

function skillMeta(file: string): { description: string; sizeBytes: number; mtimeMs: number } {
  const st = statSync(file)
  let description = ''
  try {
    description = parseDescription(readFileSync(file, 'utf8'))
  } catch {
    /* ignore */
  }
  return { description, sizeBytes: st.size, mtimeMs: st.mtimeMs }
}

/** List own + imported skills under a skills root (`…/skills`). */
export function listLocalSkillsAt(skillsRoot: string): LocalSkillEntry[] {
  const out: LocalSkillEntry[] = []

  const brain = join(skillsRoot, 'brain')
  if (existsSync(brain)) {
    try {
      for (const name of readdirSync(brain)) {
        if (isJunkName(name) || !name.endsWith('.md')) continue
        const file = join(brain, name)
        try {
          if (!statSync(file).isFile()) continue
        } catch {
          continue
        }
        const meta = skillMeta(file)
        out.push({
          kind: 'own',
          name: basename(name, '.md'),
          description: meta.description,
          path: file,
          folderPath: brain,
          sizeBytes: meta.sizeBytes,
          mtimeMs: meta.mtimeMs,
        })
      }
    } catch {
      /* ignore */
    }
  }

  const cli = join(skillsRoot, 'cli')
  if (existsSync(cli)) {
    try {
      for (const name of readdirSync(cli)) {
        if (isJunkName(name)) continue
        const pack = join(cli, name)
        let isDir = false
        try {
          isDir = statSync(pack).isDirectory()
        } catch {
          continue
        }
        if (!isDir) continue
        const file = join(pack, 'SKILL.md')
        if (!existsSync(file)) continue
        const meta = skillMeta(file)
        out.push({
          kind: 'imported',
          name,
          description: meta.description,
          path: file,
          folderPath: pack,
          sizeBytes: meta.sizeBytes,
          mtimeMs: meta.mtimeMs,
        })
      }
    } catch {
      /* ignore */
    }
  }

  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function countSkillsSplitAt(skillsRoot: string): SkillsCountSplit {
  const skills = listLocalSkillsAt(skillsRoot)
  let own = 0
  let imported = 0
  for (const s of skills) {
    if (s.kind === 'own') own++
    else imported++
  }
  return { own, imported, total: own + imported }
}

/**
 * Rewrite `skills/index.json` from the filesystem scan so it never lies as `[]`
 * while skills exist.
 */
export function writeSkillsIndexAt(skillsRoot: string): LocalSkillEntry[] {
  const skills = listLocalSkillsAt(skillsRoot)
  mkdirSync(skillsRoot, { recursive: true })
  const index = skills.map((s) => ({
    kind: s.kind === 'own' ? 'brain' : 'cli',
    name: s.name,
    description: s.description || undefined,
    localPath: s.path,
    mtime: s.mtimeMs,
    syncedAt: new Date().toISOString(),
    source: 'local-scan',
  }))
  writeFileSync(join(skillsRoot, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
  return skills
}

/**
 * Move `*.bak*` under skills/brain into skills/_backups/ and delete
 * `__pycache__` / `*.pyc` under the skills tree.
 */
export function cleanupSkillsJunkAt(skillsRoot: string): {
  movedBak: number
  removedPycache: number
  removedPyc: number
} {
  const result = { movedBak: 0, removedPycache: 0, removedPyc: 0 }
  if (!existsSync(skillsRoot)) return result

  const backups = join(skillsRoot, '_backups')
  const brainDir = join(skillsRoot, 'brain')
  const walk = (dir: string): void => {
    let ents
    try {
      ents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '_backups') continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === '__pycache__') {
          try {
            rmSync(full, { recursive: true, force: true })
            result.removedPycache++
          } catch {
            /* ignore */
          }
          continue
        }
        walk(full)
        continue
      }
      if (!ent.isFile()) continue
      if (ent.name.endsWith('.pyc') || ent.name.endsWith('.pyo')) {
        try {
          rmSync(full, { force: true })
          result.removedPyc++
        } catch {
          /* ignore */
        }
        continue
      }
      if (ent.name.includes('.bak') && dir === brainDir) {
        mkdirSync(backups, { recursive: true })
        const dest = join(backups, ent.name)
        try {
          if (existsSync(dest)) rmSync(dest, { force: true })
          renameSync(full, dest)
          result.movedBak++
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(skillsRoot)
  return result
}

/** Basename filters for copy/migrate of skills trees. */
export function shouldSkipSkillsCopyEntry(name: string): boolean {
  return isJunkName(name)
}
