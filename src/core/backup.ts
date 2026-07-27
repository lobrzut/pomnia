// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { promises as fs } from 'node:fs'
import crypto from 'node:crypto'
import type { BackupOptions, Snapshot, SnapshotSourceInfo } from './model.js'
import { currentOS, homeDir, hostName, userName } from './platform.js'
import { getAdapter } from './adapters/index.js'
import { DEFAULT_MAX_FILE } from './adapters/types.js'
import type { Vault, FileSource } from './vault.js'
import { log } from './log.js'

export interface BackupProgress {
  source: string
  phase: 'scan' | 'conversations' | 'files' | 'store' | 'done'
  detail?: string
}

/** Index the previous snapshot of a source: relPath → {sha256, bytes, mtime} for incremental reuse. */
async function priorIndex(
  vault: Vault,
  sourceId: string
): Promise<Map<string, { sha256: string; bytes: number; mtime?: string }>> {
  const map = new Map<string, { sha256: string; bytes: number; mtime?: string }>()
  // Snapshots are stored newest-first, so the first match is the most recent.
  const snap = vault.getManifest().snapshots.find((s) => s.source.id === sourceId)
  if (!snap) return map
  const payload = await vault.getSnapshotPayload(snap.id).catch(() => null)
  payload?.files.forEach((f) => map.set(f.relPath, { sha256: f.sha256, bytes: f.bytes, mtime: f.mtime }))
  return map
}

/**
 * Back up the selected sources from the *current* machine into the vault.
 * Each source becomes one snapshot.
 */
export async function runBackup(
  vault: Vault,
  opts: BackupOptions,
  onProgress?: (p: BackupProgress) => void
): Promise<Snapshot[]> {
  const created: Snapshot[] = []
  const os = currentOS()
  const home = homeDir()
  const origin = { host: hostName(), user: userName(), home }

  for (const id of opts.sources) {
    const adapter = getAdapter(id)
    if (!adapter) {
      log.warn('no adapter for source', id)
      continue
    }
    const root = adapter.resolveRoot(os, home)
    if (!root) {
      log.warn('no root for', id, 'on', os)
      continue
    }
    onProgress?.({ source: adapter.label, phase: 'scan', detail: root })

    onProgress?.({ source: adapter.label, phase: 'conversations' })
    const conversations = adapter.collectConversations ? await adapter.collectConversations(root) : []

    onProgress?.({ source: adapter.label, phase: 'files' })
    const collected = adapter.collectFiles
      ? await adapter.collectFiles(root, { ...opts, maxFileBytes: opts.maxFileBytes ?? DEFAULT_MAX_FILE })
      : []

    const incremental = opts.incremental !== false
    const prior = incremental ? await priorIndex(vault, id) : new Map()
    let reused = 0

    const fileSources: FileSource[] = collected.map((f) => {
      const item = { relPath: f.relPath, absRoot: root, mtime: f.mtime, pathSensitive: f.pathSensitive }
      const p = prior.get(f.relPath)
      if (p && p.mtime === f.mtime && p.bytes === f.bytes) {
        // Unchanged since last snapshot → reuse the existing blob, skip read+encrypt.
        reused++
        return { item, reuse: { sha256: p.sha256, bytes: p.bytes }, read: () => fs.readFile(f.abs) }
      }
      return { item, read: () => fs.readFile(f.abs) }
    })
    if (incremental && reused) log.info(adapter.label, 'incremental:', reused, 'of', collected.length, 'files reused')

    const sourceInfo: SnapshotSourceInfo = {
      id: adapter.id,
      label: adapter.label,
      strategy: (await adapter.detect()).strategy,
      root,
      os
    }
    const meta: Snapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: sourceInfo,
      note: opts.note,
      origin,
      stats: { conversations: 0, messages: 0, files: 0, bytes: 0 }
    }

    onProgress?.({
      source: adapter.label,
      phase: 'store',
      detail: reused ? `${collected.length} files (${reused} reused)` : `${collected.length} files`
    })
    const stored = await vault.addSnapshot(meta, conversations, fileSources)
    created.push(stored)
    onProgress?.({ source: adapter.label, phase: 'done' })
  }
  return created
}
