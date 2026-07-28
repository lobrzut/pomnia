import { describe, expect, it } from 'vitest'
import { isMcpClientActive } from './mcpClientVisibility'
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
    configExists: false,
    state: 'not_wired',
    servers: [],
    issues: ['config file does not exist'],
  },
]

describe('isMcpClientActive', () => {
  it('follows configExists when no override', () => {
    expect(isMcpClientActive('vscode', clients, {})).toBe(true)
    expect(isMcpClientActive('cursor', clients, {})).toBe(false)
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
