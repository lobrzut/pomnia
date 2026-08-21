// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyArchiveBlob, sha256 } from './receive.js'
import {
  applyMergedManifest,
  mergeSnapshotsById,
  readArchiveManifestJson,
  type MergeableVaultManifest,
} from './manifestMerge.js'
import { writeFileKeepingPrev } from './durableWrite.js'

let root: string

beforeEach(async () => {
  root = join(tmpdir(), `pomnia-manifest-merge-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(join(root, 'blobs'), { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const snap = (id: string, note?: string) => ({
  id,
  createdAt: '2026-08-01T00:00:00.000Z',
  note,
  source: { id: 'claude-code', label: 'Claude Code', strategy: 'fs', root: '/', os: 'win32' },
  stats: { conversations: 1, messages: 2, files: 0, bytes: 0 },
  origin: { host: 'test', user: 'u', home: '/' },
})

const baseManifest = (vaultId: string, snapshots: ReturnType<typeof snap>[]): MergeableVaultManifest => ({
  formatVersion: 1,
  vaultId,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Archive',
  snapshots,
})

async function putBlob(body: string): Promise<string> {
  const content = Buffer.from(body, 'utf8')
  const hash = sha256(content)
  const r = await applyArchiveBlob({ vaultRoot: root, hash, content })
  expect(r.ok).toBe(true)
  return hash
}

describe('mergeSnapshotsById', () => {
  it('unions disjoint snapshots of the same vault', () => {
    const vaultId = 'vault-aaa'
    const a = baseManifest(vaultId, [snap('11111111-1111-4111-8111-111111111111', 'a')])
    const b = baseManifest(vaultId, [snap('22222222-2222-4222-8222-222222222222', 'b')])
    const r = mergeSnapshotsById(a, b)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.added).toBe(1)
    expect(r.total).toBe(2)
    expect(r.manifest.snapshots.map((s) => s.id).sort()).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ])
  })

  it('dedupes the same snapshot id (idempotent)', () => {
    const vaultId = 'vault-bbb'
    const id = '33333333-3333-4333-8333-333333333333'
    const a = baseManifest(vaultId, [snap(id, 'local')])
    const b = baseManifest(vaultId, [snap(id, 'incoming-ignored')])
    const r = mergeSnapshotsById(a, b)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.added).toBe(0)
    expect(r.unchanged).toBe(true)
    expect(r.manifest.snapshots).toHaveLength(1)
    expect(r.manifest.snapshots[0].note).toBe('local')
  })

  it('refuses different vaultIds', () => {
    const a = baseManifest('vault-a', [snap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')])
    const b = baseManifest('vault-b', [snap('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')])
    const r = mergeSnapshotsById(a, b)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('vault-id-mismatch')
    expect(r.detail).toMatch(/vault-a/)
  })
})

describe('applyMergedManifest', () => {
  it('writes the union only when referenced blobs are present', async () => {
    const h1 = await putBlob('blob-one')
    const h2 = await putBlob('blob-two')
    const vaultId = 'vault-ccc'
    const id1 = '44444444-4444-4444-8444-444444444444'
    const id2 = '55555555-5555-4555-8555-555555555555'

    const first = await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest(vaultId, [snap(id1)]),
      referencedBlobs: [h1],
    })
    expect(first.ok).toBe(true)

    const second = await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest(vaultId, [snap(id2)]),
      referencedBlobs: [h2],
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.total).toBe(2)

    const { manifest } = await readArchiveManifestJson(root)
    expect(manifest.snapshots.map((s) => s.id).sort()).toEqual([id1, id2].sort())

    const again = await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest(vaultId, [snap(id1), snap(id2)]),
      referencedBlobs: [h1, h2],
    })
    expect(again.ok && again.unchanged).toBe(true)
  })

  it('rejects a manifest that references a missing blob, naming the file', async () => {
    const present = await putBlob('only-this')
    const absent = 'a'.repeat(64)
    const r = await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest('vault-ddd', [snap('66666666-6666-4666-8666-666666666666')]),
      referencedBlobs: [present, absent],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('missing-blobs')
    expect(r.detail).toContain(`blobs/${absent}.cvb`)
    expect(r.missingBlobs).toContain(`blobs/${absent}.cvb`)
    // Must not leave a published merged manifest behind.
    await expect(readArchiveManifestJson(root)).rejects.toThrow()
  })

  it('opens from .prev when the primary is zeroed', async () => {
    const h = await putBlob('prev-check')
    const vaultId = 'vault-eee'
    const id = '77777777-7777-4777-8777-777777777777'
    await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest(vaultId, [snap(id)]),
      referencedBlobs: [h],
    })
    // Second write creates .prev
    await applyMergedManifest({
      vaultRoot: root,
      incoming: baseManifest(vaultId, [snap(id), snap('88888888-8888-4888-8888-888888888888')]),
      referencedBlobs: [h],
    })

    const primary = join(root, 'manifest.cvb')
    const wrecked = await readFile(primary)
    await writeFile(primary, Buffer.alloc(wrecked.length))

    const { manifest, from } = await readArchiveManifestJson(root)
    expect(from).toBe('prev')
    expect(manifest.vaultId).toBe(vaultId)
    expect(manifest.snapshots.length).toBeGreaterThanOrEqual(1)
  })

  it('writeFileKeepingPrev is what vault and archive share', async () => {
    const file = join(root, 'probe.cvb')
    await writeFileKeepingPrev(file, Buffer.from('v1'))
    await writeFileKeepingPrev(file, Buffer.from('v2'))
    expect(await readFile(join(root, 'probe.cvb.prev'), 'utf8')).toBe('v1')
    expect(await readFile(file, 'utf8')).toBe('v2')
  })
})
