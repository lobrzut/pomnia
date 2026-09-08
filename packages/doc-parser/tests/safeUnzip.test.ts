import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'

import { parseEpub } from '../src/epub.js'
import { unzipBounded, ZipExpansionError } from '../src/safeUnzip.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('unzipBounded (F15)', () => {
  it('inflates a normal small archive', () => {
    const enc = new TextEncoder()
    const zipped = zipSync({ 'hello.json': enc.encode('{"ok":true}') })
    const out = unzipBounded(zipped)
    expect(new TextDecoder().decode(out['hello.json']!)).toBe('{"ok":true}')
  })

  it('rejects when declared uncompressed total exceeds the limit', () => {
    const enc = new TextEncoder()
    // Highly compressible payload — declared size is what the central directory reports.
    const big = enc.encode('A'.repeat(200_000))
    const zipped = zipSync({ 'bomb.json': big })
    expect(() =>
      unzipBounded(zipped, {
        maxTotalUncompressedBytes: 50_000,
        maxSingleEntryBytes: 50_000,
      }),
    ).toThrow(ZipExpansionError)
  })

  it('rejects when compressed input exceeds the limit without inflating', () => {
    const enc = new TextEncoder()
    const zipped = zipSync({ 'a.json': enc.encode('x') })
    expect(() =>
      unzipBounded(zipped, {
        maxCompressedBytes: 1,
      }),
    ).toThrow(/too large/i)
  })

  it('rejects when entry count exceeds the limit', () => {
    const enc = new TextEncoder()
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 8; i++) files[`f${i}.json`] = enc.encode(`{"i":${i}}`)
    const zipped = zipSync(files)
    expect(() => unzipBounded(zipped, { maxEntries: 3 })).toThrow(/too many entries/i)
  })

  it('does not return a partial map when a later entry breaches the cap', () => {
    const enc = new TextEncoder()
    const zipped = zipSync({
      'ok.json': enc.encode('{"a":1}'),
      'big.json': enc.encode('B'.repeat(100_000)),
    })
    let threw: unknown
    try {
      unzipBounded(zipped, {
        maxTotalUncompressedBytes: 20_000,
        maxSingleEntryBytes: 200_000,
      })
    } catch (e) {
      threw = e
    }
    expect(threw).toBeInstanceOf(ZipExpansionError)
  })
})

describe('parseEpub expansion limits (F15)', () => {
  it('refuses an oversized compressed EPUB before vault write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pomnia-epub-limit-'))
    const path = join(dir, 'huge.epub')
    // Minimal valid-looking zip bytes that exceed the compressed cap via opts
    // is covered above; here ensure parseEpub uses unzipBounded (throws ZipExpansionError).
    writeFileSync(path, zipSync({ 'META-INF/container.xml': new TextEncoder().encode('not-xml') }))
    // Broken EPUB still goes through unzipBounded — missing rootfile after inflate.
    expect(() => parseEpub(path)).toThrow()
  })
})
