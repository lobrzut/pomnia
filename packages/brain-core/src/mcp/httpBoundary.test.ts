// SPDX-License-Identifier: AGPL-3.0-only
/**
 * HTTP listener proofs for Host/Origin (F01), MCP body cap (F14), bad cookie (F17).
 * Unit tests cover helpers; this hits createBrainServer like the audit probes.
 */
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../config/index.js'
import { createBrainServer, type BrainServer } from './server.js'
import { MAX_FILE_BYTES } from '../sync/paths.js'

function call(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: body !== undefined ? 'POST' : 'GET',
        headers,
      },
      (res) => {
        let b = ''
        res.on('data', (c) => {
          b += c
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }))
      },
    )
    r.on('error', reject)
    r.setTimeout(15_000, () => r.destroy(new Error('timeout')))
    r.end(body)
  })
}

describe('HTTP request boundaries (F01/F14/F17)', () => {
  let dir: string
  let server: BrainServer
  let port: number

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pomnia-http-bound-'))
    port = 43000 + (process.pid % 1000) + Math.floor(Math.random() * 200)
    const vault = join(dir, 'vault')
    await mkdir(vault, { recursive: true })
    const config = await loadConfig(
      ['--host', '127.0.0.1', '--port', String(port), '--data-dir', dir, '--vault-root', vault],
      {},
    )
    server = await createBrainServer(config)
    await server.start()
  }, 30_000)

  afterEach(async () => {
    await server.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects foreign Host+Origin on admin before the handler (F01)', async () => {
    const r = await call(port, '/admin/behaviour', {
      host: 'audit.invalid',
      origin: 'http://audit.invalid',
    })
    expect(r.status).toBe(403)
    expect(r.body).toMatch(/bad_host|bad_origin|forbidden/)
  })

  it('rejects foreign Host+Origin on MCP (F01)', async () => {
    const r = await call(
      port,
      '/mcp',
      {
        host: 'audit.invalid',
        origin: 'http://audit.invalid',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    )
    expect(r.status).toBe(403)
  })

  it('allows a local Host without Origin (MCP clients)', async () => {
    const r = await call(port, '/admin/behaviour', { host: `127.0.0.1:${port}` })
    expect(r.status).toBe(200)
  })

  it('returns no session for a malformed cookie instead of 500 (F17)', async () => {
    const r = await call(port, '/admin/me', {
      host: `127.0.0.1:${port}`,
      cookie: 'pomnia_sid=%ZZ',
    })
    expect(r.status).not.toBe(500)
    expect([400, 401]).toContain(r.status)
  })

  it('returns 413 when the MCP body exceeds the stream limit (F14)', async () => {
    const oversized = 'x'.repeat(MAX_FILE_BYTES * 2 + 1024)
    const r = await call(
      port,
      '/mcp',
      {
        host: `127.0.0.1:${port}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'content-length': String(oversized.length),
      },
      oversized,
    )
    expect(r.status).toBe(413)
  }, 60_000)
})
