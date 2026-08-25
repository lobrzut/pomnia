// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * One-at-a-time distill job for brain-core (admin API + CLI).
 * Wired from mcp/server.ts via createDistillJob(getConfig).
 */

import { join } from 'node:path'

import { deployDistilledNotes } from './deploy.js'
import { distillConversation, isWorthDistilling } from './engine.js'
import { archiveInboxFiles, loadInbox } from './inbox.js'
import {
  loadLedger,
  markProcessedIn,
  ownerProcessed,
  saveLedger,
  sessionIdsFromNotes,
} from './ledgerStore.js'
import { DEFAULT_DISTILL_MODEL, dryRunOllamaGenerate, ollamaGenerate } from './ollamaChat.js'
import type { DistillConversation, DistilledNote } from './types.js'

export interface DistillJobLiveConfig {
  enabled: boolean
  model: string
  ollamaUrl: string
  vaultRoot: string
  writable: boolean
  readOnlyFlag: boolean
}

export interface DistillJobStatus {
  enabled: boolean
  /** Can start a real write job right now. */
  runnable: boolean
  /** idle | running | dry-run | disabled | blocked */
  phase: string
  model: string
  ollamaUrl: string
  reason?: string
  queueDepth: number
  uiVisible: boolean
  current?: { id: string; title: string; startedAt: string }
  last?: {
    finishedAt: string
    ok: number
    skipped: number
    failed: number
    garbage: number
    stubs: number
    written: number
    error?: string
  }
}

function blockReason(c: DistillJobLiveConfig): string | undefined {
  if (!c.enabled) return 'BRAIN_DISTILL=0 (feature disabled)'
  if (c.readOnlyFlag || !c.writable) return 'vault is read-only — distill needs a writable SoT'
  if (!c.ollamaUrl.trim()) return 'Ollama URL missing (needed for /api/generate)'
  return undefined
}

/** Preflight used by CLI before starting a write job. */
export function distillRunnable(
  c: DistillJobLiveConfig,
): { ok: true } | { ok: false; reason: string } {
  const reason = blockReason(c)
  return reason ? { ok: false, reason } : { ok: true }
}

export interface DistillJob {
  status(): DistillJobStatus
  start(opts: {
    dryRun?: boolean
    conversations?: DistillConversation[]
    onWritten?: (paths: string[]) => void | Promise<void>
  }): { started: boolean; reason?: string; status: DistillJobStatus }
  cancel(): { cancelled: boolean }
  /** CLI: process one conversation (optional dry-run / mock generate). */
  processOne(
    conv: DistillConversation,
    opts?: {
      dryRun?: boolean
      generate?: (prompt: string, system: string, model: string) => Promise<string>
      onWritten?: (paths: string[]) => void | Promise<void>
    },
  ): Promise<{ note?: DistilledNote; skipped?: boolean; failed?: string; written?: string[] }>
}

export function createDistillJob(getConfig: () => DistillJobLiveConfig): DistillJob {
  const queue: DistillConversation[] = []
  let running = false
  let phase: DistillJobStatus['phase'] = 'idle'
  let abort: AbortController | null = null
  let current: DistillJobStatus['current']
  let last: DistillJobStatus['last']
  let onWrittenHook: ((paths: string[]) => void | Promise<void>) | undefined

  const status = (): DistillJobStatus => {
    const c = getConfig()
    const reason = blockReason(c)
    const enabled = c.enabled
    return {
      enabled,
      runnable: !reason && !running,
      phase: !enabled ? 'disabled' : running ? phase : reason ? 'blocked' : 'idle',
      model: c.model || DEFAULT_DISTILL_MODEL,
      ollamaUrl: c.ollamaUrl,
      reason,
      queueDepth: queue.length,
      uiVisible: enabled && c.writable && !c.readOnlyFlag,
      current,
      last,
    }
  }

  const enqueue = (convs: DistillConversation[]): number => {
    let n = 0
    for (const c of convs) {
      if (!c.messages.length) continue
      if (queue.some((q) => q.id === c.id)) continue
      queue.push(c)
      n++
    }
    return n
  }

  const markDone = async (vaultRoot: string, ids: string[]): Promise<void> => {
    let ledger = await loadLedger(vaultRoot)
    if (Object.keys(ownerProcessed(ledger)).length === 0) {
      const fromDisk = await sessionIdsFromNotes(vaultRoot)
      if (fromDisk.length) ledger = markProcessedIn(ledger, fromDisk)
    }
    ledger = markProcessedIn(ledger, ids)
    await saveLedger(vaultRoot, ledger)
  }

  const runLoop = async (): Promise<void> => {
    const c0 = getConfig()
    let ok = 0
    let skipped = 0
    let failed = 0
    let garbage = 0
    let stubs = 0
    let written = 0
    let error: string | undefined
    phase = 'running'
    try {
      while (queue.length > 0) {
        if (abort?.signal.aborted) {
          error = 'cancelled'
          break
        }
        const c = getConfig()
        const reason = blockReason(c)
        if (reason) {
          error = reason
          break
        }
        const conv = queue.shift()!
        current = { id: conv.id, title: conv.title, startedAt: new Date().toISOString() }
        const ledger = await loadLedger(c.vaultRoot)
        if (ownerProcessed(ledger)[conv.id]) {
          skipped++
          continue
        }
        if (!isWorthDistilling(conv)) {
          skipped++
          await markDone(c.vaultRoot, [conv.id])
          continue
        }
        try {
          const note = await distillConversation(conv, {
            ollamaUrl: c.ollamaUrl,
            model: c.model || DEFAULT_DISTILL_MODEL,
            signal: abort?.signal,
          })
          if (note.quality === 'garbage') garbage++
          else if (note.quality === 'stub') stubs++
          else ok++
          const dep = await deployDistilledNotes([note], join(c.vaultRoot, 'distilled'))
          written += dep.written.length
          await markDone(c.vaultRoot, [conv.id])
          await onWrittenHook?.(dep.written)
        } catch (e) {
          failed++
          console.error(`[pomnia-core] distill failed ${conv.id}:`, (e as Error).message)
        }
      }
    } finally {
      last = {
        finishedAt: new Date().toISOString(),
        ok,
        skipped,
        failed,
        garbage,
        stubs,
        written,
        error,
      }
      current = undefined
      running = false
      phase = 'idle'
      abort = null
      onWrittenHook = undefined
      void c0
    }
  }

  return {
    status,

    start(opts) {
      const c = getConfig()
      if (opts.dryRun) {
        if (!c.enabled) {
          return { started: false, reason: 'BRAIN_DISTILL=0', status: status() }
        }
        if (!c.ollamaUrl.trim()) {
          return { started: false, reason: 'Ollama URL missing', status: status() }
        }
        if (running) return { started: false, reason: 'already running', status: status() }
        running = true
        phase = 'dry-run'
        abort = new AbortController()
        void (async () => {
          const r = await dryRunOllamaGenerate(
            c.ollamaUrl,
            c.model || DEFAULT_DISTILL_MODEL,
            abort?.signal,
          )
          last = {
            finishedAt: new Date().toISOString(),
            ok: r.ok ? 1 : 0,
            skipped: 0,
            failed: r.ok ? 0 : 1,
            garbage: 0,
            stubs: 0,
            written: 0,
            error: r.ok ? undefined : r.error,
          }
          running = false
          phase = 'idle'
          abort = null
        })()
        return { started: true, status: status() }
      }

      const reason = blockReason(c)
      if (reason) return { started: false, reason, status: status() }
      if (running) return { started: false, reason: 'already running', status: status() }

      if (opts.conversations?.length) enqueue(opts.conversations)
      onWrittenHook = opts.onWritten

      // Pull inbox asynchronously then process — same 1-at-a-time loop.
      running = true
      phase = 'running'
      abort = new AbortController()
      void (async () => {
        try {
          if (!opts.conversations?.length) {
            const { conversations, files } = await loadInbox(c.vaultRoot)
            const n = enqueue(conversations)
            if (n > 0) await archiveInboxFiles(files.slice(0, n), c.vaultRoot)
          }
          if (queue.length === 0) {
            last = {
              finishedAt: new Date().toISOString(),
              ok: 0,
              skipped: 0,
              failed: 0,
              garbage: 0,
              stubs: 0,
              written: 0,
              error: 'queue empty',
            }
            running = false
            phase = 'idle'
            abort = null
            return
          }
          await runLoop()
        } catch (e) {
          last = {
            finishedAt: new Date().toISOString(),
            ok: 0,
            skipped: 0,
            failed: 1,
            garbage: 0,
            stubs: 0,
            written: 0,
            error: (e as Error).message,
          }
          running = false
          phase = 'idle'
          abort = null
        }
      })()
      return { started: true, status: status() }
    },

    cancel() {
      if (!running) return { cancelled: false }
      abort?.abort()
      return { cancelled: true }
    },

    async processOne(conv, opts) {
      const c = getConfig()
      if (!opts?.dryRun) {
        const reason = blockReason(c)
        if (reason) return { failed: reason }
      }
      if (!isWorthDistilling(conv)) return { skipped: true }
      try {
        const note = await distillConversation(conv, {
          ollamaUrl: c.ollamaUrl,
          model: c.model || DEFAULT_DISTILL_MODEL,
          generate: opts?.generate,
        })
        if (opts?.dryRun) return { note }
        const dep = await deployDistilledNotes([note], join(c.vaultRoot, 'distilled'))
        await markDone(c.vaultRoot, [conv.id])
        await opts?.onWritten?.(dep.written)
        return { note, written: dep.written }
      } catch (e) {
        return { failed: (e as Error).message }
      }
    },
  }
}

/** Parse CLI / API conversation list from JSON file contents. */
export function parseConversationsJson(raw: string): DistillConversation[] {
  const data = JSON.parse(raw) as unknown
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { conversations?: unknown[] }).conversations)
      ? (data as { conversations: unknown[] }).conversations
      : [data]
  const out: DistillConversation[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as DistillConversation
    if (typeof o.id === 'string' && Array.isArray(o.messages)) out.push(o)
  }
  return out
}

export type DistillServiceConfig = DistillJobLiveConfig
export type DistillStatus = DistillJobStatus
export type DistillLastRun = NonNullable<DistillJobStatus['last']>

/** Re-export generate for CLI dry-run without going through the job. */
export { ollamaGenerate, dryRunOllamaGenerate }
