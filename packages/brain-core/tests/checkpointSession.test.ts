import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHECKPOINT_DISABLED_REFUSE,
  CHECKPOINT_EMPTY_REFUSE,
  hasCheckpointSubstance,
  runCheckpointSession,
} from '../src/mcp/tools/checkpointSession.js'
import { listTools } from '../src/mcp/tools/index.js'

describe('checkpoint_session quality gate', () => {
  it('rejects empty substance', () => {
    expect(hasCheckpointSubstance({})).toBe(false)
    expect(hasCheckpointSubstance({ decisions: ['  '], files_touched: [] })).toBe(false)
  })

  it('accepts any milestone signal', () => {
    expect(hasCheckpointSubstance({ decisions: ['use hybrid bridge'] })).toBe(true)
    expect(hasCheckpointSubstance({ files_touched: ['src/x.ts'] })).toBe(true)
    expect(hasCheckpointSubstance({ errors_seen: ['EADDRINUSE'] })).toBe(true)
    expect(hasCheckpointSubstance({ commands_run: ['npm test'] })).toBe(true)
  })
})

describe('runCheckpointSession', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  function vault(): string {
    const d = mkdtempSync(join(tmpdir(), 'pomnia-ckpt-'))
    dirs.push(d)
    return d
  }

  it('refuses when autoCheckpointEnabled is false', async () => {
    const r = await runCheckpointSession(
      {
        source: 'cursor',
        topic: 'test',
        summary: 'x',
        decisions: ['should not write'],
      },
      { vaultRoot: vault(), autoCheckpointEnabled: false },
    )
    expect(r.refused).toBe(true)
    expect(r.path).toBeNull()
    expect(r.text).toBe(CHECKPOINT_DISABLED_REFUSE)
  })

  it('refuses empty checkpoints', async () => {
    const r = await runCheckpointSession(
      { source: 'cursor', topic: 'empty', summary: 'no substance' },
      { vaultRoot: vault() },
    )
    expect(r.refused).toBe(true)
    expect(r.path).toBeNull()
    expect(r.text).toBe(CHECKPOINT_EMPTY_REFUSE)
  })

  it('writes under sessions/checkpoints with checkpoint markers', async () => {
    const root = vault()
    const r = await runCheckpointSession(
      {
        source: 'cursor',
        topic: 'hybrid bridge',
        summary: 'checkpoint_session decided',
        milestone: 'decision',
        decisions: ['hybrid: checkpoint vs save_conversation'],
        files_touched: ['packages/brain-core/src/mcp/tools/checkpointSession.ts'],
      },
      { vaultRoot: root },
    )
    expect(r.refused).toBe(false)
    expect(r.path).toBeTruthy()
    expect(r.path!.replace(/\\/g, '/')).toContain('/sessions/checkpoints/')
    const body = readFileSync(r.path!, 'utf8')
    expect(body).toContain('kind: checkpoint')
    expect(body).toContain('saved_via: mcp_checkpoint_session')
    expect(body).toContain('milestone: decision')
    expect(body).toContain('hybrid: checkpoint vs save_conversation')
  })
})

describe('listTools registration', () => {
  it('includes checkpoint_session', () => {
    const names = listTools().map((t) => t.name)
    expect(names).toContain('checkpoint_session')
    expect(names).toContain('save_conversation')
  })

  it('marks tool disabled when autoCheckpointEnabled is false', () => {
    const tool = listTools({ autoCheckpointEnabled: false }).find((t) => t.name === 'checkpoint_session')
    expect(tool?.description).toMatch(/^DISABLED/)
  })
})
