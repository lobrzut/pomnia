/**
 * Phrase match for personal Handshake ritual (no Electron deps — unit-testable).
 */

export const CANONICAL_HANDSHAKE_PHRASE = 'ok to go go go'

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeHandshakePhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isHandshakePhrase(raw: string): boolean {
  return normalizeHandshakePhrase(raw) === CANONICAL_HANDSHAKE_PHRASE
}
