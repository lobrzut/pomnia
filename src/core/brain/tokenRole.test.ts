import { describe, expect, it } from 'vitest'

import { probeTokenRole } from './tokenRole.js'

const reply = (status: number): typeof fetch =>
  (async () => new Response(status === 200 ? '{"tokens":[]}' : '', { status })) as unknown as typeof fetch

describe('probeTokenRole', () => {
  it('calls a token admin when the admin API accepts it', async () => {
    const r = await probeTokenRole({ baseUrl: 'http://b:7865', token: 'btk_x', fetchImpl: reply(200) })
    expect(r.role).toBe('admin')
  })

  it('calls it not-admin on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const r = await probeTokenRole({ baseUrl: 'http://b:7865', token: 'btk_x', fetchImpl: reply(status) })
      expect(r.role).toBe('not-admin')
    }
  })

  it('does not read a missing admin API as proof of admin rights', async () => {
    // An older server has no /admin/tokens. Guessing 'admin' there would send
    // the token into a mint call that cannot work.
    const r = await probeTokenRole({ baseUrl: 'http://b:7865', token: 'btk_x', fetchImpl: reply(404) })
    expect(r.role).toBe('not-admin')
  })

  it('separates "cannot ask" from "not admin"', async () => {
    const boom = (async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch
    const r = await probeTokenRole({ baseUrl: 'http://b:7865', token: 'btk_x', fetchImpl: boom })
    expect(r.role).toBe('unreachable')
    expect(r.detail).toContain('fetch failed')
  })

  it('sends the token as a Bearer header and asks the right route', async () => {
    let seen: { url: string; auth: string } | null = null
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization }
      return new Response('{"tokens":[]}', { status: 200 })
    }) as unknown as typeof fetch
    await probeTokenRole({ baseUrl: 'http://b:7865/', token: ' btk_x ', fetchImpl: spy })
    expect(seen).toEqual({ url: 'http://b:7865/admin/tokens', auth: 'Bearer btk_x' })
  })

  it('treats an empty token as not-admin without calling anything', async () => {
    const explode = (() => {
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    expect((await probeTokenRole({ baseUrl: 'http://b', token: '  ', fetchImpl: explode })).role).toBe('not-admin')
  })
})
