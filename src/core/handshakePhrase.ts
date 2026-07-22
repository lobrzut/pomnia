/**
 * Handshake proof phrase — agent greeting when Pomnia Brain MCP is wired
 * (no Electron deps — unit-testable). Not a Desktop unlock ritual.
 */

/** Default display phrase for existing users / unset settings. */
export const DEFAULT_HANDSHAKE_PHRASE = 'OK to Go Go Go'

/** Normalized form of the default (tests + legacy comparisons). */
export const CANONICAL_HANDSHAKE_PHRASE = 'ok to go go go'

/** Minimum length after normalize — allows short phrases ("ok", "LOL"); rejects empty / single char. */
export const MIN_HANDSHAKE_PHRASE_LEN = 2

/** Explicit punctuation + symbols often typed after the phrase. */
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

/** Whether a candidate settings value is long enough after normalize. */
export function isValidHandshakePhraseSetting(raw: string): boolean {
  return normalizeHandshakePhrase(raw).length >= MIN_HANDSHAKE_PHRASE_LEN
}

/**
 * Display form for Settings / agent rule snippets.
 * Default-equivalent strings (e.g. "OK to Go Go Go!") collapse to DEFAULT without bang.
 */
export function displayHandshakePhrase(raw: string): string {
  const trimmed = raw.trim() || DEFAULT_HANDSHAKE_PHRASE
  if (normalizeHandshakePhrase(trimmed) === CANONICAL_HANDSHAKE_PHRASE) {
    return DEFAULT_HANDSHAKE_PHRASE
  }
  return trimmed
}

/**
 * Persist form: trim + min-length, and canonicalize default-equivalent to DEFAULT.
 */
export function canonicalizeHandshakePhraseSetting(
  raw: string,
  fallback: string = DEFAULT_HANDSHAKE_PHRASE,
): string {
  const trimmed = raw.trim()
  if (!trimmed || !isValidHandshakePhraseSetting(trimmed)) return fallback
  return displayHandshakePhrase(trimmed)
}

/**
 * Match a candidate against the configured phrase (default: OK to Go Go Go).
 * Uses the same forgiving punctuation / casing / spacing rules.
 */
export function isHandshakePhrase(
  raw: string,
  expected: string = DEFAULT_HANDSHAKE_PHRASE,
): boolean {
  const expectedNorm = normalizeHandshakePhrase(expected)
  if (expectedNorm.length < MIN_HANDSHAKE_PHRASE_LEN) return false
  return normalizeHandshakePhrase(raw) === expectedNorm
}
