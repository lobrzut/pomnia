import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'

import { parseExportBuffer } from './archives.js'
import { ZipExpansionError } from '../../../packages/doc-parser/src/safeUnzip.js'

describe('parseExportBuffer ZIP limits (F15)', () => {
  it('parses a normal conversations.zip', () => {
    const enc = new TextEncoder()
    const payload = JSON.stringify([
      {
        title: 'Hi',
        mapping: {
          a: {
            message: {
              author: { role: 'user' },
              content: { parts: ['hello from chatgpt export'] },
            },
          },
        },
      },
    ])
    const zipped = zipSync({ 'conversations.json': enc.encode(payload) })
    const result = parseExportBuffer(zipped, 'export.zip')
    expect(result.conversations.length).toBeGreaterThan(0)
  })

  it('rejects high declared expansion with ZipExpansionError (no conversations)', () => {
    const enc = new TextEncoder()
    const zipped = zipSync({
      'conversations.json': enc.encode('Z'.repeat(80_000)),
    })
    expect(() =>
      parseExportBuffer(zipped, 'bomb.zip', {
        maxTotalUncompressedBytes: 10_000,
        maxSingleEntryBytes: 10_000,
      }),
    ).toThrow(ZipExpansionError)
  })

  it('rejects when entry count exceeds the cap', () => {
    const enc = new TextEncoder()
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 12; i++) files[`part${i}.json`] = enc.encode('[]')
    const zipped = zipSync(files)
    expect(() => parseExportBuffer(zipped, 'many.zip', { maxEntries: 5 })).toThrow(
      /too many entries/i,
    )
  })
})
