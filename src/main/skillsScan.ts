// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Scan portable vault skills sidecar for Dashboard counts + read-only UI.
 *
 * Layout: `<skillsRoot>/{brain,cli}/`
 *   - own (brain): `brain/<name>.md`
 *   - imported (cli): `cli/<name>/SKILL.md` or `cli/<category>/<name>/SKILL.md`
 *
 * The categorised form is not hypothetical: 1244 packages were sorted into
 * eight folders, and a scanner that reads only the flat form reports zero
 * imported skills while the directory is full of them. brain-core had the same
 * blind spot and was patched by hand inside a container, which is how it went
 * unnoticed on the server for as long as it did.
 *
 * Skips `*.bak*`, dotfiles, anything starting with `_` (the vault holds a full
 * `_backup-cli-before-categorize-…` copy — walking into it would count every
 * package twice), `__pycache__/`.
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

import { writeFileKeepingPrevSync } from '../../packages/brain-core/src/archive/durableWrite.js'

export type SkillScopeKind = 'own' | 'imported'

export interface LocalSkillEntry {
  kind: SkillScopeKind
  name: string
  /** The `cli/<category>/` folder, when the package sits in one. */
  category?: string
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
  if (!name || name.startsWith('.') || name.startsWith('_')) return true
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

  // A directory holding SKILL.md is a package; one without, at the top level,
  // is a category. Two levels and no deeper — a stray tree must not turn a
  // dashboard count into a filesystem crawl.
  const cli = join(skillsRoot, 'cli')
  const walkCli = (base: string, depth: number, category?: string): void => {
    let names: string[]
    try {
      names = readdirSync(base)
    } catch {
      return
    }
    for (const name of names) {
      if (isJunkName(name)) continue
      const pack = join(base, name)
      try {
        if (!statSync(pack).isDirectory()) continue
      } catch {
        continue
      }
      const file = join(pack, 'SKILL.md')
      if (existsSync(file)) {
        const meta = skillMeta(file)
        out.push({
          kind: 'imported',
          name,
          category,
          description: meta.description,
          path: file,
          folderPath: pack,
          sizeBytes: meta.sizeBytes,
          mtimeMs: meta.mtimeMs,
        })
      } else if (depth < 2) {
        walkCli(pack, depth + 1, name)
      }
    }
  }
  if (existsSync(cli)) walkCli(cli, 1)

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

/**
 * Remove one skill from this vault.
 *
 * A `brain/` skill is one file. A `cli/` skill is its directory — SKILL.md plus
 * whatever the package brought with it — so removing only SKILL.md would leave
 * a folder that no longer lists as a skill and that nothing can reach to clean
 * up. Mirrors what the server does for a remote skill, deliberately: the full
 * app and Mini must not disagree about what deleting a skill means.
 *
 * The path is checked against the scan rather than trusted: it has to be a file
 * this scanner would have listed, which makes an arbitrary path from a window
 * unable to name anything outside the skills tree.
 */
export function deleteLocalSkillAt(
  skillsRoot: string,
  filePath: string,
): { ok: boolean; error?: string } {
  const known = listLocalSkillsAt(skillsRoot).find((s) => s.path === filePath)
  if (!known) return { ok: false, error: 'not a listed skill' }
  try {
    if (known.kind === 'own') rmSync(known.path, { force: true })
    else rmSync(known.folderPath, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * The largest skill file the window is allowed to load or store.
 *
 * A skill is an instruction sheet — the official guidance caps SKILL.md at 500
 * lines. This ceiling is far above that on purpose: it is not a style rule, it
 * is there so a stray path or a runaway generator cannot make the renderer
 * hold a hundred megabytes of text in a textarea.
 */
export const MAX_SKILL_BYTES = 512 * 1024

/**
 * Read one skill for editing in the app.
 *
 * Editing used to mean "open the file in whatever the OS opens .md with",
 * which is fine on a machine you own and useless the moment the skill lives
 * behind a server — so Mini grew an in-app editor and the full app did not.
 * Two apps, two answers to the same question. This is the desktop half of
 * closing that gap.
 *
 * The path is checked the same way deleting checks it: it has to be a file
 * this scanner would have listed. That is what stops a path from a window
 * naming something outside the skills tree — no separate containment check to
 * get subtly wrong, and no way for the two to disagree.
 */
export function readLocalSkillAt(
  skillsRoot: string,
  filePath: string,
): { ok: true; text: string; path: string } | { ok: false; error: string } {
  const known = listLocalSkillsAt(skillsRoot).find((s) => s.path === filePath)
  if (!known) return { ok: false, error: 'not a listed skill' }
  try {
    const size = statSync(known.path).size
    if (size > MAX_SKILL_BYTES) return { ok: false, error: 'file too large' }
    return { ok: true, text: readFileSync(known.path, 'utf8'), path: known.path }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Store an edited skill.
 *
 * Only over a file the scan already lists: this saves, it never creates. A
 * client that can conjure a skill by mistyping a path can litter the tree that
 * agents read from, and creating is a different act with different guarantees
 * (that is what the book builder's staged directory is for).
 *
 * The write keeps a `.prev` and lands atomically, so a crash mid-save leaves
 * either the old skill or the new one — never a half-written instruction sheet
 * that an agent will happily follow.
 */
export function writeLocalSkillAt(
  skillsRoot: string,
  filePath: string,
  text: string,
): { ok: boolean; error?: string } {
  const known = listLocalSkillsAt(skillsRoot).find((s) => s.path === filePath)
  if (!known) return { ok: false, error: 'not a listed skill' }
  const data = Buffer.from(String(text ?? ''), 'utf8')
  if (data.byteLength > MAX_SKILL_BYTES) return { ok: false, error: 'file too large' }
  try {
    writeFileKeepingPrevSync(known.path, data)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
