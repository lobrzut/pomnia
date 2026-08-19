// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import { isMcpClientActive, mcpClientMemoryState } from './mcpClientVisibility'
import type { ClientStatus } from './types'

const clients: ClientStatus[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    configPath: '~/mcp.json',
    configExists: true,
    state: 'wired',
    servers: [],
    issues: [],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configPath: '~/.cursor/mcp.json',
    configExists: true,
    state: 'unreachable',
    servers: [],
    issues: ["http://192.168.1.201:7862/mcp is not this app's Brain"],
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: '~/claude_desktop_config.json',
    configExists: true,
    state: 'not_wired',
    servers: [],
    issues: [],
  },
]

describe('isMcpClientActive', () => {
  it('follows configExists when no override (list visibility, not handshake)', () => {
    expect(isMcpClientActive('vscode', clients, {})).toBe(true)
    expect(isMcpClientActive('cursor', clients, {})).toBe(true)
    expect(isMcpClientActive('claude-desktop', clients, {})).toBe(true)
  })

  it('Settings toggle override wins (same truth as Connect visibility)', () => {
    expect(isMcpClientActive('vscode', clients, { vscode: false })).toBe(false)
    expect(isMcpClientActive('cursor', clients, { cursor: true })).toBe(true)
  })

  it('missing client is inactive unless forced on', () => {
    expect(isMcpClientActive('windsurf', clients, {})).toBe(false)
    expect(isMcpClientActive('windsurf', clients, { windsurf: true })).toBe(true)
  })
})

describe('mcpClientMemoryState', () => {
  it('does not treat a present config file as reading this Brain', () => {
    expect(mcpClientMemoryState('cursor', clients)).toBe('unreachable')
    expect(mcpClientMemoryState('claude-desktop', clients)).toBe('not_wired')
    expect(mcpClientMemoryState('vscode', clients)).toBe('wired')
  })
})
