// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which instance is allowed to write this vault — recorded *in the vault*.
 *
 * Read-only mode already existed, but it was a promise made by whoever typed
 * `--read-only` into a systemd unit. Nothing stopped two instances from both
 * being started writable over one corpus, and that is not a hypothetical: the
 * desktop vault and the Linux brain drifted to 99 files present on one side
 * only, and it took months to notice because neither side could see the other.
 *
 * A flag on the process cannot prevent that; a marker in the shared vault can.
 * Every instance reads it on open, and one of three things is true:
 *
 *   no marker    → fresh or never-claimed vault, this instance claims it
 *   marker is me → write normally
 *   marker isn't → serve read-only, and name who actually holds it
 *
 * Handing over is deliberate (`claimVault`), never a side effect of starting a
 * process or flipping a UI toggle — that is the whole point. `--read-only`
 * still wins over everything, so an instance can always be pinned as a replica.
 */

import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'

export const VAULT_OWNER_SCHEMA = 1

export interface VaultWriter {
  /** Stable per installation — survives restarts, not reinstalls. */
  id: string
  /** Human name for refusals and UI: "Pomnia Desktop", "pomnia-master". */
  label: string
  host: string
}

export interface VaultOwnerFile {
  schemaVersion: number
  writer: VaultWriter
  /** ISO — when this writer took ownership. */
  since: string
  /** ISO — refreshed on each successful open by the owner. */
  lastSeen: string
}

export type OwnershipVerdict =
  | { writable: true; reason: 'claimed' | 'owner' | 'forced'; owner: VaultWriter }
  | { writable: false; reason: 'held-by-other'; owner: VaultWriter }
  | { writable: false; reason: 'read-only-flag'; owner: VaultWriter | null }

export function vaultOwnerPath(vaultRoot: string): string {
  return join(vaultRoot, 'state', 'vault-writer.json')
}

function isWriter(v: unknown): v is VaultWriter {
  const w = v as VaultWriter
  return !!w && typeof w.id === 'string' && !!w.id && typeof w.label === 'string' && typeof w.host === 'string'
}

export function parseVaultOwner(raw: string): VaultOwnerFile | null {
  try {
    const o = JSON.parse(raw) as Partial<VaultOwnerFile>
    if (!isWriter(o.writer)) return null
    return {
      schemaVersion: typeof o.schemaVersion === 'number' ? o.schemaVersion : VAULT_OWNER_SCHEMA,
      writer: o.writer,
      since: typeof o.since === 'string' ? o.since : new Date().toISOString(),
      lastSeen: typeof o.lastSeen === 'string' ? o.lastSeen : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export async function readVaultOwner(vaultRoot: string): Promise<VaultOwnerFile | null> {
  try {
    return parseVaultOwner(await fs.readFile(vaultOwnerPath(vaultRoot), 'utf8'))
  } catch (e) {
    // A vault we cannot read the marker from is not a vault we may assume is
    // ours. Only "there is no marker" means unclaimed.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

async function writeVaultOwner(vaultRoot: string, file: VaultOwnerFile): Promise<void> {
  const p = vaultOwnerPath(vaultRoot)
  await fs.mkdir(dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, p)
}

/**
 * Stable identity for this installation, kept beside the data rather than in
 * the vault — two installations pointed at one vault must not share an id.
 */
export async function localWriterIdentity(dataDir: string, label: string): Promise<VaultWriter> {
  const p = join(dataDir, 'instance-id')
  let id: string
  try {
    id = (await fs.readFile(p, 'utf8')).trim()
    if (!id) throw new Error('empty')
  } catch {
    id = randomUUID()
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(p, `${id}\n`, 'utf8')
  }
  return { id, label, host: hostname() }
}

/**
 * Decide whether this instance may write, and record the claim when it may.
 *
 * `forceReadOnly` is the operator's override and is checked first: an instance
 * pinned as a replica must never take ownership as a side effect of starting.
 */
export async function resolveVaultOwnership(opts: {
  vaultRoot: string
  me: VaultWriter
  forceReadOnly?: boolean
}): Promise<OwnershipVerdict> {
  const existing = await readVaultOwner(opts.vaultRoot)
  if (opts.forceReadOnly) {
    return { writable: false, reason: 'read-only-flag', owner: existing?.writer ?? null }
  }
  const now = new Date().toISOString()
  if (!existing) {
    await writeVaultOwner(opts.vaultRoot, {
      schemaVersion: VAULT_OWNER_SCHEMA,
      writer: opts.me,
      since: now,
      lastSeen: now,
    })
    return { writable: true, reason: 'claimed', owner: opts.me }
  }
  if (existing.writer.id !== opts.me.id) {
    return { writable: false, reason: 'held-by-other', owner: existing.writer }
  }
  // Same instance: refresh presence, but keep `since` — how long this instance
  // has held the vault is what makes a takeover prompt meaningful.
  await writeVaultOwner(opts.vaultRoot, { ...existing, writer: opts.me, lastSeen: now })
  return { writable: true, reason: 'owner', owner: opts.me }
}

/**
 * Take ownership from whoever holds it. Deliberate and explicit — exposed as a
 * CLI flag and a desktop action, never as an MCP tool: an agent must not be
 * able to seize the vault mid-conversation.
 */
export async function claimVault(opts: {
  vaultRoot: string
  me: VaultWriter
}): Promise<{ previous: VaultWriter | null; owner: VaultWriter }> {
  const existing = await readVaultOwner(opts.vaultRoot)
  const now = new Date().toISOString()
  await writeVaultOwner(opts.vaultRoot, {
    schemaVersion: VAULT_OWNER_SCHEMA,
    writer: opts.me,
    since: now,
    lastSeen: now,
  })
  return { previous: existing?.writer ?? null, owner: opts.me }
}

/** Human sentence for refusals and logs. */
export function describeOwner(w: VaultWriter): string {
  return w.label && w.label !== w.host ? `${w.label} (${w.host})` : w.host
}
