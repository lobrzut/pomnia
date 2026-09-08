// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../config/index.js'
import { createBrainServer, type BrainServer } from './server.js'
import { resolveVaultOwnership, vaultOwnerPath } from '../storage/vaultOwner.js'

/**
 * Switching vaultRoot must re-resolve ownership. The bug: paths changed, but
 * ctx.readOnly and vaultOwnership stayed from the previous root — so a foreign
 * vault looked writable under the wrong owner.
 */
describe('setVaultRoot re-resolves ownership (F06)', () => {
  let dir: string
  let server: BrainServer
  let port: number

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pomnia-setvault-'))
    port = 42000 + (process.pid % 1000) + Math.floor(Math.random() * 200)
    const vaultA = join(dir, 'vault-a')
    await mkdir(vaultA, { recursive: true })
    const config = await loadConfig(
      [
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--data-dir',
        dir,
        '--vault-root',
        vaultA,
        '--instance-label',
        'test-instance-a',
      ],
      {},
    )
    server = await createBrainServer(config)
    await server.start()
  }, 30_000)

  afterEach(async () => {
    await server.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('marks a foreign-owned vault read-only after switch', async () => {
    const vaultB = join(dir, 'vault-b')
    await mkdir(vaultB, { recursive: true })
    await resolveVaultOwnership({
      vaultRoot: vaultB,
      me: { id: 'foreign-owner', label: 'foreign-owner', host: 'fixture' },
    })

    await server.setVaultRoot(vaultB)

    const res = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { writable: boolean; vaultOwner: string | null }
    expect(body.writable).toBe(false)
    expect(body.vaultOwner).toMatch(/foreign-owner/)
  })

  it('does not rewrite a corrupt marker when switching onto it', async () => {
    const vaultC = join(dir, 'vault-corrupt')
    await mkdir(join(vaultC, 'state'), { recursive: true })
    await writeFile(vaultOwnerPath(vaultC), '{broken', 'utf8')

    await server.setVaultRoot(vaultC)

    expect(await readFile(vaultOwnerPath(vaultC), 'utf8')).toBe('{broken')
    const res = await fetch(`http://127.0.0.1:${port}/healthz`)
    const body = (await res.json()) as { writable: boolean }
    expect(body.writable).toBe(false)
  })
})
