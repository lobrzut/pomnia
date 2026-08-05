import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAuthGate, isLoopbackHost } from '../src/mcp/auth.js'

/**
 * config/index.ts documented "Skipped when host === 127.0.0.1; enforced
 * otherwise" long before anything enforced it. Starting the daemon with
 * --host 0.0.0.0 published vault search and note-writing tools to the network.
 */

function req(authorization?: string, ip = '10.0.0.5'): IncomingMessage {
  return {
    headers: authorization ? { authorization } : {},
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage
}

describe('isLoopbackHost', () => {
  it('recognises the local binds Pomnia embeds on', () => {
    for (const h of ['127.0.0.1', '::1', 'localhost']) expect(isLoopbackHost(h)).toBe(true)
    for (const h of ['0.0.0.0', '192.168.1.201', 'brain.example']) expect(isLoopbackHost(h)).toBe(false)
  })
})

describe('auth gate', () => {
  let dir = ''
  let tokensFile = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pomnia-auth-'))
    tokensFile = join(dir, 'mcp-tokens.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const gate = (host: string, maxFailsPerMinute = 20, now?: () => number): ReturnType<typeof createAuthGate> =>
    createAuthGate({ host, tokensFile, maxFailsPerMinute, now })

  function writeTokens(...pairs: [string, string][]): void {
    writeFileSync(tokensFile, JSON.stringify(pairs.map(([name, token]) => ({ name, token }))))
  }

  it('lets everything through on a loopback bind', async () => {
    const g = gate('127.0.0.1')
    expect(g.required).toBe(false)
    expect(await g.check(req())).toMatchObject({ ok: true })
  })

  it('refuses every request when the tokens file is missing', async () => {
    const g = gate('0.0.0.0')
    expect(g.required).toBe(true)
    expect(await g.check(req())).toMatchObject({ ok: false })
    expect(await g.check(req('Bearer anything'))).toMatchObject({ ok: false, reason: 'no_tokens_configured' })
  })

  it('accepts a listed token and names it', async () => {
    writeTokens(['claude-code-laptop', 'btk_good'])
    const g = gate('0.0.0.0')
    // A token written without a role is an agent — every token issued before
    // roles existed was issued for an agent, and promoting them silently would
    // be the opposite of the fix roles are there to make.
    expect(await g.check(req('Bearer btk_good'))).toEqual({
      ok: true,
      name: 'claude-code-laptop',
      role: 'agent',
    })
  })

  it('rejects a wrong token and a missing header', async () => {
    writeTokens(['x', 'btk_good'])
    const g = gate('0.0.0.0')
    expect(await g.check(req('Bearer btk_wrong'))).toMatchObject({ ok: false, reason: 'bad_token' })
    expect(await g.check(req())).toMatchObject({ ok: false, reason: 'no_header' })
  })

  it('accepts the scheme case-insensitively', async () => {
    writeTokens(['x', 'btk_good'])
    const g = gate('0.0.0.0')
    expect(await g.check(req('bearer btk_good'))).toMatchObject({ ok: true })
    expect(await g.check(req('BEARER btk_good'))).toMatchObject({ ok: true })
  })

  it('rate-limits repeated failures per client', async () => {
    writeTokens(['x', 'btk_good'])
    const g = gate('0.0.0.0', 3)
    for (let i = 0; i < 3; i++) await g.check(req('Bearer nope'))
    const blocked = await g.check(req('Bearer nope'))
    expect(blocked).toMatchObject({ ok: false, reason: 'rate_limited' })
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  /**
   * The self-DoS this avoids: one misconfigured client burning the budget must
   * not lock out everyone else behind the same address. A correct token is not
   * a guess, so the limit has no business refusing it.
   */
  it('still admits a valid token after the limit is hit', async () => {
    writeTokens(['x', 'btk_good'])
    const g = gate('0.0.0.0', 2)
    for (let i = 0; i < 5; i++) await g.check(req('Bearer nope'))
    expect(await g.check(req('Bearer nope'))).toMatchObject({ reason: 'rate_limited' })
    expect(await g.check(req('Bearer btk_good'))).toMatchObject({ ok: true, name: 'x' })
  })

  it('counts failures per client, not globally', async () => {
    writeTokens(['x', 'btk_good'])
    const g = gate('0.0.0.0', 2)
    for (let i = 0; i < 4; i++) await g.check(req('Bearer nope', '10.0.0.1'))
    expect(await g.check(req('Bearer nope', '10.0.0.1'))).toMatchObject({ reason: 'rate_limited' })
    expect(await g.check(req('Bearer nope', '10.0.0.2'))).toMatchObject({ reason: 'bad_token' })
  })

  it('picks up a token added after start, without a restart', async () => {
    writeTokens(['old', 'btk_old'])
    let clock = 1_000_000
    const g = gate('0.0.0.0', 20, () => clock)
    expect(await g.check(req('Bearer btk_new'))).toMatchObject({ ok: false })

    writeTokens(['old', 'btk_old'], ['new', 'btk_new'])
    clock += 5000 // past the 2s re-read guard
    expect(await g.check(req('Bearer btk_new'))).toMatchObject({ ok: true, name: 'new' })
  })

  it('treats a malformed tokens file as no tokens rather than failing open', async () => {
    writeFileSync(tokensFile, '{ this is not json')
    const g = gate('0.0.0.0')
    expect(await g.check(req('Bearer anything'))).toMatchObject({ ok: false })
  })
})
