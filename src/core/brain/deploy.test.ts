import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerReindex } from './deploy.js'

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
