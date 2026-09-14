import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { createAuthGate } from './auth.js'

/**
 * The gate re-reads the token store only when its mtime moves. After a read it
 * could not parse, it cached "no tokens" against the mtime it had just seen —
 * so it refused every request, a refused request never touches the store, the
 * mtime never moved again, and the refusal never ended.
 *
 * That is the shape of the outage on 13 September 2026: a healthy server
 * answering 401 to every token for hours. Failing closed on a bad read is
 * right. Failing closed until someone happens to rewrite the file is an outage.
 */

let dir = ''
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

const request = (token: string) =>
  ({ headers: { authorization: `Bearer ${token}` }, socket: { remoteAddress: '10.0.0.9' } }) as unknown as IncomingMessage

it('lets a valid token back in once the store reads cleanly, even if its mtime did not move', async () => {
  dir = mkdtempSync(join(tmpdir(), 'pomnia-gate-'))
  const file = join(dir, 'mcp-tokens.json')
  const good = JSON.stringify([{ name: 'agent', token: 'btk_good', role: 'agent' }])
  const stamp = new Date('2026-09-13T08:30:00Z')
  let clock = 1_000_000
  const gate = createAuthGate({ host: '0.0.0.0', tokensFile: file, maxFailsPerMinute: 1000, now: () => clock })

  writeFileSync(file, good)
  expect((await gate.check(request('btk_good'))).ok).toBe(true)

  // A torn read: the store is not JSON, and its mtime moves so the gate looks.
  writeFileSync(file, '[{"name":"agent","tok')
  utimesSync(file, stamp, stamp)
  clock += 3000
  expect((await gate.check(request('btk_good'))).ok).toBe(false)

  // The store is whole again but carries the mtime the gate already saw.
  writeFileSync(file, good)
  utimesSync(file, stamp, stamp)
  clock += 3000
  expect((await gate.check(request('btk_good'))).ok).toBe(true)
})

it('still refuses everyone for as long as the store stays unreadable', async () => {
  dir = mkdtempSync(join(tmpdir(), 'pomnia-gate-'))
  const file = join(dir, 'mcp-tokens.json')
  writeFileSync(file, 'not json')
  let clock = 1_000_000
  const gate = createAuthGate({ host: '0.0.0.0', tokensFile: file, maxFailsPerMinute: 1000, now: () => clock })
  for (let i = 0; i < 3; i++) {
    clock += 3000
    expect((await gate.check(request('btk_good'))).ok).toBe(false)
  }
})
