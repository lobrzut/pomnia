// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Skills and prompts, for clients that hold no vault.
 *
 * Pomnia Mini used to list skills by asking `/sync/manifest` — the replication
 * endpoint — and picking the `skills/` rows out of the answer. That works, and
 * measured against the real vault it costs 59.6 seconds and 2.8 MB, because a
 * manifest is a sha256 of every file in the vault and the client wanted a list
 * of names. It also answered with 8044 entries where there are 1259 skills:
 * a manifest is a replication artifact, so backups and `.bak` files are in it
 * by design.
 *
 * Replication was the wrong tool for a question about content. These routes
 * ask the same code the MCP tools ask, so a list here and a list an agent sees
 * cannot disagree.
 *
 * Everything is relative to a root and validated before touching disk: a path
 * arrives from a window on someone's laptop and decides which file on the
 * server gets replaced. A value that climbs out of the root is refused, never
 * normalised — normalising an escape attempt turns it into a successful write
 * somewhere unexpected.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { loadPrompts, PROMPTS_DIR, type PromptArgument } from '../mcp/prompts.js'

export type LibraryError = { error: 'bad-path' | 'not-found' | 'too-large' | 'failed'; detail: string }

/** A skill body over this is not a skill any more. */
const MAX_BODY_BYTES = 1024 * 1024

function isBadSegment(seg: string): boolean {
  return seg === '' || seg === '.' || seg === '..'
}

/**
 * Accept exactly the shapes that are skills, and nothing else.
 *
 *   brain/<name>.md
 *   cli/<name>/SKILL.md
 *   cli/<category>/<name>/SKILL.md
 */
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

function readText(file: string): { content: string } | LibraryError {
  try {
    if (!existsSync(file)) return { error: 'not-found', detail: file }
    if (statSync(file).size > MAX_BODY_BYTES) {
      return { error: 'too-large', detail: `over ${MAX_BODY_BYTES / 1024} kB` }
    }
    return { content: readFileSync(file, 'utf8') }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

/**
 * Write, reporting whether anything actually changed.
 *
 * `unchanged` is not a nicety: the editor saves on a keystroke the user did
 * not think of as an edit, and a vault that records a new mtime for an
 * identical file makes every replica fetch it again.
 */
function writeText(file: string, content: string): { unchanged: boolean } | LibraryError {
  if (Buffer.byteLength(content, 'utf8') > MAX_BODY_BYTES) {
    return { error: 'too-large', detail: `over ${MAX_BODY_BYTES / 1024} kB` }
  }
  try {
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return { unchanged: true }
    writeFileSync(file, content, 'utf8')
    return { unchanged: false }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

export function readSkill(skillsRoot: string, rel: string): { path: string; content: string } | LibraryError {
  if (!isSafeSkillRel(rel)) return { error: 'bad-path', detail: rel }
  const r = readText(join(skillsRoot, rel))
  return 'error' in r ? r : { path: rel, content: r.content }
}

/** Only an existing skill can be written here — creating one is a separate decision. */
export function writeSkill(
  skillsRoot: string,
  rel: string,
  content: string,
): { path: string; unchanged: boolean } | LibraryError {
  if (!isSafeSkillRel(rel)) return { error: 'bad-path', detail: rel }
  const file = join(skillsRoot, rel)
  if (!existsSync(file)) return { error: 'not-found', detail: rel }
  const r = writeText(file, content)
  return 'error' in r ? r : { path: rel, unchanged: r.unchanged }
}

/**
 * Remove a skill.
 *
 * A `brain/` skill is one file. A `cli/` skill is a *directory* — SKILL.md
 * plus whatever the package brought with it — so deleting only SKILL.md would
 * leave a folder that no longer lists as a skill and that nothing can reach or
 * clean up. The directory goes.
 *
 * Guarded twice on purpose: the path passes the same validator as a read, and
 * then the directory being removed must be the immediate parent of a SKILL.md
 * under `cli/`. A recursive delete is the one operation here where being
 * approximately right is not good enough.
 */
export function deleteSkill(skillsRoot: string, rel: string): { path: string } | LibraryError {
  if (!isSafeSkillRel(rel)) return { error: 'bad-path', detail: rel }
  const file = join(skillsRoot, rel)
  if (!existsSync(file)) return { error: 'not-found', detail: rel }
  try {
    const parts = rel.split('/')
    if (parts[0] === 'brain') {
      rmSync(file)
      return { path: rel }
    }
    const dir = dirname(file)
    // Never the category folder, never `cli/` itself: only the skill's own
    // directory, which is the one holding the SKILL.md we just validated.
    if (parts.length < 3 || parts[parts.length - 1] !== 'SKILL.md') {
      return { error: 'bad-path', detail: rel }
    }
    rmSync(dir, { recursive: true, force: true })
    return { path: rel }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

export function deletePrompt(vaultRoot: string, name: string): { name: string } | LibraryError {
  if (!isSafePromptName(name)) return { error: 'bad-path', detail: name }
  const file = join(vaultRoot, PROMPTS_DIR, `${name}.md`)
  if (!existsSync(file)) return { error: 'not-found', detail: name }
  try {
    rmSync(file)
    return { name }
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
}

export interface PromptSummary {
  name: string
  description?: string
  arguments: PromptArgument[]
  size: number
}

export function listPrompts(vaultRoot: string): PromptSummary[] {
  return loadPrompts(vaultRoot).map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
    size: Buffer.byteLength(p.body, 'utf8'),
  }))
}

/**
 * Prompts are addressed by file stem, not by the `name:` in the frontmatter.
 *
 * The two can differ, and the editor has to reach the file it is going to
 * write back. Resolving through the frontmatter would let a prompt rename
 * itself out of reach of the editor that renamed it.
 */
export function readPrompt(vaultRoot: string, name: string): { name: string; content: string } | LibraryError {
  if (!isSafePromptName(name)) return { error: 'bad-path', detail: name }
  const r = readText(join(vaultRoot, PROMPTS_DIR, `${name}.md`))
  return 'error' in r ? r : { name, content: r.content }
}

/** Unlike skills, a prompt may be created here — the library starts empty. */
export function writePrompt(
  vaultRoot: string,
  name: string,
  content: string,
): { name: string; unchanged: boolean; created: boolean } | LibraryError {
  if (!isSafePromptName(name)) return { error: 'bad-path', detail: name }
  const dir = join(vaultRoot, PROMPTS_DIR)
  const file = join(dir, `${name}.md`)
  const existed = existsSync(file)
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch (e) {
    return { error: 'failed', detail: (e as Error).message }
  }
  const r = writeText(file, content)
  return 'error' in r ? r : { name, unchanged: r.unchanged, created: !existed }
}
