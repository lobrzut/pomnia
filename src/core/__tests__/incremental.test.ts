import { describe, expect, it, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Vault, type FileSource } from '../vault.js'
import type { Snapshot } from '../model.js'

const tmpDirs: string[] = []
afterAll(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true })
})

function meta(id: string): Snapshot {
  return {
    id,
    createdAt: new Date().toISOString(),
    source: { id: 'vscode', label: 'VS Code', strategy: 'snapshot', root: '/x', os: 'linux' },
    origin: { host: 'h', user: 'u', home: '/home/u' },
    stats: { conversations: 0, messages: 0, files: 0, bytes: 0 }
  }
}

describe('incremental backup', () => {
  it('reuses an existing blob without re-reading the file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-inc-'))
    tmpDirs.push(dir)
    const vault = await Vault.create(path.join(dir, 'v.continuum'), 'Inc', 'pw')
    const data = Buffer.from('settings v1')

    // First snapshot: real read + store.
    const s1 = await vault.addSnapshot(meta('s1'), [], [
      { item: { relPath: 'settings.json', absRoot: '/x' }, read: async () => data }
    ])
    const sha = (await vault.getSnapshotPayload('s1')).files[0].sha256
    const blobsAfter1 = (await fs.readdir(path.join(dir, 'v.continuum', 'blobs'))).length
    expect(s1.stats.files).toBe(1)
    expect(blobsAfter1).toBe(1)

    // Second snapshot: file unchanged → reuse blob, read() must NOT be called.
    let readCalled = false
    const reuseSrc: FileSource = {
      item: { relPath: 'settings.json', absRoot: '/x' },
      reuse: { sha256: sha, bytes: data.length },
      read: async () => {
        readCalled = true
        throw new Error('read should not be called for a reused file')
      }
    }
    const s2 = await vault.addSnapshot(meta('s2'), [], [reuseSrc])

    expect(readCalled).toBe(false)
    expect(s2.stats.files).toBe(1)
    expect(s2.stats.bytes).toBe(data.length)
    // No new blob created — still exactly one (content-addressed + reuse).
    expect((await fs.readdir(path.join(dir, 'v.continuum', 'blobs'))).length).toBe(1)
    // And the reused snapshot still restores the right bytes.
    expect((await vault.readBlob(sha)).toString()).toBe('settings v1')
  })
})
