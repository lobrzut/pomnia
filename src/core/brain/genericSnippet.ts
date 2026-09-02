// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * One MCP block, for any client, without knowing which client it is.
 *
 * Pomnia carries a spec per agent — Cursor, Claude Code, Antigravity, VS Code,
 * Windsurf, Hermes, Claude Desktop — and every one of them exists to save a
 * paste, not to make the connection work. The endpoint has always been
 * general: one `/mcp` with a Bearer header, which is what MCP is.
 *
 * What actually differs between clients is three small things, and none is
 * about the protocol:
 *
 *   - where the file lives (~/.cursor/mcp.json, %APPDATA%/Code/User/mcp.json …)
 *   - the outer key (`mcpServers` for most, `servers` for VS Code)
 *   - HTTP or stdio (Claude Desktop speaks stdio and reaches HTTP through
 *     mcp-remote, which is where the Windows quoting faults come from)
 *
 * So this module answers the question a per-client list cannot: what do I paste
 * into an agent nobody has written a spec for yet? An agent released tomorrow
 * works with Pomnia today, because it speaks MCP and this is what MCP wants.
 *
 * The variants are ordered by how often they are right, not alphabetically:
 * `http` covers most clients, `serverUrl` the ones that name the field
 * differently, `stdio` only those that cannot speak HTTP at all.
 */

export type OS = 'win32' | 'darwin' | 'linux'

export interface GenericVariant {
  id: 'http' | 'server-url' | 'stdio'
  /** What to look for in your client's docs to know this is the one. */
  when: string
  /** The value to place under the outer key, as JSON. */
  json: string
}

export interface GenericSnippet {
  /** The endpoint every variant points at. */
  endpoint: string
  /** The key the server map nests under, and the one exception. */
  outerKey: string
  outerKeyNote: string
  /** Server name inside the map. Agents refer to Pomnia by this. */
  serverName: string
  variants: GenericVariant[]
  /** Complete file for a client that has none yet — the common case. */
  fullFileJson: string
}

export const MCP_SERVER_NAME = 'pomnia'
const AUTH_ENV = 'AUTH_HEADER'

/** `http://host:7865` → `http://host:7865/mcp`, and never `/admin/mcp`. */
function endpointFrom(brainUrl: string): string {
  let base = brainUrl.trim().replace(/\/+$/, '')
  for (;;) {
    const stripped = base.replace(/\/(admin|mcp|status)$/i, '').replace(/\/+$/, '')
    if (stripped === base) break
    base = stripped
  }
  return `${base}/mcp`
}

function withAuth<T extends Record<string, unknown>>(token: string | undefined, entry: T): T {
  if (!token) return entry
  return { ...entry, headers: { Authorization: `Bearer ${token}` } }
}

export function buildGenericSnippet(
  brainUrl: string,
  token?: string,
  os: OS = 'win32',
): GenericSnippet {
  const endpoint = endpointFrom(brainUrl)
  const j = (v: unknown): string => JSON.stringify({ [MCP_SERVER_NAME]: v }, null, 2)

  // Windows sends the token through an environment variable. `command: "npx"`
  // resolves to a path containing a space, and cmd.exe splits both that and
  // `Authorization: Bearer …` — the server then receives an empty header,
  // answers 401, and mcp-remote dies inside OAuth registration.
  const stdio =
    os === 'win32'
      ? {
          command: 'cmd',
          args: [
            '/c',
            'npx',
            '-y',
            'mcp-remote',
            endpoint,
            '--allow-http',
            ...(token ? ['--header', `Authorization:\${${AUTH_ENV}}`] : []),
          ],
          ...(token ? { env: { [AUTH_ENV]: `Bearer ${token}` } } : {}),
        }
      : {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            endpoint,
            '--allow-http',
            ...(token ? ['--header', `Authorization: Bearer ${token}`] : []),
          ],
        }

  const variants: GenericVariant[] = [
    {
      id: 'http',
      when: 'Your client takes a URL. Most do — start here.',
      json: j(withAuth(token, { type: 'http', url: endpoint })),
    },
    {
      id: 'server-url',
      when: 'Your client names the field `serverUrl` (Antigravity, Windsurf).',
      json: j(withAuth(token, { type: 'streamable-http', serverUrl: endpoint })),
    },
    {
      id: 'stdio',
      when: 'Your client only launches a command (Claude Desktop). Needs Node.',
      json: j(stdio),
    },
  ]

  return {
    endpoint,
    outerKey: 'mcpServers',
    outerKeyNote: 'VS Code calls this key `servers` instead. Everything inside is the same.',
    serverName: MCP_SERVER_NAME,
    variants,
    fullFileJson: JSON.stringify(
      { mcpServers: { [MCP_SERVER_NAME]: withAuth(token, { type: 'http', url: endpoint }) } },
      null,
      2,
    ),
  }
}

/**
 * A prompt the user pastes into the agent, so the agent wires itself up.
 *
 * Better than handing someone JSON and a file path, because the agent already
 * knows where its own configuration lives and can edit it — no directories, no
 * text editor, no guessing which of three shapes this client wants. The user
 * pastes one message into the window they are already looking at.
 *
 * Written for an agent that will act on it, so it says what to do, what not to
 * touch, and how to prove it worked. The proof matters most: 'connected' in a
 * client's UI means a config file was parsed, not that a single call ever
 * succeeded — which is exactly how six clients here sat green while answering
 * 403 to every request.
 *
 * Contains the token. That is the point, and it is the user's own credential
 * going into the user's own agent, but the UI offering this must say so: it is
 * a secret, and a chat log is a place people paste screenshots from.
 */
export function buildAgentSetupPrompt(
  brainUrl: string,
  token?: string,
  os: OS = 'win32',
): string {
  const g = buildGenericSnippet(brainUrl, token, os)
  const auth = token ? `Bearer ${token}` : undefined

  const lines: string[] = [
    'Connect yourself to my Pomnia memory server over MCP. Do it by editing your own',
    'MCP configuration file — you know where yours lives; I should not have to.',
    '',
    `Server name: ${g.serverName}`,
    `Endpoint:    ${g.endpoint}`,
  ]
  if (auth) lines.push(`Header:      Authorization: ${auth}`)
  lines.push(
    '',
    'Pick the shape your client actually supports:',
    '',
    '1. A URL field (most clients):',
    ...indent(g.variants[0].json),
    '',
    '2. A `serverUrl` field instead (Antigravity, Windsurf):',
    ...indent(g.variants[1].json),
    '',
    '3. Only a command, no HTTP (Claude Desktop) — needs Node:',
    ...indent(g.variants[2].json),
    '',
    `Nest it under "${g.outerKey}". ${g.outerKeyNote}`,
    '',
    'Rules:',
    `- Leave every other server in that file alone. Only add or replace "${g.serverName}".`,
    '- Do not invent a different name; agents and I both refer to it by that one.',
  )
  if (os === 'win32') {
    lines.push(
      '- On Windows, if you use shape 3: run through `cmd /c npx`, not `npx` —',
      "  the resolved path contains a space and fails as 'C:\\Program' is not",
      '  recognized.',
    )
    // Only when there is a token: without one there is no header to mis-quote,
    // and naming the trap anyway reads as an instruction to send a header the
    // server is not asking for.
    if (auth) {
      lines.push(
        '- Put the token in an environment variable and reference it as',
        '  "Authorization:${AUTH_HEADER}". cmd.exe splits the literal form on its',
        '  own space, the server then receives an empty header, answers 401, and',
        '  mcp-remote dies inside OAuth registration naming none of that.',
      )
    }
  }
  lines.push(
    '',
    'Then prove it, do not assume it:',
    '- Reload or restart yourself so the new configuration is read.',
    '- Call the `get_user_profile` tool and show me the first line of what comes back.',
    '- If it fails, tell me the HTTP status. 401 means the token; 403 usually means',
    '  the URL kept an /admin in it; nothing at all means the endpoint is wrong.',
    '',
    'Do not report success because the file was written. A configuration that parses',
    'and never answers is the failure this is meant to avoid.',
  )
  return lines.join('\n')
}

/** Two-space indent for a JSON block inside prose. */
function indent(json: string): string[] {
  return json.split('\n').map((l) => `    ${l}`)
}
