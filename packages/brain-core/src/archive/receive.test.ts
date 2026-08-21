// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyArchiveBlob,
  applyArchiveManifest,
  listBlobHashes,
  missingHashes,
  sha256,
} from './receive.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pomnia-archive-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('applyArchiveBlob', () => {
  it('stores a blob when sha256(content) matches the filename', async () => {
    const content = Buffer.from('archive-payload-one')
    const hash = sha256(content)
    const r = await applyArchiveBlob({ vaultRoot: root, hash, content })
    expect(r).toEqual({ ok: true, hash, path: `blobs/${hash}.cvb`, bytes: content.length })
    expect(await readFile(join(root, 'blobs', `${hash}.cvb`))).toEqual(content)
  })

  it('rejects a corrupt blob with the filename in the message', async () => {
    const hash = sha256('expected')
    const r = await applyArchiveBlob({
      vaultRoot: root,
      hash,
      content: Buffer.from('tampered'),
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('hash-mismatch')
    expect(r.path).toBe(`blobs/${hash}.cvb`)
    expect(r.detail).toContain(`blobs/${hash}.cvb`)
  })

  it('second apply of the same bytes transfers zero (skipped)', async () => {
    const content = Buffer.from('idempotent')
    const hash = sha256(content)
    await applyArchiveBlob({ vaultRoot: root, hash, content })
    const r = await applyArchiveBlob({ vaultRoot: root, hash, content })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toBe(true)
    expect(r.bytes).toBe(0)
  })
})

describe('listBlobHashes + resume', () => {
  it('lists only completed blobs; missingHashes drives resume', async () => {
    const a = Buffer.from('blob-a')
    const b = Buffer.from('blob-b')
    const ha = sha256(a)
    const hb = sha256(b)
    await applyArchiveBlob({ vaultRoot: root, hash: ha, content: a })

    const have = await listBlobHashes(root)
    expect(have).toEqual([ha])

    const need = missingHashes([ha, hb], new Set(have))
    expect(need).toEqual([hb])

    await applyArchiveBlob({ vaultRoot: root, hash: hb, content: b })
    expect(missingHashes([ha, hb], new Set(await listBlobHashes(root)))).toEqual([])
  })

  it('ignores in-progress tmp names', async () => {
    const content = Buffer.from('done')
    const hash = sha256(content)
    await mkdir(join(root, 'blobs'), { recursive: true })
    await writeFile(join(root, 'blobs', `${hash}.cvb.tmp`), content)
    await writeFile(join(root, 'blobs', `${'b'.repeat(64)}.cvb.partial`), content)
    expect(await listBlobHashes(root)).toEqual([])
  })
})

describe('applyArchiveManifest', () => {
  it('writes opaque manifest without a content-hash check', async () => {
    const content = Buffer.from('not-a-real-manifest-but-opaque')
    const r = await applyArchiveManifest({ vaultRoot: root, content })
    expect(r).toEqual({ ok: true, path: 'manifest.cvb', bytes: content.length })
    expect(await readFile(join(root, 'manifest.cvb'))).toEqual(content)
  })
})
