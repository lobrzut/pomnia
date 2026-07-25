/**
 * MCP tools: get_user_profile + memory
 *
 * Read/write of `<vault>/USER.md` — the §-delimited persistent profile that
 * every agent gets injected at session start. Ports Python
 * `dashboard/mcp_rag.py` handlers for both tools verbatim so behavior is
 * indistinguishable from the Python impl (agents already know these
 * semantics).
 *
 * The 2200-char limit is the same as Hermes' USER.md convention — agents
 * consolidate rather than sprawl. Operational “how to work with me” lives in
 * sibling `AGENTS.md` (outside the 2200 cap). `add` finds the right `§`
 * section and appends into it, or creates the section at end.
 * `replace`/`remove` are substring-scoped and single-shot.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

export const USER_MAX = 2200

/** Reject changelog / ship / trading noise before it enters USER.md. */
const PROFILE_GARBAGE_RE =
  /\b(next\s*ship|pack:win|installer|changelog|release\s*notes?|0\.\d+\.\d+(?:-setup)?|pine\s*script|tradingview|atr\s*stop|rsi\b|macd|futures)\b/i

export const getUserProfileSchema = {
  type: 'object' as const,
  properties: {},
}

export const memorySchema = {
  type: 'object' as const,
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'replace', 'remove'],
      description: 'add = new §-entry, replace = update via substring match, remove = delete via substring match',
    },
    category: {
      type: 'string',
      enum: ['user', 'tech', 'comm', 'income'],
      default: 'user',
      description:
        "Section: 'user'→PROFIL (person), 'tech'→TECH (durable product/stack identity — not release notes), 'comm'→KOMUNIKACJA, 'income'→ZAROBEK",
    },
    content: {
      type: 'string',
      description:
        'For add: one durable identity fact (decision/threat/irritant/tempo/brief — not a changelog). For replace/remove: substring to find. Never add installer paths, version notes, ship notes, or one-off build fixes to USER.md.',
    },
    new_content: {
      type: 'string',
      description: 'For replace: the replacement text.',
    },
  },
  required: ['action', 'content'],
}

const memoryArgsSchema = z.object({
  action: z.enum(['add', 'replace', 'remove']),
  category: z.enum(['user', 'tech', 'comm', 'income']).optional().default('user'),
  content: z.string(),
  new_content: z.string().optional().default(''),
})

const CATEGORY_TO_SECTION: Record<string, string> = {
  user: 'PROFIL',
  tech: 'TECH',
  comm: 'KOMUNIKACJA',
  income: 'ZAROBEK',
}

export interface UserProfileDeps {
  /** Path to USER.md — typically <vaultRoot>/USER.md. */
  userMdPath: string
}

/** Read the whole profile file, or empty string if missing. */
function readProfile(path: string): string {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

/** Atomic write via `.tmp` + rename. Matches Python impl. */
function writeProfile(path: string, content: string): void {
  const tmp = path + '.tmp'
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, path)
}

function agentsMdHint(userMdPath: string): string {
  const agentsPath = join(dirname(userMdPath), 'AGENTS.md')
  if (!existsSync(agentsPath)) {
    return (
      `\n\n[AGENTS] No vault/AGENTS.md yet — create it for operational brief ` +
      `(how to work with this user + Handshake) outside the ${USER_MAX}-char USER.md cap.`
    )
  }
  try {
    const brief = readFileSync(agentsPath, 'utf-8').trim()
    if (!brief) return `\n\n[AGENTS] vault/AGENTS.md exists but is empty.`
    // Cap so get_user_profile stays usable; full brief is on disk.
    const preview =
      brief.length > 1200
        ? `${brief.slice(0, 1200)}\n…[AGENTS.md truncated — read vault/AGENTS.md]`
        : brief
    return `\n\n[AGENTS — operational brief, outside USER.md ${USER_MAX}]\n${preview}`
  } catch {
    return `\n\n[AGENTS] vault/AGENTS.md present but unreadable.`
  }
}

export async function runGetUserProfile(
  _args: unknown,
  deps: UserProfileDeps,
): Promise<string> {
  if (!existsSync(deps.userMdPath)) {
    return (
      'No user profile yet. Call memory(add,...) to create entries.' + agentsMdHint(deps.userMdPath)
    )
  }
  const content = readProfile(deps.userMdPath)
  const used = content.length
  const pct = Math.floor((used / USER_MAX) * 100)
  return (
    `[USER PROFILE — ${used}/${USER_MAX} chars (${pct}%)]\n\n${content}` + agentsMdHint(deps.userMdPath)
  )
}

export async function runMemory(
  args: unknown,
  deps: UserProfileDeps,
): Promise<string> {
  const a = memoryArgsSchema.parse(args)
  const content = a.content.trim()
  const newContent = a.new_content.trim()

  if (!content) return 'error: content required'

  // Bridge: refuse ship/changelog/trading noise on add/replace-into-profile
  const probe = a.action === 'replace' ? newContent || content : content
  if ((a.action === 'add' || a.action === 'replace') && PROFILE_GARBAGE_RE.test(probe)) {
    return (
      'error: refused — looks like ship/changelog/trading noise. ' +
      'USER.md keeps durable identity patterns only; put session dumps in save_conversation. ' +
      'Operational agent brief → vault/AGENTS.md (outside 2200).'
    )
  }

  const section = `§ ${CATEGORY_TO_SECTION[a.category] ?? 'PROFIL'}`
  const current = readProfile(deps.userMdPath)
  let next: string

  if (a.action === 'add') {
    if (current.includes(section)) {
      // Insert at end of that section (before the next `\n§ ` or EOF).
      const idx = current.indexOf(section)
      const nextSec = current.indexOf('\n§ ', idx + 1)
      const insertAt = nextSec !== -1 ? nextSec : current.length
      // Find the last newline in [idx, insertAt) to append after — matches Python.
      const blockEnd = current.lastIndexOf('\n', insertAt - 1)
      // If no newline in block (edge case), fall back to insertAt.
      const cutAt = blockEnd > idx ? blockEnd + 1 : insertAt
      next = current.slice(0, cutAt) + content + '\n' + current.slice(cutAt)
    } else {
      next = current.replace(/\s+$/, '') + `\n\n${section}\n${content}\n`
    }
  } else if (a.action === 'replace') {
    if (!current.includes(content)) {
      return `Substring not found: '${content.slice(0, 60)}...'`
    }
    // Single-shot replace (first occurrence only), matches Python `str.replace(a, b, 1)`.
    next = current.replace(content, newContent)
  } else {
    // action === 'remove'
    if (!current.includes(content)) {
      return `Substring not found: '${content.slice(0, 60)}...'`
    }
    next = current.replace(content, '')
    // Collapse triple+ blank lines to just double, matches Python cleanup.
    next = next.replace(/\n{3,}/g, '\n\n')
  }

  if (next.length > USER_MAX) {
    const over = next.length - USER_MAX
    return (
      `Profile full! ${over} chars over limit (${USER_MAX}). ` +
      `Remove or consolidate existing entries first (prefer replace/compress). ` +
      `Operational brief → vault/AGENTS.md.\n\nCurrent:\n${current}`
    )
  }

  writeProfile(deps.userMdPath, next)
  const used = next.length
  const pct = Math.floor((used / USER_MAX) * 100)
  return `✓ Profile updated (${a.action}) — ${used}/${USER_MAX} chars (${pct}%)\n\n${next}`
}
