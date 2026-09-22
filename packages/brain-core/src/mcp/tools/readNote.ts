// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * read_note — fetch the full text behind a compact search hit.
 *
 * search_library in compact mode returns a path, a title, a date and one line
 * of snippet: enough to decide relevance without carrying the whole passage.
 * When a hit turns out to matter, read_note hands back the file it names —
 * so the model pays for full text only where it actually needs it, instead of
 * on every hit of every search.
 *
 * The path comes back from the model, so it is untrusted: it is confined to the
 * vault, must resolve inside it, and a symlink or `..` that would escape is
 * refused rather than followed. Reading is all this tool does — there is no
 * write path here by design.
 */
import { existsSync, realpathSync, statSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

/** Full notes are small; a library chunk's source file can be large. Cap the read. */
const DEFAULT_MAX = 12_000
const HARD_MAX = 40_000

export const readNoteSchema = {
  type: 'object' as const,
  properties: {
    path: {
      type: 'string' as const,
      description: 'The `path` of a search_library hit. Must be inside the vault.',
    },
    max_chars: {
      type: 'integer' as const,
      description: `Cap the returned text (default ${DEFAULT_MAX}, max ${HARD_MAX}). The reply says if it was truncated.`,
    },
  },
  required: ['path'],
}

export interface ReadNoteDeps {
  vaultRoot: string
}

/** Resolve `p` and return it only if it stays inside `root`, following symlinks. */
function insideVault(root: string, p: string): string | null {
  const base = resolve(root)
  const abs = isAbsolute(p) ? resolve(p) : resolve(base, p)
  // A path that resolves outside the vault is refused before any stat, so a
  // crafted `..` cannot even probe for existence elsewhere.
  if (abs !== base && !abs.startsWith(base + sep)) return null
  if (!existsSync(abs)) return abs === base ? null : abs // let caller's stat report not_found
  // Follow symlinks and re-check: a link inside the vault must not point out of it.
  try {
    const real = realpathSync(abs)
    if (real !== base && !real.startsWith(base + sep)) return null
    return real
  } catch {
    return abs
  }
}

export function runReadNote(args: unknown, deps: ReadNoteDeps): string {
  const a = (args ?? {}) as { path?: unknown; max_chars?: unknown }
  const rawPath = typeof a.path === 'string' ? a.path.trim() : ''
  if (!rawPath) return JSON.stringify({ error: 'bad_path', detail: 'Give the path of a search_library hit.' })

  const safe = insideVault(deps.vaultRoot, rawPath)
  if (!safe) {
    return JSON.stringify({
      error: 'outside_vault',
      detail: 'This path is not inside the vault, so read_note will not open it.',
    })
  }
  if (!existsSync(safe)) return JSON.stringify({ error: 'not_found', detail: rawPath })
  let st
  try {
    st = statSync(safe)
  } catch (e) {
    return JSON.stringify({ error: 'unreadable', detail: (e as Error).message })
  }
  if (!st.isFile()) return JSON.stringify({ error: 'not_a_file', detail: rawPath })

  const cap = Math.min(
    typeof a.max_chars === 'number' && a.max_chars > 0 ? Math.floor(a.max_chars) : DEFAULT_MAX,
    HARD_MAX,
  )
  let text: string
  try {
    text = readFileSync(safe, 'utf8')
  } catch (e) {
    return JSON.stringify({ error: 'unreadable', detail: (e as Error).message })
  }
  const truncated = text.length > cap
  return JSON.stringify({
    path: rawPath,
    bytes: st.size,
    chars: text.length,
    truncated,
    ...(truncated ? { note: `Showing the first ${cap} of ${text.length} chars. Raise max_chars for more.` } : {}),
    text: truncated ? text.slice(0, cap) : text,
  })
}
