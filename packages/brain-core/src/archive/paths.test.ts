// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia

import { describe, expect, it } from 'vitest'

import { safeBlobPath, blobRelative, BLOB_HASH_RE } from './paths.js'

const HASH = 'a'.repeat(64)

describe('safeBlobPath', () => {
  it('accepts a bare hash', () => {
    const v = safeBlobPath(HASH)
    expect(v).toEqual({ ok: true, hash: HASH, relative: `blobs/${HASH}.cvb` })
  })

  it('accepts blobs/<hash>.cvb', () => {
    const v = safeBlobPath(`blobs/${HASH}.cvb`)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.relative).toBe(blobRelative(HASH))
  })

  it('rejects traversal and wrong dirs', () => {
    expect(safeBlobPath('../x').ok).toBe(false)
    expect(safeBlobPath('sessions/a.md').ok).toBe(false)
    expect(safeBlobPath(`blobs/../${HASH}.cvb`).ok).toBe(false)
    expect(safeBlobPath('blobs/short.cvb').ok).toBe(false)
    expect(safeBlobPath(HASH.toUpperCase()).ok).toBe(false)
  })

  it('BLOB_HASH_RE matches only lowercase hex64', () => {
    expect(BLOB_HASH_RE.test(HASH)).toBe(true)
    expect(BLOB_HASH_RE.test('G'.repeat(64))).toBe(false)
  })
})
