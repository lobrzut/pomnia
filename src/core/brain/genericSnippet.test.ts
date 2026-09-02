import { describe, expect, it } from 'vitest'

import { buildAgentSetupPrompt, buildGenericSnippet } from './genericSnippet.js'

const URL_ = 'http://192.168.1.248:7865'
const TOK = 'btk_abc'

describe('buildGenericSnippet — one block for any client', () => {
  it('appends /mcp exactly once', () => {
    expect(buildGenericSnippet(URL_).endpoint).toBe(`${URL_}/mcp`)
    expect(buildGenericSnippet(`${URL_}/mcp`).endpoint).toBe(`${URL_}/mcp`)
  })

  it('strips the admin panel path somebody pasted from their address bar', () => {
    // /admin/mcp is a real route, gated on an admin role, answering 403. It
    // reached six clients at once and cost an evening.
    expect(buildGenericSnippet(`${URL_}/admin`).endpoint).toBe(`${URL_}/mcp`)
    expect(buildGenericSnippet(`${URL_}/status`).endpoint).toBe(`${URL_}/mcp`)
  })

  it('offers the URL shape first, because most clients want it', () => {
    const g = buildGenericSnippet(URL_, TOK)
    expect(g.variants[0].id).toBe('http')
    expect(g.variants[0].json).toContain(`"url": "${URL_}/mcp"`)
    expect(g.variants[0].json).toContain(`Bearer ${TOK}`)
  })

  it('carries the token in every variant', () => {
    for (const v of buildGenericSnippet(URL_, TOK).variants) {
      expect(v.json).toContain(TOK)
    }
  })

  it('omits auth entirely when there is no token', () => {
    for (const v of buildGenericSnippet(URL_).variants) {
      expect(v.json).not.toContain('Authorization')
    }
  })

  it('uses the Windows-safe stdio shape on Windows', () => {
    const stdio = buildGenericSnippet(URL_, TOK, 'win32').variants[2].json
    expect(stdio).toContain('"cmd"')
    expect(stdio).toContain('AUTH_HEADER')
    // The space cmd.exe splits must not appear in the argument itself.
    expect(stdio).not.toContain('Authorization: Bearer')
  })

  it('does not impose the cmd wrapper where no shell splits arguments that way', () => {
    const stdio = buildGenericSnippet(URL_, TOK, 'darwin').variants[2].json
    expect(stdio).toContain('"npx"')
    expect(stdio).not.toContain('"cmd"')
  })
})

describe('buildAgentSetupPrompt — the agent wires itself', () => {
  it('gives the agent the endpoint and the header', () => {
    const p = buildAgentSetupPrompt(URL_, TOK)
    expect(p).toContain(`${URL_}/mcp`)
    expect(p).toContain(`Bearer ${TOK}`)
  })

  it('tells it not to disturb other servers', () => {
    expect(buildAgentSetupPrompt(URL_, TOK)).toMatch(/Leave every other server .* alone/)
  })

  it('demands proof by calling a tool, not by writing a file', () => {
    // 'Connected' in a client UI means a file parsed. Six clients here were
    // green while answering 403 to every request.
    const p = buildAgentSetupPrompt(URL_, TOK)
    expect(p).toContain('get_user_profile')
    expect(p).toContain('Do not report success because the file was written')
  })

  it('explains what each failure code means', () => {
    const p = buildAgentSetupPrompt(URL_, TOK)
    expect(p).toContain('401')
    expect(p).toContain('403')
  })

  it('warns about the Windows quoting only on Windows', () => {
    expect(buildAgentSetupPrompt(URL_, TOK, 'win32')).toContain('cmd /c npx')
    expect(buildAgentSetupPrompt(URL_, TOK, 'darwin')).not.toContain('cmd /c npx')
  })

  it('works without a token, for an unauthenticated local brain', () => {
    const p = buildAgentSetupPrompt('http://127.0.0.1:7862')
    expect(p).not.toContain('Authorization: Bearer')
    expect(p).toContain('http://127.0.0.1:7862/mcp')
  })
})
