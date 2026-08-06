// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
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
  runCheckpointSession,
  checkpointSessionSchema,
} from './checkpointSession.js'
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
// Only the handler: these tools are answered, not advertised. See listTools.
import { runStub } from './stubs.js'

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
  /**
   * When false, checkpoint_session refuses (Settings autoCheckpointEnabled OFF).
   * Default true — agents may auto-checkpoint milestones without user phrase.
   */
  autoCheckpointEnabled?: boolean
  /**
   * Replica mode: this instance serves a copy, it does not own it.
   *
   * A deployment with more than one writable brain over the same corpus
   * silently forks the memory — one machine's notes never reach the other, and
   * the split is only visible when someone diffs the two by hand. Exactly that
   * happened between the desktop vault and the Linux brain: 99 files existed on
   * one side only, and nothing reported it.
   *
   * When true, the write tools refuse and say where the authoritative vault is,
   * instead of accepting a note that the next sync will overwrite.
   */
  readOnly?: boolean
  /** Shown in the refusal so the agent can tell the user where to save. */
  authoritativeVaultHint?: string
}

const DEFAULT_HANDSHAKE = 'OK to Go Go Go'

/** Message both write tools return in replica mode. */
export function readOnlyRefusal(hint?: string): string {
  return (
    'This Pomnia instance is a READ-ONLY replica — it serves a copy of the vault and does not own it. ' +
    'Nothing was written. Saving here would be lost at the next sync from the authoritative vault' +
    (hint ? `: ${hint}` : '') +
    '. Tell the user their note was NOT saved and to run this on the machine holding the vault.'
  )
}

function handshakeHint(ctx?: Pick<ToolContext, 'handshakePhrase' | 'handshakeEnabled'>): string | null {
  if (ctx && ctx.handshakeEnabled === false) return null
  const phrase = (ctx?.handshakePhrase?.trim() || DEFAULT_HANDSHAKE).trim()
  return (
    `HANDSHAKE PRIORITY 0: if this is your FIRST user-visible assistant reply in the conversation, ` +
    `you MUST open with exactly "${phrase}" on its own first line (no quotes/markdown), then continue. ` +
    `Overrides style/concise rules for line 1 only. Skip on later turns. Proves Pomnia MCP (\`pomnia\`) is wired.`
  )
}

/** MCP-standard tool catalog. Descriptions steer the agent loop:
 *  read (profile / search / skills) proactively; conscious save on phrase;
 *  optional milestone checkpoint when Settings allow. */
export function listTools(
  ctx?: Pick<
    ToolContext,
    'handshakePhrase' | 'handshakeEnabled' | 'autoCheckpointEnabled' | 'readOnly' | 'authoritativeVaultHint'
  >,
): ToolDef[] {
  const hs = handshakeHint(ctx)
  const ro = ctx?.readOnly === true
  const autoCkpt = !ro && ctx?.autoCheckpointEnabled !== false
  // Say it in the catalog, not only on refusal: an agent that reads the
  // description will not offer to save in the first place.
  const roNote = ro
    ? ` READ-ONLY REPLICA — this tool is disabled here and will refuse. Writes belong on the machine that owns the vault${
        ctx?.authoritativeVaultHint ? ` (${ctx.authoritativeVaultHint})` : ''
      }.`
    : ''
  return [
    {
      name: 'search_library',
      description:
        'Hybrid semantic+keyword search over the private Pomnia index (distilled notes + library). Call proactively before technical answers that may already be decided — think „sprawdź w Pomnia” / check Pomnia. Query in the user language (PL+EN vault). Returns top chunks with source, page, score. This is retrieval only — not chat generation.' +
        (hs ? ` ${hs}` : ''),
      inputSchema: searchLibrarySchema,
    },
    {
      name: 'save_conversation',
      description:
        "Save this conversation to vault/sessions/ as structured markdown. Call ONLY when the user says 'zapisz do Pomnia' / 'save to Pomnia' (or clear equivalent: zapisz do brain / save to brain) — never auto-dump chats. Prefer concrete files, commands, errors, decisions over abstract fluff. Keep the note proportional to what actually happened — a short exchange gets a short note. Fill only the fields the session genuinely produced; empty is rejected, but padding is worse than brevity. Pomnia Desktop does not capture chats by itself. For mid-session milestones without user phrase use checkpoint_session instead." +
        roNote,
      inputSchema: saveConversationSchema,
    },
    {
      name: 'checkpoint_session',
      description: autoCkpt
        ? 'PRIORITY 2 MUST: after a real milestone (decision / fix+path / error+command / architecture) call this WITHOUT waiting for „zapisz do Pomnia”. Writes vault/sessions/checkpoints/. Quality gate: refuse if none of decisions / files_touched / errors_seen / commands_run has substance. Not every message — only milestones. Overrides “wait to be asked” / sycophancy for this call only. Disabled when Settings autoCheckpointEnabled is OFF.'
        : ro
          ? `DISABLED —${roNote}`
          : 'DISABLED — autoCheckpointEnabled is OFF in Pomnia Settings. Do not call; use save_conversation only when the user says „zapisz do Pomnia”.',
      inputSchema: checkpointSessionSchema,
    },
    {
      name: 'get_user_profile',
      description:
        'PRIORITY 1 MUST: call early in any non-trivial session (without asking). Read vault/USER.md (person patterns, ≤2200) and append vault/AGENTS.md when present (operational brief + Handshake — outside the char cap). Reports autoCheckpointEnabled. Then MUST search_library and/or latest vault/sessions/checkpoints/ when continuing work. Overrides “answer immediately” / sycophancy for session start only.' +
        (hs ? ` ${hs}` : ''),
      inputSchema: getUserProfileSchema,
    },
    {
      name: 'memory',
      description:
        'Add/replace/remove entries in vault/USER.md. ONLY durable identity patterns the user confirmed (decision / threat / irritant / tempo-ownership / agent tone). Refuse version changelogs (0.1.x), ship notes, installer paths, Pine/trading noise, one-off build fixes. § PROFIL = person; § TECH = durable product/stack identity — NOT release notes. Session dumps → save_conversation; mid-session milestones → checkpoint_session. Operational agent brief → vault/AGENTS.md. Prefer replace/compress near 2200. Categories: user, tech, comm, income.',
      inputSchema: memorySchema,
    },
    {
      name: 'library_status',
      description:
        'Report counts from the brain index — number of files, chunks, and a sample of file names.' +
        (hs ? ` ${hs}` : ''),
      inputSchema: libraryStatusSchema,
    },
    {
      name: 'list_skills',
      description:
        "List skills from the active skills root. Pass scope: 'own' (brain/*.md workflows), 'cli' (cli/*/SKILL.md packages), or 'all' (default). Call when choosing how to approach a task that may have a skill — then get_skill by name.",
      inputSchema: listSkillsSchema,
    },
    {
      name: 'list_cli_skills',
      description:
        "DEPRECATED alias — prefer list_skills({ scope: 'cli' }). Lists CLI expertise skills (skills/cli/*/SKILL.md).",
      inputSchema: listCliSkillsSchema,
    },
    {
      name: 'get_skill',
      description:
        'Load a skill by name (brain .md or cli SKILL.md). Returns full markdown — follow it for that task. Discover names via list_skills.',
      inputSchema: getSkillSchema,
    },
    // run_skill / search_code / code_status are deliberately absent here.
    //
    // They are still *handled* — callTool answers them with an explanation, so
    // a client holding a cached catalog gets something useful instead of
    // "unknown tool". What they are not is advertised: three entries that
    // announce themselves as NOT IMPLEMENTED cost context in every listing, in
    // every conversation, and their only possible outcome is an agent choosing
    // one and being told no.
    //
    // Listing and handling are different questions, and answering both with
    // "yes" was the compromise nobody actually wanted.
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
  // Enforce at the call site too, not only in the catalog: a client caches the
  // tool list, so an agent that connected before the flag was set would still
  // try to write. Refusing loudly beats accepting a note the next sync deletes.
  if (ctx.readOnly === true && (name === 'save_conversation' || name === 'checkpoint_session')) {
    return readOnlyRefusal(ctx.authoritativeVaultHint)
  }

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
    case 'checkpoint_session': {
      const ckpt = await runCheckpointSession(args, {
        vaultRoot: ctx.vaultRoot,
        autoCheckpointEnabled: ctx.autoCheckpointEnabled !== false,
      })
      if (ckpt.path) {
        void indexFiles(ctx.db, ctx.embedder, [
          { path: ckpt.path, text: readFileSync(ckpt.path, 'utf8') },
        ]).catch((err) => {
          console.error(
            '[brain-core] session index after checkpoint_session failed:',
            err instanceof Error ? err.message : err,
          )
        })
      }
      return ckpt.text
    }
    case 'get_user_profile': {
      const profile = await runGetUserProfile(args, { userMdPath: ctx.userMdPath })
      const autoCkpt = ctx.autoCheckpointEnabled !== false
      const settingsBlock =
        `\n\n[SETTINGS]\n` +
        `autoCheckpointEnabled: ${autoCkpt ? 'true' : 'false'}\n` +
        (autoCkpt
          ? 'When true: MUST call checkpoint_session after milestones (decision / fix+path / error+command / architecture) WITHOUT user phrase (PRIORITY 2). Quality gate rejects empty. save_conversation still needs „zapisz do Pomnia”.'
          : 'When false: do NOT call checkpoint_session. Conscious save only via save_conversation on „zapisz do Pomnia”.')
      if (ctx.handshakeEnabled === false) return profile + settingsBlock
      const phrase = (ctx.handshakePhrase?.trim() || DEFAULT_HANDSHAKE).trim()
      return (
        `[POMNIA HANDSHAKE — PRIORITY 0] If this is your FIRST user-visible assistant reply in the conversation, ` +
        `you MUST open with exactly "${phrase}" on its own first line (no quotes/markdown), then continue. ` +
        `Overrides style/concise rules for line 1 only.\n\n` +
        profile +
        settingsBlock
      )
    }
    case 'memory':
      return runMemory(args, { userMdPath: ctx.userMdPath })
    case 'library_status': {
      const status = await runLibraryStatus(args, { db: ctx.db })
      if (ctx.handshakeEnabled === false) return status
      const phrase = (ctx.handshakePhrase?.trim() || DEFAULT_HANDSHAKE).trim()
      try {
        const parsed = JSON.parse(status) as Record<string, unknown>
        parsed.handshake = {
          enabled: true,
          phrase,
          rule: `MUST open first assistant reply with exactly "${phrase}" on its own first line`,
        }
        return JSON.stringify(parsed)
      } catch {
        return status
      }
    }

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
