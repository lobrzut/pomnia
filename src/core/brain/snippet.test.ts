import { describe, expect, it } from 'vitest'
import { buildSnippet } from './snippet.js'

describe('brain/snippet — Cursor remote mcp.json', () => {
  it('emits all three Brain servers with Bearer headers', () => {
    const s = buildSnippet(
      'cursor',
      'http://brain.example.local:7862',
      'darwin',
      '/Users/Alice',
      'btk_test_token',
      'remote'
    )
    expect(s.filePath).toBe('/Users/Alice/.cursor/mcp.json')
    expect(s.mcpKey).toBe('mcpServers')

    const full = JSON.parse(s.fullFileJson) as {
      mcpServers: Record<string, { url: string; headers?: { Authorization: string } }>
    }
    const servers = full.mcpServers
    expect(Object.keys(servers).sort()).toEqual(['brain-library', 'brain-rag', 'brain-vault'])
    expect(servers['brain-rag'].url).toBe('http://brain.example.local:7862/sse')
    expect(servers['brain-vault'].url).toBe('http://brain.example.local:7862/servers/brain-vault/sse')
    expect(servers['brain-library'].url).toBe('http://brain.example.local:7862/servers/brain-library/sse')
    for (const key of ['brain-rag', 'brain-vault', 'brain-library'] as const) {
      expect(servers[key].headers?.Authorization).toBe('Bearer btk_test_token')
    }
  })

  it('mergeJson is the three-server map (not a single-server stub)', () => {
    const s = buildSnippet('cursor', 'https://brain.example:7862', 'win32', 'C:\\Users\\Admin', 'tok', 'remote')
    const merge = JSON.parse(s.mergeJson) as Record<string, unknown>
    expect(merge['brain-rag']).toBeTruthy()
    expect(merge['brain-vault']).toBeTruthy()
    expect(merge['brain-library']).toBeTruthy()
    expect(Object.keys(merge)).toHaveLength(3)
  })

  it('embedded Cursor uses single /mcp brain-rag without token', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'darwin', '/Users/x', undefined, 'embedded')
    const full = JSON.parse(s.fullFileJson) as { mcpServers: Record<string, { url: string; headers?: unknown }> }
    expect(Object.keys(full.mcpServers)).toEqual(['brain-rag'])
    expect(full.mcpServers['brain-rag'].url).toBe('http://127.0.0.1:7862/mcp')
    expect(full.mcpServers['brain-rag'].headers).toBeUndefined()
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
    expect(s.brief?.filePath.replace(/\\/g, '/')).toMatch(/\.cursor\/rules\/brain\.mdc$/)
    expect(s.brief?.content).toContain('alwaysApply: true')
    expect(s.brief?.content).toContain('pomnia-brain-start')
    expect(s.brief?.content).toContain('OK to Go Go Go')
    expect(s.agentRuleMarkdown).toContain('save_conversation')
    expect(s.agentRuleMarkdown).toContain('Do not assume Pomnia auto-captures')
    expect(s.agentRuleMarkdown).toContain('Handshake (proof Pomnia Brain is wired)')
  })

  it('Brain Mode ON wires custom handshake phrase into the rule', () => {
    const s = buildSnippet('claude-code', 'http://127.0.0.1:7862', 'darwin', '/Users/x', undefined, 'embedded', {
      brainMode: true,
      handshakePhrase: 'Ruszamy',
    })
    expect(s.agentRuleMarkdown).toContain('`Ruszamy`')
    expect(s.instructions).toContain('Ruszamy')
  })

  it('Brain Mode ON with handshakeEnabled false omits greeting rule', () => {
    const s = buildSnippet('cursor', 'http://127.0.0.1:7862', 'win32', 'C:\\Users\\x', undefined, 'embedded', {
      brainMode: true,
      handshakeEnabled: false,
    })
    expect(s.agentRuleMarkdown).not.toContain('Handshake (proof')
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
  it('uses serverUrl + streamable-http (not Cursor url shape)', () => {
    const s = buildSnippet(
      'antigravity',
      'http://brain.example.local:7862',
      'win32',
      'C:\\Users\\Admin',
      'btk_test_token',
      'remote'
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
    const rag = full.mcpServers['brain-rag']
    expect(rag.type).toBe('streamable-http')
    expect(rag.serverUrl).toBe('http://brain.example.local:7862/mcp')
    expect(rag.url).toBeUndefined()
    expect(rag.headers?.Authorization).toBe('Bearer btk_test_token')
  })
})
