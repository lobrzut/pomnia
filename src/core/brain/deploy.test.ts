import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyNoteThroughQualityGate,
  deployDistilledFiles,
  deployDistilledHttp,
  deployFilesystem,
  noteFilename,
  triggerReindex,
} from './deploy.js'
import type { DistilledNote } from './distill.js'

function note(partial: Partial<DistilledNote> & Pick<DistilledNote, 'quality'>): DistilledNote {
  return {
    title: 't',
    date: '2026-07-28',
    source: 'cursor',
    sessionId: 'abcd1234efgh',
    msgCount: 4,
    score: 5,
    markdown: '---\nquality: ' + partial.quality + '\n---\n\n# body\n',
    fields: { summary: '', decisions: [], solutions: [], facts: [], openQuestions: [] },
    ...partial,
  }
}

describe('brain/deploy triggerReindex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const ok = await triggerReindex('http://127.0.0.1:7860', 'btk_test')

    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7860/api/library/reindex',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          Authorization: 'Bearer btk_test'
        })
      })
    )
  })

  it('omits Authorization when token missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await triggerReindex('http://localhost:7860')

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('brain/deploy quality gate paths', () => {
  it('routes stub/garbage → _review and weak → _weak', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pomnia-deploy-q-'))
    const written = await deployFilesystem(
      [
        note({ quality: 'ok', sessionId: 'ok000001xxxx', markdown: '---\nquality: ok\n---\n\nok\n' }),
        note({ quality: 'stub', sessionId: 'st000001xxxx', markdown: '---\nquality: stub\n---\n\nstub\n' }),
        note({ quality: 'garbage', sessionId: 'ga000001xxxx', markdown: '---\nquality: garbage\n---\n\ngarbage\n' }),
        note({
          quality: 'weak' as DistilledNote['quality'],
          sessionId: 'we000001xxxx',
          markdown: '---\nquality: weak\n---\n\nweak\n',
        }),
      ],
      dir,
    )
    expect(written.some((p) => p.includes('_review') && p.includes('st000001'))).toBe(true)
    expect(written.some((p) => p.includes('_review') && p.includes('ga000001'))).toBe(true)
    expect(written.some((p) => p.includes('_weak') && p.includes('we000001'))).toBe(true)
    expect(
      written.some((p) => !p.includes('_review') && !p.includes('_weak') && p.includes('ok000001')),
    ).toBe(true)
  })

  it('copyNoteThroughQualityGate honors frontmatter', async () => {
    const srcDir = await mkdtemp(join(tmpdir(), 'pomnia-gate-src-'))
    const dstDir = await mkdtemp(join(tmpdir(), 'pomnia-gate-dst-'))
    const src = join(srcDir, 'a.md')
    await writeFile(src, '---\nquality: stub\n---\n\nstub body\n', 'utf8')
    const r = await copyNoteThroughQualityGate(src, dstDir)
    expect(r.dest).toBe('review')
    expect(r.path).toContain('_review')
    const body = await readFile(r.path, 'utf8')
    expect(body).toContain('quality: stub')
  })

  it('deployDistilledFiles gates top-level md by frontmatter', async () => {
    const notesDir = await mkdtemp(join(tmpdir(), 'pomnia-dist-src-'))
    const target = await mkdtemp(join(tmpdir(), 'pomnia-dist-dst-'))
    await writeFile(join(notesDir, 'weak.md'), '---\nquality: weak\n---\n\nw\n', 'utf8')
    await writeFile(join(notesDir, 'ok.md'), '---\nquality: ok\n---\n\nok\n', 'utf8')
    await mkdir(join(notesDir, '_review'), { recursive: true })
    await writeFile(join(notesDir, '_review', 'old.md'), '---\nquality: garbage\n---\n\ng\n', 'utf8')

    await deployDistilledFiles(notesDir, target)
    const weakBody = await readFile(join(target, '_weak', 'weak.md'), 'utf8')
    expect(weakBody).toContain('quality: weak')
    const okBody = await readFile(join(target, 'ok.md'), 'utf8')
    expect(okBody).toContain('quality: ok')
    const rev = await readFile(join(target, '_review', 'old.md'), 'utf8')
    expect(rev).toContain('garbage')
  })
})

describe('brain/deploy distill dedup (re-distill overwrite)', () => {
  it('noteFilename includes session id so re-deploy overwrites the same path', () => {
    const n = note({ quality: 'ok', title: 'WireGuard tips', sessionId: 'deadbeef01234567' })
    const name = noteFilename(n)
    expect(name).toMatch(/deadbeef/)
    expect(name.endsWith('.md')).toBe(true)
    // Same session → identical filename (stable across re-distill).
    expect(noteFilename({ ...n, markdown: '---\nquality: ok\n---\n\nupdated body\n' })).toBe(name)
  })

  it('second deployFilesystem of same session does not grow note count', async () => {
    const { readdir } = await import('node:fs/promises')
    const dir = await mkdtemp(join(tmpdir(), 'pomnia-distill-dedup-'))
    const n = note({
      quality: 'ok',
      title: 'Cyclical backup note',
      sessionId: 'session99abcdef',
      markdown: '---\nquality: ok\n---\n\nfirst distill\n',
    })

    const first = await deployFilesystem([n], dir)
    expect(first).toHaveLength(1)
    const afterFirst = (await readdir(dir)).filter((f) => f.endsWith('.md'))
    expect(afterFirst).toHaveLength(1)

    const n2 = {
      ...n,
      markdown: '---\nquality: ok\n---\n\nsecond distill overwrite\n',
    }
    const second = await deployFilesystem([n2], dir)
    expect(second).toHaveLength(1)
    expect(second[0]).toBe(first[0])

    const afterSecond = (await readdir(dir)).filter((f) => f.endsWith('.md'))
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0]).toBe(afterFirst[0])

    const body = await readFile(first[0], 'utf8')
    expect(body).toContain('second distill overwrite')
  })
})

describe('brain/deploy deployDistilledHttp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends Bearer token on save-note when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const notesDir = await mkdtemp(join(tmpdir(), 'pomnia-deploy-'))
    await writeFile(join(notesDir, 'note.md'), '# test', 'utf8')

    await deployDistilledHttp(notesDir, 'http://127.0.0.1:7860', 'btk_test')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7860/api/vault/save-note',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer btk_test'
        })
      })
    )
  })
})
