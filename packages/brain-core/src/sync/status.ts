// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * In-process visibility for vault intake (surface /sync/* and archive /archive/*).
 *
 * The server used to accept files and forget it did. Without a GUI, /healthz
 * and /admin are the only places an operator can ask "did anything arrive?" —
 * so this tracker answers that, without ever storing or logging a bearer secret.
 *
 * Mode is receive-only: the server waits for push. Pull is a later addition.
 */

/** Public /healthz block — no vault paths, no tokens. */
export interface SyncHealthSnapshot {
  /** ISO time of the last accepted surface file, or null if nothing ever arrived. */
  lastReceivedAt: string | null
  /** Token *name* and/or remote host — never the bearer secret. */
  lastPeer: string | null
  /** Files accepted in the current/last surface transfer (reset on /sync/plan). */
  filesReceived: number
  /** Conflict events since process start (keep-both + report). */
  conflicts: number
  /** ISO time of the last accepted archive blob/manifest, or null. */
  archiveLastAt: string | null
}

export interface SyncConflictRecord {
  /** Local path that was kept unchanged. */
  path: string
  /** Path where the incoming bytes landed (numeric suffix). */
  wrote: string
  /** ISO timestamp. */
  at: string
  /** Peer label at the time (name/host, never token). */
  peer: string
}

/** Authed /admin view — adds config echo and recent conflict rows. */
export interface SyncAdminSnapshot extends SyncHealthSnapshot {
  /** Configured notes peer (URL or label). Separate from archiveTarget. */
  peer: string | null
  /** Configured blob archive destination (URL or path). Not deployTarget. */
  archiveTarget: string | null
  /** Server does not initiate pull; clients push here. */
  mode: 'receive-only'
  recentConflicts: SyncConflictRecord[]
}

const MAX_RECENT_CONFLICTS = 50

/**
 * Drop anything that looks like a bearer secret. Token *names* are short and
 * human; secrets are long opaque strings. Never put the Authorization value here.
 */
export function sanitizePeerLabel(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return 'unknown'
  // Long opaque blobs (hex / base64url tokens) — refuse. Allow long URLs/labels
  // that still look like operator config (scheme, host@name, host:port).
  if (s.length >= 40) {
    const looksConfigured =
      /^https?:\/\//i.test(s) ||
      s.includes('@') ||
      s.includes('/') ||
      s.includes('\\') ||
      /:\d{2,5}$/.test(s)
    if (!looksConfigured) return 'peer'
  }
  return s.slice(0, 96)
}

export class SyncIntakeTracker {
  private lastReceivedAt: string | null = null
  private lastPeer: string | null = null
  private filesReceived = 0
  private conflicts = 0
  private archiveLastAt: string | null = null
  private recentConflicts: SyncConflictRecord[] = []
  private peerConfig: string | null
  private archiveTargetConfig: string | null

  constructor(opts?: { peer?: string | null; archiveTarget?: string | null }) {
    this.peerConfig = opts?.peer?.trim() || null
    this.archiveTargetConfig = opts?.archiveTarget?.trim() || null
  }

  /** Call on /sync/plan — starts a new transfer counter. */
  beginSurfaceTransfer(peer: string): void {
    this.filesReceived = 0
    this.lastPeer = sanitizePeerLabel(peer)
  }

  /** Call after a successful /sync/file apply (including unchanged/conflict). */
  recordSurfaceFile(opts: {
    peer: string
    conflict?: { kept: string; wrote: string }
  }): void {
    const peer = sanitizePeerLabel(opts.peer)
    const at = new Date().toISOString()
    this.lastPeer = peer
    this.lastReceivedAt = at
    this.filesReceived += 1
    if (opts.conflict) {
      this.conflicts += 1
      const row: SyncConflictRecord = {
        path: opts.conflict.kept,
        wrote: opts.conflict.wrote,
        at,
        peer,
      }
      this.recentConflicts.unshift(row)
      if (this.recentConflicts.length > MAX_RECENT_CONFLICTS) {
        this.recentConflicts.length = MAX_RECENT_CONFLICTS
      }
      // warn, not debug — a keep-both that nobody sees is a silent overwrite.
      console.warn(
        `[brain-core] sync conflict: kept ${opts.conflict.kept}, wrote ${opts.conflict.wrote} (peer=${peer})`,
      )
    }
  }

  /** Call after a successful archive blob or manifest write. */
  recordArchive(peer: string): void {
    this.archiveLastAt = new Date().toISOString()
    // Soft: remember who last touched archive without overwriting surface peer
    // only when surface never received anything.
    if (!this.lastPeer) this.lastPeer = sanitizePeerLabel(peer)
  }

  snapshot(): SyncHealthSnapshot {
    return {
      lastReceivedAt: this.lastReceivedAt,
      lastPeer: this.lastPeer,
      filesReceived: this.filesReceived,
      conflicts: this.conflicts,
      archiveLastAt: this.archiveLastAt,
    }
  }

  adminSnapshot(): SyncAdminSnapshot {
    return {
      ...this.snapshot(),
      peer: this.peerConfig,
      archiveTarget: this.archiveTargetConfig,
      mode: 'receive-only',
      recentConflicts: this.recentConflicts.slice(),
    }
  }
}
