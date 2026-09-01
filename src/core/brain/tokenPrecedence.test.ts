import { describe, expect, it } from 'vitest'

import { resolveConnectToken } from './tokenPrecedence.js'

describe('resolveConnectToken', () => {
  it('takes the file value when the two disagree', () => {
    // The incident: the server token was rotated, app-settings.json was
    // updated, and the renderer kept answering with the revoked one.
    const r = resolveConnectToken({ fileToken: 'btk_new', cachedToken: 'btk_revoked' })
    expect(r.token).toBe('btk_new')
    expect(r.refreshCache).toBe(true)
  })

  it('does not rewrite the cache when both already agree', () => {
    const r = resolveConnectToken({ fileToken: 'btk_same', cachedToken: 'btk_same' })
    expect(r.token).toBe('btk_same')
    expect(r.refreshCache).toBe(false)
  })

  it('hydrates a cache that has never been written', () => {
    const r = resolveConnectToken({ fileToken: 'btk_new', cachedToken: '' })
    expect(r.token).toBe('btk_new')
    expect(r.refreshCache).toBe(true)
  })

  it('keeps the cached token when the file has none', () => {
    // Missing is not the same as cleared. A machine whose settings file
    // predates the token field must not be signed out by reading it.
    const r = resolveConnectToken({ fileToken: undefined, cachedToken: 'btk_local' })
    expect(r.token).toBe('btk_local')
    expect(r.refreshCache).toBe(false)
  })

  it('treats whitespace as absent on both sides', () => {
    expect(resolveConnectToken({ fileToken: '   ', cachedToken: 'btk_local' }).token).toBe('btk_local')
    expect(resolveConnectToken({ fileToken: 'btk_f', cachedToken: '  ' })).toEqual({
      token: 'btk_f',
      refreshCache: true,
    })
  })

  it('returns empty rather than undefined when neither side has a token', () => {
    expect(resolveConnectToken({})).toEqual({ token: '', refreshCache: false })
  })
})
