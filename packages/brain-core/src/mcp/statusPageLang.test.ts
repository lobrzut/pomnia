import { describe, expect, it } from 'vitest'

import { renderStatusPage } from './statusPage.js'

/**
 * The public status page is English throughout — it is what an unauthenticated
 * visitor sees, including someone who self-hosts this and does not read Polish.
 *
 * One label had drifted: the disk check came through as "Dysk / zapis" beside
 * "Database", "Index" and "Vault". Nothing catches that except reading the page,
 * and nobody reads a status page they believe they wrote. This test is the
 * reader.
 *
 * The admin panel is a separate surface and deliberately Polish; it is not
 * covered here.
 */
const DIACRITIC = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/

const page = (): string =>
  renderStatusPage({
    version: '0.0.0-test',
    authRequired: true,
    origin: 'http://127.0.0.1:7865',
    state: 'degraded',
    writable: false,
    vaultOwner: 'Pomnia Desktop',
    uptimeSec: 42,
    index: { files: 10, chunks: 44 },
    checks: [
      { name: 'Database', state: 'ok', detail: 'open' },
      { name: 'Index', state: 'ok', detail: '10 files' },
      { name: 'Vault', state: 'ok', detail: 'readable' },
      { name: 'Disk / write', state: 'down', detail: 'no space left on device' },
      { name: 'Embeddings (Ollama)', state: 'degraded', detail: 'connection refused' },
    ],
  })

describe('the public status page speaks one language', () => {
  it('renders no Polish diacritics anywhere', () => {
    const html = page()
    const offenders = html
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter((l) => DIACRITIC.test(l.text))
    expect(offenders, `Polish leaked into the English status page:\n${
      offenders.map((o) => `  ${o.line}: ${o.text.slice(0, 100)}`).join('\n')
    }`).toEqual([])
  })

  it('still names every check it was given', () => {
    const html = page()
    for (const name of ['Database', 'Index', 'Vault', 'Disk / write', 'Embeddings (Ollama)']) {
      expect(html).toContain(name)
    }
  })
})
