import { describe, expect, it } from 'vitest'

import { __testPickUrl as pickUrl } from './status.js'

/**
 * The probe used to test every client's URL with the app's own token, so a
 * config carrying a revoked one reported connected — Pomnia substituted a
 * working token and agreed with itself. Reading the token the client would
 * actually send is what makes the check mean anything.
 */
describe('reading the token a client would actually send', () => {
  it('reads a plain Authorization header', () => {
    expect(pickUrl({ url: 'http://h:7865/mcp', headers: { Authorization: 'Bearer btk_a' } }).token).toBe('btk_a')
  })

  it('reads the --header form written before 0.1.71', () => {
    expect(
      pickUrl({
        command: 'npx',
        args: ['-y', 'mcp-remote', 'http://h:7865/mcp', '--header', 'Authorization: Bearer btk_b'],
      }).token,
    ).toBe('btk_b')
  })

  it('reads the env form this app writes for Windows', () => {
    // 0.1.71 moved to ${AUTH_HEADER} because cmd.exe splits the header on its
    // space. Neither earlier pattern matched it, so the shape Pomnia writes
    // itself was reported as having no token.
    const got = pickUrl({
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'mcp-remote', 'http://h:7865/mcp', '--allow-http', '--header', 'Authorization:${AUTH_HEADER}'],
      env: { AUTH_HEADER: 'Bearer btk_c' },
    })
    expect(got.token).toBe('btk_c')
    expect(got.hasToken).toBe(true)
  })

  it('reports no token when there is none', () => {
    const got = pickUrl({ url: 'http://h:7862/mcp' })
    expect(got.token).toBeUndefined()
    expect(got.hasToken).toBeUndefined()
  })

  it('does not mistake an empty Bearer for a token', () => {
    // The empty-header failure this whole line of work started from: cmd.exe
    // ate the value and the server saw `Bearer ` with nothing after it.
    expect(pickUrl({ url: 'http://h/mcp', headers: { Authorization: 'Bearer ' } }).token).toBeUndefined()
  })

  it('still finds the URL in every shape', () => {
    expect(pickUrl({ url: 'http://a/mcp' }).url).toBe('http://a/mcp')
    expect(pickUrl({ serverUrl: 'http://b/mcp' }).url).toBe('http://b/mcp')
    expect(pickUrl({ command: 'npx', args: ['mcp-remote', 'http://c/mcp'] }).url).toBe('http://c/mcp')
  })
})
