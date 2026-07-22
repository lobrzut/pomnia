import { describe, expect, it } from 'vitest'
import {
  CANONICAL_HANDSHAKE_PHRASE,
  canonicalizeHandshakePhraseSetting,
  DEFAULT_HANDSHAKE_PHRASE,
  displayHandshakePhrase,
  isHandshakePhrase,
  isValidHandshakePhraseSetting,
  MIN_HANDSHAKE_PHRASE_LEN,
  normalizeHandshakePhrase,
} from '../handshakePhrase'

describe('handshakePhrase', () => {
  it('accepts flexible casing, spacing, and punctuation against default', () => {
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
    expect(DEFAULT_HANDSHAKE_PHRASE).toBe('OK to Go Go Go')
  })

  it('matches a custom expected phrase with the same forgiving rules', () => {
    expect(isHandshakePhrase('Ruszamy!', 'Ruszamy')).toBe(true)
    expect(isHandshakePhrase('  ruszamy  ', 'Ruszamy')).toBe(true)
    expect(isHandshakePhrase('Ruszamy', 'Inna fraza')).toBe(false)
  })

  it('rejects near-misses and too-short settings', () => {
    expect(isHandshakePhrase('OK to Go Go')).toBe(false)
    // Two "go" + bang → "ok to go" — not an alias for three-go default
    expect(isHandshakePhrase('OK to GO!')).toBe(false)
    expect(normalizeHandshakePhrase('OK to GO!')).toBe('ok to go')
    expect(isHandshakePhrase('go go go')).toBe(false)
    expect(isHandshakePhrase('')).toBe(false)
    expect(isValidHandshakePhraseSetting('a')).toBe(false)
    expect(isValidHandshakePhraseSetting('')).toBe(false)
    expect(isValidHandshakePhraseSetting('  ')).toBe(false)
    expect(isValidHandshakePhraseSetting('ok')).toBe(true)
    expect(isValidHandshakePhraseSetting('LOL')).toBe(true)
    expect(isValidHandshakePhraseSetting('go')).toBe(true)
    expect(MIN_HANDSHAKE_PHRASE_LEN).toBe(2)
    expect(isHandshakePhrase('abcd', 'a')).toBe(false)
  })

  it('accepts a short custom phrase when explicitly configured', () => {
    expect(isHandshakePhrase('OK to GO!', 'OK to GO')).toBe(true)
    expect(isHandshakePhrase('ok to go', 'OK to Go')).toBe(true)
    expect(isHandshakePhrase('LOL', 'LOL')).toBe(true)
    expect(isHandshakePhrase('lol!', 'LOL')).toBe(true)
    expect(isHandshakePhrase('ok', 'ok')).toBe(true)
  })

  it('display/canonicalize collapse default-equivalent bang to DEFAULT', () => {
    expect(displayHandshakePhrase('OK to Go Go Go!')).toBe(DEFAULT_HANDSHAKE_PHRASE)
    expect(displayHandshakePhrase('  ok to go go go  ')).toBe(DEFAULT_HANDSHAKE_PHRASE)
    expect(displayHandshakePhrase('Ruszamy!')).toBe('Ruszamy!')
    expect(canonicalizeHandshakePhraseSetting('OK to Go Go Go!')).toBe(DEFAULT_HANDSHAKE_PHRASE)
    expect(canonicalizeHandshakePhraseSetting('OK to GO!')).toBe('OK to GO!')
    expect(canonicalizeHandshakePhraseSetting('a', 'fallback')).toBe('fallback')
  })
})
