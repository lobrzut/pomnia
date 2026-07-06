/**
 * Per-client MCP snippet generator.
 *
 * Reliqua's "Connect to Brain" flow does NOT auto-modify any client's config
 * file — we generate a copy-paste snippet plus the path where it goes plus
 * a short instruction. The user pastes. See [[snippet-not-autodeploy]] in
 * project memory for the rationale.
 *
 * Adding a new client = add one entry to CLIENTS. Fixing a client's format
 * change = edit one entry. No deployer logic to debug.
 */
import path from 'node:path'
import type { OS } from '../model.js'
import { appDataRoot } from '../platform.js'

/** Local embedded brain-core (forked child, no auth). */
export const EMBEDDED_BRAIN_DEFAULT_URL = 'http://127.0.0.1:7862'
/** Remote homelab master behind supergateway (Bearer auth). */
export const REMOTE_BRAIN_DEFAULT_URL = 'http://brain.example.local:7862'

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
  /** Builds the `{brain-rag,brain-vault,brain-library}` map for this client. */
  buildServers: (brainUrl: string, token?: string) => Record<string, Record<string, unknown>>
  /** Human notes — what file, anything quirky, multi-location warnings. */
  notes: string
  /** How to make the client pick up the change. */
  restartHint: string
  /**
   * Optional agent brief — a markdown/system-prompt file the client auto-reads
   * on each session. Tells the agent to call get_user_profile at start,
   * search_library before technical answers, save_conversation on "zapisz do
   * brain", and memory.add when corrected. Snippet-only: Reliqua does not
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
      return { 'brain-rag': { type: 'http', url: mcp } }
    case 'cursor':
      return { 'brain-rag': { url: mcp } }
    case 'antigravity':
      return { 'brain-rag': { type: 'streamable-http', serverUrl: mcp } }
    case 'claude-desktop':
      return {
        'brain-rag': {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcp, '--allow-http'],
        },
      }
    case 'vscode':
      return { 'brain-rag': { type: 'http', url: mcp } }
    case 'windsurf':
      return { 'brain-rag': { serverUrl: mcp } }
    case 'hermes':
      return { 'brain-rag': { url: mcp } }
    default:
      return { 'brain-rag': { url: mcp } }
  }
}

/* ---------------------------------------------------------------------- */
/* Agent brief — one markdown, all clients                                */
/* ---------------------------------------------------------------------- */

/**
 * The behavior contract we want every MCP-capable agent to follow when it
 * has brain-rag/brain-vault/brain-library wired. Same text for every client
 * because the tool surface is identical — only the destination file changes.
 *
 * Written in Polish because that is the user's operating language; the tool
 * names + payload keys stay English because that is how MCP catalog reports
 * them.
 */
export const BRAIN_BRIEF_EMBEDDED_MD = `## Brain integration (MCP) — lokalny embedded

Masz **jeden** MCP server \`brain-rag\` na \`127.0.0.1:7862\` — wszystkie narzędzia są na nim
(\`search_library\`, \`save_conversation\`, \`get_user_profile\`, \`memory\`, \`library_status\`).
Bez tokena — localhost only.

### Na starcie każdej nietrywialnej sesji
1. Wywołaj \`brain-rag.get_user_profile\` — przeczytaj mój profil (USER.md).
2. Gdy pytanie brzmi technicznie — \`brain-rag.search_library\` PRZED odpowiedzią.

### W trakcie rozmowy
3. "zapisz do brain" → \`brain-rag.save_conversation\` z pełnym payloadem.
4. Korekty / trwałe fakty → \`brain-rag.memory\` add/replace/remove.

Uruchom embedded brain w Reliqua (Brain tab → Start) jeśli MCP nie odpowiada.
`

export const BRAIN_BRIEF_MD = `## Brain integration (MCP)

Masz dostęp do trzech MCP serverów: \`brain-rag\`, \`brain-vault\`, \`brain-library\`.
Traktuj je jak przedłużenie mojej pamięci — nie moją wiedzę pretrenowaną.

### Na starcie każdej nietrywialnej sesji
1. Wywołaj \`brain-rag.get_user_profile\` — przeczytaj mój profil (USER.md).
   Bez tego nie wiesz kim jestem, jak rozmawiam, jakich narzędzi używam.
2. Jeśli pytanie brzmi technicznie / dotyczy tego projektu — wywołaj
   \`brain-rag.search_library\` z tematem pytania PRZED odpowiedzią.
   Cytuj źródła (path, score) gdy pomogły.

### W trakcie rozmowy
3. Gdy powiem "zapisz do brain", "zapisz rozmowę", "zapisz" lub podobnie —
   natychmiast wywołaj \`brain-rag.save_conversation\` z PEŁNYM payloadem:
   \`decisions\`, \`solutions\`, \`root_causes\`, \`files_touched\`,
   \`commands_run\`, \`errors_seen\`, \`attempts_failed\`, \`facts\`,
   \`open_questions\`, \`endpoints_urls_ips\`.
   Preferuj konkret (ścieżki z numerami linii, dokładne komendy, kody błędów)
   nad ogólnymi zdaniami — te notatki czytam za miesiące.
4. Gdy Cię koryguję ("nie używaj X", "wolę Y", "przestań robić Z") lub gdy
   powiem coś trwałego o sobie — wywołaj \`brain-rag.memory\` z akcją
   \`add\` i odpowiednią kategorią (\`user\` / \`tech\` / \`comm\` / \`income\`).

### Preferencje
- Preferuj \`brain-rag.search_library\` nad własną pretrenowaną wiedzą gdy
  pytanie brzmi jak coś specyficznego dla tego projektu / usera.
- Bez wywołania brain = zgadujesz. Z brain = masz kontekst tej konkretnej
  osoby i tego konkretnego repo.
- Nie pytaj mnie o pozwolenie na wywołanie tych narzędzi — są bezpieczne
  (read + append do vault). Rób.
`


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
        'brain-rag':     withHeaders(token, { type: 'http', url: PATHS.rag(base) }),
        'brain-vault':   withHeaders(token, { type: 'http', url: PATHS.vault(base) }),
        'brain-library': withHeaders(token, { type: 'http', url: PATHS.library(base) }),
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
        'brain-rag':     withHeaders(token, { url: PATHS.rag(base) }),
        'brain-vault':   withHeaders(token, { url: PATHS.vault(base) }),
        'brain-library': withHeaders(token, { url: PATHS.library(base) }),
      }
    },
    notes: 'Cursor reads the global ~/.cursor/mcp.json. The whole file is just this object — paste as-is.',
    restartHint: 'In Cursor: Ctrl+Shift+P → "Developer: Reload Window", or restart Cursor.',
    brief: {
      // Cursor 0.46+ reads user-global rules from ~/.cursor/rules/*.mdc.
      // Dedicated file avoids merging with per-project .cursorrules.
      briefPath: (os, home) => joinPath(os, home, '.cursor', 'rules', 'brain.mdc'),
      mode: 'create-if-missing',
      hint: 'Ctrl+Shift+P → "Developer: Reload Window" (rules are re-scanned on window reload).',
    },
  },

  {
    id: 'antigravity',
    label: 'Antigravity (Google IDE)',
    // The "live" location for Antigravity 2.x. There are two more (~/.gemini/config and
    // ~/.gemini/antigravity), but the IDE reads this one — see project memory for details.
    configPath: (os, home) => joinPath(os, home, '.gemini', 'antigravity-ide', 'mcp_config.json'),
    mcpKey: 'mcpServers',
    buildServers: (url, token) => {
      const base = trimBase(url)
      // Antigravity 2.x prefers streamable-http with /mcp paths and uses serverUrl (not url).
      return {
        'brain-rag':     withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.ragMcp(base) }),
        'brain-vault':   withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.vaultMcp(base) }),
        'brain-library': withHeaders(token, { type: 'streamable-http', serverUrl: PATHS.libraryMcp(base) }),
      }
    },
    notes:
      'Antigravity has up to three locations: ~/.gemini/antigravity-ide/ (live), ~/.gemini/config/ (shared), ~/.gemini/antigravity/ (legacy). Put the same snippet in BOTH antigravity-ide and config to be safe. If the IDE still does not pick MCP up after restart, MCP may need to be enabled in Antigravity settings — there is no language_server-side log line for MCP wiring.',
    restartHint: 'Close Antigravity completely (File → Exit, also tray → Quit), then reopen. Watch the Cascade/agent panel for tool availability.',
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
        'brain-rag':     wrap(PATHS.ragMcp(base)),
        'brain-vault':   wrap(PATHS.vaultMcp(base)),
        'brain-library': wrap(PATHS.libraryMcp(base)),
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
        'brain-rag':     withHeaders(token, { type: 'http', url: PATHS.rag(base) }),
        'brain-vault':   withHeaders(token, { type: 'http', url: PATHS.vault(base) }),
        'brain-library': withHeaders(token, { type: 'http', url: PATHS.library(base) }),
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
        'brain-rag':     withHeaders(token, { serverUrl: PATHS.ragMcp(base) }),
        'brain-vault':   withHeaders(token, { serverUrl: PATHS.vaultMcp(base) }),
        'brain-library': withHeaders(token, { serverUrl: PATHS.libraryMcp(base) }),
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
        'brain-rag':     withHeaders(token, { url: PATHS.ragMcp(base) }),
        'brain-vault':   withHeaders(token, { url: PATHS.vaultMcp(base) }),
        'brain-library': withHeaders(token, { url: PATHS.libraryMcp(base) }),
      }
    },
    // Note the YAML caveat: the snippet is emitted as JSON (Reliqua's uniform
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
  /** Optional agent brief — undefined if this client has no auto-loaded rules mechanism. */
  brief?: SnippetBrief
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
export function buildSnippet(
  clientId: ClientId,
  brainUrl: string,
  os: OS,
  home: string,
  token?: string,
  target: BrainTarget = 'remote'
): Snippet {
  const spec = getClient(clientId)
  const servers =
    target === 'embedded' ? embeddedServers(spec, brainUrl) : spec.buildServers(trimBase(brainUrl), token)
  const filePath = spec.configPath(os, home)

  const fullFileObj = { [spec.mcpKey]: servers }
  const fullFileJson = JSON.stringify(fullFileObj, null, 2) + '\n'
  const mergeJson = JSON.stringify(servers, null, 2) + '\n'

  const embeddedNote =
    target === 'embedded'
      ? 'Embedded brain: one server (brain-rag) at /mcp — no Bearer token. Start it in Reliqua → Brain tab first.'
      : null

  const instructions = [
    `▶ ${spec.label}`,
    ``,
    `1. Open or create: ${filePath}`,
    `2. If the file is empty / does not exist — paste the FULL snippet below as the entire file content.`,
    `   If the file already exists with other servers — merge into the "${spec.mcpKey}" object (under MERGE snippet).`,
    `3. ${spec.restartHint}`,
    ``,
    `Notes: ${spec.notes}`,
    embeddedNote,
    target === 'remote' && token
      ? `Token included in headers — keep this file private (chmod 600 if possible).`
      : target === 'remote'
        ? `No token included — add Authorization headers manually if the brain MCP proxy is auth-gated.`
        : `No token — localhost embedded brain does not use Bearer auth.`,
  ]
    .filter(Boolean)
    .join('\n')

  const briefContent = target === 'embedded' ? BRAIN_BRIEF_EMBEDDED_MD : BRAIN_BRIEF_MD

  const brief: SnippetBrief | undefined = spec.brief
    ? {
        filePath: spec.brief.briefPath(os, home),
        content: briefContent,
        mode: spec.brief.mode,
        restartHint: spec.brief.hint,
      }
    : undefined

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
  }
}
