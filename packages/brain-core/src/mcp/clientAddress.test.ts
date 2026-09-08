// SPDX-License-Identifier: AGPL-3.0-only
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'

import { clientAddress, isTrustedProxy, requestIsHttps } from './clientAddress.js'

function req(
  remoteAddress: string,
  headers: Record<string, string | undefined> = {},
  encrypted = false,
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress, encrypted },
  } as unknown as IncomingMessage
}

describe('clientAddress (F02)', () => {
  it('uses remoteAddress when no proxies are trusted', () => {
    expect(
      clientAddress(req('10.0.0.5', { 'x-forwarded-for': '1.2.3.4' }), []),
    ).toBe('10.0.0.5')
  })

  it('ignores XFF from an untrusted peer even if the list is non-empty', () => {
    expect(
      clientAddress(req('10.0.0.5', { 'x-forwarded-for': '9.9.9.9' }), ['127.0.0.1']),
    ).toBe('10.0.0.5')
  })

  it('reads the first XFF hop only from a trusted proxy', () => {
    expect(
      clientAddress(req('127.0.0.1', { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }), ['127.0.0.1']),
    ).toBe('9.9.9.9')
  })

  it('matches IPv4-mapped peers', () => {
    expect(isTrustedProxy('::ffff:127.0.0.1', ['127.0.0.1'])).toBe(true)
  })
})

describe('requestIsHttps (F02)', () => {
  it('does not trust X-Forwarded-Proto from an untrusted peer', () => {
    expect(requestIsHttps(req('10.0.0.5', { 'x-forwarded-proto': 'https' }), [])).toBe(false)
  })

  it('honours forwarded proto from a trusted proxy', () => {
    expect(
      requestIsHttps(req('127.0.0.1', { 'x-forwarded-proto': 'https' }), ['127.0.0.1']),
    ).toBe(true)
  })

  it('falls back to socket encryption without proxies', () => {
    expect(requestIsHttps(req('10.0.0.5', {}, true), [])).toBe(true)
  })
})
