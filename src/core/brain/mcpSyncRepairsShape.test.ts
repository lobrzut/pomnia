import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { syncManagedMcpConfigs } from './mcpSync.js'

/**
 * The failure these exist for: an entry written by an older build kept the
 * right address and the wrong everything else — `command: "npx"` and a
 * `--header "Authorization: Bearer …"` carrying a space, the two Windows faults
 * fixed in 0.1.71. Sync skipped whenever the URL already matched, so every
 * later version looked at that entry, agreed about the address, and left the
 * break in place. Upgrading could not repair it.
 */
describe('syncManagedMcpConfigs — repairs the block, not just the address', () => {
  let home: string
  const BRAIN = 'http://192.168.1.248:7865'

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'pomnia-mcpsync-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  const cursorPath = () => join(home, '.cursor', 'mcp.json')

  async function writeCursor(entry: unknown): Promise<void> {
    await writeFile(cursorPath(), JSON.stringify({ mcpServers: { pomnia: entry } }, null, 2), {
      encoding: 'utf8',
    }).catch(async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(home, '.cursor'), { recursive: true })
      await writeFile(cursorPath(), JSON.stringify({ mcpServers: { pomnia: entry } }, null, 2), 'utf8')
    })
  }

  async function readCursor(): Promise<Record<string, unknown>> {
    const j = JSON.parse(await readFile(cursorPath(), 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    return j.mcpServers.pomnia
  }

  it('rewrites an entry whose URL is right and whose token is missing', async () => {
    await writeCursor({ url: `${BRAIN}/mcp` })
    const r = await syncManagedMcpConfigs({ brainUrl: BRAIN, target: 'remote', token: 'btk_x', os: 'win32', home })
    expect(r.updated.some((u) => u.id === 'cursor')).toBe(true)
    expect(JSON.stringify(await readCursor())).toContain('btk_x')
  })

  it('leaves an entry alone when it already says exactly the right thing', async () => {
    await writeCursor({ url: `${BRAIN}/mcp` })
    await syncManagedMcpConfigs({ brainUrl: BRAIN, target: 'remote', token: 'btk_x', os: 'win32', home })
    const second = await syncManagedMcpConfigs({ brainUrl: BRAIN, target: 'remote', token: 'btk_x', os: 'win32', home })
    expect(second.updated).toEqual([])
    expect(second.skipped.some((s) => s.reason === 'already correct')).toBe(true)
  })

  it('still rewrites when the address itself changed', async () => {
    await writeCursor({ url: 'http://192.168.1.99:7865/mcp', headers: { Authorization: 'Bearer btk_x' } })
    const r = await syncManagedMcpConfigs({ brainUrl: BRAIN, target: 'remote', token: 'btk_x', os: 'win32', home })
    expect(r.updated.some((u) => u.id === 'cursor')).toBe(true)
    expect(JSON.stringify(await readCursor())).toContain('192.168.1.248')
  })

  it('does not touch servers that are not ours', async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(home, '.cursor'), { recursive: true })
    await writeFile(
      cursorPath(),
      JSON.stringify({ mcpServers: { pomnia: { url: `${BRAIN}/mcp` }, other: { url: 'http://x/y' } } }, null, 2),
      'utf8',
    )
    await syncManagedMcpConfigs({ brainUrl: BRAIN, target: 'remote', token: 'btk_x', os: 'win32', home })
    const j = JSON.parse(await readFile(cursorPath(), 'utf8')) as {
      mcpServers: Record<string, { url?: string }>
    }
    expect(j.mcpServers.other.url).toBe('http://x/y')
  })
})
