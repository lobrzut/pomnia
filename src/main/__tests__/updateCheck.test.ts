import { describe, expect, it, vi } from 'vitest'

vi.mock('@core/log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { checkForUpdate, isNewerVersion } from '../updateCheck.js'

/**
 * The app shipped with no update path: whoever installed a build stayed on it
 * forever. Every fix reached nobody who already had it.
 */

function ghRelease(tag: string, extra: Record<string, unknown> = {}): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tag, html_url: `https://github.com/lobrzut/pomnia/releases/tag/${tag}`, ...extra }),
  })) as unknown as typeof fetch
}

describe('isNewerVersion', () => {
  it('compares numerically, not as text', () => {
    // The bug a string compare would hide: "0.1.9" > "0.1.10" alphabetically.
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.1.9', '0.1.10')).toBe(false)
  })

  it('handles the v prefix GitHub tags carry', () => {
    expect(isNewerVersion('v0.1.52', '0.1.51')).toBe(true)
    expect(isNewerVersion('v0.1.51', '0.1.51')).toBe(false)
  })

  it('treats equal versions as not newer', () => {
    expect(isNewerVersion('0.1.51', '0.1.51')).toBe(false)
  })

  it('compares across minor and major', () => {
    expect(isNewerVersion('0.2.0', '0.1.99')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.1.0', '1.0.0')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('reports a newer release', async () => {
    const r = await checkForUpdate('0.1.51', ghRelease('v0.1.52'))
    expect(r).toEqual({
      version: '0.1.52',
      releaseUrl: 'https://github.com/lobrzut/pomnia/releases/tag/v0.1.52',
    })
  })

  it('says nothing when already current', async () => {
    expect(await checkForUpdate('0.1.51', ghRelease('v0.1.51'))).toBeNull()
  })

  it('ignores drafts and prereleases', async () => {
    expect(await checkForUpdate('0.1.51', ghRelease('v0.2.0', { draft: true }))).toBeNull()
    expect(await checkForUpdate('0.1.51', ghRelease('v0.2.0', { prerelease: true }))).toBeNull()
  })

  /** Offline or rate-limited is not something the user can act on. */
  it('stays quiet when the network fails', async () => {
    const dead = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as unknown as typeof fetch
    expect(await checkForUpdate('0.1.51', dead)).toBeNull()
  })

  it('stays quiet on a non-OK response', async () => {
    const rateLimited = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch
    expect(await checkForUpdate('0.1.51', rateLimited)).toBeNull()
  })

  it('stays quiet when the payload has no tag', async () => {
    const empty = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    expect(await checkForUpdate('0.1.51', empty)).toBeNull()
  })
})
