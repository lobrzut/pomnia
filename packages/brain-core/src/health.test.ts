import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectHealth, redactHealth, worstOf } from './health.js'
import type { EmbedClient } from './rag/embed.js'

let vaultRoot: string

const okEmbedder = {
  backend: 'ollama' as const,
  config: { backend: 'ollama' as const, ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text', modelId: 'nomic-embed-text' },
  preflight: vi.fn(async () => {}),
} as unknown as EmbedClient
const deadEmbedder = {
  backend: 'ollama' as const,
  config: { backend: 'ollama' as const, ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text', modelId: 'nomic-embed-text' },
  preflight: vi.fn(async () => {
    throw new Error('ollama unreachable at http://127.0.0.1:11434 (fetch failed)')
  }),
} as unknown as EmbedClient

function db(withRows: { files: number; chunks: number }): Database.Database {
  const d = new Database(':memory:')
  d.exec('CREATE TABLE indexed_files (p TEXT); CREATE TABLE chunks (p TEXT)')
  for (let i = 0; i < withRows.files; i++) d.prepare('INSERT INTO indexed_files VALUES (?)').run(`f${i}`)
  for (let i = 0; i < withRows.chunks; i++) d.prepare('INSERT INTO chunks VALUES (?)').run(`c${i}`)
  return d
}

const base = {
  version: '0.1.7',
  authRequired: true,
  writable: false,
  vaultOwner: 'Pomnia Desktop',
  startedAt: Date.now() - 5_000,
}

beforeEach(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'pomnia-health-'))
})

/** A vault with something in it. Empty vault and empty index agree; a vault
 *  with notes and an empty index is the state that lies to every search. */
async function seedNote(): Promise<void> {
  await mkdir(join(vaultRoot, 'sessions'), { recursive: true })
  await writeFile(join(vaultRoot, 'sessions', 'note.md'), '# note')
}
afterEach(async () => {
  await rm(vaultRoot, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('collectHealth', () => {
  it('reports ok when everything a search needs is there', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 10, chunks: 44 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.status).toBe('ok')
    expect(h.ok).toBe(true)
    expect(h.index).toEqual({ files: 10, chunks: 44 })
    expect(h.embed).toEqual({ backend: 'ollama', model: 'nomic-embed-text', ready: true, dim: 768 })
    expect(h.sync).toEqual({
      lastReceivedAt: null,
      lastPeer: null,
      filesReceived: 0,
      conflicts: 0,
      archiveLastAt: null,
    })
    expect(h.distill).toEqual({ enabled: false, runnable: false, phase: 'idle', model: '' })
    expect(h.ollamaRuntime).toBeDefined()
    expect(h.ollamaRuntime.accelerator).toBeTruthy()
  })

  /**
   * The state this whole module exists for: everything answers, every search
   * comes back empty, and the old /healthz called that healthy.
   */
  it('calls an empty index down when the vault has notes to find', async () => {
    await seedNote()
    const h = await collectHealth({ ...base, db: db({ files: 0, chunks: 0 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.index.state).toBe('down')
    expect(h.checks.index.detail).toMatch(/reindex/)
    expect(h.status).toBe('down')
    expect(h.ok).toBe(false)
  })

  it('does not call a fresh install broken — empty vault, empty index', async () => {
    // Both are empty, so they agree, and there is nothing to be misled about.
    // Calling this `down` made every correct fresh install look broken: the
    // Docker HEALTHCHECK exits non-zero on 503, so a new container reported
    // unhealthy while working, and install.sh burned its whole readiness loop
    // because `curl -f` treats 503 as a failure. Verified live on 7873.
    const h = await collectHealth({ ...base, db: db({ files: 0, chunks: 0 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.index.state).toBe('degraded')
    expect(h.checks.index.detail).toMatch(/no notes/)
    expect(h.ok).toBe(true)
  })

  /** Skills, profile and note reads still work without Ollama. */
  it('degrades rather than dies when Ollama is unreachable', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 3 }), embedder: deadEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.ollama.state).toBe('degraded')
    expect(h.checks.ollama.detail).toMatch(/unreachable/)
    expect(h.status).toBe('degraded')
    // Still reachable and still useful — a monitor must not page for this.
    expect(h.ok).toBe(true)
  })

  it('reports a missing vault directory', async () => {
    const h = await collectHealth({
      ...base,
      db: db({ files: 1, chunks: 1 }),
      embedder: okEmbedder,
      vaultRoot: join(vaultRoot, 'gone'),
      dataDir: vaultRoot,
    })
    expect(h.checks.vault.state).toBe('down')
    expect(h.status).toBe('down')
  })

  it('reports an unopened database without throwing', async () => {
    const h = await collectHealth({ ...base, db: null, embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.db.state).toBe('down')
    expect(h.status).toBe('down')
  })

  it('survives a database that errors on query', async () => {
    const broken = new Database(':memory:') // no tables at all
    const h = await collectHealth({ ...base, db: broken, embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.db.state).toBe('down')
    expect(h.checks.db.detail).toBeTruthy()
  })

  /** A health endpoint that hangs makes whatever polls it hang too. */
  it('does not wait on a hanging Ollama', async () => {
    const hanging = {
      backend: 'ollama' as const,
      config: { backend: 'ollama' as const, ollamaUrl: 'http://127.0.0.1:11434', embedModel: 'nomic-embed-text', modelId: 'nomic-embed-text' },
      preflight: vi.fn(() => new Promise<void>(() => {})),
    } as unknown as EmbedClient
    const t0 = Date.now()
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: hanging, vaultRoot, dataDir: vaultRoot })
    expect(Date.now() - t0).toBeLessThan(9_000)
    expect(h.checks.ollama.state).toBe('degraded')
    expect(h.checks.ollama.detail).toMatch(/timed out/)
    expect(h.embed.ready).toBe(false)
  }, 15_000)

  it('carries ownership through, so a client can see who may write', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.writable).toBe(false)
    expect(h.vaultOwner).toBe('Pomnia Desktop')
  })
})

describe('redactHealth', () => {
  /**
   * Public /healthz used to zero the counts. With checks.index=ok that read as
   * "healthy empty brain" — the 0/0 mystery on every unauthenticated curl.
   */
  it('nulls index counts instead of pretending the vault is empty', async () => {
    const h = await collectHealth({
      ...base,
      db: db({ files: 10, chunks: 44 }),
      embedder: okEmbedder,
      vaultRoot,
      dataDir: vaultRoot,
    })
    const r = redactHealth(h)
    expect(r.index).toBeNull()
    expect(r.checks.index.state).toBe('ok')
    expect(r.checks.index.detail).toBeUndefined()
    expect(r.status).toBe(h.status)
    expect(r.vaultOwner).toBe('Pomnia Desktop')
    expect(r.embed.backend).toBe('ollama')
    expect(r.embed.ready).toBe(true)
    expect(r.embed.model).toBe('')
    expect(r.distill.model).toBe('')
    expect(r.sync.lastReceivedAt).toBeNull()
    expect(r.ollamaRuntime.running).toEqual([])
    expect(r.ollamaRuntime.accelerator).toBe(h.ollamaRuntime.accelerator)
  })
})

describe('worstOf', () => {
  it('takes the worst, not the last', () => {
    expect(worstOf([{ state: 'ok' }, { state: 'down' }, { state: 'ok' }])).toBe('down')
    expect(worstOf([{ state: 'ok' }, { state: 'degraded' }])).toBe('degraded')
    expect(worstOf([{ state: 'degraded' }, { state: 'down' }])).toBe('down')
    expect(worstOf([])).toBe('ok')
  })
})

describe('disk', () => {
  it('passes when the data directory is writable', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.disk.state).toBe('ok')
  })

  /**
   * The state nothing checked: a full or read-only filesystem fails the next
   * sync, reindex and token touch, while the database still opens for reads
   * and /healthz said ok.
   */
  it('goes down when the data directory cannot be written', async () => {
    const h = await collectHealth({
      ...base,
      db: db({ files: 1, chunks: 1 }),
      embedder: okEmbedder,
      vaultRoot,
      dataDir: join(vaultRoot, 'does', 'not', 'exist'),
    })
    expect(h.checks.disk.state).toBe('down')
    expect(h.checks.disk.detail).toMatch(/cannot write/)
    expect(h.status).toBe('down')
  })

  it('reports down when no data directory is configured at all', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: okEmbedder, vaultRoot, dataDir: '' })
    expect(h.checks.disk.state).toBe('down')
  })

  /** A probe file left behind would accumulate one per health check. */
  it('leaves nothing behind', async () => {
    await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    const { readdir } = await import('node:fs/promises')
    expect(await readdir(vaultRoot)).not.toContain('.write-probe')
  })
})
