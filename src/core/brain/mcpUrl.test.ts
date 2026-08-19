// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import { urlsPointAtSameBrain } from './mcpUrl.js'

describe('urlsPointAtSameBrain', () => {
  it('treats localhost and 127.0.0.1 as the same embedded brain', () => {
    expect(urlsPointAtSameBrain('http://localhost:7862/mcp', 'http://127.0.0.1:7862')).toBe(true)
  })

  it('rejects a LAN host even when it speaks MCP on the same port', () => {
    expect(urlsPointAtSameBrain('http://192.168.1.201:7862/mcp', 'http://127.0.0.1:7862')).toBe(false)
  })
})
