import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { buildVaultManifest, syncVaultToReplica, pullVaultFromPeer } from './vaultSync.js'

let root: string

const put = async (rel: string, body: string): Promise<void> => {
  await mkdir(join(root, rel, '..'), { recursive: true })
  await writeFile(join(root, rel), body, 'utf8')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pomnia-push-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('buildVaultManifest', () => {
  it('covers the memory a replica needs', async () => {
    await put('sessions/a.md', 'a')
    await put('distilled/b.md', 'b')
    await put('skills/brain/x/SKILL.md', 'c')
    await put('state/distill-ledger.json', '{}')
    await put('USER.md', 'me')
    const { entries } = await buildVaultManifest(root)
    expect(entries.map((e) => e.path).sort()).toEqual([
      'USER.md',
      'distilled/b.md',
      'sessions/a.md',
      'skills/brain/x/SKILL.md',
      'state/distill-ledger.json',
    ])
  })

  /** 2.51 GB the replica's search never reads. */
  it('never offers blobs or snapshots', async () => {
    await put('blobs/ab/cd.bin', 'binary')
    await put('snapshots/s.json', '{}')
    await put('sessions/a.md', 'a')
    const { entries } = await buildVaultManifest(root)
    expect(entries.map((e) => e.path)).toEqual(['sessions/a.md'])
  })

  it('skips non-text files inside synced dirs', async () => {
    await put('sessions/a.md', 'a')
    await put('sessions/photo.png', 'x')
    const { entries } = await buildVaultManifest(root)
    expect(entries.map((e) => e.path)).toEqual(['sessions/a.md'])
  })

  it('treats a missing optional dir as normal, not as failure', async () => {
    await put('sessions/a.md', 'a')
    const { entries, skipped } = await buildVaultManifest(root)
    expect(entries).toHaveLength(1)
    expect(skipped).toEqual([])
  })

  it('hashes content, so an edit changes the entry', async () => {
    await put('sessions/a.md', 'before')
    const first = (await buildVaultManifest(root)).entries[0].sha256
    await put('sessions/a.md', 'after')
    expect((await buildVaultManifest(root)).entries[0].sha256).not.toBe(first)
  })
})

describe('syncVaultToReplica', () => {
  const fakeServer = (plan: {
    wanted: string[]
    unchanged?: number
    extra?: string[]
    rejected?: Array<{ path: string; reason: string }>
  }): { fetch: typeof fetch; uploads: string[]; reindexed: () => number } => {
    const uploads: string[] = []
    let reindexCalls = 0
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (String(url).endsWith('/sync/reindex')) {
        reindexCalls++
        return { ok: true, status: 202, text: async () => JSON.stringify({ started: true }) }
      }
      if (String(url).endsWith('/sync/plan')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              wanted: plan.wanted,
              unchanged: plan.unchanged ?? 0,
              extra: plan.extra ?? [],
              rejected: plan.rejected ?? [],
            }),
        }
      }
      uploads.push(body.path)
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, path: body.path, bytes: 1 }) }
    })
    vi.stubGlobal('fetch', f)
    return { fetch: f as unknown as typeof fetch, uploads, reindexed: () => reindexCalls }
  }

  /** Uploading into an index nobody rebuilt changes nothing an agent can find. */
  it('tells the replica to reindex after uploading, and not before', async () => {
    await put('sessions/a.md', 'a')
    const s = fakeServer({ wanted: ['sessions/a.md'] })
    await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(s.reindexed()).toBe(1)
  })

  it('does not reindex when nothing was uploaded', async () => {
    await put('sessions/a.md', 'a')
    const s = fakeServer({ wanted: [], unchanged: 1 })
    await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(s.reindexed()).toBe(0)
  })

  it('reports a failed reindex instead of calling the sync clean', async () => {
    await put('sessions/a.md', 'a')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/sync/reindex')) {
          return { ok: false, status: 500, text: async () => JSON.stringify({ error: 'boom' }) }
        }
        if (String(url).endsWith('/sync/plan')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ wanted: ['sessions/a.md'], unchanged: 0, extra: [], rejected: [] }),
          }
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) }
      }),
    )
    const r = await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(r.uploaded).toBe(1)
    expect(r.failed.map((f) => f.path)).toContain('(replica reindex)')
  })

  it('uploads only what the replica asked for', async () => {
    await put('sessions/a.md', 'a')
    await put('sessions/b.md', 'b')
    await put('sessions/c.md', 'c')
    const { uploads } = fakeServer({ wanted: ['sessions/b.md'], unchanged: 2 })
    const r = await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(uploads).toEqual(['sessions/b.md'])
    expect(r).toMatchObject({ uploaded: 1, unchanged: 2 })
  })

  it('reports what only the replica has, and uploads nothing extra for it', async () => {
    await put('sessions/a.md', 'a')
    const { uploads } = fakeServer({ wanted: [], unchanged: 1, extra: ['sessions/deleted-here.md'] })
    const r = await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(r.extraOnReplica).toEqual(['sessions/deleted-here.md'])
    expect(uploads).toEqual([])
  })

  it('carries a replica refusal through instead of counting it as sent', async () => {
    await put('sessions/a.md', 'a')
    fakeServer({ wanted: [], rejected: [{ path: '../escape.md', reason: 'traversal' }] })
    const r = await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(r.uploaded).toBe(0)
    expect(r.failed[0].reason).toContain('traversal')
  })

  /** The whole reason for the handshake: a full push is not a sync. */
  it('sends one file when one changed out of many', async () => {
    for (let i = 0; i < 50; i++) await put(`sessions/n${i}.md`, `body ${i}`)
    const { uploads } = fakeServer({ wanted: ['sessions/n7.md'], unchanged: 49 })
    await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' })
    expect(uploads).toEqual(['sessions/n7.md'])
  })

  it('strips a trailing /mcp from the target', async () => {
    await put('sessions/a.md', 'a')
    const f = fakeServer({ wanted: [] }).fetch as unknown as ReturnType<typeof vi.fn>
    await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865/mcp' })
    expect(f.mock.calls[0][0]).toBe('http://replica:7865/sync/plan')
  })

  it('sends the bearer token when given one', async () => {
    await put('sessions/a.md', 'a')
    const f = fakeServer({ wanted: [] }).fetch as unknown as ReturnType<typeof vi.fn>
    await syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865', token: 'btk_x' })
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer btk_x')
  })

  it('surfaces a refusal from an instance that owns its vault', async () => {
    await put('sessions/a.md', 'a')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error: 'not_a_replica', hint: 'This instance owns the vault' }),
      })),
    )
    await expect(
      syncVaultToReplica({ vaultRoot: root, target: 'http://replica:7865' }),
    ).rejects.toThrow(/not_a_replica/)
  })

  it('stops when cancelled and says so', async () => {
    for (let i = 0; i < 5; i++) await put(`sessions/n${i}.md`, `b${i}`)
    fakeServer({ wanted: ['sessions/n0.md', 'sessions/n1.md'] })
    const ac = new AbortController()
    ac.abort()
    const r = await syncVaultToReplica({
      vaultRoot: root,
      target: 'http://replica:7865',
      signal: ac.signal,
    })
    expect(r.uploaded).toBe(0)
    expect(r.failed[0].reason).toBe('cancelled')
  })
})

describe('pullVaultFromPeer', () => {
  it('downloads only what local planSync wants', async () => {
    await put('sessions/have.md', 'identical')
    const bodies: Record<string, string> = {
      'sessions/have.md': 'identical',
      'sessions/peer.md': 'from peer',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        if (u.endsWith('/sync/manifest')) {
          const { sha256 } = await import('../../../packages/brain-core/src/sync/receive.js')
          const entries = Object.entries(bodies).map(([path, body]) => ({
            path,
            sha256: sha256(body),
            size: Buffer.byteLength(body),
          }))
          return { ok: true, status: 200, text: async () => JSON.stringify({ entries, skipped: [] }) }
        }
        if (u.endsWith('/sync/fetch')) {
          const path = JSON.parse(String(init?.body)).path as string
          const body = bodies[path]
          const { sha256 } = await import('../../../packages/brain-core/src/sync/receive.js')
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                path,
                sha256: sha256(body),
                size: Buffer.byteLength(body),
                contentBase64: Buffer.from(body).toString('base64'),
              }),
          }
        }
        throw new Error(`unexpected ${u}`)
      }),
    )
    const r = await pullVaultFromPeer({ vaultRoot: root, target: 'http://replica:7865' })
    expect(r.downloaded).toBe(1)
    expect(r.unchanged).toBe(1)
    expect(await (await import('node:fs/promises')).readFile(join(root, 'sessions/peer.md'), 'utf8')).toBe(
      'from peer',
    )
  })

  it('suffixes on content conflict instead of overwriting', async () => {
    await put('sessions/note.md', 'local')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url)
        const { sha256 } = await import('../../../packages/brain-core/src/sync/receive.js')
        if (u.endsWith('/sync/manifest')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                entries: [{ path: 'sessions/note.md', sha256: sha256('remote'), size: 6 }],
                skipped: [],
              }),
          }
        }
        if (u.endsWith('/sync/fetch')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                path: 'sessions/note.md',
                sha256: sha256('remote'),
                size: 6,
                contentBase64: Buffer.from('remote').toString('base64'),
              }),
          }
        }
        throw new Error(`unexpected ${u}`)
      }),
    )
    const r = await pullVaultFromPeer({ vaultRoot: root, target: 'http://replica:7865' })
    expect(r.conflicts).toEqual([{ kept: 'sessions/note.md', wrote: 'sessions/note-2.md' }])
    const fs = await import('node:fs/promises')
    expect(await fs.readFile(join(root, 'sessions/note.md'), 'utf8')).toBe('local')
    expect(await fs.readFile(join(root, 'sessions/note-2.md'), 'utf8')).toBe('remote')
  })
})
