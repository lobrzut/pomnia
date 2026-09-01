import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectHealth, redactHealth, resetDiskCountCache, worstOf } from './health.js'
import { indexAfterWrite, resetIndexFailures } from './mcp/indexAfterWrite.js'
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

describe('collectHealth — notes on disk but not in the index', () => {
  // The on-disk count is cached for 5 minutes, so without clearing it each
  // case would be graded against the previous case's vault.
  beforeEach(() => resetDiskCountCache())

  /** Write n notes under sessions/, the way a vault actually fills up. */
  async function seedNotes(n: number): Promise<void> {
    await mkdir(join(vaultRoot, 'sessions'), { recursive: true })
    for (let i = 0; i < n; i++) {
      await writeFile(join(vaultRoot, 'sessions', `note-${i}.md`), `# note ${i}`)
    }
  }

  it('degrades when a large share of the vault never reached the index', async () => {
    // The shape of the real incident: a CIFS mount without iocharset=utf8 left
    // 206 of 3573 files listable and unopenable, so the indexer skipped them
    // and /healthz stayed green while searches quietly missed them.
    await seedNotes(12)
    const h = await collectHealth({
      ...base, db: db({ files: 1, chunks: 4 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('degraded')
    expect(h.checks.index.detail).toContain('11 of 12')
    expect(h.status).toBe('degraded')
  })

  it('names the mount as a suspect, because a reindex alone will not fix that case', async () => {
    await seedNotes(12)
    const h = await collectHealth({
      ...base, db: db({ files: 1, chunks: 4 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.detail).toContain('iocharset=utf8')
  })

  it('stays ok when the gap is ordinary churn, not a fault', async () => {
    // Pruning lag and in-flight writes must not page anybody.
    await seedNotes(12)
    const h = await collectHealth({
      ...base, db: db({ files: 11, chunks: 40 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('ok')
  })

  it('does not count skills as a gap — they replicate but never enter RAG', async () => {
    // Shipped once and caught on the live server: the walk used SYNC_DIRS while
    // the indexer uses INDEX_SUBDIRS, and skills/ is in the first and not the
    // second. /healthz went degraded over 774 notes the indexer was never
    // asked to take — the same false alarm as quarantine, one list further up.
    await seedNotes(10)
    await mkdir(join(vaultRoot, 'skills'), { recursive: true })
    for (let i = 0; i < 40; i++) {
      await writeFile(join(vaultRoot, 'skills', `s-${i}.md`), '# skill')
    }
    const h = await collectHealth({
      ...base, db: db({ files: 10, chunks: 30 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('ok')
  })

  it('does not count quarantine as a gap — _review is policy, not a fault', async () => {
    // Found the hard way: this check reported 123 missing notes on a real
    // appliance, and all 123 were readable files sitting in distilled/_review,
    // which the indexer skips on purpose. A monitor that goes red over correct
    // behaviour trains people to ignore it, which restores the exact silence
    // the check exists to break.
    await seedNotes(5)
    await mkdir(join(vaultRoot, 'distilled', '_review'), { recursive: true })
    for (let i = 0; i < 10; i++) {
      await writeFile(join(vaultRoot, 'distilled', '_review', `q-${i}.md`), '# quarantined')
    }
    const h = await collectHealth({
      ...base, db: db({ files: 5, chunks: 15 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('ok')
  })

  it('tolerates the index running slightly ahead of the walk', async () => {
    // A handful of not-yet-pruned rows is pruning lag, not a fault, and gets
    // the same tolerance as the missing-notes direction.
    await seedNotes(200)
    const h = await collectHealth({
      ...base, db: db({ files: 203, chunks: 600 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('ok')
  })

  it('degrades when the index holds many entries with no note behind them', async () => {
    // Seen on the live server during an audit: 2688 indexed against 2666 on
    // disk. Orphans are quieter than missing notes — recall still answers, so
    // nothing looks wrong, and what comes back is a passage from a note that
    // was deleted. Earlier this direction was graded ok on the grounds that a
    // negative gap is not missing notes. True, and beside the point: it is a
    // different fault, and it was going unreported.
    await seedNotes(5)
    const h = await collectHealth({
      ...base, db: db({ files: 40, chunks: 120 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('degraded')
    expect(h.checks.index.detail).toContain('35 entries more')
    expect(h.checks.index.detail).toContain('--reindex')
  })

  it('does not blame the mount for orphans — a reindex is the whole fix', async () => {
    // The missing-notes text names iocharset=utf8 as a suspect. Repeating that
    // here would send someone to check a mount that is working.
    await seedNotes(5)
    const h = await collectHealth({
      ...base, db: db({ files: 40, chunks: 120 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.detail).not.toContain('iocharset')
  })
})

describe('collectHealth - a note that failed to index at write time', () => {
  beforeEach(() => {
    resetDiskCountCache()
    resetIndexFailures()
  })
  afterEach(() => resetIndexFailures())

  it('degrades even though the counts look healthy', async () => {
    // The quietest gap there is: somebody deliberately recorded a decision,
    // the tool reported success, and recall will never return it. One or two
    // notes cannot move the disk-vs-index ratio, so arithmetic will not find
    // this - it has to be reported on its own.
    await mkdir(join(vaultRoot, 'sessions'), { recursive: true })
    for (let i = 0; i < 10; i++) {
      await writeFile(join(vaultRoot, 'sessions', `n${i}.md`), '# n')
    }
    await indexAfterWrite('sessions/lost.md', async () => { throw new Error('embedder down') }, 200)
    const h = await collectHealth({
      ...base, db: db({ files: 10, chunks: 30 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('degraded')
    expect(h.checks.index.detail).toContain('written but failed to index')
    expect(h.checks.index.detail).toContain('sessions/lost.md')
    expect(h.checks.index.detail).toContain('--reindex')
  })

  it('stays ok when every write reached the index', async () => {
    await mkdir(join(vaultRoot, 'sessions'), { recursive: true })
    for (let i = 0; i < 10; i++) {
      await writeFile(join(vaultRoot, 'sessions', `n${i}.md`), '# n')
    }
    await indexAfterWrite('sessions/ok.md', async () => undefined, 200)
    const h = await collectHealth({
      ...base, db: db({ files: 10, chunks: 30 }), embedder: okEmbedder, vaultRoot, dataDir: vaultRoot,
    })
    expect(h.checks.index.state).toBe('ok')
  })
})
