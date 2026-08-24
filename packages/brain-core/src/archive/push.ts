// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Source-side archive push (TOR B1).
 *
 * Protocol:
 *   1. GET  /archive/hashes     — target lists what it has
 *   2. POST /archive/blob/:hash — send missing (raw body, Content-Type: application/octet-stream)
 *   3. PUT  /archive/manifest   — opaque manifest.cvb LAST (optional)
 *
 * Hash identity is sha256 of the on-disk file bytes (content-addressed archive
 * key). Vault plaintext-hash filenames may differ; the push client re-keys by
 * file content so the target can verify name === sha256(bytes).
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { BLOB_HASH_RE, MAX_BLOB_BYTES } from './paths.js'
import { listBlobHashes, missingHashes, sha256 } from './receive.js'

export interface ArchivePushOptions {
  /** Local vault (or archive) root containing blobs/ and optional manifest.cvb. */
  sourceRoot: string
  /** brain-core base URL, e.g. http://192.168.1.150:7862 */
  baseUrl: string
  token: string
  /** When true, PUT manifest.cvb after every blob has been accepted. */
  sendManifest?: boolean
  fetchImpl?: typeof fetch
}

export interface ArchivePushResult {
  remoteHad: number
  localBlobs: number
  sent: number
  bytesSent: number
  skipped: number
  manifestSent: boolean
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

/**
 * Enumerate local blob files and return map hash→absolute path.
 *
 * Uses sha256(file bytes) as the archive key (may differ from the vault's
 * plaintext-hash filename).
 */
export async function localArchiveBlobs(
  sourceRoot: string,
): Promise<Map<string, { abs: string; bytes: number }>> {
  const dir = join(sourceRoot, 'blobs')
  const out = new Map<string, { abs: string; bytes: number }>()
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (!name.endsWith('.cvb')) continue
    if (name.includes('.partial') || name.endsWith('.tmp')) continue
    const abs = join(dir, name)
    const st = await fs.stat(abs)
    if (!st.isFile()) continue
    if (st.size > MAX_BLOB_BYTES) {
      throw new Error(`blob too large: ${name} (${st.size} bytes)`)
    }
    const content = await fs.readFile(abs)
    const hash = sha256(content)
    out.set(hash, { abs, bytes: content.length })
  }
  return out
}

/** Push missing blobs (then optional manifest) to an archive target. */
export async function pushArchive(opts: ArchivePushOptions): Promise<ArchivePushResult> {
  const fetchFn = opts.fetchImpl ?? fetch
  const base = opts.baseUrl.replace(/\/$/, '')
  const auth = { authorization: `Bearer ${opts.token}` }

  const hashesRes = await fetchFn(`${base}/archive/hashes`, {
    method: 'GET',
    headers: { ...auth },
  })
  if (!hashesRes.ok) {
    const body = await readBody(hashesRes)
    throw new Error(`archive/hashes failed: HTTP ${hashesRes.status} ${JSON.stringify(body)}`)
  }
  const hashesBody = (await hashesRes.json()) as { hashes?: string[] }
  if (!Array.isArray(hashesBody.hashes)) {
    throw new Error('archive/hashes: missing hashes array')
  }
  const remote = new Set(
    hashesBody.hashes.filter((h): h is string => typeof h === 'string' && BLOB_HASH_RE.test(h)),
  )

  const local = await localArchiveBlobs(opts.sourceRoot)
  const localHashes = [...local.keys()].sort()
  const need = missingHashes(localHashes, remote)

  let bytesSent = 0
  let sent = 0
  let skipped = localHashes.length - need.length

  for (const hash of need) {
    const meta = local.get(hash)!
    const content = await fs.readFile(meta.abs)
    if (sha256(content) !== hash) {
      throw new Error(`local blob changed underfoot: ${meta.abs}`)
    }
    const res = await fetchFn(`${base}/archive/blob/${hash}`, {
      method: 'POST',
      headers: {
        ...auth,
        'content-type': 'application/octet-stream',
        'content-length': String(content.length),
      },
      body: content,
    })
    const body = (await readBody(res)) as {
      ok?: boolean
      skipped?: boolean
      bytes?: number
      path?: string
      reason?: string
      detail?: string
    }
    if (!res.ok || body.ok === false) {
      const path = body.path ?? `blobs/${hash}.cvb`
      throw new Error(
        `archive blob rejected: ${path}` +
          (body.reason ? ` (${body.reason})` : '') +
          (body.detail ? ` — ${body.detail}` : ''),
      )
    }
    if (body.skipped) skipped++
    else {
      sent++
      bytesSent += typeof body.bytes === 'number' ? body.bytes : content.length
    }
  }

  let manifestSent = false
  if (opts.sendManifest) {
    const manifestPath = join(opts.sourceRoot, 'manifest.cvb')
    try {
      const content = await fs.readFile(manifestPath)
      const res = await fetchFn(`${base}/archive/manifest`, {
        method: 'PUT',
        headers: {
          ...auth,
          'content-type': 'application/octet-stream',
          'content-length': String(content.length),
        },
        body: content,
      })
      const body = await readBody(res)
      if (!res.ok) {
        throw new Error(`archive/manifest failed: HTTP ${res.status} ${JSON.stringify(body)}`)
      }
      manifestSent = true
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        // No local manifest — fine for blob-only archive.
      } else {
        throw e
      }
    }
  }

  return {
    remoteHad: remote.size,
    localBlobs: localHashes.length,
    sent,
    bytesSent,
    skipped,
    manifestSent,
  }
}

/** Convenience: hashes already on disk under sourceRoot/blobs (filename stems). */
export async function listLocalFilenameHashes(sourceRoot: string): Promise<string[]> {
  return listBlobHashes(sourceRoot)
}
