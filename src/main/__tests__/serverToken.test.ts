import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * One token reaches the Brain server, and it is the one the user can replace.
 *
 * This app briefly held two: `connectToken` from the Brain panel, and
 * `replicaToken`, which the replication panel stored and gave no way to change.
 * The stale copy took precedence, so once the server revoked it every sync
 * answered 401 while the panel reported a token was set — and pasting a fresh
 * one where the user could reach it changed nothing.
 *
 * The regression that matters is not the precedence itself but *forgetting a
 * caller*: Mini's skills, prompts and ingest authenticate through the same
 * settings, so a fix applied only to the sync path breaks them silently. These
 * assertions are about the file, not about behaviour at runtime, because that
 * is the shape the mistake takes — a call site left reading the old field.
 */
const main = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'),
  'utf8'
)

/** Comments explain the history; they must not be mistaken for call sites. */
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('server token resolution', () => {
  it('resolves in one place', () => {
    expect(code).toMatch(/function serverToken\(/)
  })

  it('prefers the token the user manages, with the old one as fallback', () => {
    const fn = /function serverToken\([\s\S]*?\n}/.exec(code)?.[0] ?? ''
    const connectAt = fn.indexOf('connectToken')
    const replicaAt = fn.indexOf('replicaToken')

    expect(connectAt).toBeGreaterThan(-1)
    expect(replicaAt).toBeGreaterThan(-1)
    expect(connectAt, 'connectToken has to be tried first').toBeLessThan(replicaAt)
  })

  it('leaves no caller reading replicaToken on its own', () => {
    // Every remaining mention must be inside serverToken itself.
    const fn = /function serverToken\([\s\S]*?\n}/.exec(code)?.[0] ?? ''
    const outside = code.replace(fn, '')

    expect(outside).not.toMatch(/getAppSettings\(\)\.replicaToken/)
    expect(outside).not.toMatch(/adminToken:\s*s\.replicaToken/)
    expect(outside).not.toMatch(/adminToken:\s*next\.replicaToken\s*,/)
  })
})
