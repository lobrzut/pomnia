import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createToken } from '../../../packages/brain-core/src/admin/tokens.js'
import { loadConfig } from '../../../packages/brain-core/src/config/index.js'
import { createBrainServer, type BrainServer } from '../../../packages/brain-core/src/mcp/server.js'
import { syncVaultToReplica } from './vaultSync.js'

/**
 * The desktop's sync client against a real brain-core, both halves running.
 *
 * The server side is covered — an admin token is accepted, an agent token is
 * refused — but that only proves the door opens. Nothing had ever driven the
 * desktop's own client through it, and the two are written months apart against
 * a protocol described in prose: a manifest, a wanted list, an upload, a
 * reindex. Every one of those is a place where two implementations can each be
 * self-consistent and disagree.
 *
 * syncContractParity.test.ts checks that the two halves *agree about what
 * replicates*. This checks that a push actually lands.
 */

const PORT = 46000 + (process.pid % 3000)
const BASE = `http://127.0.0.1:${PORT}`

let dir: string
let source: string
let serverVault: string
let server: BrainServer
let adminToken = ''
let agentToken = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-sync-real-'))
  source = join(dir, 'desktop-vault')
  serverVault = join(dir, 'server-vault')
  await mkdir(join(source, 'distilled'), { recursive: true })
  await mkdir(join(source, 'sessions'), { recursive: true })
  await mkdir(serverVault, { recursive: true })

  await writeFile(join(source, 'distilled', 'a.md'), '# one\nATR band, bar close only.\n', 'utf8')
  await writeFile(join(source, 'distilled', 'b.md'), '# two\nWireGuard killswitch.\n', 'utf8')
  await writeFile(join(source, 'sessions', 'c.md'), '# three\nA saved chat.\n', 'utf8')
  await writeFile(join(source, 'USER.md'), '# profile\n', 'utf8')

  const tokensFile = join(dir, 'mcp-tokens.json')
  const admin = await createToken(tokensFile, { name: 'studio', role: 'admin' })
  const agent = await createToken(tokensFile, { name: 'bot', role: 'agent' })
  if (!admin.ok || !agent.ok) throw new Error('token creation failed')
  adminToken = admin.token
  agentToken = agent.token

  const config = await loadConfig(
    [
      '--host', '0.0.0.0',
      '--port', String(PORT),
      '--data-dir', dir,
      '--vault-root', serverVault,
      '--tokens-file', tokensFile,
      '--instance-label', 'sync-target',
    ],
    {},
  )
  server = await createBrainServer(config)
  await server.start()
}, 60_000)

afterAll(async () => {
  await server?.stop().catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('the desktop pushes into a vault the server owns', () => {
  it('uploads every note and lands them on the server disk', async () => {
    const result = await syncVaultToReplica({
      vaultRoot: source,
      target: BASE,
      token: adminToken,
    })

    expect(result.failed, `failures: ${JSON.stringify(result.failed)}`).toEqual([])
    expect(result.uploaded).toBe(4)
    expect(result.bytesUploaded).toBeGreaterThan(0)

    // The counter that matters is on the other machine's disk, not in the result.
    const distilled = await readdir(join(serverVault, 'distilled'))
    const sessions = await readdir(join(serverVault, 'sessions'))
    const root = await readdir(serverVault)
    expect(distilled.sort()).toEqual(['a.md', 'b.md'])
    expect(sessions).toContain('c.md')
    expect(root).toContain('USER.md')
  }, 30_000)

  it('sends nothing the second time, because nothing changed', async () => {
    const again = await syncVaultToReplica({ vaultRoot: source, target: BASE, token: adminToken })
    expect(again.uploaded).toBe(0)
    expect(again.unchanged).toBe(4)
  }, 30_000)

  it('sends exactly the one note that changed', async () => {
    await writeFile(join(source, 'distilled', 'a.md'), '# one\nEdited: ATR on close.\n', 'utf8')
    const third = await syncVaultToReplica({ vaultRoot: source, target: BASE, token: adminToken })
    expect(third.uploaded).toBe(1)
    expect(third.unchanged).toBe(3)
  }, 30_000)

  /**
   * The refusal a person actually sees. The server answers `write_needs_admin`;
   * this asserts the desktop turns that into a sentence naming what to do,
   * rather than a bare status code.
   */
  it('refuses an agent token with a message you can act on', async () => {
    await expect(
      syncVaultToReplica({ vaultRoot: source, target: BASE, token: agentToken }),
    ).rejects.toThrow(/admin token/i)
  }, 30_000)

  it('keeps the machine-readable code on the refusal', async () => {
    const err = await syncVaultToReplica({
      vaultRoot: source,
      target: BASE,
      token: agentToken,
    }).catch((e: Error & { code?: string }) => e)
    expect((err as Error & { code?: string }).code).toBe('write_needs_admin')
  }, 30_000)

  it('reports what only the server has, and deletes none of it', async () => {
    await writeFile(join(serverVault, 'distilled', 'only-here.md'), '# orphan\n', 'utf8')
    const r = await syncVaultToReplica({ vaultRoot: source, target: BASE, token: adminToken })
    expect(r.extraOnReplica).toContain('distilled/only-here.md')
    // Reported, never removed — a replica that prunes on a bad manifest can
    // lose the only copy of something.
    expect(await readdir(join(serverVault, 'distilled'))).toContain('only-here.md')
  }, 30_000)
})
