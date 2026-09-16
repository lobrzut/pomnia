// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * `list_agents` is the fact a conductor reads instead of the operator retyping
 * it. These pin what makes it worth trusting: the authenticated list tracks
 * every request rather than only introductions, the self-reported list stays
 * separate, and an empty answer never reads as "nothing is connected".
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  noteMcpBody,
  noteMcpCaller,
  resetSeenCallers,
  resetSeenClients,
  seenCallers,
} from '../clientRegistry.js'
import { runListAgents } from './agents.js'

/** The body an MCP client actually sends when it connects. */
function initialize(name: string, version?: string): unknown {
  return { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name, version } } }
}

const parse = (s: string) =>
  JSON.parse(s) as {
    you: string | null
    youNote: string
    agents: Array<{ token: string; calls: number; secondsSinceLastSeen: number }>
    clients: Array<{ client: string; version: string | null }>
    scope: string
  }

beforeEach(() => {
  resetSeenCallers()
  resetSeenClients()
})

describe('runListAgents — the authenticated list', () => {
  it('counts every request, not only introductions', () => {
    // The bug this replaced: a session that introduced itself before the last
    // restart calls tools for minutes and shows up nowhere.
    noteMcpCaller('cursor', 1_000)
    noteMcpCaller('cursor', 2_000)
    noteMcpCaller('claude-code', 3_000)

    const out = parse(runListAgents({ caller: 'claude-code', now: 5_000 }))

    expect(out.agents.map((a) => a.token)).toEqual(['claude-code', 'cursor'])
    expect(out.agents.find((a) => a.token === 'cursor')?.calls).toBe(2)
    expect(out.agents[0].secondsSinceLastSeen).toBe(2)
  })

  it('ignores loopback and empty names rather than inventing an agent', () => {
    noteMcpCaller('loopback', 1_000)
    noteMcpCaller(undefined, 1_000)
    noteMcpCaller('   ', 1_000)

    expect(seenCallers()).toEqual([])
    expect(parse(runListAgents({})).agents).toEqual([])
  })
})

describe('runListAgents — the self-reported list stays separate', () => {
  it('keeps the authenticated caller apart from the client name', () => {
    // The client calls itself Cursor; the token it presented is named
    // claude-code. That mismatch must stay visible.
    noteMcpBody(initialize('Cursor', '1.2.3'), 1_000)
    noteMcpCaller('claude-code', 1_000)

    const out = parse(runListAgents({ caller: 'claude-code' }))

    expect(out.you).toBe('claude-code')
    expect(out.clients[0].client).toBe('Cursor')
    expect(out.clients[0].version).toBe('1.2.3')
    expect(out.agents.map((a) => a.token)).toEqual(['claude-code'])
    expect(out.you).not.toBe(out.clients[0].client)
  })

  it('reports an agent that never introduced itself', () => {
    noteMcpCaller('codex', 1_000)

    const out = parse(runListAgents({ caller: 'codex' }))

    expect(out.agents.map((a) => a.token)).toEqual(['codex'])
    expect(out.clients).toEqual([])
  })
})

describe('runListAgents — honesty of the empty answer', () => {
  it('says the caller is unknown rather than inventing one', () => {
    const out = parse(runListAgents({}))

    expect(out.you).toBeNull()
    expect(out.youNote).toMatch(/could not name/i)
  })

  it('never lets an empty list mean nothing is connected', () => {
    const out = parse(runListAgents({ caller: 'cursor' }))

    expect(out.agents).toEqual([])
    expect(out.clients).toEqual([])
    expect(out.scope).toMatch(/since this server started/i)
    expect(out.scope).toMatch(/absent, not gone/i)
  })

  it('reads the live registries when nothing is injected', () => {
    noteMcpCaller('antigravity')
    noteMcpBody(initialize('Antigravity'))

    const out = parse(runListAgents({ caller: 'antigravity' }))

    expect(out.agents.map((a) => a.token)).toEqual(['antigravity'])
    expect(out.clients.map((c) => c.client)).toEqual(['Antigravity'])
  })
})
