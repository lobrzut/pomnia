// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Serialize read-modify-write on a shared store.
 *
 * An in-process queue alone is not enough: the daemon and a CLI share the same
 * tokens/users files across processes. An exclusive lockfile covers that; the
 * promise chain covers concurrent awaits inside one process.
 */

import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

const queues = new Map<string, Promise<unknown>>()

const STALE_MS = 60_000

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function acquireFileLock(lockPath: string, timeoutMs = 30_000): Promise<void> {
  await fs.mkdir(dirname(lockPath), { recursive: true })
  const started = Date.now()
  for (;;) {
    try {
      const fh = await fs.open(lockPath, 'wx')
      try {
        await fh.writeFile(`${process.pid}\n${Date.now()}\n`)
      } finally {
        await fh.close()
      }
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      try {
        const st = await fs.stat(lockPath)
        if (Date.now() - st.mtimeMs > STALE_MS) {
          await fs.unlink(lockPath).catch(() => {})
          continue
        }
      } catch {
        // raced with unlock — retry open
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`timed out waiting for lock ${lockPath}`)
      }
      await sleep(5 + Math.floor(Math.random() * 20))
    }
  }
}

async function releaseFileLock(lockPath: string): Promise<void> {
  await fs.unlink(lockPath).catch(() => {})
}

/**
 * Run `fn` while holding the exclusive lock for `resourcePath`.
 * Nested calls on the same path from the same async chain are not supported —
 * callers must not re-enter.
 */
export async function withStoreLock<T>(resourcePath: string, fn: () => Promise<T>): Promise<T> {
  const key = resourcePath
  const prev = queues.get(key) ?? Promise.resolve()
  let releaseGate!: () => void
  const gate = new Promise<void>((r) => {
    releaseGate = r
  })
  const chained = prev.then(() => gate)
  queues.set(
    key,
    chained.catch(() => {}),
  )
  await prev.catch(() => {})

  const lockPath = `${resourcePath}.lock`
  await acquireFileLock(lockPath)
  try {
    return await fn()
  } finally {
    await releaseFileLock(lockPath)
    releaseGate()
    if (queues.get(key) === chained) queues.delete(key)
  }
}
