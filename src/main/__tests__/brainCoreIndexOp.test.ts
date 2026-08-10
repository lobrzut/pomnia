// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Index-pass timeout semantics.
 *
 * These lock in the fix for a flat 10 min wall clock that used to cap reindex.
 * At the ~158 ms/file measured against a local Ollama that cap failed outright
 * on any vault past ~3.8k notes, and because nothing cancelled the child, the
 * orphaned pass held its `busy` flag and bounced every retry until restart.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/pomnia-test', getAppPath: () => '/tmp/pomnia-test' },
  utilityProcess: { fork: vi.fn() },
}))

interface FakeChild {
  send(msg: unknown): void
  sent: unknown[]
  emit(m: unknown): void
}

function fakeChild(): FakeChild {
  const handlers = new Set<(m: unknown) => void>()
  const sent: unknown[] = []
  return {
    pid: 1,
    stderr: null,
    exitCode: null,
    killed: false,
    spawned: true,
    sent,
    send(msg: unknown) {
      sent.push(msg)
    },
    onMessage(h: (m: unknown) => void) {
      handlers.add(h)
    },
    offMessage(h: (m: unknown) => void) {
      handlers.delete(h)
    },
    onceExit() {},
    offExit() {},
    onceSpawn() {},
    softKill() {},
    emit(m: unknown) {
      for (const h of [...handlers]) h(m)
    },
  } as unknown as FakeChild
}

/** Manager with a child injected — start() would need a real fork. */
async function managerWithChild(): Promise<{ mgr: Record<string, never>; child: FakeChild }> {
  const { BrainCoreManager } = await import('../brainCore.js')
  const mgr = new BrainCoreManager()
  const child = fakeChild()
  Object.assign(mgr, { child, url: 'http://127.0.0.1:7862/mcp' })
  return { mgr: mgr as unknown as Record<string, never>, child }
}

type Mgr = {
  reindex(dir: string): Promise<unknown>
  cancelIndexing(): void
  status(): { indexing: boolean }
}

describe('index pass timeout is idle, not wall-clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('survives far past the old 10 min cap while progress keeps arriving', async () => {
    const { mgr, child } = await managerWithChild()
    const m = mgr as unknown as Mgr
    const p = m.reindex('C:/Vault')

    // 40 minutes of steady progress — quadruple the cap this replaced.
    for (let i = 0; i < 40; i += 1) {
      await vi.advanceTimersByTimeAsync(60_000)
      child.emit({ type: 'reindex-progress', file: `n${i}.md`, done: i, total: 40 })
    }
    child.emit({ type: 'reindexed', stats: { files: 40, chunks: 90 } })

    await expect(p).resolves.toEqual({ files: 40, chunks: 90 })
  })

  it('gives up when the child goes quiet, and cancels it before rejecting', async () => {
    const { mgr, child } = await managerWithChild()
    const m = mgr as unknown as Mgr
    const p = m.reindex('C:/Vault')
    const rejected = expect(p).rejects.toThrow(/stalled/)

    child.emit({ type: 'reindex-progress', file: 'a.md', done: 1, total: 9 })
    await vi.advanceTimersByTimeAsync(181_000)

    await rejected
    // Leaving the child running is what used to wedge every later attempt.
    expect(child.sent).toContainEqual({ type: 'cancel' })
  })

  it('releases the indexing flag so the next pass can start', async () => {
    const { mgr, child } = await managerWithChild()
    const m = mgr as unknown as Mgr
    const p = m.reindex('C:/Vault')
    expect(m.status().indexing).toBe(true)

    child.emit({ type: 'error', message: 'reindex aborted' })
    await expect(p).rejects.toThrow('reindex aborted')
    expect(m.status().indexing).toBe(false)
  })

  it('cancelIndexing asks the child to abort only while a pass is in flight', async () => {
    const { mgr, child } = await managerWithChild()
    const m = mgr as unknown as Mgr

    m.cancelIndexing()
    expect(child.sent).toHaveLength(0)

    const p = m.reindex('C:/Vault')
    m.cancelIndexing()
    expect(child.sent).toContainEqual({ type: 'cancel' })

    child.emit({ type: 'error', message: 'reindex aborted' })
    await expect(p).rejects.toThrow()
  })
})
