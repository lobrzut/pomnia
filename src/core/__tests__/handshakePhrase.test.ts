import { describe, expect, it } from 'vitest'
import {
  CANONICAL_HANDSHAKE_PHRASE,
  isHandshakePhrase,
  normalizeHandshakePhrase,
} from '../handshakePhrase'

describe('handshakePhrase', () => {
  it('accepts flexible casing, spacing, and punctuation', () => {
    expect(isHandshakePhrase('OK to Go Go Go')).toBe(true)
    expect(isHandshakePhrase('ok to go go go')).toBe(true)
    expect(isHandshakePhrase('Ok to Go Go Go!')).toBe(true)
    expect(isHandshakePhrase('OK to Go Go Go!')).toBe(true)
    expect(isHandshakePhrase('Ok to Go Go Go！')).toBe(true) // fullwidth !
    expect(isHandshakePhrase('  Ok   TO   go  go   go  ')).toBe(true)
    expect(isHandshakePhrase('ok  to   go go go')).toBe(true)
    expect(isHandshakePhrase('"Ok to Go Go Go!"')).toBe(true)
    expect(normalizeHandshakePhrase('  Ok   TO   go  go   go!  ')).toBe(
      CANONICAL_HANDSHAKE_PHRASE,
    )
    expect(normalizeHandshakePhrase('Ok to Go Go Go!')).toBe('ok to go go go')
  })

  it('rejects near-misses', () => {
    expect(isHandshakePhrase('OK to Go Go')).toBe(false)
    expect(isHandshakePhrase('go go go')).toBe(false)
    expect(isHandshakePhrase('')).toBe(false)
  })
})
