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
    expect(encodeClaudeProject('C:\\Users\\Alice\\PROJEKTY')).toBe('C--Users-Alice-PROJEKTY')
    expect(encodeClaudeProject('/Users/jane/PROJEKTY')).toBe('-Users-jane-PROJEKTY')
  })

  it('remaps a Windows project dir to a macOS home', () => {
    const origin: HostContext = { os: 'win32', home: 'C:\\Users\\Alice', user: 'Alice' }
    const target: HostContext = { os: 'darwin', home: '/Users/jane', user: 'jane' }
    const enc = encodeClaudeProject('C:\\Users\\Alice\\PROJEKTY')
    const { encoded, confident } = remapClaudeProject(enc, origin, target)
    expect(confident).toBe(true)
    expect(encoded).toBe('-Users-jane-PROJEKTY')
  })

  it('rewrites absolute home paths inside a config across separators', () => {
    const origin: HostContext = { os: 'win32', home: 'C:\\Users\\Alice', user: 'Alice' }
    const target: HostContext = { os: 'darwin', home: '/Users/jane', user: 'jane' }
    const cfg = JSON.stringify({ path: 'C:\\Users\\Alice\\.claude', alt: 'C:/Users/Alice/x' })
    const { text, changed } = remapTextPaths(cfg, origin, target)
    expect(changed).toBe(true)
    expect(text).toContain('/Users/jane')
    expect(text).not.toContain('Alice')
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

  it('stores library documents as encrypted blobs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-lib-'))
    tmpDirs.push(dir)
    const vaultDir = path.join(dir, 'v.continuum')

    const vault = await Vault.create(vaultDir, 'Lib', 'pw-lib')
    const source = Buffer.from('%PDF-1.4 fake pdf content for test')
    const extracted = Buffer.from('---\nformat: pdf\n---\n\nHello document')
    const doc = await vault.addLibraryDocument(
      {
        id: 'deadbeef_report.pdf',
        originalName: 'report.pdf',
        format: 'pdf',
        contentSha: sha256(source),
        pages: 1,
        sparse: false,
        extractionPath: 'unpdf',
        importedAt: new Date().toISOString()
      },
      source,
      extracted
    )
    expect(doc.sourceBlobSha).toBe(sha256(source))
    expect(vault.getLibraryManifest().documents).toHaveLength(1)

    const reopened = await Vault.open(vaultDir, 'pw-lib')
    const got = reopened.getLibraryDocument('deadbeef_report.pdf')
    expect(got?.originalName).toBe('report.pdf')
    expect((await reopened.readLibrarySource('deadbeef_report.pdf')).toString()).toBe(source.toString())
    expect((await reopened.readLibraryExtracted('deadbeef_report.pdf')).toString()).toBe(extracted.toString())
  })

  it('tracks pending library index in manifest', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-pending-'))
    tmpDirs.push(dir)
    const vaultDir = path.join(dir, 'v.pending')

    const vault = await Vault.create(vaultDir, 'Pending', 'pw-pend')
    const source = Buffer.from('hello pending doc')
    const extracted = Buffer.from('---\nformat: txt\n---\n\nHello')
    await vault.addLibraryDocument(
      {
        id: 'abc_note.txt',
        originalName: 'note.txt',
        format: 'txt',
        contentSha: sha256(source),
        pages: 1,
        sparse: false,
        extractionPath: 'passthrough',
        importedAt: new Date().toISOString(),
        pendingIndex: true,
      },
      source,
      extracted
    )
    expect(vault.getPendingIndexDocuments()).toHaveLength(1)

    await vault.markLibraryDocIndexed('abc_note.txt')
    expect(vault.getPendingIndexDocuments()).toHaveLength(0)
    expect(vault.getLibraryDocument('abc_note.txt')?.indexedAt).toBeTruthy()

    const reopened = await Vault.open(vaultDir, 'pw-pend')
    expect(reopened.getPendingIndexDocuments()).toHaveLength(0)
    expect(reopened.getLibraryDocument('abc_note.txt')?.indexedAt).toBeTruthy()
  })
})
