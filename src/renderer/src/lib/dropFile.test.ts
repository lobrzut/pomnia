import { describe, expect, it, vi } from 'vitest'
import { pathFromDroppedFile } from './dropFile'

vi.mock('./api', () => ({
  api: {
    getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? null)
  }
}))

describe('pathFromDroppedFile', () => {
  it('returns path from preload webUtils bridge', () => {
    const file = new File(['x'], 'report.pdf') as File & { path?: string }
    file.path = 'C:\\Users\\Alice\\Downloads\\report.pdf'
    expect(pathFromDroppedFile(file)).toBe('C:\\Users\\Alice\\Downloads\\report.pdf')
  })

  it('returns null when path cannot be resolved', () => {
    const file = new File(['x'], 'report.pdf')
    expect(pathFromDroppedFile(file)).toBeNull()
  })
})
