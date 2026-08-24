import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config/index.js'
import { createToken } from '../src/admin/tokens.js'
import { createBrainServer, type BrainServer } from '../src/mcp/server.js'

/**
 * Does a Pomnia nobody has a desktop for actually hold and return a memory?
 *
 * That is the claim the Linux build makes to anyone who installs it, and until
 * now nothing checked it. The server was deployed read-only on purpose — the
 * desktop owned the vault and this host was a search mirror — so "self-hosted"
 * meant "self-hosted half of it". This walks the whole loop on a vault that
 * starts empty, the way a stranger's does:
 *
 *   empty vault → server claims it → agent saves over MCP → file on disk →
 *   index → search finds the words back
 *
 * Search needs an embedder. Where Ollama is absent the run still proves
 * everything up to it rather than skipping the file wholesale — a machine
 * without Ollama is a real deployment, and the write path has to work there too.
 */

const PORT = 45000 + (process.pid % 3000)
const BASE = `http://127.0.0.1:${PORT}`
const OLLAMA = process.env.OLLAMA_TEST_URL ?? 'http://127.0.0.1:11434'

let dir: string
let vault: string
let server: BrainServer
let agentToken = ''
let adminToken = ''
let embedderReady = false

const NEEDLE = 'kernel regression stop uses an ATR band, never repainting'

/** One MCP call. Stateless transport answers as SSE, so the payload is a data: line. */
async function mcp(method: string, params: unknown, token: string): Promise<unknown> {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await r.text()
  const line = text.split('\n').find((l) => l.startsWith('data:'))
  const raw = line ? line.slice(5).trim() : text
  try {
    return JSON.parse(raw)
  } catch {
    return { parseFailed: true, status: r.status, text: text.slice(0, 400) }
  }
}

const callTool = (name: string, args: unknown, token: string): Promise<unknown> =>
  mcp('tools/call', { name, arguments: args }, token)

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-selfhost-'))
  vault = join(dir, 'vault')
  // Empty, like a fresh install. No seeded notes, no marker, no owner.
  await mkdir(vault, { recursive: true })

  const tokensFile = join(dir, 'mcp-tokens.json')
  // Through the real code path install.sh uses, not a hand-written file.
  const agent = await createToken(tokensFile, { name: 'laptop-agent', role: 'agent' })
  const admin = await createToken(tokensFile, { name: 'studio', role: 'admin' })
  if (!agent.ok || !admin.ok) throw new Error('token creation failed')
  agentToken = agent.token
  adminToken = admin.token

  try {
    const probe = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const body = (await probe.json()) as { models?: { name?: string }[] }
    embedderReady = (body.models ?? []).some((m) => (m.name ?? '').startsWith('nomic-embed-text'))
  } catch {
    embedderReady = false
  }

  const config = await loadConfig(
    [
      '--host', '0.0.0.0',
      '--port', String(PORT),
      '--data-dir', dir,
      '--vault-root', vault,
      '--tokens-file', tokensFile,
      '--ollama-url', OLLAMA,
      '--instance-label', 'pomnia-selfhost-test',
    ],
    {},
  )
  server = await createBrainServer(config)
  await server.start()
}, 60_000)

afterAll(async () => {
  await server?.stop().catch(() => {})
  await rm(dir, { recursive: true, force: true })
})

describe('a server with no desktop behind it', () => {
  it('claims the empty vault and reports itself writable', async () => {
    const r = await fetch(`${BASE}/healthz`)
    const body = (await r.json()) as { service?: string; writable?: boolean; vaultOwner?: string }
    expect(body.service).toBe('brain-core')
    expect(body.writable).toBe(true)
    expect(body.vaultOwner).toContain('pomnia-selfhost-test')
  })

  it('records the claim in the vault, where the next process will read it', async () => {
    const state = await readdir(join(vault, 'state')).catch(() => [] as string[])
    expect(state).toContain('vault-writer.json')
  })

  it('offers the write tools without a read-only warning on them', async () => {
    const res = (await mcp('tools/list', {}, agentToken)) as {
      result?: { tools?: { name: string; description: string }[] }
    }
    const tools = res.result?.tools ?? []
    expect(tools.map((t) => t.name)).toContain('save_conversation')
    const save = tools.find((t) => t.name === 'save_conversation')!
    expect(save.description).not.toContain('READ-ONLY')
  })
})

describe('an agent saves a memory and gets it back', () => {
  it('accepts save_conversation from an ordinary agent token', async () => {
    const res = (await callTool(
      'save_conversation',
      {
        source: 'claude-code',
        topic: 'Non-repainting ATR stop',
        summary: NEEDLE,
        decisions: ['ATR band, evaluated on bar close only'],
      },
      agentToken,
    )) as { result?: { isError?: boolean; content?: { text?: string }[] }; error?: unknown }
    expect(res.error).toBeUndefined()
    expect(res.result?.isError).not.toBe(true)
  })

  /** The counter that has to move: a file, on disk, in the vault. */
  it('leaves a real file in the vault rather than reporting success', async () => {
    const sessions = await readdir(join(vault, 'sessions')).catch(() => [] as string[])
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.some((f) => f.endsWith('.md'))).toBe(true)
  })

  it('indexes what it was given', async () => {
    if (!embedderReady) return
    const r = await fetch(`${BASE}/sync/reindex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: '{}',
    })
    expect([200, 202]).toContain(r.status)

    // Indexing runs in the background; wait for the count to move rather than
    // for a fixed sleep, and fail with the count if it never does.
    let files = 0
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 500))
      const h = await fetch(`${BASE}/healthz`, { headers: { authorization: `Bearer ${adminToken}` } })
      const body = (await h.json()) as { index?: { files?: number } | null }
      files = body.index?.files ?? 0
      if (files > 0) break
    }
    expect(files, 'the index never saw the note the agent saved').toBeGreaterThan(0)
  }, 45_000)

  it('finds the words back through search_library', async () => {
    if (!embedderReady) return
    const res = (await callTool(
      'search_library',
      { query: 'ATR stop repainting', top_k: 5 },
      agentToken,
    )) as { result?: { content?: { text?: string }[] } }
    const text = res.result?.content?.map((c) => c.text ?? '').join('\n') ?? ''
    expect(text).toMatch(/ATR/i)
  }, 30_000)
})

describe('what the operator is told', () => {
  /**
   * Both branches, because both are real deployments and the interesting claim
   * is the same either way: the verdict describes whether this server can
   * actually answer a search, not whether the process is alive.
   *
   * CI has no Ollama and caught this — the first version asserted `ok: true`
   * unconditionally and failed on a machine shaped exactly like a plain VPS.
   * A server with no embedder reporting healthy would be the bug; saying "down"
   * is the feature.
   */
  it('tells the truth about whether it can serve search', async () => {
    const r = await fetch(`${BASE}/healthz`, { headers: { authorization: `Bearer ${adminToken}` } })
    const body = (await r.json()) as {
      ok?: boolean
      uptimeSec?: number
      checks?: { ollama?: { state?: string } }
    }
    if (embedderReady) {
      expect(body.ok).toBe(true)
      expect(body.checks?.ollama?.state).toBe('ok')
    } else {
      expect(body.ok).toBe(false)
      expect(body.checks?.ollama?.state, 'no embedder, yet Ollama reported ok').not.toBe('ok')
    }
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0)
  })

  it('serves the login panel at /, not the public status page', async () => {
    const r = await fetch(`${BASE}/`)
    const html = await r.text()
    expect(r.status).toBe(200)
    expect(html).toMatch(/login|Zaloguj|Sign in/i)
    expect(html).not.toMatch(/Not serving|Operational/)
  })

  it('serves the public status page at /status without a token', async () => {
    const r = await fetch(`${BASE}/status`)
    const html = await r.text()
    expect(r.status).toBe(200)
    // The page renamed itself to the product; this assertion did not follow and
    // had been red on the branch before anyone noticed. The rename is still
    // partial — the MCP handshake and /healthz `service` both answer
    // "brain-core" — so this deliberately pins the page only.
    expect(html).toContain('Pomnia')
  })
})
