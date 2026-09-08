import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Vault } from '../vault.js'

const PASS = 'test-passphrase-not-a-real-one'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-vault-lock-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function keyBuf(v: Vault): Buffer {
  return (v as unknown as { key: Buffer }).key
}

describe('Vault.lock (F13)', () => {
  it('zeros the derived key and rejects further crypto', async () => {
    const v = await Vault.create(dir, 'LockTest', PASS)
    await v.writeBlob(Buffer.from('before-lock'))
    expect(v.isLocked()).toBe(false)
    expect(keyBuf(v).some((b) => b !== 0)).toBe(true)

    v.lock()
    expect(v.isLocked()).toBe(true)
    expect(keyBuf(v).every((b) => b === 0)).toBe(true)

    expect(() => v.getManifest()).toThrow(/Vault is locked/)
    await expect(v.writeBlob(Buffer.from('after'))).rejects.toThrow(/Vault is locked/)
    await expect(v.verify()).rejects.toThrow(/Vault is locked/)
  })

  it('is idempotent', async () => {
    const v = await Vault.create(dir, 'LockTwice', PASS)
    v.lock()
    v.lock()
    expect(v.isLocked()).toBe(true)
    expect(keyBuf(v).every((b) => b === 0)).toBe(true)
  })

  it('fails a write started after lock during a slow import-like read', async () => {
    const v = await Vault.create(dir, 'LockMidOp', PASS)
    let releaseRead!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve
    })

    const pending = v.addSnapshot(
      {
        id: 'snap-mid',
        createdAt: new Date().toISOString(),
        source: {
          id: 'generic',
          label: 'test',
          strategy: 'snapshot',
          root: dir,
          os: 'windows',
        },
        note: 'mid-lock',
        stats: { conversations: 0, messages: 0, files: 0, bytes: 0 },
        origin: { host: 'test', user: 'test', home: dir },
      },
      [],
      [
        {
          item: {
            relPath: 'slow.txt',
            absRoot: dir,
            bytes: 0,
            sha256: '',
          },
          read: async () => {
            await gate
            return Buffer.from('data')
          },
        },
      ],
    )

    // Lock while the file read is still waiting — payload write must refuse.
    v.lock()
    releaseRead()

    await expect(pending).rejects.toThrow(/Vault is locked/)
    expect(v.isLocked()).toBe(true)
  })
})
