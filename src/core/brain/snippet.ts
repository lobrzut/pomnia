// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Per-client MCP snippet generator.
 *
 * Pomnia's "Connect to Brain" flow does NOT auto-modify any client's config
 * file — we generate a copy-paste snippet plus the path where it goes plus
 * a short instruction. The user pastes. See [[snippet-not-autodeploy]] in
 * project memory for the rationale.
 *
 * Adding a new client = add one entry to CLIENTS. Fixing a client's format
 * change = edit one entry. No deployer logic to debug.
 */
import path from 'node:path'
import { DEFAULT_HANDSHAKE_PHRASE } from '../handshakePhrase.js'
import type { OS } from '../model.js'
import { appDataRoot } from '../platform.js'

/** Local embedded brain-core (forked child, no auth). */
/** MCP server key agents see in mcp.json (was `brain-rag`). */
export const MCP_POMNIA_KEY = 'pomnia'
export const MCP_POMNIA_VAULT_KEY = 'pomnia-vault'
export const MCP_POMNIA_LIBRARY_KEY = 'pomnia-library'
/** Legacy key still accepted when reading client configs. */
export const MCP_LEGACY_RAG_KEY = 'brain-rag'

export const EMBEDDED_BRAIN_DEFAULT_URL = 'http://127.0.0.1:7862'
/** Placeholder shown in URL fields — user must configure their own remote Brain. */
export const REMOTE_BRAIN_URL_PLACEHOLDER = 'https://twoj-serwer:7862'
/** No default remote URL — each user saves their own in app-settings / localStorage. */
export const REMOTE_BRAIN_DEFAULT_URL = ''

export type BrainTarget = 'embedded' | 'remote'

export type ClientId =
  | 'claude-code'
  | 'cursor'
  | 'antigravity'
  | 'claude-desktop'
  | 'vscode'
  | 'windsurf'
  | 'hermes'

export interface ClientSpec {
  id: ClientId
  label: string
  /** Absolute config path on a given OS + home dir. */
  configPath: (os: OS, home: string) => string
  /** Top-level JSON key under which MCP servers live. */
  mcpKey: string
  /** Builds the `{pomnia,pomnia-vault,pomnia-library}` map for this client (remote). Embedded uses only `pomnia`. */
  buildServers: (brainUrl: string, token?: string) => Record<string, Record<string, unknown>>
  /** Human notes — what file, anything quirky, multi-location warnings. */
  notes: string
  /** How to make the client pick up the change. */
  restartHint: string
  /**
   * Optional agent brief — a markdown/system-prompt file the client auto-reads
   * on each session. Tells the agent to call get_user_profile at start,
   * search_library before technical answers, save_conversation on "zapisz do
   * brain", and memory.add when corrected. Snippet-only: Pomnia does not
   * write to this file, user pastes. `null` if the client has no such hook
   * (e.g. Claude Desktop, Hermes).
   */
  brief?: {
    briefPath: (os: OS, home: string) => string
    /** append-to-existing = user pastes at bottom of existing file; create-if-missing = whole file content */
    mode: 'append-to-existing' | 'create-if-missing'
    hint: string
  }
}

function joinPath(os: OS, ...parts: string[]): string {
  return (os === 'win32' ? path.win32 : path.posix).join(...parts)
}

function dirnamePath(os: OS, filePath: string): string {
  return (os === 'win32' ? path.win32 : path.posix).dirname(filePath)
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * URL paths exposed by the supergateway. Behind the Bearer auth proxy these
 * keep the same shape — the proxy just gates on the Authorization header.
 */
const PATHS = {
  rag:     (base: string) => `${base}/sse`,
  vault:   (base: string) => `${base}/servers/brain-vault/sse`,
  library: (base: string) => `${base}/servers/brain-library/sse`,
  ragMcp:     (base: string) => `${base}/mcp`,
  vaultMcp:   (base: string) => `${base}/servers/brain-vault/mcp`,
  libraryMcp: (base: string) => `${base}/servers/brain-library/mcp`,
}

function withHeaders(token: string | undefined, server: Record<string, unknown>): Record<string, unknown> {
  if (!token) return server
  return { ...server, headers: { Authorization: `Bearer ${token}` } }
}

/**
 * Embedded brain-core exposes ONE unified MCP at `/mcp` (all tools on one server).
 * Remote master uses supergateway with three split servers — see buildServers below.
 */
function embeddedServers(spec: ClientSpec, brainUrl: string): Record<string, Record<string, unknown>> {
  const mcp = `${trimBase(brainUrl)}/mcp`
  switch (spec.id) {
    case 'claude-code':
      return { [MCP_POMNIA_KEY]: { type: 'http', url: mcp } }
    case 'cursor':
      return { [MCP_POMNIA_KEY]: { url: mcp } }
    case 'antigravity':
      return { [MCP_POMNIA_KEY]: { type: 'streamable-http', serverUrl: mcp } }
    case 'claude-desktop':
      return {
        [MCP_POMNIA_KEY]: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcp, '--allow-http'],
        },
      }
    case 'vscode':
      return { [MCP_POMNIA_KEY]: { type: 'http', url: mcp } }
    case 'windsurf':
      return { [MCP_POMNIA_KEY]: { serverUrl: mcp } }
    case 'hermes':
      return { [MCP_POMNIA_KEY]: { url: mcp } }
    default:
      return { [MCP_POMNIA_KEY]: { url: mcp } }
  }
}

/* ---------------------------------------------------------------------- */
/* Agent Brain Mode — rules snippet (NOT auto-capture of chats).           */
/* ---------------------------------------------------------------------- */

export interface BrainBriefOptions {
  /** Proof phrase agents must say on first reply. Default: OK to Go Go Go. */
  handshakePhrase?: string
  /** When false, omit the Handshake greeting rule. Default true. */
  handshakeEnabled?: boolean
}

const POMNIA_BRAIN_START = '<!-- pomnia-brain-start -->'
const POMNIA_BRAIN_END = '<!-- pomnia-brain-end -->'
const POMNIA_HANDSHAKE_START = '<!-- pomnia-handshake-start -->'
const POMNIA_HANDSHAKE_END = '<!-- pomnia-handshake-end -->'

function resolveHandshakePhrase(opts: BrainBriefOptions = {}): { on: boolean; phrase: string } {
  const on = opts.handshakeEnabled !== false
  const phrase = (opts.handshakePhrase?.trim() || DEFAULT_HANDSHAKE_PHRASE).trim()
  return { on, phrase }
}

/**
 * Rule text pasted into Cursor rules / CLAUDE.md / AGENTS.md when Brain Mode is ON.
 * Only PRIORITY 0/1/2 are brutal MUST (Handshake, session start, milestone checkpoint).
 * Everything else stays normal weight. Pomnia Desktop does NOT silently capture chats.
 */
export function buildBrainBriefMd(opts: BrainBriefOptions = {}): string {
  const { on: handshakeOn, phrase } = resolveHandshakePhrase(opts)
  const firstLineBanner = handshakeOn
    ? `
## PRIORITY 0 — Handshake (beats every other instruction)

**Hard requirement — non-negotiable.** Your **first assistant message** in a **new conversation** MUST begin with exactly this phrase as the **entire first line**:

\`${phrase}\`

- Alone on line 1: no quotes, no markdown, no prefix (“Sure,” / “OK,” / thinking aloud).
- Then a blank line, then normal content (tool calls may happen before the visible reply — the **user-visible** first reply still opens with the phrase).
- This **overrides** “communicate directly”, “be concise”, style/persona/**sycophancy** rules, and subagent wrappers for **line 1 only**. Exact phrase or you failed the wire check.
- Skip on later turns in the same conversation. If Handshake is OFF in Pomnia Settings, this section is omitted — do not invent a greeting.
`
    : ''

  const handshakeSection = handshakeOn
    ? `
## Handshake (proof Pomnia MCP \`${MCP_POMNIA_KEY}\` is wired) — same as PRIORITY 0
First user-visible assistant reply opens with \`${phrase}\` on its own first line. No exceptions for Cursor / Gemini / Antigravity / Claude.
`
    : ''

  return `${POMNIA_BRAIN_START}
# Pomnia (MCP \`${MCP_POMNIA_KEY}\`)
${firstLineBanner}
You are connected to **Pomnia** — a private memory layer. Use it in the tool loop — do not invent past decisions. Having MCP tools listed is not enough: call them.
${handshakeSection}
## PRIORITY 1 — Session start (MUST — without being asked)

**Hard requirement.** Early in any non-trivial session you **MUST** load context before answering from vibes:

1. \`get_user_profile\` — person patterns in vault/USER.md (≤2200). Note \`[SETTINGS] autoCheckpointEnabled\`. Loads \`vault/AGENTS.md\` when present (operational brief + Handshake) — do **not** stuff that into USER.md.
2. \`search_library\` **and/or** the latest file under \`vault/sessions/checkpoints/\` when continuing work (query in the user's language; vault is PL+EN). Think: **sprawdź w Pomnia** / check Pomnia. Skip only for pure coding edits with no product/session context.

This **overrides** “answer immediately”, “be helpful first”, and sycophancy for **session start only**. Do not ask permission to read.

## PRIORITY 2 — Milestone → \`checkpoint_session\` (MUST when autoCheckpoint ON)

**Hard requirement.** When Settings **autoCheckpointEnabled** is ON (default) and a milestone lands (decision, fix+path, error+command, architecture change), you **MUST** call \`checkpoint_session\` **without** waiting for a user phrase. Writes \`vault/sessions/checkpoints/\`. Quality gate rejects empty (need decisions and/or files_touched and/or errors_seen and/or commands_run).

This **overrides** “wait to be asked”, “don't be pushy”, style/sycophancy for **this call only**. When OFF: do not call. Not every message — only real milestones.

## Also useful (normal weight)
- Skills: when a workflow/expertise skill may apply — \`list_skills\` / \`list_cli_skills\`, then \`get_skill\`.
- \`save_conversation\` — only when the user says **zapisz do Pomnia** / **save to Pomnia** (or clear equivalent: zapisz do brain / save to brain still accepted). Conscious full commit to \`vault/sessions/\`. Prefer concrete paths, commands, errors, decisions — not fluff.
- \`memory\` — only durable identity facts the user confirmed. Keep: decision / threat / irritant / tempo-ownership / agent-tone patterns. § PROFIL = person; § TECH = durable project/stack identity — never installer paths, version changelogs (\`0.1.x\`), ship notes, Pine/trading filler, or one-off build fixes (those go to save_conversation / checkpoint). Skip notes with \`quality: garbage\` / \`quality_score\` < 5. Categories: user, tech, comm, income. Max ~2200 chars — prefer replace/compress when near cap.

## Not your job
- Do not assume Pomnia auto-captures this chat. No MCP call = nothing is stored (Desktop does not silently dump chats; checkpoint is agent-called).
- Do not spam search/memory/checkpoint every message; call when the topic needs memory or a real milestone landed.
- MCP “connected” in an IDE only means the config file points at Pomnia — it does **not** mean you already searched. Prove it with Handshake + tool calls (\`search_library\` = sprawdź w Pomnia).
${POMNIA_BRAIN_END}
`
}

/**
 * Upsert the marked Pomnia Brain block into a client rules file (CLAUDE.md / AGENTS.md).
 * Always places the block at the top so Claude Code sees Handshake before older notes.
 */
export function upsertPomniaBrainBrief(existing: string, briefContent: string): string {
  const block = briefContent.includes(POMNIA_BRAIN_START)
    ? briefContent.trimEnd()
    : `${POMNIA_BRAIN_START}\n${briefContent.trim()}\n${POMNIA_BRAIN_END}`
  let rest = existing
  const start = rest.indexOf(POMNIA_BRAIN_START)
  const end = rest.indexOf(POMNIA_BRAIN_END)
  if (start >= 0 && end > start) {
    rest = `${rest.slice(0, start)}${rest.slice(end + POMNIA_BRAIN_END.length)}`
  }
  rest = rest.replace(/^\uFEFF/, '').trim()
  const supersede =
    /BRAIN-MCP-INSTRUCTIONS/i.test(rest) && !/pomnia-brain-overrides/i.test(rest)
      ? '<!-- pomnia-brain-overrides: Handshake + save_conversation policy above win over older BRAIN-MCP-INSTRUCTIONS below. -->\n\n'
      : ''
  return rest ? `${block}\n\n${supersede}${rest}\n` : `${block}\n`
}

/** Marked Handshake section for vault/AGENTS.md (exact phrase, not a Settings pointer). */
export function buildVaultAgentsHandshakeSection(opts: BrainBriefOptions = {}): string {
  const { on, phrase } = resolveHandshakePhrase(opts)
  if (!on) {
    return `${POMNIA_HANDSHAKE_START}
## Handshake
OFF in Pomnia Settings — do not invent a greeting.
${POMNIA_HANDSHAKE_END}`
  }
  return `${POMNIA_HANDSHAKE_START}
## Handshake (dowód MCP Pomnia) — OBOWIĄZKOWE / PRIORITY 0
**MUST** open your **first assistant message** with exactly this phrase on its own first line (no quotes/markdown):

\`${phrase}\`

Overrides “communicate directly” / style / **sycophancy** for line 1 only. Exact phrase or wire check failed. Then blank line + normal content. Skip on later turns. Phrase = Pomnia Settings → Handshake.
${POMNIA_HANDSHAKE_END}`
}

/** Upsert Handshake section into vault/AGENTS.md (create file if missing). */
export function upsertVaultAgentsHandshake(existing: string, opts: BrainBriefOptions = {}): string {
  const section = buildVaultAgentsHandshakeSection(opts)
  const start = existing.indexOf(POMNIA_HANDSHAKE_START)
  const end = existing.indexOf(POMNIA_HANDSHAKE_END)
  if (start >= 0 && end > start) {
    return `${existing.slice(0, start)}${section}${existing.slice(end + POMNIA_HANDSHAKE_END.length)}`
  }
  // Replace a plain "## Handshake…" block if present (legacy soft pointer).
  const legacy = existing.match(/^## Handshake[\s\S]*?(?=^## |\z)/m)
  if (legacy && legacy.index !== undefined) {
    return `${existing.slice(0, legacy.index)}${section}\n${existing.slice(legacy.index + legacy[0].length)}`
  }
  const trimmed = existing.trim()
  if (!trimmed) {
    return `# AGENTS — jak ze mną pracować\n\n${section}\n`
  }
  // Insert after title / lead paragraph if possible.
  const afterTitle = trimmed.match(/^#[^\n]*\n+(?:[^\n#][^\n]*\n+)*/)
  if (afterTitle) {
    const i = afterTitle[0].length
    return `${trimmed.slice(0, i)}\n${section}\n${trimmed.slice(i)}\n`
  }
  return `${trimmed}\n\n${section}\n`
}

/** Default brief (default phrase, Handshake on) — for older imports / tests. */
export const BRAIN_BRIEF_MD = buildBrainBriefMd()

/** Same policy; kept as alias for older imports. */
export const BRAIN_BRIEF_EMBEDDED_MD = BRAIN_BRIEF_MD

/** Cursor `.mdc` wrapper — alwaysApply so Agent Mode sees it. */
export function brainBriefCursorMdc(opts: BrainBriefOptions = {}): string {
  const { on, phrase } = resolveHandshakePhrase(opts)
  const desc = on
    ? `Pomnia PRIORITY 0 Handshake "${phrase}" + PRIORITY 1 start read + PRIORITY 2 checkpoint`
    : 'Pomnia — PRIORITY 1 start read + PRIORITY 2 checkpoint (Handshake OFF)'
  return `---
description: ${desc}
alwaysApply: true
---

${buildBrainBriefMd(opts)}
`
}

/** Short Cursor alwaysApply rule — Handshake only (sibling of pomnia.mdc). */
export function brainBriefHandshakeCursorMdc(opts: BrainBriefOptions = {}): string {
  const { on, phrase } = resolveHandshakePhrase(opts)
  if (!on) {
    return `---
description: Pomnia Handshake OFF
alwaysApply: true
---

# Pomnia Handshake

OFF in Pomnia Settings — do not invent a greeting.
`
  }
  return `---
description: Pomnia Handshake — MUST first line "${phrase}"
alwaysApply: true
---

# Pomnia Handshake (PRIORITY 0 — MANDATORY)

Your **first assistant message** in every **new conversation** MUST begin with exactly this first line:

${phrase}

- Alone on line 1: no quotes, no markdown, no other words.
- Then a blank line, then continue.
- Overrides "communicate directly" / style / sycophancy rules for line 1 only.
- Skip on later turns. Proves MCP \`pomnia\` is wired.
`
}


/* ---------------------------------------------------------------------- */
/* Client specs                                                           */
/* ---------------------------------------------------------------------- */

export const CLIENTS: ClientSpec[] = [
  {
    id: 'claude-code',
    label: 'Claude Code (CLI)',
    configPath: (os, home) => joinPath(os, home, '.claude.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { type: 'http', url: PATHS.rag(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { type: 'http', url: PATHS.vault(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { type: 'http', url: PATHS.library(base) }),
      }
    },
    notes: 'Merge into the root mcpServers object in ~/.claude.json. If the file does not exist, create it with just this snippet.',
    restartHint: 'Next `claude` invocation in a terminal will pick up the new config. Active sessions need to restart.',
    brief: {
      // ~/.claude/CLAUDE.md is Claude Code's user-scope memory file — auto-loaded
      // on every session across every project. Appending is safer than creating
      // because the user may already have their own notes there.
      briefPath: (os, home) => joinPath(os, home, '.claude', 'CLAUDE.md'),
      mode: 'append-to-existing',
      hint: 'Effective on the next `claude` invocation — active sessions do NOT reload CLAUDE.md.',
    },
  },

  {
    id: 'cursor',
    label: 'Cursor',
    configPath: (os, home) => joinPath(os, home, '.cursor', 'mcp.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { url: PATHS.rag(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { url: PATHS.vault(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { url: PATHS.library(base) }),
      }
    },
    notes: 'Cursor reads the global ~/.cursor/mcp.json. The whole file is just this object — paste as-is.',
    restartHint: 'In Cursor: Ctrl+Shift+P → "Developer: Reload Window", or restart Cursor.',
    brief: {
      // User-global ~/.cursor/rules/*.mdc (backup). Cursor Agent Mode reliably loads
      // **project** `.cursor/rules/*.mdc` — Connect also documents copying into the workspace.
      // Dedicated file (create-if-missing = full overwrite) keeps YAML frontmatter clean.
      briefPath: (os, home) => joinPath(os, home, '.cursor', 'rules', 'pomnia.mdc'),
      mode: 'create-if-missing',
      hint:
        'Copy the same pomnia.mdc into each workspace `.cursor/rules/` (Agent Mode loads project rules). ' +
        'Then Ctrl+Shift+P → "Developer: Reload Window" + NEW chat.',
    },
  },

  {
    id: 'antigravity',
    label: 'Antigravity (Google IDE)',
    // The "live" location for Antigravity IDE / 2.x Cascade. Also keep ~/.gemini/config/mcp_config.json
    // in sync (global discovery). Legacy: ~/.gemini/antigravity/mcp_config.json.
    configPath: (os, home) => joinPath(os, home, '.gemini', 'antigravity-ide', 'mcp_config.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      // Antigravity 2.x prefers streamable-http with /mcp paths and uses serverUrl (not url).
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.ragMcp(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.vaultMcp(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.libraryMcp(base) }),
      }
    },
    notes:
      'Pomnia „Połączony” = plik mcp_config.json wskazuje na MCP `pomnia` (nie = agent już woła search_library). ' +
      'MCP: ~/.gemini/antigravity-ide/mcp_config.json (live) + skopiuj to samo do ~/.gemini/config/mcp_config.json (global). ' +
      'Legacy: ~/.gemini/antigravity/. Bez Trybu Brain / GEMINI.md agent ma narzędzia, ale nie musi ich używać ani Handshake. ' +
      'Jeśli MCP nie widać: Settings → MCP Servers, pełny restart IDE.',
    restartHint:
      'Close Antigravity completely (File → Exit + tray Quit), reopen, start a NEW Cascade chat. ' +
      'Expect Handshake phrase on first reply, then get_user_profile / search_library on product questions.',
    brief: {
      // Global customization root — Antigravity always discovers ~/.gemini/config/ (GEMINI.md is
      // always-on for that scope; no frontmatter). Same policy as Cursor pomnia.mdc / Claude CLAUDE.md.
      briefPath: (os, home) => joinPath(os, home, '.gemini', 'config', 'GEMINI.md'),
      mode: 'append-to-existing',
      hint: 'Full Antigravity restart + new Cascade chat (active sessions do not reload GEMINI.md).',
    },
  },

  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: (os, home) =>
      os === 'win32'
        ? joinPath(os, appDataRoot(os, home), 'Claude', 'claude_desktop_config.json')
        : os === 'darwin'
          ? joinPath(os, home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : joinPath(os, appDataRoot(os, home), 'Claude', 'claude_desktop_config.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      // Claude Desktop wraps non-localhost http MCP through mcp-remote with --allow-http.
      // Token (if present) is passed via --header. mcp-remote handles the SSE transport.
      const base = trimBase(url)
      const authArgs = token ? ['--header', `Authorization: Bearer ${token}`] : []
      const wrap = (target: string) => ({
        command: 'npx',
        args: ['-y', 'mcp-remote', target, '--allow-http', ...authArgs],
      })
      return {
        [MCP_POMNIA_KEY]:     wrap(PATHS.ragMcp(base)),
        [MCP_POMNIA_VAULT_KEY]:   wrap(PATHS.vaultMcp(base)),
        [MCP_POMNIA_LIBRARY_KEY]: wrap(PATHS.libraryMcp(base)),
      }
    },
    notes: 'Claude Desktop cannot speak HTTP/SSE to non-localhost natively; we tunnel through `mcp-remote` (npm) with --allow-http. Requires Node.js installed locally.',
    restartHint: 'Quit Claude Desktop from the system tray (NOT just close the window), then relaunch.',
  },

  {
    id: 'vscode',
    label: 'VS Code (1.103+ native MCP)',
    configPath: (os, home) =>
      os === 'win32'
        ? joinPath(os, appDataRoot(os, home), 'Code', 'User', 'mcp.json')
        : os === 'darwin'
          ? joinPath(os, home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
          : joinPath(os, appDataRoot(os, home), 'Code', 'User', 'mcp.json'),
    // VS Code uses "servers" not "mcpServers".
    mcpKey: 'servers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { type: 'http', url: PATHS.rag(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { type: 'http', url: PATHS.vault(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { type: 'http', url: PATHS.library(base) }),
      }
    },
    notes: 'VS Code 1.103+ has native MCP support; older versions need the GitHub Copilot extension. Note the top-level key is `servers`, not `mcpServers`.',
    restartHint: 'Ctrl+Shift+P → "MCP: List Servers" → Start each, or restart VS Code.',
  },

  {
    id: 'windsurf',
    label: 'Windsurf (Codeium)',
    configPath: (os, home) =>
      os === 'win32'
        ? joinPath(os, appDataRoot(os, home), 'Windsurf', 'User', 'mcp.json')
        : os === 'darwin'
          ? joinPath(os, home, 'Library', 'Application Support', 'Windsurf', 'User', 'mcp.json')
          : joinPath(os, appDataRoot(os, home), 'Windsurf', 'User', 'mcp.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { serverUrl: PATHS.ragMcp(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { serverUrl: PATHS.vaultMcp(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { serverUrl: PATHS.libraryMcp(base) }),
      }
    },
    notes: 'Windsurf is Codeium-lineage; format mirrors Antigravity\'s `serverUrl` style. If your Windsurf version differs, check Settings → Cascade → MCP.',
    restartHint: 'Restart Windsurf or use the in-app "Reload Cascade" action.',
  },

  {
    id: 'hermes',
    label: 'Hermes Agent (Nous Research)',
    // Hermes reads ~/.hermes/config.yaml on all platforms (HERMES_HOME env
    // var overrides the default). Same path on Win/macOS/Linux — the tilde
    // convention is honored by Hermes' own loader.
    configPath: (os, home) => joinPath(os, home, '.hermes', 'config.yaml'),
    mcpKey: 'mcp_servers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      return {
        [MCP_POMNIA_KEY]:     withHeaders(token, { url: PATHS.ragMcp(base) }),
        [MCP_POMNIA_VAULT_KEY]:   withHeaders(token, { url: PATHS.vaultMcp(base) }),
        [MCP_POMNIA_LIBRARY_KEY]: withHeaders(token, { url: PATHS.libraryMcp(base) }),
      }
    },
    // Note the YAML caveat: the snippet is emitted as JSON (Pomnia's uniform
    // format), but YAML parsers accept flow-style JSON as valid YAML, so it
    // pastes in cleanly. If you prefer classic block-style YAML you can
    // convert by hand — the shape (top-level `mcp_servers:` map keyed by
    // server name, each entry with `url:` and `headers:`) matches Hermes' docs.
    notes: 'Hermes reads ~/.hermes/config.yaml. The snippet is JSON — YAML parsers accept it since JSON is a subset of YAML, so paste it as-is under mcp_servers. See https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp for schema details (transport, timeout, keepalive_interval, etc.).',
    restartHint: 'Restart the Hermes daemon (`hermes stop && hermes start`) or start a new session — MCP servers are discovered per-session.',
  },
]

export function getClient(id: ClientId): ClientSpec {
  const c = CLIENTS.find((c) => c.id === id)
  if (!c) throw new Error(`unknown client: ${id}`)
  return c
}

export function listClients(): Array<{ id: ClientId; label: string }> {
  return CLIENTS.map(({ id, label }) => ({ id, label }))
}

export interface SnippetBrief {
  /** Absolute path where the brief should go. */
  filePath: string
  /** Markdown content — ready to paste. */
  content: string
  /** append-to-existing or create-if-missing — drives UI copy ("Dopisz" vs "Utwórz"). */
  mode: 'append-to-existing' | 'create-if-missing'
  /** How to make the client pick up the brief change. */
  restartHint: string
}

export interface Snippet {
  client: ClientId
  label: string
  /** Absolute path to the file the user should edit. */
  filePath: string
  /** The top-level key the server map should be nested under. */
  mcpKey: string
  /** Ready-to-paste JSON (full file shape — user can paste as-is into a new file). */
  fullFileJson: string
  /** Just the value under mcpKey — for merging into an existing file. */
  mergeJson: string
  /** Plain-text user instruction block. */
  instructions: string
  /** How to make the client pick up the change (also embedded in instructions). */
  restartHint: string
  /** Human notes — quirks, multi-location warnings (also embedded in instructions). */
  notes: string
  /** Optional agent brief — set when Brain Mode is ON and the client has a rules path. */
  brief?: SnippetBrief
  /**
   * Cursor-only sibling: short alwaysApply Handshake rule (`pomnia-handshake.mdc`).
   * Written next to `pomnia.mdc` by Connect → Zapisz regułę.
   */
  handshakeBrief?: SnippetBrief
  /**
   * Same policy as brief.content (without Cursor .mdc frontmatter). Present when Brain Mode is ON
   * so clients without a dedicated path (Windsurf, Hermes, …) can still paste into AGENTS.md.
   */
  agentRuleMarkdown?: string
}

/**
 * Build the snippet bundle for one client.
 *
 * @param clientId  one of CLIENTS
 * @param brainUrl  base URL of the brain MCP proxy (e.g. http://127.0.0.1:7862 or https://brain.example.com)
 * @param os        target OS for path resolution
 * @param home      target home dir for path resolution
 * @param token     optional Bearer token from /api/mcp/tokens (remote only)
 * @param target    embedded = single local /mcp, no auth; remote = three supergateway servers
 */
export interface BuildSnippetOptions {
  /**
   * When true, include agent rule brief (Cursor rules / CLAUDE.md / copy block).
   * Does NOT enable Desktop auto-capture — only instructs the host agent to use MCP.
   */
  brainMode?: boolean
  /** Proof greeting phrase from Pomnia Settings (wired into Brain Mode rule). */
  handshakePhrase?: string
  /** When false, Brain Mode rule omits Handshake greeting. Default true. */
  handshakeEnabled?: boolean
}

export function buildSnippet(
  clientId: ClientId,
  brainUrl: string,
  os: OS,
  home: string,
  token?: string,
  target: BrainTarget = 'remote',
  opts: BuildSnippetOptions = {},
): Snippet {
  const spec = getClient(clientId)
  const brainMode = !!opts.brainMode
  const briefOpts: BrainBriefOptions = {
    handshakePhrase: opts.handshakePhrase,
    handshakeEnabled: opts.handshakeEnabled,
  }
  const ruleMd = brainMode ? buildBrainBriefMd(briefOpts) : undefined
  const servers =
    target === 'embedded' ? embeddedServers(spec, brainUrl) : spec.buildServers(trimBase(brainUrl), token)
  const filePath = spec.configPath(os, home)

  const fullFileObj = { [spec.mcpKey]: servers }
  const fullFileJson = JSON.stringify(fullFileObj, null, 2) + '\n'
  const mergeJson = JSON.stringify(servers, null, 2) + '\n'

  const embeddedNote =
    target === 'embedded'
      ? 'Embedded Pomnia: one MCP server (`pomnia`) at /mcp — no Bearer token. Start it in Pomnia → Brain tab first.'
      : null

  const brief =
    brainMode && spec.brief
      ? {
          filePath: spec.brief.briefPath(os, home),
          content: clientId === 'cursor' ? brainBriefCursorMdc(briefOpts) : (ruleMd as string),
          mode: spec.brief.mode,
          restartHint: spec.brief.hint,
        }
      : undefined

  const handshakeBrief =
    brainMode && clientId === 'cursor' && spec.brief
      ? {
          filePath: joinPath(os, dirnamePath(os, spec.brief.briefPath(os, home)), 'pomnia-handshake.mdc'),
          content: brainBriefHandshakeCursorMdc(briefOpts),
          mode: 'create-if-missing' as const,
          restartHint: spec.brief.hint,
        }
      : undefined

  const handshakeOn = opts.handshakeEnabled !== false
  const phrase = (opts.handshakePhrase?.trim() || DEFAULT_HANDSHAKE_PHRASE).trim()

  const instructions = [
    `▶ ${spec.label}`,
    ``,
    `1. Open or create: ${filePath}`,
    `2. If the file is empty / does not exist — paste the FULL snippet below as the entire file content.`,
    `   If the file already exists with other servers — merge into the "${spec.mcpKey}" object (under MERGE snippet).`,
    `3. ${spec.restartHint}`,
    brainMode
      ? brief
        ? `4. Brain Mode ON — ${brief.mode === 'append-to-existing' ? 'append' : 'create'} agent rule at: ${brief.filePath}`
        : `4. Brain Mode ON — paste the Agent rule block into this client's rules / AGENTS.md (no auto path for ${spec.label}).`
      : null,
    handshakeBrief ? `5. Also write Handshake rule: ${handshakeBrief.filePath}` : null,
    ``,
    `Notes: ${spec.notes}`,
    embeddedNote,
    brainMode
      ? handshakeOn
        ? `Brain Mode PRIORITY 0/1/2: MUST first-line handshake "${phrase}"; MUST get_user_profile + search_library and/or latest checkpoints/; MUST checkpoint_session on milestones when autoCheckpointEnabled; conscious save only on "zapisz do Pomnia". Pomnia does not silently capture chats.`
        : 'Brain Mode PRIORITY 1/2: MUST get_user_profile + search_library and/or latest checkpoints/; MUST checkpoint_session on milestones when autoCheckpointEnabled; conscious save only on "zapisz do Pomnia". Pomnia does not silently capture chats. Handshake greeting is OFF.'
      : null,
    target === 'remote' && token
      ? `Token included in headers — keep this file private (chmod 600 if possible).`
      : target === 'remote'
        ? `No token included — add Authorization headers manually if the brain MCP proxy is auth-gated.`
        : `No token — localhost embedded brain does not use Bearer auth.`,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    client: clientId,
    label: spec.label,
    filePath,
    mcpKey: spec.mcpKey,
    fullFileJson,
    mergeJson,
    instructions,
    restartHint: spec.restartHint,
    notes: spec.notes,
    brief,
    handshakeBrief,
    /** Always available when Brain Mode is ON — even if client has no dedicated rules path. */
    agentRuleMarkdown: ruleMd,
  }
}
