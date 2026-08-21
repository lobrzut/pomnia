import { describe, expect, it } from 'vitest'

import { formatUptime, renderStatusPage } from './statusPage.js'

const page = (over: Partial<Parameters<typeof renderStatusPage>[0]> = {}): string =>
  renderStatusPage({
    version: '0.1.7',
    authRequired: true,
    origin: 'http://192.168.1.201:7865',
    state: 'ok',
    writable: false,
    vaultOwner: 'Pomnia Desktop',
    uptimeSec: 3_600,
    ...over,
  })

describe('renderStatusPage', () => {
  /**
   * The reason this page exists rather than reusing the Python dashboard: that
   * one fetches its webfonts from Google on every load, on the machine whose
   * whole promise is that nothing leaves it.
   */
  it('fetches nothing from anywhere', () => {
    const html = page()
    // Same-origin favicon/icon links + inline theme/sky scripts are fine.
    // What must not exist is anything the browser will go and *load* off-box.
    expect(html).not.toMatch(/\ssrc=["']https?:/i)
    expect(html).not.toMatch(/<link[^>]+https?:/i)
    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    for (const h of hrefs) {
      if (h.startsWith('/') || h.startsWith('http://192.168.1.201:7865')) continue
      expect(h, `external href must stay pomnia.ai, got ${h}`).toBe('https://pomnia.ai')
    }
    expect(hrefs).toContain('https://pomnia.ai')
    expect(hrefs).toContain('http://192.168.1.201:7865/')
  })

  it('shows the endpoint a client actually needs', () => {
    expect(page()).toContain('http://192.168.1.201:7865/mcp')
  })

  it('reports the real version, not a hardcoded one', () => {
    expect(page({ version: '9.9.9' })).toContain('9.9.9')
  })

  it('distinguishes a protected server from an open one', () => {
    expect(page({ authRequired: true })).toContain('Bearer token required')
    expect(page({ authRequired: false })).toContain('Open — no token required')
  })

  /**
   * Nothing here may say more than /healthz already says unauthenticated.
   * Checks the shapes a leak would take, not the word "vault" — the page says
   * that word on purpose, to promise it is not reading one.
   */
  it('leaks no paths, counts or tokens', () => {
    const html = page().toLowerCase()
    for (const shape of ['btk_', 'c:\\', '/var/lib', '/home/']) {
      expect(html).not.toContain(shape)
    }
    // Naming the scheme is the help; printing a credential after it is not.
    expect(html).not.toMatch(/bearer\s+[a-z0-9_-]{12,}/i)
    // No "1996 files", "2512 chunks" — no statistic of any kind.
    expect(html).not.toMatch(/\d+\s*(files?|chunks?|notes?|sessions?|docs?)/i)
  })

  it('shows the verdict to anyone — a broken server must be visible', () => {
    expect(page({ state: 'down' })).toContain('Not serving')
    expect(page({ state: 'degraded' })).toContain('Degraded')
    expect(page({ state: 'ok' })).toContain('Operational')
  })

  /**
   * Reasons name the vault path, the Ollama URL and the model; counts say how
   * much material is in there. Both are for whoever holds a token.
   */
  it('withholds per-check reasons and counts without a token', () => {
    const anon = page()
    expect(anon).not.toContain('Embeddings (Ollama)')
    expect(anon).not.toMatch(/\d[\d,]*\s+chunks/)
    expect(anon).toContain('Authorization: Bearer')
  })

  it('shows the operator view when the request carried a token', () => {
    const html = page({
      index: { files: 1996, chunks: 2512 },
      checks: [
        { name: 'Database', state: 'ok' },
        { name: 'Index', state: 'ok' },
        { name: 'Vault', state: 'ok' },
        { name: 'Embeddings (Ollama)', state: 'degraded', detail: 'ollama unreachable at http://127.0.0.1:11434' },
      ],
    })
    expect(html).toContain('Embeddings (Ollama)')
    expect(html).toContain('ollama unreachable')
    expect(html).toContain('2,512')
    expect(html).not.toContain('Authorization: Bearer')
  })

  it('says who owns the vault when this server does not', () => {
    expect(page({ writable: false, vaultOwner: 'Pomnia Desktop' })).toContain('owned by Pomnia Desktop')
    expect(page({ writable: true })).toContain('this server owns it')
  })

  it('escapes a check detail, which can carry a path from anywhere', () => {
    const html = page({
      checks: [{ name: 'Vault', state: 'down', detail: '<img src=x onerror=alert(1)>' }],
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  /** Host is attacker-controlled — it lands in the page as text. */
  it('escapes the origin', () => {
    const html = page({ origin: 'http://evil"><script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('formatUptime', () => {
  it('says something a person reads at a glance', () => {
    expect(formatUptime(12)).toBe('12s')
    expect(formatUptime(90)).toBe('1 min')
    expect(formatUptime(3_600)).toBe('1 h 00 min')
    expect(formatUptime(3_600 * 26)).toBe('1 d 02 h')
  })

  it('does not print a negative uptime after a clock jump', () => {
    expect(formatUptime(-5)).toBe('0s')
  })
})
