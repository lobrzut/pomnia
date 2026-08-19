// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeManagedServers, syncManagedMcpConfigs } from './mcpSync.js'

describe('mergeManagedServers', () => {
  it('replaces brain-rag with pomnia and keeps unrelated servers', () => {
    const merged = mergeManagedServers(
      {
        'brain-rag': { url: 'http://192.168.1.201:7862/mcp', headers: { Authorization: 'Bearer x' } },
        comfyui: { command: 'python' },
      },
      { pomnia: { url: 'http://127.0.0.1:7862/mcp' } },
    )
    expect(merged['brain-rag']).toBeUndefined()
    expect(merged.pomnia).toEqual({ url: 'http://127.0.0.1:7862/mcp' })
    expect(merged.comfyui).toEqual({ command: 'python' })
  })
})

describe('syncManagedMcpConfigs', () => {
  let home = ''

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'pomnia-mcp-sync-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    mkdirSync(join(home, '.cursor'), { recursive: true })
    writeFileSync(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'brain-rag': { url: 'http://192.168.1.201:7862/mcp' },
          comfyui: { command: 'python' },
        },
      }),
      { encoding: 'utf8' },
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  it('rewrites a stale LAN brain-rag to this app embedded URL', async () => {
    const r = await syncManagedMcpConfigs({
      brainUrl: 'http://127.0.0.1:7862',
      target: 'embedded',
      home,
      os: 'darwin',
    })
    expect(r.updated.some((u) => u.id === 'cursor')).toBe(true)
    const written = JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { url?: string; command?: string }>
    }
    expect(written.mcpServers['brain-rag']).toBeUndefined()
    expect(written.mcpServers.pomnia?.url).toBe('http://127.0.0.1:7862/mcp')
    expect(written.mcpServers.comfyui?.command).toBe('python')
  })
})
