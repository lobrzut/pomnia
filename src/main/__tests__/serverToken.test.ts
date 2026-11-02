// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { adminToken, serverToken } from '../brainTokens.js'

/**
 * Two bearers, after the connect flow splits them.
 *
 * Pasting an admin token stores it in `replicaToken` and the renderer then
 * replaces `connectToken` with a minted agent token. Admin routes answer 401
 * to that agent token. Agent configs must not receive the admin token.
 *
 * Before that split — a fresh install, adopt not run — the admin token lives
 * only in the field. Admin calls have to fall back to it, or Skills and
 * status report that no admin token exists while the same paste is accepted.
 */

describe('admin token', () => {
  it('prefers the stored admin token over the field', () => {
    expect(adminToken({ replicaToken: 'btk_admin', connectToken: 'btk_agent' })).toBe('btk_admin')
  })

  it('uses the field when that is the only copy', () => {
    expect(adminToken({ connectToken: 'btk_admin' })).toBe('btk_admin')
    expect(adminToken({ replicaToken: '  ' , connectToken: ' btk_admin ' })).toBe('btk_admin')
  })

  it('uses an explicit token only when nothing is stored', () => {
    expect(adminToken({ replicaToken: 'btk_admin', connectToken: 'btk_agent' }, 'btk_other')).toBe('btk_admin')
    expect(adminToken({}, 'btk_other')).toBe('btk_other')
    expect(adminToken({})).toBeUndefined()
  })
})

describe('agent token', () => {
  it('prefers the field, which holds the minted agent token after adopt', () => {
    expect(serverToken({ replicaToken: 'btk_admin', connectToken: 'btk_agent' })).toBe('btk_agent')
  })

  it('falls back to the stored token when the field is empty', () => {
    expect(serverToken({ replicaToken: 'btk_admin' })).toBe('btk_admin')
    expect(serverToken({}, 'btk_explicit')).toBe('btk_explicit')
  })
})

const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'), 'utf8')
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('admin call sites', () => {
  it('does not hand serverToken to an admin route', () => {
    expect(code).not.toMatch(/adminToken:\s*serverToken\(/)
    expect(code).not.toMatch(/token:\s*serverToken\(/)
    expect(code).not.toMatch(/token:\s*s\.replicaToken/)
    expect(code).not.toMatch(/st\.replicaToken\b/)
    expect(code).not.toMatch(/getAppSettings\(\)\.replicaToken/)
  })

  it('resolves admin calls through adminToken', () => {
    expect(code).toMatch(/token: adminToken\(\)/)
    expect(code).toMatch(/const token = adminToken\(\) \?\? ''/)
    expect(code).toMatch(/adminToken: adminToken\(\)/)
    expect(code).toMatch(/const auth = adminToken\(token\)/)
    expect(code).toMatch(/const used = adminToken\(explicit\)/)
  })

  it('keeps the agent probe on serverToken', () => {
    const probe = /async function warnIfRemoteBrainUnusable[\s\S]*?\n\}/.exec(code)?.[0] ?? ''
    expect(probe).toMatch(/serverToken\(\)/)
    expect(probe).not.toMatch(/adminToken\(/)
  })

  it('adopts the pasted token, not whichever bearer was already stored', () => {
    const adopt = /'connect:tokenAdopt'[\s\S]*?\n  trustedHandle\(/.exec(code)?.[0] ?? ''
    expect(adopt).toMatch(/token: clean/)
    expect(adopt).toMatch(/replicaToken: clean/)
    expect(adopt).not.toMatch(/adminToken\(/)
    expect(adopt).not.toMatch(/serverToken\(/)
  })
})
