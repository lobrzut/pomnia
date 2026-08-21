import { describe, expect, it } from 'vitest'

import { renderAdminPage } from './adminPage.js'

/**
 * The panel shipped with a syntax error in its inline script and looked
 * perfectly fine: the HTML rendered, the login form drew, and pressing the
 * button did nothing at all. A dead `<script>` produces no visible symptom —
 * it just silently unwires every handler — so it needs a test that parses it
 * rather than an eye that looks at it.
 */

const html = (): string => renderAdminPage('http://192.168.1.201:7865')

function inlineScript(): string {
  // First <script> is the panel; brand chrome may add a second (theme + sky).
  const m = html().match(/<script>([\s\S]*?)<\/script>/)
  expect(m, 'the panel must carry an inline script').toBeTruthy()
  return m![1]
}

describe('the panel script', () => {
  /** The bug this file exists for. */
  it('parses', () => {
    const src = inlineScript()
    // `new Function` compiles without executing: exactly a syntax check, and
    // no DOM is needed for it.
    expect(() => new Function(src)).not.toThrow()
  })

  it('contains no raw newline inside a single-quoted string', () => {
    // How the break got in: an escaping slip turned `\n` into a real newline.
    for (const [i, line] of inlineScript().split('\n').entries()) {
      const singles = (line.match(/(?<!\\)'/g) ?? []).length
      expect(singles % 2, `line ${i + 1} leaves a quote open: ${line.trim().slice(0, 70)}`).toBe(0)
    }
  })

  it('wires every control the markup declares', () => {
    const page = html()
    const script = inlineScript()
    // Every id the script reaches for must exist in the markup, and every
    // button the markup declares must be reachable from the script.
    for (const id of ['login-form', 'logout', 'adduser', 'save-behaviour', 'save-engine', 'probe-ollama', 'add', 'claim', 'refresh', 'dash-refresh', 'tiles', 'vault-banner']) {
      expect(page, `markup is missing #${id}`).toContain(`id="${id}"`)
      expect(script, `script never touches #${id}`).toContain(`'${id}'`)
    }
    expect(script).toContain('/admin/health')
  })

  it('reaches every tab section the nav offers', () => {
    const page = html()
    for (const tab of ['dash', 'status', 'engine', 'clients', 'users', 'behaviour', 'settings', 'vault']) {
      expect(page, `no section for the ${tab} tab`).toContain(`id="tab-${tab}"`)
      expect(page, `no nav button for ${tab}`).toContain(`data-tab="${tab}"`)
    }
    expect(page).toContain('id="settings-appearance"')
    expect(page).toContain('id="settings-language"')
    expect(page).toContain('id="settings-interface"')
    expect(page).not.toContain('data-tab="appearance"')
    // PL default chrome: Vault tab is Sejf; logout stays on the nav row.
    expect(page).toContain('data-i18n="tabVault">Sejf')
    expect(page).toContain('nav #logout')
    expect(page).toContain("tabVault: 'Sejf'")
    expect(page).toContain("tabVault: 'Vault'")
  })
})

describe('the panel page', () => {
  it('fetches nothing from anywhere', () => {
    const page = html()
    // Favicon / apple-touch are same-origin paths served by this process — not a CDN.
    expect(page).not.toMatch(/<link[^>]+https?:/i)
    expect(page).not.toMatch(/\ssrc=["']https?:/i)
    expect(page).not.toMatch(/@import/i)
    expect(page).not.toMatch(/url\(\s*['"]?https?:/i)
  })

  /** Session / CSRF must not land in storage; chrome prefs (locale/density) may. */
  it('never stores session credentials in browser storage', () => {
    const script = inlineScript()
    expect(script).not.toMatch(/document\.cookie/)
    expect(script).not.toMatch(/sessionStorage/)
    // Prefs only — same pattern as themeScript in the second <script>.
    expect(script).toMatch(/localStorage\.(get|set)Item\('pomnia-ui-locale'/)
    expect(script).toMatch(/localStorage\.(get|set)Item\('pomnia-ui-density'/)
  })

  it('sends the CSRF header on mutations and credentials same-origin', () => {
    const script = inlineScript()
    expect(script).toContain('x-pomnia-csrf')
    expect(script).toContain("credentials: 'same-origin'")
  })

  it('carries no credential in the shell itself', () => {
    expect(html()).not.toMatch(/btk_[A-Za-z0-9_-]{10,}/)
  })
})
