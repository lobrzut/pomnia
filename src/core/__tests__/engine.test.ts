import { describe, expect, it, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deriveKey, encrypt, decrypt, newSalt, sha256 } from '../crypto.js'
import { encodeClaudeProject, remapClaudeProject, remapTextPaths, type HostContext } from '../pathmap.js'
import { Vault, type FileSource } from '../vault.js'
import type { Snapshot } from '../model.js'

const tmpDirs: string[] = []
afterAll(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true })
})

describe('crypto', () => {
  it('round-trips and rejects the wrong key', () => {
    const salt = newSalt()
    const key = deriveKey('correct horse battery staple', salt)
    const blob = encrypt(key, Buffer.from('top secret 🔐'))
    expect(decrypt(key, blob).toString()).toBe('top secret 🔐')
    const wrong = deriveKey('nope', salt)
    expect(() => decrypt(wrong, blob)).toThrow()
  })
})

describe('pathmap — cross-platform', () => {
  it('replicates Claude Code project-dir encoding', () => {
    expect(encodeClaudeProject('C:\\Users\\Admin\\PROJEKTY')).toBe('C--Users-Admin-PROJEKTY')
    expect(encodeClaudeProject('/Users/jane/PROJEKTY')).toBe('-Users-jane-PROJEKTY')
  })

  it('remaps a Windows project dir to a macOS home', () => {
    const origin: HostContext = { os: 'win32', home: 'C:\\Users\\Admin', user: 'Admin' }
    const target: HostContext = { os: 'darwin', home: '/Users/jane', user: 'jane' }
    const enc = encodeClaudeProject('C:\\Users\\Admin\\PROJEKTY')
    const { encoded, confident } = remapClaudeProject(enc, origin, target)
    expect(confident).toBe(true)
    expect(encoded).toBe('-Users-jane-PROJEKTY')
  })

  it('rewrites absolute home paths inside a config across separators', () => {
    const origin: HostContext = { os: 'win32', home: 'C:\\Users\\Admin', user: 'Admin' }
    const target: HostContext = { os: 'darwin', home: '/Users/jane', user: 'jane' }
    const cfg = JSON.stringify({ path: 'C:\\Users\\Admin\\.claude', alt: 'C:/Users/Alice/x' })
    const { text, changed } = remapTextPaths(cfg, origin, target)
    expect(changed).toBe(true)
    expect(text).toContain('/Users/jane')
    expect(text).not.toContain('Admin')
  })
})

describe('vault — encrypted, content-addressed', () => {
  it('creates, stores, verifies, dedupes and restores a snapshot', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-test-'))
    tmpDirs.push(dir)
    const vaultDir = path.join(dir, 'v.continuum')

    const vault = await Vault.create(vaultDir, 'Test', 'pw-123')
    const payload = Buffer.from('hello vault')
    const files: FileSource[] = [
      { item: { relPath: 'a.txt', absRoot: '/src', pathSensitive: false }, read: async () => payload },
      // identical content → should dedupe to one blob
      { item: { relPath: 'b.txt', absRoot: '/src', pathSensitive: false }, read: async () => payload }
    ]
    const meta: Snapshot = {
      id: 'snap-1',
      createdAt: new Date().toISOString(),
      source: { id: 'generic', label: 'Test', strategy: 'snapshot', root: '/src', os: 'linux' },
      origin: { host: 'h', user: 'u', home: '/home/u' },
      stats: { conversations: 0, messages: 0, files: 0, bytes: 0 }
    }
    const stored = await vault.addSnapshot(meta, [], files)
    expect(stored.stats.files).toBe(2)

    // Dedup: two identical files → a single blob on disk.
    const blobs = await fs.readdir(path.join(vaultDir, 'blobs'))
    expect(blobs.length).toBe(1)
    expect(blobs[0]).toBe(`${sha256(payload)}.cvb`)

    const v = await vault.verify()
    expect(v.ok).toBe(true)

    // Reopen with correct + wrong passphrase.
    const reopened = await Vault.open(vaultDir, 'pw-123')
    expect(reopened.getManifest().snapshots.length).toBe(1)
    await expect(Vault.open(vaultDir, 'wrong')).rejects.toThrow(/passphrase/i)

    const got = await reopened.getSnapshotPayload('snap-1')
    expect((await reopened.readBlob(got.files[0].sha256)).toString()).toBe('hello vault')
  })
})
