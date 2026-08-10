// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Reachability is a separate question from configuration.
 *
 * Regression guarded: three clients reported "wired" while pointing at a brain
 * host that had been left behind on another machine. Every key was present and
 * every URL well-formed — nothing was listening.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkClient, probeMcpUrl } from './status.js'
import { getClient } from './snippet.js'

function mcpOk(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ result: { protocolVersion: '2024-11-05' }, jsonrpc: '2.0', id: 1 }),
  } as unknown as Response
}

describe('probeMcpUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports an MCP server that answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mcpOk()))
    const p = await probeMcpUrl('http://127.0.0.1:7862/mcp')
    expect(p).toMatchObject({ reachable: true, status: 200, speaksMcp: true })
  })

  it('separates "host answered but rejected us" from "host is gone"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }) as unknown as Response))
    const gated = await probeMcpUrl('https://brain.example/mcp')
    expect(gated).toMatchObject({ reachable: true, status: 401, speaksMcp: false })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The operation was aborted due to timeout')
      }),
    )
    const gone = await probeMcpUrl('http://192.168.1.201:7862/mcp')
    expect(gone.reachable).toBe(false)
    expect(gone.error).toMatch(/timeout/)
  })

  it('sends a real initialize call, not a health ping', async () => {
    const f = vi.fn(async () => mcpOk())
    vi.stubGlobal('fetch', f)
    await probeMcpUrl('http://127.0.0.1:7862/mcp', 'tok123')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:7862/mcp')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toContain('"method":"initialize"')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok123')
  })
})

describe('checkClient reachability', () => {
  let home = ''

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'pomnia-status-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    // Correct in every readable way: a complete remote trio, well-formed URLs.
    // This is the shape that reported "wired" while the host was gone.
    const base = 'http://192.168.1.201:7862'
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          pomnia: { type: 'http', url: `${base}/mcp` },
          'pomnia-vault': { type: 'http', url: `${base}/servers/brain-vault/mcp` },
          'pomnia-library': { type: 'http', url: `${base}/servers/brain-library/mcp` },
        },
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    rmSync(home, { recursive: true, force: true })
  })

  it('still says wired when nobody asked for a probe', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const s = await checkClient(getClient('claude-code'))
    expect(s.state).toBe('wired')
    expect(f).not.toHaveBeenCalled()
  })

  it('downgrades to unreachable and names the dead URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 192.168.1.201:7862')
      }),
    )
    const s = await checkClient(getClient('claude-code'), { probe: true })
    expect(s.state).toBe('unreachable')
    expect(s.probe?.reachable).toBe(false)
    expect(s.issues[0]).toContain('192.168.1.201:7862')
  })

  it('stays wired when the probe succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mcpOk()))
    const s = await checkClient(getClient('claude-code'), { probe: true })
    expect(s.state).toBe('wired')
    expect(s.probe?.speaksMcp).toBe(true)
  })
})
