import { describe, expect, it } from 'vitest'

import { renderStatusPage } from './statusPage.js'

const page = (over: Partial<Parameters<typeof renderStatusPage>[0]> = {}): string =>
  renderStatusPage({ version: '0.1.7', authRequired: true, origin: 'http://192.168.1.201:7865', ...over })

describe('renderStatusPage', () => {
  /**
   * The reason this page exists rather than reusing the Python dashboard: that
   * one fetches its webfonts from Google on every load, on the machine whose
   * whole promise is that nothing leaves it.
   */
  it('fetches nothing from anywhere', () => {
    const html = page()
    // A URL printed as text is fine — the endpoint is the point of the page.
    // What must not exist is anything the browser will go and *load*.
    expect(html).not.toMatch(/\ssrc=/i)
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i)
    // The one link is a plain anchor the user must click, not a request.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual(['https://pomnia.ai'])
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

  /** Host is attacker-controlled — it lands in the page as text. */
  it('escapes the origin', () => {
    const html = page({ origin: 'http://evil"><script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })
})
