import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RestoreOptions, RestorePlan, RestorePlanEntry } from './model.js'
import { currentOS, fromPortable, homeDir, userName } from './platform.js'
import { getAdapter } from './adapters/index.js'
import { type HostContext, looksLikeTextConfig, remapClaudeProject, remapTextPaths } from './pathmap.js'
import type { Vault } from './vault.js'
import { log } from './log.js'

/** Remap a captured relative path for the target machine (Claude Code project dirs). */
function remapRelPath(
  sourceId: string,
  relPath: string,
  origin: HostContext,
  target: HostContext,
  warnings: string[]
): string {
  if (sourceId === 'claude-code' && relPath.startsWith('projects/')) {
    const parts = relPath.split('/')
    const encoded = parts[1]
    if (encoded) {
      const { encoded: mapped, confident } = remapClaudeProject(encoded, origin, target)
      if (mapped !== encoded) {
        if (!confident)
          warnings.push(`Project dir "${encoded}" remapped to "${mapped}" with low confidence — verify after restore.`)
        parts[1] = mapped
        return parts.join('/')
      }
    }
  }
  return relPath
}

/**
 * Build a restore plan WITHOUT writing. Resolves the target root, remaps Claude
 * Code project dirs for the current OS, and flags path-sensitive configs.
 */
export async function planRestore(vault: Vault, opts: RestoreOptions): Promise<RestorePlan> {
  const meta = vault.getSnapshotMeta(opts.snapshotId)
  if (!meta) throw new Error(`Snapshot ${opts.snapshotId} not found`)
  const payload = await vault.getSnapshotPayload(opts.snapshotId)

  const targetOS = currentOS()
  const adapter = getAdapter(meta.source.id)
  const liveRoot = opts.targetRoot ?? adapter?.resolveRoot(targetOS, homeDir()) ?? meta.source.root

  // Non-overwrite mode restores into a side-by-side folder so live data is never clobbered.
  const effectiveRoot = opts.overwrite ? liveRoot : `${liveRoot} (reliqua-restore)`

  const origin: HostContext = { os: meta.source.os, home: meta.origin.home, user: meta.origin.user }
  const target: HostContext = { os: targetOS, home: homeDir(), user: userName() }

  const warnings: string[] = []
  if (meta.source.id === 'claude-desktop')
    warnings.push('Claude Desktop chats are largely cloud-synced; this restores local config + agent sessions, not server-side history.')
  if (origin.os !== target.os)
    warnings.push(`Cross-OS restore (${origin.os} → ${target.os}). Absolute paths inside configs will be remapped.`)

  const entries: RestorePlanEntry[] = []
  let totalBytes = 0
  for (const f of payload.files) {
    const relTarget = remapRelPath(meta.source.id, f.relPath, origin, target, warnings)
    const to = path.join(effectiveRoot, fromPortable(relTarget, targetOS))
    const exists = await fs
      .access(to)
      .then(() => true)
      .catch(() => false)
    const willRemap =
      opts.remapPaths !== false &&
      f.pathSensitive === true &&
      looksLikeTextConfig(f.relPath) &&
      (origin.home !== target.home || origin.user !== target.user)
    const action: RestorePlanEntry['action'] = willRemap
      ? 'remap'
      : exists
        ? opts.overwrite
          ? 'overwrite'
          : 'skip-exists'
        : 'create'
    entries.push({ relPath: relTarget, from: f.sha256, to, action, bytes: f.bytes })
    totalBytes += f.bytes
  }

  return { snapshotId: opts.snapshotId, targetRoot: effectiveRoot, entries, totalBytes, warnings }
}

export interface RestoreResult {
  written: number
  remapped: number
  skipped: number
  failed: number
  bytes: number
  targetRoot: string
}

/** Execute a restore plan: read blobs, optionally remap config contents, write files. */
export async function applyRestore(
  vault: Vault,
  opts: RestoreOptions,
  onProgress?: (done: number, total: number, rel: string) => void
): Promise<RestoreResult> {
  const meta = vault.getSnapshotMeta(opts.snapshotId)!
  const plan = await planRestore(vault, opts)
  if (opts.dryRun) {
    return { written: 0, remapped: 0, skipped: 0, failed: 0, bytes: 0, targetRoot: plan.targetRoot }
  }

  const origin: HostContext = { os: meta.source.os, home: meta.origin.home, user: meta.origin.user }
  const target: HostContext = { os: currentOS(), home: homeDir(), user: userName() }

  let written = 0
  let remapped = 0
  let skipped = 0
  let failed = 0
  let bytes = 0
  const total = plan.entries.length

  for (let i = 0; i < plan.entries.length; i++) {
    const e = plan.entries[i]
    onProgress?.(i + 1, total, e.relPath)
    if (e.action === 'skip-exists') {
      skipped++
      continue
    }
    try {
      let data = await vault.readBlob(e.from)
      if (e.action === 'remap') {
        // The planner flagged this path-sensitive config for cross-host rewrite.
        const orig = data.toString('utf8')
        const { text, changed } = remapTextPaths(orig, origin, target)
        if (changed) {
          data = Buffer.from(text, 'utf8')
          remapped++
        }
      }
      await fs.mkdir(path.dirname(e.to), { recursive: true })
      await fs.writeFile(e.to, data)
      written++
      bytes += data.length
    } catch (err) {
      // Target file locked by a running app — skip it, keep going (close the app to get it).
      failed++
      log.warn('restore skipped (locked target?):', e.relPath, (err as Error).message)
    }
  }

  log.info('restore complete', { written, remapped, skipped, failed, targetRoot: plan.targetRoot })
  return { written, remapped, skipped, failed, bytes, targetRoot: plan.targetRoot }
}
