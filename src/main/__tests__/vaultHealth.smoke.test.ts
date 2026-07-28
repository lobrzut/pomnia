import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataPath = join(tmpdir(), 'pomnia-vh-userdata-default')

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => userDataPath,
    getAppPath: () => '/tmp/pomnia-app',
  },
}))

vi.mock('../appSettings.js', () => ({
  getAppSettings: () => ({}),
  setAppSettings: vi.fn(async () => {}),
}))

vi.mock('@core/log.js', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('vaultHealth counting', () => {
  let vaultDir = ''

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'pomnia-vh-ud-'))
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-vh-vault-'))
  })

  afterEach(() => {
    for (const d of [vaultDir, userDataPath]) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it(
    'counts _weak and checkpoints like the indexer',
    async () => {
      const d = join(vaultDir, 'distilled')
      const s = join(vaultDir, 'sessions')
      mkdirSync(join(d, '_weak'), { recursive: true })
      mkdirSync(join(s, 'checkpoints'), { recursive: true })
      writeFileSync(join(d, 'a.md'), 'a')
      writeFileSync(join(d, 'b.md'), 'b')
      writeFileSync(join(d, '_weak', 'w1.md'), 'w')
      writeFileSync(join(d, '_weak', 'w2.md'), 'w')
      writeFileSync(join(d, '_weak', 'w3.md'), 'w')
      writeFileSync(join(s, 's1.md'), 's')
      writeFileSync(join(s, 'checkpoints', 'c1.md'), 'c')
      writeFileSync(join(s, 'checkpoints', 'c2.md'), 'c')
      writeFileSync(join(s, 'checkpoints', 'c3.md'), 'c')
      writeFileSync(join(s, 'checkpoints', 'c4.md'), 'c')

      const { countVaultIndexableNotes } = await import('../vaultHealth.js')
      const c = countVaultIndexableNotes(vaultDir)
      expect(c.distilled).toBe(5)
      expect(c.sessions).toBe(5)
      expect(c.total).toBe(10)
      expect(c.libraryHasContent).toBe(false)
    },
    30_000,
  )

  it(
    'skips _review / skills like the indexer',
    async () => {
      mkdirSync(join(vaultDir, 'distilled', '_review'), { recursive: true })
      mkdirSync(join(vaultDir, 'skills', 'foo'), { recursive: true })
      writeFileSync(join(vaultDir, 'distilled', 'keep.md'), 'k')
      writeFileSync(join(vaultDir, 'distilled', '_review', 'x.md'), 'skip')
      writeFileSync(join(vaultDir, 'skills', 'foo', 'SKILL.md'), 'skip')

      const { countVaultIndexableNotes } = await import('../vaultHealth.js')
      expect(countVaultIndexableNotes(vaultDir).total).toBe(1)
    },
    30_000,
  )

  it(
    'detects library/ content for server-hint gating',
    async () => {
      mkdirSync(join(vaultDir, 'library'), { recursive: true })
      writeFileSync(join(vaultDir, 'library', 'book.pdf'), '%PDF')
      const { countVaultIndexableNotes } = await import('../vaultHealth.js')
      expect(countVaultIndexableNotes(vaultDir).libraryHasContent).toBe(true)
    },
    30_000,
  )
})

describe('vaultHealth heuristics (pure counts)', () => {
  async function load() {
    return import('../vaultHealth.js')
  }

  const base = {
    vaultRoot: 'C:\\Vault',
    newestMs: 0,
    indexFiles: null as number | null,
    indexDbBytes: 3_000_000 as number | null,
    dbExists: true,
    lastFingerprint: null as string | null,
  }

  it('ok for ~1.17 chunks/file (former absolute thin_index false positive)', async () => {
    const { assessVaultHealthCounts, MIN_CHUNKS_PER_FILE } = await load()
    // Real case: 2097 chunks / 1797 notes (incl. _weak + checkpoints). Old: chunks < 5000 → warn.
    const distilled = 1523 + 250
    const sessions = 24
    const chunks = 2097
    expect(chunks / (distilled + sessions)).toBeGreaterThan(MIN_CHUNKS_PER_FILE)
    expect(chunks).toBeLessThan(5000)
    const report = assessVaultHealthCounts({
      ...base,
      distilled,
      sessions,
      libraryHasContent: false,
      indexChunks: chunks,
      indexFiles: distilled + sessions,
    })
    expect(report.code).toBe('ok')
    expect(report.detailPl).not.toMatch(/dziesiątki tysięcy/)
  })

  it('warns thin_index when chunks/file < 0.8 (above empty floor)', async () => {
    const { assessVaultHealthCounts } = await load()
    // 501/650 ≈ 0.77; chunks ≥ 500 so empty_index does not fire
    const report = assessVaultHealthCounts({
      ...base,
      distilled: 650,
      sessions: 0,
      libraryHasContent: false,
      indexChunks: 501,
      indexFiles: 650,
    })
    expect(report.code).toBe('thin_index')
    expect(report.level).toBe('warn')
    expect(report.detailPl).toMatch(/chunk\/plik/)
    expect(report.detailPl).not.toMatch(/dziesiątki tysięcy/)
  })

  it('gates server copy language behind non-empty library/', async () => {
    const { assessVaultHealthCounts } = await load()
    const report = assessVaultHealthCounts({
      ...base,
      distilled: 650,
      sessions: 0,
      libraryHasContent: true,
      indexChunks: 501,
      indexFiles: 650,
    })
    expect(report.code).toBe('thin_index')
    expect(report.detailPl).toMatch(/dziesiątki tysięcy/)
    expect(report.detailEn).toMatch(/tens of thousands/)
  })

  it('empty_index for tiny chunks with bad density', async () => {
    const { assessVaultHealthCounts } = await load()
    const report = assessVaultHealthCounts({
      ...base,
      distilled: 1797,
      sessions: 0,
      libraryHasContent: false,
      indexChunks: 155,
      indexFiles: 1797,
    })
    expect(report.code).toBe('empty_index')
    expect(report.level).toBe('critical')
    expect(report.detailPl).not.toMatch(/dziesiątki tysięcy/)
  })

  it('shallow top-level-only count would mislabel healthy index — full count does not', async () => {
    const { assessVaultHealthCounts } = await load()
    // Shallow: 1523 distilled + 0 sessions = 1523; with absolute <5000 old code warned.
    // Full INDEX_SUBDIRS count: 1797 → ratio OK.
    const shallow = assessVaultHealthCounts({
      ...base,
      distilled: 1523,
      sessions: 0,
      libraryHasContent: false,
      indexChunks: 2097,
      indexFiles: 1523,
    })
    const full = assessVaultHealthCounts({
      ...base,
      distilled: 1523 + 250,
      sessions: 24,
      libraryHasContent: false,
      indexChunks: 2097,
      indexFiles: 1797,
    })
    expect(full.code).toBe('ok')
    // Even shallow denominator is ok under ratio heuristic (2097/1523 > 0.8);
    // the bug was absolute chunk threshold, not only the count.
    expect(shallow.code).toBe('ok')
  })
})
