// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which agents share this memory — so one of them can act for the others.
 *
 * The operator pays for four coding agents and wants to say, in whichever one
 * is open: "you have these connected, be their conductor". That sentence needs
 * a fact the agent can read, not a list the person retypes.
 *
 * Two identities are reported, and they are not the same thing:
 *
 *   - `you` is the **token name** the auth gate matched. It is authenticated:
 *     the caller proved it by presenting the secret.
 *   - `client` is what the client said about itself in `initialize`
 *     (`clientInfo.name`). It is **self-reported** and unverified — any client
 *     can introduce itself as anything.
 *
 * Both are here because the difference carries information. Agreement is
 * ordinary; a mismatch means a token is being used by something other than the
 * client it was minted for, which is worth seeing rather than smoothing away.
 *
 * Until 2026-09-15 this tool would have been useless: all four agents shared a
 * single token, so the server saw one actor no matter who called. Per-agent
 * tokens are what make `you` mean anything.
 *
 * Deliberately built on the registry as it is — in memory, "seen since this
 * server started". Persisting it would turn a client someone tried once into a
 * permanent fixture, the same wrongness as a config file outliving its tool.
 * The answer says so, so nobody reads an empty list as "nothing is connected".
 */
import { seenClients } from '../clientRegistry.js'

export const listAgentsSchema = { type: 'object' as const, properties: {} }

export interface ListAgentsOptions {
  /** Token name from the auth gate — authenticated, unlike the client's own name. */
  caller?: string
  /** Injectable for tests; defaults to the live registry. */
  clients?: ReturnType<typeof seenClients>
  now?: number
}

/** JSON text, like every other tool here. */
export function runListAgents(opts: ListAgentsOptions = {}): string {
  const clients = opts.clients ?? seenClients()
  const now = opts.now ?? Date.now()

  return JSON.stringify(
    {
      you: opts.caller ?? null,
      youNote:
        opts.caller == null
          ? 'This server could not name the calling token. Either it is a loopback call or the token has no name.'
          : 'Token name matched by the auth gate — authenticated.',
      agents: clients.map((c) => ({
        client: c.name,
        version: c.version ?? null,
        firstSeen: new Date(c.firstSeen).toISOString(),
        lastSeen: new Date(c.lastSeen).toISOString(),
        secondsSinceLastSeen: Math.max(0, Math.round((now - c.lastSeen) / 1000)),
        connects: c.connects,
      })),
      scope:
        'Clients that have introduced themselves since this server started. In memory: a restart empties it, ' +
        'and an agent that has never connected since then is absent rather than gone. `client` is self-reported ' +
        'by the client in its MCP `initialize`; it is not proof of identity — only `you` is.',
    },
    null,
    2,
  )
}
