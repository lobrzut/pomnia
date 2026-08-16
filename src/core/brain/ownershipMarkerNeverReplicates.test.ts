import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createToken } from '../../../packages/brain-core/src/admin/tokens.js'
import { loadConfig } from '../../../packages/brain-core/src/config/index.js'
import { safeVaultPath } from '../../../packages/brain-core/src/sync/paths.js'
import { createBrainServer, type BrainServer } from '../../../packages/brain-core/src/mcp/server.js'
import { buildVaultManifest, syncVaultToReplica } from './vaultSync.js'

/**
 * state/vault-writer.json records which machine owns a vault. It is the reason
 * two Pomnias cannot silently fork one corpus — the failure that already
 * happened here and cost 99 files nobody noticed for months.
 *
 * `state` is in SYNC_DIRS and the marker ends in .json, so on the face of it a
 * push carries it. Sending it would hand the receiver the *sender's* idea of who
 * owns the vault, overwriting the receiver's record of owning its own — and the
 * server would quietly demote itself to read-only against a vault it holds. The
 * mechanism built to prevent divergence would be the thing that causes it.
 *
 * Harmless while the server was a pinned replica and the desktop always the
 * owner. It stopped being harmless the moment a server could own a vault and
 * the desktop could push into it.
 */

const PORT = 47000 + (process.pid % 2000)
const BASE = `http://127.0.0.1:${PORT}`

let dir: string
let source: string
let serverVault: string
let server: BrainServer
let adminToken = ''

const markerPath = (root: string): string => join(root, 'state', 'vault-writer.json')

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-marker-'))
  source = join(dir, 'desktop-vault')
  serverVault = join(dir, 'server-vault')
  await mkdir(join(source, 'state'), { recursive: true })
  await mkdir(join(source, 'distilled'), { recursive: true })
  await mkdir(serverVault, { recursive: true })

  await writeFile(join(source, 'distilled', 'note.md'), '# note\n', 'utf8')
  // The desktop's own marker, exactly as its brain writes one.
  await writeFile(
    markerPath(source),
    JSON.stringify({ id: 'desktop-machine-id', label: 'Pomnia Desktop', since: 1 }, null, 2),
    'utf8',
  )
  // A ledger, to prove state/ still replicates for everything that is memory.
  await writeFile(join(source, 'state', 'distill-ledger.json'), '["abc"]', 'utf8')

  const tokensFile = join(dir, 'mcp-tokens.json')
  const admin = await createToken(tokensFile, { name: 'studio', role: 'admin' })
  if (!admin.ok) throw new Error('token creation failed')
  adminToken = admin.token

  const config = await loadConfig(
    [
      '--host', '0.0.0.0',
      '--port', String(PORT),
      '--data-dir', dir,
      '--vault-root', serverVault,
      '--tokens-file', tokensFile,
      '--instance-label', 'the-server',
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

describe('the ownership marker', () => {
  it('is refused by the path validator, so no peer can ever send one', () => {
    const v = safeVaultPath('state/vault-writer.json')
    expect(v.ok, 'a peer could overwrite who owns this vault').toBe(false)
  })

  it('is not offered by the sender either — refused twice, on purpose', async () => {
    const { entries } = await buildVaultManifest(source)
    expect(entries.map((e) => e.path)).not.toContain('state/vault-writer.json')
  })

  it('still replicates everything else in state/', async () => {
    const { entries } = await buildVaultManifest(source)
    expect(entries.map((e) => e.path)).toContain('state/distill-ledger.json')
  })

  it('survives a real push: the server still owns its own vault', async () => {
    const before = await readFile(markerPath(serverVault), 'utf8')
    expect(before).toContain('the-server')

    const r = await syncVaultToReplica({ vaultRoot: source, target: BASE, token: adminToken })
    expect(r.failed).toEqual([])
    expect(r.uploaded).toBeGreaterThan(0)

    const after = await readFile(markerPath(serverVault), 'utf8')
    expect(after, 'the push rewrote who owns the vault').toBe(before)
    expect(after).not.toContain('Pomnia Desktop')
  }, 30_000)

  it('leaves the server writable after the push', async () => {
    const h = await fetch(`${BASE}/healthz`)
    const body = (await h.json()) as { writable?: boolean; vaultOwner?: string }
    expect(body.writable).toBe(true)
    expect(body.vaultOwner).toContain('the-server')
  })
})
