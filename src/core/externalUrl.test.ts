// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { isWebUrl } from './externalUrl.js'

describe('isWebUrl', () => {
  it('allows the web pages the app actually links to', () => {
    expect(isWebUrl('https://github.com/lobrzut/pomnia/releases/tag/v0.1.64')).toBe(true)
    expect(isWebUrl('http://127.0.0.1:7862/admin')).toBe(true)
  })

  it('refuses schemes that ask the OS to run something', () => {
    // update.releaseUrl is html_url out of the GitHub API response — the one
    // value reaching openExternal that this app does not author.
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'smb://attacker/share',
      'ms-msdt:/id',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'vscode://x',
    ]) {
      expect(isWebUrl(url), url).toBe(false)
    }
  })

  it('refuses what does not parse as a URL at all', () => {
    expect(isWebUrl('')).toBe(false)
    expect(isWebUrl('not a url')).toBe(false)
    expect(isWebUrl('//evil.example')).toBe(false)
  })
})
