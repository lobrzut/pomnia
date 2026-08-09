import { describe, expect, it } from 'vitest'
import { buildSnippet, MCP_POMNIA_KEY, MCP_POMNIA_LIBRARY_KEY, MCP_POMNIA_VAULT_KEY } from './snippet.js'

describe('brain/snippet — Cursor remote mcp.json', () => {
  it('default remote (brain-core) emits single pomnia → /mcp with Bearer', () => {
    const s = buildSnippet(
      'cursor',
      'http://192.168.1.201:7865',
      'darwin',
      '/Users/Alice',
      'btk_test_token',
      'remote',
    )
    expect(s.filePath).toBe('/Users/Alice/.cursor/mcp.json')
    expect(s.mcpKey).toBe('mcpServers')

    const full = JSON.parse(s.fullFileJson) as {
      mcpServers: Record<string, { url: string; headers?: { Authorization: string } }>
    }
    const servers = full.mcpServers
    expect(Object.keys(servers)).toEqual([MCP_POMNIA_KEY])
    expect(servers[MCP_POMNIA_KEY].url).toBe('http://192.168.1.201:7865/mcp')
    expect(servers[MCP_POMNIA_KEY].headers?.Authorization).toBe('Bearer btk_test_token')
    expect(servers[MCP_POMNIA_VAULT_KEY]).toBeUndefined()
    expect(servers[MCP_POMNIA_LIBRARY_KEY]).toBeUndefined()
    expect(s.instructions).toContain('brain-core')
    expect(s.instructions).not.toContain('three SSE')
  })

  it('mergeJson is the single-server map for brain-core remote', () => {
    const s = buildSnippet('cursor', 'https://brain.example:7865', 'win32', 'C:\\Users\\Alice', 'tok', 'remote')
    const merge = JSON.parse(s.mergeJson) as Record<string, unknown>
    expect(merge[MCP_POMNIA_KEY]).toBeTruthy()
    expect(merge[MCP_POMNIA_VAULT_KEY]).toBeUndefined()
    expect(Object.keys(merge)).toHaveLength(1)
  })

  it('legacy-hub remote still emits three SSE servers with Bearer', () => {
    const s = buildSnippet(
      'cursor',
      'http://127.0.0.1:7862',
      'darwin',
      '/Users/Alice',
      'btk_test_token',
      'remote',
      { remoteHub: 'legacy-hub' },
    )
    const full = JSON.parse(s.fullFileJson) as {
      mcpServers: Record<string, { url: string; headers?: { Authorization: string } }>
    }
    const servers = full.mcpServers
    expect(Object.keys(servers).sort()).toEqual(
      [MCP_POMNIA_KEY, MCP_POMNIA_LIBRARY_KEY, MCP_POMNIA_VAULT_KEY].sort(),
    )
    expect(servers[MCP_POMNIA_KEY].url).toBe('http://127.0.0.1:7862/sse')
    expect(servers[MCP_POMNIA_VAULT_KEY].url).toBe('http://127.0.0.1:7862/servers/brain-vault/sse')
    expect(servers[MCP_POMNIA_LIBRARY_KEY].url).toBe('http://127.0.0.1:7862/servers/brain-library/sse')
    for (const key of [MCP_POMNIA_KEY, MCP_POMNIA_VAULT_KEY, MCP_POMNIA_LIBRARY_KEY] as const) {
      expect(servers[key].headers?.Authorization).toBe('Bearer btk_test_token')
    }
    expect(s.instructions).toContain('Legacy Python hub')
  })

  it('embedded Cursor uses single /mcp pomnia without token', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'darwin', '/Users/x', undefined, 'embedded')
    const full = JSON.parse(s.fullFileJson) as { mcpServers: Record<string, { url: string; headers?: unknown }> }
    expect(Object.keys(full.mcpServers)).toEqual([MCP_POMNIA_KEY])
    expect(full.mcpServers[MCP_POMNIA_KEY].url).toBe('http://127.0.0.1:7862/mcp')
    expect(full.mcpServers[MCP_POMNIA_KEY].headers).toBeUndefined()
  })

  it('Brain Mode OFF omits agent brief', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'win32', 'C:\\Users\\x', undefined, 'embedded')
    expect(s.brief).toBeUndefined()
    expect(s.agentRuleMarkdown).toBeUndefined()
  })

  it('Brain Mode ON includes Cursor .mdc brief + shared rule markdown', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'win32', 'C:\\Users\\x', undefined, 'embedded', {
      brainMode: true,
    })
    expect(s.brief?.filePath.replace(/\\/g, '/')).toMatch(/\.cursor\/rules\/pomnia\.mdc$/)
    expect(s.brief?.content).toContain('alwaysApply: true')
    expect(s.brief?.content).toContain('pomnia-brain-start')
    expect(s.brief?.content).toContain('OK to Go Go Go')
    expect(s.handshakeBrief?.filePath.replace(/\\/g, '/')).toMatch(/\.cursor\/rules\/pomnia-handshake\.mdc$/)
    expect(s.handshakeBrief?.content).toContain('PRIORITY 0')
    expect(s.handshakeBrief?.content).toContain('OK to Go Go Go')
    expect(s.agentRuleMarkdown).toContain('save_conversation')
    expect(s.agentRuleMarkdown).toContain('checkpoint_session')
    expect(s.agentRuleMarkdown).toContain('autoCheckpointEnabled')
    expect(s.agentRuleMarkdown).toContain('sessions/checkpoints')
    expect(s.agentRuleMarkdown).toContain('Do not assume Pomnia auto-captures')
    expect(s.agentRuleMarkdown).toContain('Handshake (proof Pomnia MCP')
    expect(s.agentRuleMarkdown).toContain('zapisz do Pomnia')
    expect(s.agentRuleMarkdown).toContain('sprawdź w Pomnia')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 0')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 1')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 2')
    expect(s.agentRuleMarkdown).toContain('MUST')
    expect(s.agentRuleMarkdown).toContain('vault/AGENTS.md')
    expect(s.agentRuleMarkdown).toContain('quality_score')
    expect(s.agentRuleMarkdown).toContain('MCP `pomnia`')
    expect(s.agentRuleMarkdown).toContain('Also useful (normal weight)')
    expect(s.agentRuleMarkdown).not.toContain('agent MAY call')
  })

  it('Brain Mode ON wires custom handshake phrase into the rule', () => {
    const s = buildSnippet('claude-code', 'http://127.0.0.1:7862', 'darwin', '/Users/x', undefined, 'embedded', {
      brainMode: true,
      handshakePhrase: 'Ruszamy',
    })
    expect(s.agentRuleMarkdown).toContain('`Ruszamy`')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 0')
    expect(s.instructions).toContain('Ruszamy')
  })

  it('upsertPomniaBrainBrief puts Handshake block at top and replaces old markers', async () => {
    const { upsertPomniaBrainBrief, buildBrainBriefMd } = await import('./snippet.js')
    const brief = buildBrainBriefMd({ handshakePhrase: 'OK to Go Go Go' })
    const existing = '# Old notes\n\n<!-- pomnia-brain-start -->\nold\n<!-- pomnia-brain-end -->\n\nkeep me\n'
    const next = upsertPomniaBrainBrief(existing, brief)
    expect(next.indexOf('<!-- pomnia-brain-start -->')).toBe(0)
    expect(next).toContain('OK to Go Go Go')
    expect(next).toContain('keep me')
    expect(next).not.toContain('\nold\n')
    expect(next.match(/<!-- pomnia-brain-start -->/g)?.length).toBe(1)
  })

  it('upsertVaultAgentsHandshake embeds exact phrase', async () => {
    const { upsertVaultAgentsHandshake } = await import('./snippet.js')
    const next = upsertVaultAgentsHandshake(
      '# AGENTS\n\n## Handshake\nold soft pointer\n\n## Zasady\nx\n',
      { handshakePhrase: 'OK to Go Go Go' },
    )
    expect(next).toContain('<!-- pomnia-handshake-start -->')
    expect(next).toContain('`OK to Go Go Go`')
    expect(next).toContain('MUST')
    expect(next).not.toContain('old soft pointer')
  })

  it('Brain Mode ON with handshakeEnabled false omits greeting rule', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'win32', 'C:\\Users\\x', undefined, 'embedded', {
      brainMode: true,
      handshakeEnabled: false,
    })
    expect(s.agentRuleMarkdown).not.toContain('Handshake (proof')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 1')
    expect(s.agentRuleMarkdown).toContain('PRIORITY 2')
    expect(s.instructions).toContain('Handshake greeting is OFF')
  })

  it('Brain Mode ON for Hermes still gives copyable rule (no dedicated path)', () => {
    const s = buildSnippet('hermes', 'http://127.0.0.1:7862', 'linux', '/home/x', undefined, 'embedded', {
      brainMode: true,
    })
    expect(s.brief).toBeUndefined()
    expect(s.agentRuleMarkdown).toContain('get_user_profile')
  })
})

describe('brain/snippet — Antigravity remote mcp_config.json', () => {
  it('default remote uses single streamable-http /mcp (brain-core)', () => {
    const s = buildSnippet(
      'antigravity',
      'http://192.168.1.201:7865',
      'win32',
      'C:\\Users\\Alice',
      'btk_test_token',
      'remote',
    )
    expect(s.client).toBe('antigravity')
    expect(s.label).toBe('Antigravity (Google IDE)')
    expect(s.filePath.replace(/\\/g, '/')).toMatch(/\.gemini\/antigravity-ide\/mcp_config\.json$/)

    const full = JSON.parse(s.fullFileJson) as {
      mcpServers: Record<
        string,
        { type?: string; serverUrl?: string; url?: string; headers?: { Authorization: string } }
      >
    }
    expect(Object.keys(full.mcpServers)).toEqual([MCP_POMNIA_KEY])
    const rag = full.mcpServers[MCP_POMNIA_KEY]
    expect(rag.type).toBe('streamable-http')
    expect(rag.serverUrl).toBe('http://192.168.1.201:7865/mcp')
    expect(rag.url).toBeUndefined()
    expect(rag.headers?.Authorization).toBe('Bearer btk_test_token')
  })

  it('Brain Mode ON includes GEMINI.md brief path (Zapisz regułę na dysk)', () => {
    const s = buildSnippet(
      'antigravity',
      'http://127.0.0.1:7862',
      'win32',
      'C:\\Users\\Alice',
      undefined,
      'embedded',
      { brainMode: true },
    )
    expect(s.brief?.filePath.replace(/\\/g, '/')).toMatch(/\.gemini\/config\/GEMINI\.md$/)
    expect(s.brief?.mode).toBe('append-to-existing')
    expect(s.brief?.content).toContain('pomnia-brain-start')
    expect(s.brief?.content).toContain('PRIORITY 0')
    expect(s.brief?.content).toContain('search_library')
    expect(s.brief?.content).toContain('MUST')
    expect(s.agentRuleMarkdown).toContain('get_user_profile')
    expect(s.instructions).toContain('GEMINI.md')
  })
})
