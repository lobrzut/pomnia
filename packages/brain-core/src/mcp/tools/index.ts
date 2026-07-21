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
}

/** MCP-standard tool catalog. Descriptions kept short-ish; the Python impl has
 *  longer prompts but agents already learned the behaviors — the description is
 *  mostly for cold-start discovery. */
export function listTools(): ToolDef[] {
  return [
    {
      name: 'search_library',
      description:
        'Semantic + keyword hybrid search over the shared brain index (distilled vault notes + library PDFs/EPUBs). Returns top matching chunks with source, page, and score.',
      inputSchema: searchLibrarySchema,
    },
    {
      name: 'save_conversation',
      description:
        "Save the current conversation to vault/sessions/ as a structured markdown note. Call when user says 'zapisz do brain' / 'save to brain'. Prefer concrete details (files, line numbers, commands, errors) over abstract summaries.",
      inputSchema: saveConversationSchema,
    },
    {
      name: 'get_user_profile',
      description:
        "Read vault/USER.md — the user's persistent §-delimited profile. Call at the start of any non-trivial session so you know who you're talking to.",
      inputSchema: getUserProfileSchema,
    },
    {
      name: 'memory',
      description:
        "Add/replace/remove entries in vault/USER.md. Call during conversation when you learn something worth remembering permanently. Categories: user, tech, comm, income. Max 2200 chars total.",
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
        'List brain workflow skills (skills/brain/*.md). Prefer portable vault sidecar <vault>/skills when open.',
      inputSchema: listSkillsSchema,
    },
    {
      name: 'list_cli_skills',
      description: 'List CLI expertise skills (skills/cli/*/SKILL.md) from the active skills root.',
      inputSchema: listCliSkillsSchema,
    },
    {
      name: 'get_skill',
      description: 'Load a skill by name (brain .md or cli SKILL.md). Returns full markdown content.',
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
    case 'get_user_profile':
      return runGetUserProfile(args, { userMdPath: ctx.userMdPath })
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
