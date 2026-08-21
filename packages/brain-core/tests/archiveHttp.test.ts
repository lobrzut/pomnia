// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * End-to-end TOR B1 acceptance over real HTTP against createBrainServer.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config/index.js'
import { createBrainServer, type BrainServer } from '../src/mcp/server.js'
import { pushArchive, localArchiveBlobs } from '../src/archive/push.js'
import { sha256 } from '../src/archive/receive.js'

const PORT = 42000 + (process.pid % 4000)
const BASE = `http://127.0.0.1:${PORT}`
const ADMIN = 'btk_admin_for_archive_test'

let dir: string
let sourceRoot: string
let server: BrainServer

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-archive-http-'))
  const vault = join(dir, 'archive-target')
  await mkdir(vault, { recursive: true })
  sourceRoot = join(dir, 'source')
  await mkdir(join(sourceRoot, 'blobs'), { recursive: true })

  for (const label of ['alpha', 'beta', 'gamma']) {
    const content = Buffer.from(`payload-${label}-${'x'.repeat(64)}`)
    const hash = sha256(content)
    await writeFile(join(sourceRoot, 'blobs', `${hash}.cvb`), content)
  }
  await writeFile(join(sourceRoot, 'manifest.cvb'), Buffer.from('source-manifest-v1'))

  const tokensFile = join(dir, 'mcp-tokens.json')
  await writeFile(
    tokensFile,
    JSON.stringify([{ name: 'studio', token: ADMIN, role: 'admin' }]),
    'utf8',
  )

  const config = await loadConfig(
    [
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--data-dir',
      dir,
      '--vault-root',
      vault,
      '--tokens-file',
      tokensFile,
    ],
    {},
  )
  server = await createBrainServer(config)
  await server.start()
}, 30_000)

afterAll(async () => {
  await server?.stop().catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('TOR B1 archive HTTP', () => {
  it('fresh target receives all blobs, each hash-verified; manifest last', async () => {
    const local = await localArchiveBlobs(sourceRoot)
    expect(local.size).toBe(3)

    const first = await pushArchive({
      sourceRoot,
      baseUrl: BASE,
      token: ADMIN,
      sendManifest: true,
    })
    expect(first.sent).toBe(3)
    expect(first.bytesSent).toBeGreaterThan(0)
    expect(first.manifestSent).toBe(true)

    const hashesRes = await fetch(`${BASE}/archive/hashes`, {
      headers: { authorization: `Bearer ${ADMIN}` },
    })
    expect(hashesRes.status).toBe(200)
    const { hashes } = (await hashesRes.json()) as { hashes: string[] }
    expect(hashes.sort()).toEqual([...local.keys()].sort())

    const targetVault = join(dir, 'archive-target')
    expect(await readFile(join(targetVault, 'manifest.cvb'), 'utf8')).toBe('source-manifest-v1')
  })

  it('second run transfers zero bytes', async () => {
    const second = await pushArchive({
      sourceRoot,
      baseUrl: BASE,
      token: ADMIN,
      sendManifest: false,
    })
    expect(second.sent).toBe(0)
    expect(second.bytesSent).toBe(0)
    expect(second.skipped).toBe(3)
  })

  it('interrupted mid-way continues (resume)', async () => {
    const local = await localArchiveBlobs(sourceRoot)
    const one = [...local.keys()][0]
    const targetBlob = join(dir, 'archive-target', 'blobs', `${one}.cvb`)
    await rm(targetBlob, { force: true })

    const resume = await pushArchive({
      sourceRoot,
      baseUrl: BASE,
      token: ADMIN,
      sendManifest: false,
    })
    expect(resume.sent).toBe(1)
    expect(resume.bytesSent).toBe(local.get(one)!.bytes)
    expect(resume.skipped).toBe(2)
  })

  it('corrupt blob is rejected with filename in the body', async () => {
    const fakeHash = 'c'.repeat(64)
    const res = await fetch(`${BASE}/archive/blob/${fakeHash}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ADMIN}`,
        'content-type': 'application/octet-stream',
      },
      body: Buffer.from('not-matching-content'),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      ok?: boolean
      path?: string
      reason?: string
      detail?: string
    }
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('hash-mismatch')
    expect(body.path).toBe(`blobs/${fakeHash}.cvb`)
    expect(body.detail).toContain(`blobs/${fakeHash}.cvb`)
  })
})
