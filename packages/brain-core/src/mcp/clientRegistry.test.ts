import { beforeEach, describe, expect, it } from 'vitest'

import { noteMcpBody, resetSeenClients, seenClients } from './clientRegistry.js'

const init = (name: unknown, version?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name, version } },
})

describe('clientRegistry — who has actually connected', () => {
  beforeEach(() => resetSeenClients())

  it('records a client from its own introduction', () => {
    // Better evidence than a config file: this client called.
    noteMcpBody(init('cursor-vscode', '1.2.3'), 1000)
    expect(seenClients()).toEqual([
      { name: 'cursor-vscode', version: '1.2.3', firstSeen: 1000, lastSeen: 1000, connects: 1 },
    ])
  })

  it('records an agent nobody wrote a spec for', () => {
    // The whole point: something released tomorrow appears the first time it
    // connects, and no code changes.
    noteMcpBody(init('some-agent-from-2027'), 1000)
    expect(seenClients()[0].name).toBe('some-agent-from-2027')
  })

  it('counts reconnects instead of duplicating the client', () => {
    noteMcpBody(init('claude-ai', '1.0'), 1000)
    noteMcpBody(init('claude-ai', '1.0'), 5000)
    const [c] = seenClients()
    expect(c.connects).toBe(2)
    expect(c.firstSeen).toBe(1000)
    expect(c.lastSeen).toBe(5000)
  })

  it('lists the most recently seen first', () => {
    noteMcpBody(init('a'), 1000)
    noteMcpBody(init('b'), 2000)
    expect(seenClients().map((c) => c.name)).toEqual(['b', 'a'])
  })

  it('ignores everything that is not an initialize', () => {
    noteMcpBody(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_library' } },
      1000,
    )
    expect(seenClients()).toEqual([])
  })

  it('handles a batch, rather than quietly seeing nothing', () => {
    noteMcpBody([init('one'), { method: 'tools/list' }, init('two')], 1000)
    expect(
      seenClients()
        .map((c) => c.name)
        .sort(),
    ).toEqual(['one', 'two'])
  })

  it('refuses a nameless or non-string client', () => {
    noteMcpBody(init(''), 1000)
    noteMcpBody(init('   '), 1000)
    noteMcpBody(init(42), 1000)
    noteMcpBody(init(undefined), 1000)
    expect(seenClients()).toEqual([])
  })

  it('does not list Pomnia talking to itself', () => {
    // The desktop's liveness probe opens a session every few seconds. It reads
    // nothing, and left in it dominates the list it is supposed to describe.
    noteMcpBody(init('pomnia-status-probe', '1'), 1000)
    noteMcpBody(init('PomNia-Status-Probe', '1'), 1000)
    expect(seenClients()).toEqual([])
  })

  it('still lists a real client alongside the probe', () => {
    noteMcpBody(init('pomnia-status-probe', '1'), 1000)
    noteMcpBody(init('claude-code', '2.1.247'), 2000)
    expect(seenClients().map((c) => c.name)).toEqual(['claude-code'])
  })

  it('strips control characters out of a name', () => {
    // It lands in a UI and in logs; a name is a label, not a payload.
    noteMcpBody(init('ev\u0007il\u001bclient'), 1000)
    expect(seenClients()[0].name).toBe('evilclient')
  })

  it('survives rubbish without throwing', () => {
    for (const junk of [null, undefined, 42, 'string', [], {}, { method: 'initialize' }]) {
      expect(() => noteMcpBody(junk, 1000)).not.toThrow()
    }
    expect(seenClients()).toEqual([])
  })

  it('drops the least recently seen when full, keeping the newest arrival', () => {
    for (let i = 0; i < 64; i++) noteMcpBody(init(`c${i}`), 1000 + i)
    noteMcpBody(init('newest'), 99_999)
    const names = seenClients().map((c) => c.name)
    expect(names).toContain('newest')
    expect(names).not.toContain('c0')
    expect(names.length).toBe(64)
  })
})
