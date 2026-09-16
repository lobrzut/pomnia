// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which agents share this memory — so one of them can act for the others.
 *
 * The operator pays for four coding agents and wants to say, in whichever one
 * is open: "you have these connected, be their conductor". That sentence needs
 * a fact the agent can read, not a list the person retypes.
 *
 * Two lists, because there are two kinds of identity and only one is proof:
 *
 *   - `agents` is keyed by the token name the auth gate verified, and is
 *     updated on every authenticated request. This is the honest answer to
 *     "who is using this memory".
 *   - `clients` is what each client said about itself in `initialize`
 *     (clientInfo.name) — self-reported, unverified, and only recorded when an
 *     introduction actually arrives.
 *
 * The split is not pedantry, it is a bug this tool already had. The first
 * version reported only the self-reported list, and on 2026-09-16 a live
 * Claude Code session called tools for minutes while that list stayed empty:
 * the server is stateless, so a client that introduced itself before the last
 * restart never has to do it again. A conductor asking who was connected would
 * have been told nobody, while four agents worked.
 *
 * Both lists live in memory, since this server started. Persisting them would
 * turn a client someone tried once into a permanent fixture — the same
 * wrongness as a config file outliving its tool. The answer says so, so an
 * empty list is never read as "nothing is connected".
 */
import { seenCallers, seenClients } from '../clientRegistry.js'

export const listAgentsSchema = { type: 'object' as const, properties: {} }

export interface ListAgentsOptions {
  /** Token name from the auth gate — authenticated, unlike anything self-reported. */
  caller?: string
  /** Injectable for tests; defaults to the live registries. */
  callers?: ReturnType<typeof seenCallers>
  clients?: ReturnType<typeof seenClients>
  now?: number
}

const since = (now: number, at: number): number => Math.max(0, Math.round((now - at) / 1000))

/** JSON text, like every other tool here. */
export function runListAgents(opts: ListAgentsOptions = {}): string {
  const callers = opts.callers ?? seenCallers()
  const clients = opts.clients ?? seenClients()
  const now = opts.now ?? Date.now()

  return JSON.stringify(
    {
      you: opts.caller ?? null,
      youNote:
        opts.caller == null
          ? 'This server could not name the calling token. Either it is a loopback call or the token has no name.'
          : 'Token name matched by the auth gate — authenticated.',
      agents: callers.map((c) => ({
        token: c.name,
        firstSeen: new Date(c.firstSeen).toISOString(),
        lastSeen: new Date(c.lastSeen).toISOString(),
        secondsSinceLastSeen: since(now, c.lastSeen),
        calls: c.calls,
      })),
      clients: clients.map((c) => ({
        client: c.name,
        version: c.version ?? null,
        firstSeen: new Date(c.firstSeen).toISOString(),
        lastSeen: new Date(c.lastSeen).toISOString(),
        secondsSinceLastSeen: since(now, c.lastSeen),
        connects: c.connects,
      })),
      scope:
        'The agents list is keyed by the token the auth gate verified and updates on every request — it is ' +
        'who is actually using this memory. The clients list is self-reported in MCP initialize and only ' +
        'appears when a client introduces itself, which a long-lived session may never do again. Both are ' +
        'held in memory since this server started: a restart empties them, and an agent absent here is ' +
        'absent, not gone.',
    },
    null,
    2,
  )
}
