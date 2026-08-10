import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAuthGate } from './auth.js'

/**
 * These exist because the guard they cover was shipped broken.
 *
 * `check(req, need)` grew the parameter and kept the old body: the signature
 * promised a role check that nothing performed, the unit tests around the
 * admin handler passed (they inject an actor and never touch the gate), and an
 * agent token minted itself an admin token against a live server. The lesson is
 * the boring one — test the layer that enforces, not the layer that assumes.
 */

let dir: string
let file: string

const req = (token?: string): IncomingMessage =>
  ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: { remoteAddress: '10.0.0.5' },
  }) as unknown as IncomingMessage

const gate = () => createAuthGate({ host: '0.0.0.0', tokensFile: file, maxFailsPerMinute: 20 })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-roles-'))
  file = join(dir, 'mcp-tokens.json')
  await writeFile(
    file,
    JSON.stringify([
      { name: 'bot', token: 'btk_agent', role: 'agent' },
      { name: 'ops', token: 'btk_admin', role: 'admin' },
      { name: 'legacy', token: 'btk_legacy' },
    ]),
    'utf8',
  )
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('role enforcement', () => {
  it('lets an agent token through where no role is required', async () => {
    expect(await gate().check(req('btk_agent'))).toMatchObject({ ok: true, name: 'bot', role: 'agent' })
  })

  /** The escalation: agent token → change settings, mint tokens, take the vault. */
  it('refuses an agent token where admin is required', async () => {
    const r = await gate().check(req('btk_agent'), 'admin')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('forbidden')
  })

  it('lets an admin token through both', async () => {
    const g = gate()
    expect((await g.check(req('btk_admin'))).ok).toBe(true)
    expect((await g.check(req('btk_admin'), 'admin'))).toMatchObject({ ok: true, role: 'admin' })
  })

  /** Every token issued before roles existed was issued for an agent. */
  it('treats a role-less legacy token as an agent, not as an admin', async () => {
    const g = gate()
    expect((await g.check(req('btk_legacy'))).ok).toBe(true)
    expect((await g.check(req('btk_legacy'), 'admin')).reason).toBe('forbidden')
  })

  it('refuses an unknown token regardless of the role asked for', async () => {
    const g = gate()
    expect((await g.check(req('btk_nope'), 'admin')).reason).toBe('bad_token')
    expect((await g.check(req('btk_nope'))).reason).toBe('bad_token')
  })

  it('refuses a missing header on an admin route', async () => {
    expect((await gate().check(req(), 'admin')).reason).toBe('no_header')
  })

  /**
   * A valid agent token on an admin route is a misconfiguration, not a guess.
   * Counting it would let one misconfigured client lock out every other one.
   */
  it('does not feed the rate limiter when refusing on role alone', async () => {
    const g = createAuthGate({ host: '0.0.0.0', tokensFile: file, maxFailsPerMinute: 3 })
    for (let i = 0; i < 10; i++) {
      expect((await g.check(req('btk_agent'), 'admin')).reason).toBe('forbidden')
    }
    // The agent's own surface still works after ten refusals.
    expect((await g.check(req('btk_agent'))).ok).toBe(true)
  })

  it('still rate-limits actual guessing', async () => {
    const g = createAuthGate({ host: '0.0.0.0', tokensFile: file, maxFailsPerMinute: 3 })
    for (let i = 0; i < 3; i++) await g.check(req(`btk_guess${i}`))
    expect((await g.check(req('btk_guess9'))).reason).toBe('rate_limited')
  })
})

describe('peek', () => {
  it('applies the same role rule as check', async () => {
    const g = gate()
    expect(await g.peek(req('btk_agent'))).toBe(true)
    expect(await g.peek(req('btk_agent'), 'admin')).toBe(false)
    expect(await g.peek(req('btk_admin'), 'admin')).toBe(true)
    expect(await g.peek(req('btk_nope'), 'admin')).toBe(false)
  })
})

describe('loopback', () => {
  /** Pomnia Desktop embeds this; the port is not reachable off-box. */
  it('is trusted for admin too', async () => {
    const g = createAuthGate({ host: '127.0.0.1', tokensFile: file, maxFailsPerMinute: 3 })
    expect(await g.check(req(), 'admin')).toMatchObject({ ok: true, role: 'admin' })
    expect(await g.peek(req(), 'admin')).toBe(true)
  })
})

describe('a tokens file that cannot be trusted', () => {
  it('denies admin when the file is missing', async () => {
    const g = createAuthGate({
      host: '0.0.0.0',
      tokensFile: join(dir, 'gone.json'),
      maxFailsPerMinute: 3,
    })
    expect((await g.check(req('btk_admin'), 'admin')).ok).toBe(false)
  })

  it('denies admin when the file is corrupt', async () => {
    await writeFile(file, '{ not json', 'utf8')
    expect((await gate().check(req('btk_admin'), 'admin')).ok).toBe(false)
  })

  it('does not accept an unknown role as admin', async () => {
    await writeFile(file, JSON.stringify([{ name: 'x', token: 'btk_x', role: 'root' }]), 'utf8')
    expect((await gate().check(req('btk_x'), 'admin')).reason).toBe('forbidden')
  })
})
