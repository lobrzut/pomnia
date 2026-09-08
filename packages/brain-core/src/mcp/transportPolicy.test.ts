// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { isInsecureRemoteHttpUrl, isLoopbackHostname } from './transportPolicy.js'

describe('isLoopbackHostname (F12)', () => {
  it('accepts localhost forms', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
  })

  it('rejects LAN and public hosts', () => {
    expect(isLoopbackHostname('192.168.1.248')).toBe(false)
    expect(isLoopbackHostname('brain.local')).toBe(false)
  })
})

describe('isInsecureRemoteHttpUrl (F12)', () => {
  it('warns on plain HTTP to a remote host', () => {
    expect(isInsecureRemoteHttpUrl('http://192.168.1.248:7865')).toBe(true)
    expect(isInsecureRemoteHttpUrl('http://192.168.1.248:7865/admin')).toBe(true)
    expect(isInsecureRemoteHttpUrl('192.168.1.248:7865')).toBe(true)
  })

  it('allows loopback HTTP and any HTTPS', () => {
    expect(isInsecureRemoteHttpUrl('http://127.0.0.1:7862')).toBe(false)
    expect(isInsecureRemoteHttpUrl('http://localhost:7865/mcp')).toBe(false)
    expect(isInsecureRemoteHttpUrl('https://192.168.1.248:7865')).toBe(false)
  })

  it('stays quiet on empty or unparseable input', () => {
    expect(isInsecureRemoteHttpUrl('')).toBe(false)
    expect(isInsecureRemoteHttpUrl('   ')).toBe(false)
  })
})
