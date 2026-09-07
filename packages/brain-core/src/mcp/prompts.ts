// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The prompt library — `vault/prompts/*.md`, served as MCP prompts.
 *
 * Why a protocol capability and not a sixteenth tool: MCP has a slot for this
 * already, and clients render it. A prompt published through `prompts/list`
 * shows up in Claude Code as `/name` and in Claude Desktop as a picker, which
 * is the whole point — a prompt you have to remember to go and open is a file,
 * not a library.
 *
 * It also sidesteps the trap `list_skills` fell into. `prompts/list` returns
 * names, descriptions and argument signatures only; the body travels on
 * `prompts/get`, when someone has actually chosen one. A thousand prompts
 * would still list in a few kilobytes.
 *
 * One file, one prompt:
 *
 *     ---
 *     name: bug-report            # optional, defaults to the filename
 *     description: Turn loose symptoms into a filed bug
 *     arguments:
 *       - name: symptom
 *         description: What you actually saw
 *         required: true
 *       - name: repro
 *     ---
 *     Here is what happened: {{symptom}}
 *     Steps: {{repro}}
 *
 * With no `arguments:` block the placeholders in the body are the signature,
 * all of them required — the common case, written the short way.
 */
import { readdirSync, readFileSync, existsSync, statSync, type Dirent } from 'node:fs'
import { join, basename } from 'node:path'

export const PROMPTS_DIR = 'prompts'

export interface PromptArgument {
  name: string
  description?: string
  required: boolean
}

export interface PromptDef {
  name: string
  description?: string
  arguments: PromptArgument[]
  /** Body with frontmatter stripped. */
  body: string
  path: string
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g

function splitFrontmatter(raw: string): { head: string; body: string } {
  if (!raw.startsWith('---')) return { head: '', body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { head: '', body: raw }
  const afterMarker = raw.indexOf('\n', end + 1)
  return {
    head: raw.slice(3, end),
    body: afterMarker < 0 ? '' : raw.slice(afterMarker + 1),
  }
}

function unquote(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1)
  }
  return t
}

/**
 * A deliberately small YAML reader: top-level `key: value`, plus one
 * list-of-maps under `arguments:` and its `[a, b]` shorthand.
 *
 * Pulling in a YAML parser for two shapes would be the larger change, and the
 * failure mode of this one is a prompt that lists no arguments — visible the
 * first time it is used, and harmless.
 */
function parseHead(head: string): { name?: string; description?: string; args?: PromptArgument[] } {
  const out: { name?: string; description?: string; args?: PromptArgument[] } = {}
  const lines = head.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) continue // continuation of a block handled below
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    const inline = m[2].trim()

    if (key === 'name') {
      out.name = unquote(inline)
      continue
    }
    if (key === 'description') {
      if (inline && inline !== '>' && inline !== '>-' && inline !== '|' && inline !== '|-') {
        out.description = unquote(inline)
      } else {
        const parts: string[] = []
        for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) parts.push(lines[j].trim())
        if (parts.length) out.description = parts.join(' ')
      }
      continue
    }
    if (key !== 'arguments') continue

    // arguments: [a, b]
    if (inline.startsWith('[')) {
      out.args = inline
        .slice(1, inline.endsWith(']') ? -1 : undefined)
        .split(',')
        .map((s) => unquote(s))
        .filter(Boolean)
        .map((name) => ({ name, required: true }))
      continue
    }

    // arguments:
    //   - name: x
    //     description: y
    //     required: true
    const args: PromptArgument[] = []
    let cur: PromptArgument | null = null
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (l.trim() && !/^\s/.test(l)) break
      const item = /^\s*-\s*(.*)$/.exec(l)
      if (item) {
        cur = { name: '', required: false }
        args.push(cur)
        const first = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(item[1].trim())
        if (first) applyArgField(cur, first[1], first[2])
        else if (item[1].trim()) cur.name = unquote(item[1])
        continue
      }
      const field = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(l)
      if (field && cur) applyArgField(cur, field[1], field[2])
    }
    out.args = args.filter((a) => a.name)
  }
  return out
}

function applyArgField(arg: PromptArgument, key: string, value: string): void {
  const v = unquote(value)
  if (key === 'name') arg.name = v
  else if (key === 'description') arg.description = v
  else if (key === 'required') arg.required = v === 'true' || v === 'yes'
}

function placeholdersOf(body: string): string[] {
  const seen: string[] = []
  for (const m of body.matchAll(PLACEHOLDER)) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }
  return seen
}

export function parsePrompt(raw: string, file: string): PromptDef {
  const { head, body } = splitFrontmatter(raw)
  const meta = parseHead(head)
  const fromBody = placeholdersOf(body)
  // Declared arguments win, but a placeholder nobody declared is still an
  // argument — the prompt will not render without it.
  const args: PromptArgument[] = meta.args ? [...meta.args] : fromBody.map((name) => ({ name, required: true }))
  for (const name of fromBody) {
    if (!args.some((a) => a.name === name)) args.push({ name, required: true })
  }
  return {
    name: meta.name || basename(file, '.md'),
    description: meta.description,
    arguments: args,
    body,
    path: file,
  }
}

/** Read every prompt in `<vaultRoot>/prompts`. Unreadable files are skipped, not fatal. */
export function loadPrompts(vaultRoot: string): PromptDef[] {
  const dir = join(vaultRoot, PROMPTS_DIR)
  if (!vaultRoot || !existsSync(dir)) return []
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: PromptDef[] = []
  const seen = new Set<string>()
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue
    if (ent.name.startsWith('.') || ent.name.startsWith('_') || ent.name.includes('.bak')) continue
    const file = join(dir, ent.name)
    try {
      if (statSync(file).size > 512 * 1024) continue
      const p = parsePrompt(readFileSync(file, 'utf8'), file)
      // Two files claiming one name would make `prompts/get` a coin flip.
      if (seen.has(p.name)) continue
      seen.add(p.name)
      out.push(p)
    } catch {
      /* a prompt that cannot be read is not a reason to serve none */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Substitute `{{arg}}`. Placeholders with no value are left visible, not blanked. */
export function renderPrompt(def: PromptDef, args: Record<string, unknown> = {}): string {
  const missing = def.arguments
    .filter((a) => a.required)
    .filter((a) => {
      const v = args[a.name]
      return v === undefined || v === null || String(v).trim() === ''
    })
    .map((a) => a.name)
  if (missing.length) {
    throw new Error(`prompt "${def.name}" needs: ${missing.join(', ')}`)
  }
  return def.body.replace(PLACEHOLDER, (whole, key: string) => {
    const v = args[key]
    return v === undefined || v === null ? whole : String(v)
  })
}
