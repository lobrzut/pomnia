// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * `list_agents` is the fact a conductor reads instead of the operator retyping
 * it. These pin the two things that make it worth trusting: it reports the
 * registry rather than a hardcoded list, and it keeps the authenticated
 * identity (`you`) separate from the self-reported one (`client`).
 */
import { describe, expect, it } from 'vitest'

import { noteMcpBody, resetSeenClients, seenClients } from '../clientRegistry.js'
import { runListAgents } from './agents.js'

/** The body an MCP client actually sends when it connects. */
function initialize(name: string, version?: string): unknown {
  return { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name, version } } }
}

describe('runListAgents', () => {
  it('reports the clients that introduced themselves, newest first', () => {
    resetSeenClients()
    noteMcpBody(initialize('Cursor', '1.2.3'), 1_000)
    noteMcpBody(initialize('codex', '0.9'), 2_000)

    const out = JSON.parse(runListAgents({ caller: 'cursor', now: 5_000 })) as {
      agents: Array<{ client: string; version: string | null; connects: number; secondsSinceLastSeen: number }>
    }

    expect(out.agents.map((a) => a.client)).toEqual(['codex', 'Cursor'])
    expect(out.agents[1].version).toBe('1.2.3')
    expect(out.agents[0].secondsSinceLastSeen).toBe(3)
  })

  it('separates the authenticated caller from the self-reported client name', () => {
    resetSeenClients()
    // The client calls itself "Cursor"; the token it presented is named
    // "claude-code". That mismatch is exactly what must stay visible.
    noteMcpBody(initialize('Cursor'), 1_000)

    const out = JSON.parse(runListAgents({ caller: 'claude-code' })) as {
      you: string | null
      agents: Array<{ client: string }>
    }

    expect(out.you).toBe('claude-code')
    expect(out.agents[0].client).toBe('Cursor')
    expect(out.you).not.toBe(out.agents[0].client)
  })

  it('says the caller is unknown rather than inventing one', () => {
    resetSeenClients()
    const out = JSON.parse(runListAgents({})) as { you: string | null; youNote: string }
    expect(out.you).toBeNull()
    expect(out.youNote).toMatch(/could not name/i)
  })

  it('never claims an empty list means nothing is connected', () => {
    resetSeenClients()
    const out = JSON.parse(runListAgents({ caller: 'cursor' })) as { agents: unknown[]; scope: string }
    expect(out.agents).toEqual([])
    // The scope sentence is the thing that stops "empty" being read as "none".
    expect(out.scope).toMatch(/since this server started/i)
    expect(out.scope).toMatch(/restart empties it/i)
  })

  it('reads the live registry when no list is injected', () => {
    resetSeenClients()
    noteMcpBody(initialize('Antigravity'))
    expect(seenClients().map((c) => c.name)).toEqual(['Antigravity'])

    const out = JSON.parse(runListAgents({ caller: 'antigravity' })) as { agents: Array<{ client: string }> }
    expect(out.agents.map((a) => a.client)).toEqual(['Antigravity'])
  })
})
