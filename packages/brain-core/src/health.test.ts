import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectHealth, worstOf } from './health.js'
import type { EmbedClient } from './rag/embed.js'

let vaultRoot: string

const okEmbedder = { preflight: vi.fn(async () => {}) } as unknown as EmbedClient
const deadEmbedder = {
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
  })

  /**
   * The state this whole module exists for: everything answers, every search
   * comes back empty, and the old /healthz called that healthy.
   */
  it('calls an empty index down, not ok', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 0, chunks: 0 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.checks.index.state).toBe('down')
    expect(h.checks.index.detail).toMatch(/reindex/)
    expect(h.status).toBe('down')
    expect(h.ok).toBe(false)
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
      preflight: vi.fn(() => new Promise<void>(() => {})),
    } as unknown as EmbedClient
    const t0 = Date.now()
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: hanging, vaultRoot, dataDir: vaultRoot })
    expect(Date.now() - t0).toBeLessThan(9_000)
    expect(h.checks.ollama.state).toBe('degraded')
    expect(h.checks.ollama.detail).toMatch(/timed out/)
  }, 15_000)

  it('carries ownership through, so a client can see who may write', async () => {
    const h = await collectHealth({ ...base, db: db({ files: 1, chunks: 1 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot })
    expect(h.writable).toBe(false)
    expect(h.vaultOwner).toBe('Pomnia Desktop')
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
