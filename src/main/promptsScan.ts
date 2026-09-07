// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The prompt library on this machine — `<vaultRoot>/prompts/*.md`.
 *
 * Built as the sibling of skillsScan, because it is the same job: read a
 * directory of markdown the user maintains and show it without pretending to
 * own it. What differs is who consumes them. A skill is loaded by an agent
 * mid-task; a prompt is served over MCP `prompts/list` and appears to the user
 * as `/name` in their client.
 *
 * Frontmatter parsing lives in brain-core (`mcp/prompts.ts`) and is the
 * authority — it is what the server actually serves. This module reads the
 * same files only well enough to list them, so a difference between the two
 * shows up as a missing description, never as a prompt that renders one way
 * here and another way in the agent.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface LocalPromptEntry {
  name: string
  description: string
  /** Argument names, in the order they appear. Required ones carry a flag. */
  arguments: { name: string; required: boolean }[]
  path: string
  folderPath: string
  sizeBytes: number
  mtimeMs: number
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g

/** Files that are notes to self, not prompts. Matches the server's filter. */
function isSkipped(name: string): boolean {
  if (!name.endsWith('.md')) return true
  return name.startsWith('.') || name.startsWith('_') || name.includes('.bak')
}

function frontmatter(raw: string): { head: string; body: string } {
  if (!raw.startsWith('---')) return { head: '', body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { head: '', body: raw }
  const after = raw.indexOf('\n', end + 1)
  return { head: raw.slice(3, end), body: after < 0 ? '' : raw.slice(after + 1) }
}

function readDescription(head: string): string {
  const m = head.match(/^description:\s*(?:>-?\s*)?(?:"([^"]*)"|'([^']*)'|(.+))?$/m)
  if (!m) return ''
  const d = (m[1] ?? m[2] ?? m[3] ?? '').trim()
  return d && d !== '>' && d !== '>-' ? d.replace(/\s+/g, ' ').slice(0, 240) : ''
}

/**
 * Which arguments the prompt takes.
 *
 * Declared names come from the `arguments:` block; a placeholder nobody
 * declared is still an argument, because the prompt will not render without
 * it. Same rule the server applies, so the list here matches the signature a
 * client is offered.
 */
function readArguments(head: string, body: string): { name: string; required: boolean }[] {
  const out: { name: string; required: boolean }[] = []
  const block = head.split('\n')
  const start = block.findIndex((l) => /^arguments:/.test(l))
  if (start >= 0) {
    const inline = block[start].slice('arguments:'.length).trim()
    if (inline.startsWith('[')) {
      for (const raw of inline.replace(/^\[|\]$/g, '').split(',')) {
        const name = raw.trim().replace(/^["']|["']$/g, '')
        if (name) out.push({ name, required: true })
      }
    } else {
      let current: { name: string; required: boolean } | null = null
      for (let i = start + 1; i < block.length; i++) {
        const l = block[i]
        if (l.trim() && !/^\s/.test(l)) break
        const item = /^\s*-\s*(?:name:\s*)?(.*)$/.exec(l)
        if (item) {
          const name = item[1].trim().replace(/^["']|["']$/g, '')
          current = { name, required: false }
          if (name) out.push(current)
          continue
        }
        if (!current) continue
        const req = /^\s+required:\s*(\S+)/.exec(l)
        if (req) current.required = req[1] === 'true' || req[1] === 'yes'
        const nm = /^\s+name:\s*(\S+)/.exec(l)
        if (nm && !current.name) {
          current.name = nm[1].replace(/^["']|["']$/g, '')
          if (current.name) out.push(current)
        }
      }
    }
  }
  for (const m of body.matchAll(PLACEHOLDER)) {
    if (!out.some((a) => a.name === m[1])) out.push({ name: m[1], required: true })
  }
  return out.filter((a) => a.name)
}

/** List the prompt library under a vault root. A missing directory is normal, not an error. */
export function listLocalPromptsAt(vaultRoot: string): LocalPromptEntry[] {
  const dir = join(vaultRoot, 'prompts')
  if (!vaultRoot || !existsSync(dir)) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: LocalPromptEntry[] = []
  for (const name of names) {
    if (isSkipped(name)) continue
    const file = join(dir, name)
    try {
      const st = statSync(file)
      if (!st.isFile()) continue
      const raw = readFileSync(file, 'utf8')
      const { head, body } = frontmatter(raw)
      out.push({
        name: basename(name, '.md'),
        description: readDescription(head),
        arguments: readArguments(head, body),
        path: file,
        folderPath: dir,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      })
    } catch {
      /* one unreadable file is not a reason to list none */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function countLocalPromptsAt(vaultRoot: string): number {
  return listLocalPromptsAt(vaultRoot).length
}

/** Where a new prompt goes. Returns the file path so the caller can open it. */
export function createLocalPrompt(vaultRoot: string, name: string, content: string): string {
  const dir = join(vaultRoot, 'prompts')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}.md`)
  if (!existsSync(file)) writeFileSync(file, content, 'utf8')
  return file
}
