// SPDX-License-Identifier: AGPL-3.0-only
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'

import { checkLoopbackRequestBoundary, hostNameOnly } from './requestBoundary.js'

function req(headers: Record<string, string | undefined>): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

describe('hostNameOnly', () => {
  it('strips ports and brackets', () => {
    expect(hostNameOnly('127.0.0.1:7862')).toBe('127.0.0.1')
    expect(hostNameOnly('localhost')).toBe('localhost')
    expect(hostNameOnly('[::1]:7862')).toBe('::1')
  })
})

describe('checkLoopbackRequestBoundary (F01)', () => {
  it('accepts loopback Host without Origin', () => {
    expect(checkLoopbackRequestBoundary(req({ host: '127.0.0.1:45000' }))).toEqual({ ok: true })
    expect(checkLoopbackRequestBoundary(req({ host: 'localhost:7862' }))).toEqual({ ok: true })
  })

  it('accepts loopback Origin with loopback Host', () => {
    expect(
      checkLoopbackRequestBoundary(
        req({ host: '127.0.0.1:45000', origin: 'http://127.0.0.1:45000' }),
      ),
    ).toEqual({ ok: true })
  })

  it('rejects a foreign Host (DNS rebinding)', () => {
    expect(checkLoopbackRequestBoundary(req({ host: 'audit.invalid' }))).toEqual({
      ok: false,
      reason: 'bad_host',
    })
  })

  it('rejects a foreign Origin even with a local Host', () => {
    expect(
      checkLoopbackRequestBoundary(
        req({ host: '127.0.0.1:45000', origin: 'http://audit.invalid' }),
      ),
    ).toEqual({ ok: false, reason: 'bad_origin' })
  })

  it('rejects missing Host', () => {
    expect(checkLoopbackRequestBoundary(req({}))).toEqual({ ok: false, reason: 'bad_host' })
  })
})
