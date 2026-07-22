/**
 * MCP tools — public surface. One place that owns:
 *   - the full tool catalog (name + description + inputSchema) that MCP
 *     clients discover via `tools/list`,
 *   - dispatch to the right handler when a client calls `tools/call`.
 *
 * The load-bearing tools are real (search, save, profile, memory, library_status,
 * list/get skills); remaining stubs live in stubs.ts.
 */

import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import type { EmbedClient } from '../../rag/embed.js'
import { indexFiles } from '../../rag/indexer.js'

import { runSearchLibrary, searchLibrarySchema } from './searchLibrary.js'
import { runSaveConversation, saveConversationSchema } from './saveConversation.js'
import {
  runGetUserProfile,
  runMemory,
  getUserProfileSchema,
  memorySchema,
} from './userProfile.js'
import { runLibraryStatus, libraryStatusSchema } from './libraryStatus.js'
import {
  runListSkills,
  runListCliSkills,
  runGetSkill,
  listSkillsSchema,
  listCliSkillsSchema,
  getSkillSchema,
} from './skills.js'
import { stubSchemas, runStub } from './stubs.js'

export interface ToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface ToolContext {
  db: Database.Database
  embedder: EmbedClient
  vaultRoot: string
  userMdPath: string
  /**
   * Skills filesystem root — prefer `<encryptedVault>/skills` (portable sidecar),
   * else `<dataDir>/vault/skills` (legacy).
   */
  skillsRoot: string
  /** Proof phrase for agent first-reply greeting (from Pomnia Settings). */
  handshakePhrase?: string
  /** When false, omit Handshake hints from tool descriptions / profile preamble. */
  handshakeEnabled?: boolean
}

const DEFAULT_HANDSHAKE = 'OK to Go Go Go'

function handshakeHint(ctx?: Pick<ToolContext, 'handshakePhrase' | 'handshakeEnabled'>): string | null {
  if (ctx && ctx.handshakeEnabled === false) return null
  const phrase = (ctx?.handshakePhrase?.trim() || DEFAULT_HANDSHAKE).trim()
  return `If Pomnia Brain is connected: open your FIRST assistant reply in each conversation with exactly "${phrase}" on its own first line (proof wiring works), then continue normally. Skip on later turns.`
}

/** MCP-standard tool catalog. Descriptions steer the agent loop:
 *  read (profile / search / skills) proactively; write only on explicit save. */
export function listTools(ctx?: Pick<ToolContext, 'handshakePhrase' | 'handshakeEnabled'>): ToolDef[] {
  const hs = handshakeHint(ctx)
  return [
    {
      name: 'search_library',
      description:
        'Hybrid semantic+keyword search over the private Brain index (distilled notes + library). Call proactively before technical answers that may already be decided in the vault. Query in the user language (PL+EN vault). Returns top chunks with source, page, score. This is retrieval only — not chat generation.' +
        (hs ? ` ${hs}` : ''),
      inputSchema: searchLibrarySchema,
    },
    {
      name: 'save_conversation',
      description:
        "Save this conversation to vault/sessions/ as structured markdown. Call ONLY when the user says 'zapisz do brain' / 'save to brain' (or clear equivalent) — never auto-dump chats. Prefer concrete files, commands, errors, decisions over abstract fluff. Pomnia Desktop does not capture chats by itself.",
      inputSchema: saveConversationSchema,
    },
    {
      name: 'get_user_profile',
      description:
        "Read vault/USER.md — persistent §-delimited profile. Call early in any non-trivial session so you know who you're talking to (preferences, stack, constraints)." +
        (hs ? ` ${hs}` : ''),
      inputSchema: getUserProfileSchema,
    },
    {
      name: 'memory',
      description:
        'Add/replace/remove entries in vault/USER.md. ONLY durable identity facts the user confirmed — never session ship notes, version changelogs, installer paths, one-off build/JSDoc fixes, or release checklists. § PROFIL = person (nick, stack, prefs); § TECH = durable product/stack identity (e.g. "builds Pomnia Brain/MCP"), NOT release notes. Session dumps → save_conversation. Categories: user, tech, comm, income. Max ~2200 chars total.',
      inputSchema: memorySchema,
    },
    {
      name: 'library_status',
      description: 'Report counts from the brain index — number of files, chunks, and a sample of file names.',
      inputSchema: libraryStatusSchema,
    },
    {
      name: 'list_skills',
      description:
        'List brain workflow skills (skills/brain/*.md), preferring portable <vault>/skills. Call when choosing how to approach a task that may have a skill.',
      inputSchema: listSkillsSchema,
    },
    {
      name: 'list_cli_skills',
      description:
        'List CLI expertise skills (skills/cli/*/SKILL.md) from the active skills root. Use when domain expertise (networking, trading, security, …) may apply.',
      inputSchema: listCliSkillsSchema,
    },
    {
      name: 'get_skill',
      description:
        'Load a skill by name (brain .md or cli SKILL.md). Returns full markdown — follow it for that task.',
      inputSchema: getSkillSchema,
    },
    // Remaining stubs — schemas present so tools/list stays complete.
    { name: 'run_skill', description: 'STUB — coming later.', inputSchema: stubSchemas.run_skill },
    { name: 'search_code', description: 'STUB — coming later.', inputSchema: stubSchemas.search_code },
    {
      name: 'code_status',
      description: 'STUB — coming later.',
      inputSchema: stubSchemas.code_status,
    },
  ]
}

/**
 * Dispatch a `tools/call` — returns the tool's text response (string).
 * Unknown tools throw so the MCP server can convert to a proper error.
 */
export async function callTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case 'search_library':
      return runSearchLibrary(args, { db: ctx.db, embedder: ctx.embedder })
    case 'save_conversation': {
      const saved = await runSaveConversation(args, { vaultRoot: ctx.vaultRoot })
      // Fire-and-forget: index the new session file without blocking the MCP reply.
      void indexFiles(ctx.db, ctx.embedder, [
        { path: saved.path, text: readFileSync(saved.path, 'utf8') },
      ]).catch((err) => {
        console.error(
          '[brain-core] session index after save_conversation failed:',
          err instanceof Error ? err.message : err,
        )
      })
      return saved.text
    }
    case 'get_user_profile': {
      const profile = await runGetUserProfile(args, { userMdPath: ctx.userMdPath })
      if (ctx.handshakeEnabled === false) return profile
      const phrase = (ctx.handshakePhrase?.trim() || 'OK to Go Go Go').trim()
      return (
        `[POMNIA HANDSHAKE] If this is your first assistant reply in the conversation, ` +
        `open with exactly "${phrase}" on its own first line, then continue.\n\n` +
        profile
      )
    }
    case 'memory':
      return runMemory(args, { userMdPath: ctx.userMdPath })
    case 'library_status':
      return runLibraryStatus(args, { db: ctx.db })

    case 'list_skills':
      return runListSkills(args, { skillsRoot: ctx.skillsRoot })
    case 'list_cli_skills':
      return runListCliSkills(args, { skillsRoot: ctx.skillsRoot })
    case 'get_skill':
      return runGetSkill(args, { skillsRoot: ctx.skillsRoot })

    case 'run_skill':
    case 'search_code':
    case 'code_status':
      return runStub(name)

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
