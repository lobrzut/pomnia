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

/*
 * The admin token must never reach an agent's config file.
 *
 * `mcpTokens.ts` already states the rule — an admin token "must never be pasted
 * into those configs — it would put the right to change server behaviour and
 * mint further tokens into six files on disk". Nothing enforced it. Measured on
 * 2026-09-15: all three callers (Connect.tsx, Settings.tsx, useStore) hand this
 * function the app's `connectToken`, and in Mini that token is the admin one, so
 * opening Connect wrote `btk_igum…` into three Antigravity configs.
 *
 * The role is supplied by the caller rather than probed here on purpose: this
 * function is filesystem-only and its tests run with no server. `main/index.ts`
 * already imports `probeTokenRole` and asks once, where the URL and token live.
 *
 * Skipping is deliberate rather than writing the entry without a secret. A
 * remote entry with no Authorization fails auth on the next call, which is
 * worse than leaving yesterday's working block alone.
 */
describe('syncManagedMcpConfigs — an admin token never reaches an agent config', () => {
  let home = ''

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'pomnia-mcp-admin-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    mkdirSync(join(home, '.cursor'), { recursive: true })
    writeFileSync(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          pomnia: { url: 'http://192.168.1.201:7862/mcp' },
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

  it('skips the client instead of writing the admin secret', async () => {
    const r = await syncManagedMcpConfigs({
      brainUrl: 'http://192.168.1.248:7865',
      target: 'remote',
      token: 'btk_ADMIN_SECRET_must_not_land',
      tokenRole: 'admin',
      home,
      os: 'darwin',
    })

    const raw = readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')
    expect(raw).not.toContain('btk_ADMIN_SECRET_must_not_land')
    expect(r.updated.some((u) => u.id === 'cursor')).toBe(false)
    expect(r.skipped.some((s) => s.id === 'cursor' && /admin/i.test(s.reason))).toBe(true)
    // The rest of the file is untouched — refusing is not a reason to damage it.
    const written = JSON.parse(raw) as { mcpServers: Record<string, { command?: string }> }
    expect(written.mcpServers.comfyui?.command).toBe('python')
  })

  it('still writes an agent token, so the guard does not break the working path', async () => {
    const r = await syncManagedMcpConfigs({
      brainUrl: 'http://192.168.1.248:7865',
      target: 'remote',
      token: 'btk_AGENT_SECRET_may_land',
      tokenRole: 'not-admin',
      home,
      os: 'darwin',
    })

    const raw = readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')
    expect(raw).toContain('btk_AGENT_SECRET_may_land')
    expect(r.updated.some((u) => u.id === 'cursor')).toBe(true)
  })
})
