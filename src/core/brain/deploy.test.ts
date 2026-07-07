import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deployDistilledHttp, triggerReindex } from './deploy.js'
describe('brain/deploy triggerReindex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const ok = await triggerReindex('http://brain.example.local:7860', 'btk_test')

    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://brain.example.local:7860/api/library/reindex',
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

    await deployDistilledHttp(notesDir, 'http://brain.example.local:7860', 'btk_test')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://brain.example.local:7860/api/vault/save-note',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer btk_test'
        })
      })
    )
  })
})
