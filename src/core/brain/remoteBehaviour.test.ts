import { describe, expect, it, vi } from 'vitest'

import { behaviourBaseUrl, behaviourPayload, pushRemoteBehaviour } from './remoteBehaviour.js'

const ok = () => new Response('{}', { status: 200 })

describe('behaviourBaseUrl', () => {
  it('strips the paths people paste from a browser', () => {
    for (const u of ['http://h:7865', 'http://h:7865/', 'http://h:7865/admin', 'http://h:7865/mcp']) {
      expect(behaviourBaseUrl(u)).toBe('http://h:7865')
    }
  })
})

describe('behaviourPayload', () => {
  it('sends only what was asked for', () => {
    // The server also holds instanceLabel. Sending a whole object would
    // overwrite settings this app never showed.
    expect(behaviourPayload({ handshakeEnabled: false })).toEqual({ handshakeEnabled: false })
  })

  it('keeps false, which is a value and not an absence', () => {
    expect(behaviourPayload({ autoCheckpointEnabled: false })).toEqual({ autoCheckpointEnabled: false })
  })

  it('drops an empty phrase rather than sending one the server will refuse', () => {
    expect(behaviourPayload({ handshakePhrase: '   ' })).toEqual({})
  })
})

describe('pushRemoteBehaviour', () => {
  it('refuses without an admin token, and says why', () => {
    return pushRemoteBehaviour({ brainUrl: 'http://h:7865', next: { handshakeEnabled: true } }).then((r) => {
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.reason).toBe('no-token')
        expect(r.detail).toContain('admin token')
      }
    })
  })

  it('does not call the server when there is nothing to change', async () => {
    const f = vi.fn(ok)
    const r = await pushRemoteBehaviour({ brainUrl: 'http://h:7865', adminToken: 't', next: {}, fetchImpl: f as never })
    expect(r.ok).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })

  it('PUTs to /admin/behaviour with the admin token', async () => {
    const f = vi.fn(ok)
    await pushRemoteBehaviour({
      brainUrl: 'http://h:7865/admin',
      adminToken: 'btk_a',
      next: { handshakePhrase: 'OK to Go Go Go', autoCheckpointEnabled: false },
      fetchImpl: f as never,
    })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://h:7865/admin/behaviour')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer btk_a')
    expect(JSON.parse(init.body as string)).toEqual({
      handshakePhrase: 'OK to Go Go Go',
      autoCheckpointEnabled: false,
    })
  })

  it('repeats the server\'s own explanation of a refusal', async () => {
    // "Could not save" over a 400 that names the offending field is the kind
    // of message that costs an hour.
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_phrase', detail: 'Fraza: od 3 do 64 znaków.' }), { status: 400 }),
    )
    const r = await pushRemoteBehaviour({
      brainUrl: 'http://h:7865',
      adminToken: 't',
      next: { handshakePhrase: 'ab' },
      fetchImpl: f as never,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('rejected')
      expect(r.detail).toContain('400')
      expect(r.detail).toContain('3 do 64')
    }
  })

  it('reports an unreachable server as unreachable, not as rejected', async () => {
    const f = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const r = await pushRemoteBehaviour({
      brainUrl: 'http://h:7865',
      adminToken: 't',
      next: { handshakeEnabled: true },
      fetchImpl: f as never,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unreachable')
  })
})
