/**
 * Phrase match for personal Handshake ritual (no Electron deps — unit-testable).
 */

export const CANONICAL_HANDSHAKE_PHRASE = 'ok to go go go'

/** Explicit punctuation + symbols often typed after the ritual phrase. */
const PUNCT_AND_SYMBOLS =
  /[!?.,;:'"`´‘’“”…·•\-_/=+\\|()[\]{}<>@#$%^&*~¡¿]/g

/**
 * Lowercase, NFKC, strip punctuation/symbols, collapse whitespace.
 * Keeps letters/digits from any script so matching stays forgiving.
 */
export function normalizeHandshakePhrase(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(PUNCT_AND_SYMBOLS, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isHandshakePhrase(raw: string): boolean {
  return normalizeHandshakePhrase(raw) === CANONICAL_HANDSHAKE_PHRASE
}
