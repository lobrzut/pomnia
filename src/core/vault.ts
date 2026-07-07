/**
 * Pomnia vault — an encrypted, content-addressed, portable store.
 *
 * On-disk layout of `MyVault.pomnia/`:
 *   header.json              plaintext: format, vault id, KDF salt+params, check token
 *   manifest.cvb             encrypted VaultManifest (list of snapshots + stats)
 *   snapshots/<id>.cvb       encrypted SnapshotPayload (conversations + file index)
 *   blobs/<sha256>.cvb       encrypted file contents, deduplicated across snapshots
 *
 * The header holds NO secrets — only the salt and an encrypted check token used to
 * validate the passphrase at unlock. The folder is fully portable: copy it to any
 * OS and open with the same passphrase.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { CaptureItem, Conversation, Snapshot, VaultManifest } from './model.js'
import {
  CHECK_PLAINTEXT,
  DEFAULT_SCRYPT,
  decrypt,
  decryptJSON,
  deriveKey,
  encrypt,
  encryptJSON,
  newSalt,
  sha256,
  type ScryptParams
} from './crypto.js'
import { log } from './log.js'

interface VaultHeader {
  formatVersion: 1
  vaultId: string
  name: string
  createdAt: string
  kdf: { algo: 'scrypt'; salt: string } & ScryptParams
  check: string // base64 encrypted CHECK_PLAINTEXT
}

export interface SnapshotPayload {
  conversations: Conversation[]
  files: CaptureItem[]
}

/** Source of file bytes for a backup — read lazily so we don't hold everything in RAM. */
export interface FileSource {
  item: Omit<CaptureItem, 'sha256' | 'bytes'>
  read: () => Promise<Buffer>
  /** Incremental backup: if set, the blob already exists (unchanged file) — skip read+store. */
  reuse?: { sha256: string; bytes: number }
}

async function atomicWrite(file: string, data: Buffer): Promise<void> {
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, file)
}

export class Vault {
  private constructor(
    readonly dir: string,
    private header: VaultHeader,
    private key: Buffer,
    private manifest: VaultManifest
  ) {}

  private get manifestPath(): string {
    return path.join(this.dir, 'manifest.cvb')
  }
  private blobPath(sha: string): string {
    return path.join(this.dir, 'blobs', `${sha}.cvb`)
  }
  private snapshotPath(id: string): string {
    return path.join(this.dir, 'snapshots', `${id}.cvb`)
  }

  static async create(dir: string, name: string, passphrase: string): Promise<Vault> {
    if (
      await fs
        .access(path.join(dir, 'header.json'))
        .then(() => true)
        .catch(() => false)
    ) {
      throw new Error(`A vault already exists at ${dir}`)
    }
    await fs.mkdir(path.join(dir, 'blobs'), { recursive: true })
    await fs.mkdir(path.join(dir, 'snapshots'), { recursive: true })

    const salt = newSalt()
    const key = deriveKey(passphrase, salt, DEFAULT_SCRYPT)
    const header: VaultHeader = {
      formatVersion: 1,
      vaultId: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      kdf: { algo: 'scrypt', salt: salt.toString('base64'), ...DEFAULT_SCRYPT },
      check: encrypt(key, CHECK_PLAINTEXT).toString('base64')
    }
    const manifest: VaultManifest = {
      formatVersion: 1,
      vaultId: header.vaultId,
      createdAt: header.createdAt,
      name,
      snapshots: []
    }
    await atomicWrite(path.join(dir, 'header.json'), Buffer.from(JSON.stringify(header, null, 2)))
    const v = new Vault(dir, header, key, manifest)
    await v.saveManifest()
    log.info('created vault', name, 'at', dir)
    return v
  }

  static async open(dir: string, passphrase: string): Promise<Vault> {
    const header: VaultHeader = JSON.parse(
      await fs.readFile(path.join(dir, 'header.json'), 'utf8')
    )
    if (header.formatVersion !== 1) throw new Error(`Unsupported vault format ${header.formatVersion}`)
    const salt = Buffer.from(header.kdf.salt, 'base64')
    const key = deriveKey(passphrase, salt, header.kdf)
    // Validate passphrase via the check token.
    try {
      const got = decrypt(key, Buffer.from(header.check, 'base64'))
      if (!got.equals(CHECK_PLAINTEXT)) throw new Error('mismatch')
    } catch {
      throw new Error('Wrong passphrase')
    }
    const manifest = decryptJSON<VaultManifest>(
      key,
      await fs.readFile(path.join(dir, 'manifest.cvb'))
    )
    return new Vault(dir, header, key, manifest)
  }

  /** Quick check whether a directory is a Pomnia vault. */
  static async isVault(dir: string): Promise<boolean> {
    return fs
      .access(path.join(dir, 'header.json'))
      .then(() => true)
      .catch(() => false)
  }

  getManifest(): VaultManifest {
    return this.manifest
  }

  getSnapshotMeta(id: string): Snapshot | undefined {
    return this.manifest.snapshots.find((s) => s.id === id)
  }

  private async saveManifest(): Promise<void> {
    await atomicWrite(this.manifestPath, encryptJSON(this.key, this.manifest))
  }

  async writeBlob(data: Buffer): Promise<{ sha256: string; bytes: number }> {
    const sha = sha256(data)
    const p = this.blobPath(sha)
    // Content-addressed → if it exists, it's identical. Dedup for free.
    const exists = await fs
      .access(p)
      .then(() => true)
      .catch(() => false)
    if (!exists) await atomicWrite(p, encrypt(this.key, data))
    return { sha256: sha, bytes: data.length }
  }

  async readBlob(sha: string): Promise<Buffer> {
    return decrypt(this.key, await fs.readFile(this.blobPath(sha)))
  }

  /** Add a snapshot: stores file blobs (dedup), the payload, and updates the manifest. */
  async addSnapshot(
    meta: Snapshot,
    conversations: Conversation[],
    files: FileSource[]
  ): Promise<Snapshot> {
    const captured: CaptureItem[] = []
    let totalBytes = 0
    let skipped = 0
    for (const f of files) {
      try {
        let sha: string
        let bytes: number
        if (f.reuse) {
          // Unchanged file — blob already present in the vault, don't re-read or re-encrypt.
          sha = f.reuse.sha256
          bytes = f.reuse.bytes
        } else {
          let data: Buffer | undefined
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              data = await f.read()
              break
            } catch {
              if (attempt === 2) throw new Error('locked after retries')
              await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
            }
          }
          ;({ sha256: sha, bytes } = await this.writeBlob(data!))
        }
        captured.push({ ...f.item, sha256: sha, bytes })
        totalBytes += bytes
      } catch (e) {
        // Locked/unreadable file: skip it rather than aborting the whole backup.
        skipped++
        log.warn('backup skipped (locked/unreadable):', f.item.relPath, (e as Error).message)
      }
    }
    const payload: SnapshotPayload = { conversations, files: captured }
    await atomicWrite(this.snapshotPath(meta.id), encryptJSON(this.key, payload))

    const finalMeta: Snapshot = {
      ...meta,
      stats: {
        conversations: conversations.length,
        messages: conversations.reduce((n, c) => n + c.messages.length, 0),
        files: captured.length,
        bytes: totalBytes,
        skipped: skipped || undefined
      }
    }
    this.manifest.snapshots.unshift(finalMeta)
    await this.saveManifest()
    log.info('snapshot stored', finalMeta.id, finalMeta.source.label, `${captured.length} files`)
    return finalMeta
  }

  async getSnapshotPayload(id: string): Promise<SnapshotPayload> {
    return decryptJSON<SnapshotPayload>(this.key, await fs.readFile(this.snapshotPath(id)))
  }

  /** Remove a snapshot and garbage-collect blobs no longer referenced anywhere. */
  async removeSnapshot(id: string): Promise<void> {
    const payload = await this.getSnapshotPayload(id).catch(() => null)
    this.manifest.snapshots = this.manifest.snapshots.filter((s) => s.id !== id)
    await fs.rm(this.snapshotPath(id), { force: true })
    await this.saveManifest()
    if (!payload) return
    // GC: collect shas still referenced by remaining snapshots.
    const referenced = new Set<string>()
    for (const s of this.manifest.snapshots) {
      const p = await this.getSnapshotPayload(s.id).catch(() => null)
      p?.files.forEach((f) => referenced.add(f.sha256))
    }
    for (const f of payload.files) {
      if (!referenced.has(f.sha256)) await fs.rm(this.blobPath(f.sha256), { force: true })
    }
  }

  /** Verify every blob referenced by every snapshot decrypts and matches its hash. */
  async verify(): Promise<{ ok: boolean; checked: number; errors: string[] }> {
    const errors: string[] = []
    let checked = 0
    for (const s of this.manifest.snapshots) {
      const payload = await this.getSnapshotPayload(s.id).catch((e) => {
        errors.push(`snapshot ${s.id}: ${e.message}`)
        return null
      })
      if (!payload) continue
      for (const f of payload.files) {
        try {
          const data = await this.readBlob(f.sha256)
          if (sha256(data) !== f.sha256) errors.push(`${s.id}:${f.relPath} hash mismatch`)
          checked++
        } catch (e) {
          errors.push(`${s.id}:${f.relPath} ${(e as Error).message}`)
        }
      }
    }
    return { ok: errors.length === 0, checked, errors }
  }
}
