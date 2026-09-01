import { describe, expect, it } from 'vitest'

import { renderStatusPage, type StatusPageInfo } from './statusPage.js'

const base: StatusPageInfo = {
  version: '0.1.77',
  authRequired: true,
  origin: 'http://192.168.1.248:7865',
  state: 'ok',
  writable: true,
  vaultOwner: 'abc123',
  uptimeSec: 4200,
}

describe('status page colours come from settings', () => {
  it('renders the stored scheme', () => {
    expect(renderStatusPage({ ...base, colorScheme: 'iris' })).toContain('data-theme="iris"')
  })

  it('falls back to mint when nothing is stored', () => {
    expect(renderStatusPage(base)).toContain('data-theme="mint"')
  })

  it('offers no switcher — a status page reports, it does not take preferences', () => {
    // It used to carry Mint/Iris/Glass buttons writing to the visitor's
    // localStorage: invisible to anyone else, unsettable by the operator.
    const html = renderStatusPage({ ...base, colorScheme: 'glass' })
    // The element, not the class: `.theme-bar` styling stays in the shared
    // stylesheet because the admin panel still has a switcher.
    expect(html).not.toContain('id="theme-bar"')
    expect(html).not.toContain('data-theme-opt')
    expect(html).not.toContain('>Iris<')
  })

  it('still renders every scheme the settings accept', () => {
    for (const s of ['mint', 'iris', 'glass'] as const) {
      expect(renderStatusPage({ ...base, colorScheme: s })).toContain(`data-theme="${s}"`)
    }
  })
})
