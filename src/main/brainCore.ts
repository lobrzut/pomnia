// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * BrainCoreManager — lifecycle of the embedded brain-core child process.
 *
 * Pomnia runs `packages/brain-core/dist/embedded.js` and talks over IPC
 * (see brain-core/src/embedded.ts for the protocol). One child max; crash
 * puts us back in `stopped` with lastError set.
 *
 * Packaged: Electron `utilityProcess.fork` — same Electron ABI as main, no
 * second pomnia-brain.exe / Electron sidecars in the installer.
 * Dev: prefer system `node` (matches npm prebuild); POMNIA_NODE_BIN overrides.
 *
 * ABI note: better-sqlite3 is rebuilt for Electron in stage:brain-core —
 * utilityProcess loads that binding. Do not fork a plain Node ABI binary
 * against the staged Electron-ABI .node in production.
 */

import { fork, spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import { isPomniaService } from '../../packages/brain-core/src/serviceName.js'

/** Cold start under AV scan can exceed 20s; IPC ready usually lands in 1–4s when healthy. */
const START_TIMEOUT_MS = 45_000

/** Unified handle for Node ChildProcess | Electron UtilityProcess. */
interface BrainChild {
  readonly pid?: number
  stderr: NodeJS.ReadableStream | null
  /** Set after exit (UtilityProcess has no exitCode property). */
  exitCode: number | null
  killed: boolean
  /** True once spawn has fired / ChildProcess has spawnfile. */
  spawned: boolean
  send(msg: unknown): void
  onMessage(handler: (m: ChildMsg) => void): void
  offMessage(handler: (m: ChildMsg) => void): void
  onceExit(handler: (code: number | null) => void): void
  offExit(handler: (code: number | null) => void): void
  onceSpawn(handler: () => void): void
  /** Soft terminate (SIGTERM / UtilityProcess.kill). */
  softKill(): void
}

function wrapNodeChild(child: ChildProcess): BrainChild {
  const exitWrappers = new Map<(code: number | null) => void, (code: number | null) => void>()
  const handle: BrainChild = {
    get pid() {
      return child.pid
    },
    stderr: child.stderr,
    exitCode: null,
    killed: false,
    spawned: Boolean(child.spawnfile),
    send(msg) {
      child.send(msg as never)
    },
    onMessage(handler) {
      child.on('message', handler as (m: unknown) => void)
    },
    offMessage(handler) {
      child.off('message', handler as (m: unknown) => void)
    },
    onceExit(handler) {
      const wrapper = (code: number | null): void => {
        handle.exitCode = code
        exitWrappers.delete(handler)
        handler(code)
      }
      exitWrappers.set(handler, wrapper)
      child.once('exit', wrapper)
    },
    offExit(handler) {
      const wrapper = exitWrappers.get(handler)
      if (!wrapper) return
      exitWrappers.delete(handler)
      child.off('exit', wrapper)
    },
    onceSpawn(handler) {
      if (handle.spawned) {
        handler()
        return
      }
      child.once('spawn', () => {
        handle.spawned = true
        handler()
      })
    },
    softKill() {
      handle.killed = true
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    },
  }
  child.once('exit', (code) => {
    handle.exitCode = code
  })
  return handle
}

function wrapUtilityChild(child: UtilityProcess): BrainChild {
  const exitWrappers = new Map<(code: number | null) => void, (code: number) => void>()
  const handle: BrainChild = {
    get pid() {
      return child.pid
    },
    stderr: child.stderr,
    exitCode: null,
    killed: false,
    spawned: child.pid != null,
    send(msg) {
      child.postMessage(msg)
    },
    onMessage(handler) {
      child.on('message', handler)
    },
    offMessage(handler) {
      child.off('message', handler)
    },
    onceExit(handler) {
      const wrapper = (code: number): void => {
        handle.exitCode = code
        exitWrappers.delete(handler)
        handler(code)
      }
      exitWrappers.set(handler, wrapper)
      child.once('exit', wrapper)
    },
    offExit(handler) {
      const wrapper = exitWrappers.get(handler)
      if (!wrapper) return
      exitWrappers.delete(handler)
      child.off('exit', wrapper)
    },
    onceSpawn(handler) {
      if (handle.spawned) {
        handler()
        return
      }
      child.once('spawn', () => {
        handle.spawned = true
        handler()
      })
    },
    softKill() {
      handle.killed = true
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    },
  }
  child.once('exit', (code) => {
    handle.exitCode = code
  })
  return handle
}

/** Force-kill a child (+ Windows process tree). UtilityProcess lives under Pomnia.exe tree. */
function forceKillChild(child: BrainChild, sync = false): void {
  const pid = child.pid
  child.killed = true
  if (!pid) {
    child.softKill()
    return
  }
  try {
    if (process.platform === 'win32') {
      // /T kills the tree — avoids orphan holding :7862 / fooling NSIS.
      if (sync) {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true })
        } catch {
          /* already gone */
        }
        return
      }
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      return
    }
    child.softKill()
  } catch {
    child.softKill()
  }
}

export interface EmbeddedBrainStatus {
  running: boolean
  starting: boolean
  indexing: boolean
  url: string | null
  dataDir: string
  lastError: string | null
}

interface ChildMsg {
  type: string
  url?: string
  message?: string
  stats?: unknown
  counts?: Record<string, number>
  file?: string
  done?: number
  total?: number
  tool?: string
  detail?: string
  path?: string
  chunks?: number
}

/**
 * Idle timeout for child index passes — reset by every progress message,
 * NOT a cap on total runtime.
 *
 * This replaced a flat 10 min wall clock. Measured against a local Ollama a
 * full reindex runs ~158 ms/file, so the old cap failed outright on any vault
 * past ~3.8k notes — and since nothing cancelled the child afterwards, the
 * orphaned pass held its `busy` flag and bounced every retry until the app
 * was restarted.
 */
const INDEX_IDLE_TIMEOUT_MS = 180_000

export interface IndexDocumentPayload {
  path: string
  name?: string
  pages: { page: number; text: string }[]
}

export interface StartOptions {
  dataDir: string
  ollamaUrl?: string
  port?: number
  /** Portable skills sidecar — typically `<encryptedVault>/skills`. */
  skillsRoot?: string
  /**
   * Plaintext knowledge root — typically the open encrypted vault folder
   * (`USER.md`, `distilled/`, `sessions/` next to header.json).
   */
  vaultRoot?: string
  /** Agent proof greeting phrase (from Pomnia Settings). */
  handshakePhrase?: string
  /** When false, MCP tools omit Handshake greeting hints. */
  handshakeEnabled?: boolean
  /** When false, checkpoint_session refuses. Default true. */
  autoCheckpointEnabled?: boolean
}

function resolveNodeBin(): string | undefined {
  if (process.env.POMNIA_NODE_BIN) return process.env.POMNIA_NODE_BIN
  if (process.env.RELIQUA_NODE_BIN) return process.env.RELIQUA_NODE_BIN
  if (app.isPackaged) return undefined
  for (const p of ['C:/Program Files/nodejs/node.exe', '/usr/local/bin/node', '/usr/bin/node']) {
    if (existsSync(p)) return p
  }
  return undefined
}

function entryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'brain-core', 'embedded.js')
    : join(app.getAppPath(), 'packages', 'brain-core', 'dist', 'embedded.js')
}

function entryDir(): string {
  return dirname(entryPath())
}

/** Packaged runtime: JS + Electron-ABI native deps only (no second Electron EXE). */
function assertPackagedBrainRuntime(): void {
  if (!app.isPackaged) return
  const dir = join(process.resourcesPath, 'brain-core')
  const required = ['embedded.js']
  const missing = required.filter((name) => !existsSync(join(dir, name)))
  if (missing.length) {
    throw new Error(
      `brain-core runtime incomplete (missing ${missing.join(', ')}). Reinstall Pomnia — unsigned exclusions will not fix a broken install.`,
    )
  }
}

async function probeBrainHealthz(host: string, port: number): Promise<string | null> {
  const url = `http://${host}:${port}/healthz`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(800) })
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean; service?: string }
    if (body?.ok === true && isPomniaService(body?.service)) {
      return `http://${host}:${port}/mcp`
    }
  } catch {
    /* not up yet */
  }
  return null
}

function trimStderr(buf: string): string {
  const t = buf.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  return t.length > 280 ? `${t.slice(-280)}` : t
}

/**
 * Legacy cleanup: ≤0.1.35 shipped pomnia-brain.exe. Harmless no-op when absent.
 * Current packaged Brain is a utilityProcess under Pomnia.exe.
 */
export function killLeftoverBrainHelpers(sync = false): void {
  if (process.platform !== 'win32') return
  const cmd = 'taskkill /IM pomnia-brain.exe /F /T'
  try {
    if (sync) {
      execSync(cmd, { stdio: 'ignore', windowsHide: true })
    } else {
      spawn('taskkill', ['/IM', 'pomnia-brain.exe', '/F', '/T'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    }
  } catch {
    /* none running */
  }
}

function spawnBrainChild(entry: string): BrainChild {
  const cwd = entryDir()
  if (app.isPackaged) {
    // Same Electron ABI as main — better-sqlite3 staged with electron-rebuild.
    const child = utilityProcess.fork(entry, [], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env },
      serviceName: 'pomnia-brain-core',
    })
    return wrapUtilityChild(child)
  }

  const execPath = resolveNodeBin()
  const child = fork(entry, [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    cwd,
    env: {
      ...process.env,
      // Dev fallback when no system node: Electron-as-node (same as historical path).
      ...(!execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    },
    ...(execPath ? { execPath } : {}),
  })
  return wrapNodeChild(child)
}

export class BrainCoreManager {
  private child: BrainChild | null = null
  private url: string | null = null
  private starting = false
  private indexing = false
  private lastError: string | null = null
  private dataDir = ''
  /** Coalesce concurrent start() while waiting for ready. */
  private startPromise: Promise<EmbeddedBrainStatus> | null = null
  /** Reject in-flight reindex / index-document when the child is stopped. */
  private pendingOpReject: ((err: Error) => void) | null = null
  /** Broadcast hook — main wires this to webContents.send. */
  onEvent: ((e: ChildMsg) => void) | null = null

  status(): EmbeddedBrainStatus {
    return {
      running: !!this.child && !!this.url,
      starting: this.starting,
      indexing: this.indexing,
      url: this.url,
      dataDir: this.dataDir,
      lastError: this.lastError,
    }
  }

  private failPendingOp(reason: string): void {
    const reject = this.pendingOpReject
    this.pendingOpReject = null
    this.indexing = false
    reject?.(new Error(reason))
  }

  async start(opts: StartOptions): Promise<EmbeddedBrainStatus> {
    if (this.child && this.url) return this.status()
    if (this.startPromise) return this.startPromise
    this.startPromise = this.startInner(opts).finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async startInner(opts: StartOptions): Promise<EmbeddedBrainStatus> {
    if (this.child && this.url) return this.status()
    // Stale child without URL (interrupted start) — clear before respawn.
    if (this.child) {
      forceKillChild(this.child, true)
      this.child = null
      this.url = null
    }
    this.starting = true
    this.lastError = null
    this.dataDir = opts.dataDir
    const port = opts.port ?? 7862
    const host = '127.0.0.1'
    let stderrBuf = ''
    try {
      assertPackagedBrainRuntime()
      const entry = entryPath()
      if (!existsSync(entry)) {
        throw new Error(`brain-core build missing: ${entry} — run \`npm run build -w @pomnia/brain-core\``)
      }
      const child = spawnBrainChild(entry)
      child.stderr?.on('data', (d: Buffer | string) => {
        const line = typeof d === 'string' ? d : d.toString()
        stderrBuf += line
        if (stderrBuf.length > 8_000) stderrBuf = stderrBuf.slice(-4_000)
        console.error('[pomnia-core]', line.trimEnd())
      })
      child.onceExit((code) => {
        if (this.child === child) {
          this.child = null
          this.url = null
          this.failPendingOp('embedded brain stopped')
          if (code && code !== 0) this.lastError = `brain-core exited with code ${code}`
          this.onEvent?.({ type: 'exited', message: String(code ?? 0) })
        }
      })
      child.onMessage((m: ChildMsg) => {
        if (m.type === 'reindex-progress' || m.type === 'index-progress' || m.type === 'mcp-query') {
          this.onEvent?.(m)
        }
      })
      this.child = child

      // Wait briefly for spawn so send() is not racing a still-creating pipe.
      await new Promise<void>((resolve) => {
        if (child.spawned) {
          resolve()
          return
        }
        const t = setTimeout(resolve, 500)
        child.onceSpawn(() => {
          clearTimeout(t)
          resolve()
        })
      })

      const ready = await new Promise<string>((resolve, reject) => {
        let settled = false
        let healthTimer: ReturnType<typeof setInterval> | null = null

        const finish = (fn: () => void): void => {
          if (settled) return
          settled = true
          clearTimeout(t)
          if (healthTimer) clearInterval(healthTimer)
          child.offMessage(h)
          child.offExit(onEarlyExit)
          fn()
        }

        const t = setTimeout(() => {
          finish(() => {
            const hint = trimStderr(stderrBuf)
            reject(
              new Error(
                `brain-core start timeout (${START_TIMEOUT_MS / 1000}s) — no ready/healthz` +
                  (hint ? ` — ${hint}` : '') +
                  '. Check logs; public Windows builds need Authenticode (not folder exclusions).',
              ),
            )
          })
        }, START_TIMEOUT_MS)

        const onEarlyExit = (code: number | null): void => {
          const u = code == null ? 'null' : `0x${(code >>> 0).toString(16)}`
          const hint = trimStderr(stderrBuf)
          finish(() =>
            reject(
              new Error(
                `brain-core exited before ready (code ${u})` +
                  (hint ? ` — ${hint}` : '') +
                  '. Usually incomplete brain-core runtime or process kill — reinstall / rebuild; exclusions are not the product fix.',
              ),
            ),
          )
        }

        const h = (m: ChildMsg): void => {
          if (m.type === 'ready' && m.url) {
            finish(() => resolve(m.url!))
          } else if (m.type === 'error') {
            finish(() => reject(new Error(m.message ?? 'unknown brain-core error')))
          }
        }

        child.onMessage(h)
        child.onceExit(onEarlyExit)

        // Fallback: IPC ready lost but HTTP is up (and our child still alive).
        healthTimer = setInterval(() => {
          if (child.exitCode != null || child.killed) return
          void probeBrainHealthz(host, port).then((url) => {
            if (url && child.exitCode == null && !child.killed) finish(() => resolve(url))
          })
        }, 750)

        try {
          child.send({
            type: 'start',
            config: {
              dataDir: opts.dataDir,
              ollamaUrl: opts.ollamaUrl,
              port,
              host,
              ...(opts.skillsRoot ? { skillsRoot: opts.skillsRoot } : {}),
              ...(opts.vaultRoot ? { vaultRoot: opts.vaultRoot } : {}),
              ...(opts.handshakePhrase ? { handshakePhrase: opts.handshakePhrase } : {}),
              handshakeEnabled: opts.handshakeEnabled !== false,
              autoCheckpointEnabled: opts.autoCheckpointEnabled !== false,
              // Named so the *other* side of a shared vault can say who is
              // holding it. Without a label the refusal would only name a
              // hostname, which tells nobody which of their Pomnias it is.
              instanceLabel: 'Pomnia Desktop',
            },
          })
        } catch (err) {
          finish(() =>
            reject(err instanceof Error ? err : new Error(`brain-core IPC send failed: ${String(err)}`)),
          )
        }
      })
      this.url = ready
      return this.status()
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      if (this.child) forceKillChild(this.child, true)
      this.child = null
      this.url = null
      throw err
    } finally {
      this.starting = false
    }
  }

  async stop(): Promise<EmbeddedBrainStatus> {
    const child = this.child
    if (!child) {
      this.failPendingOp('embedded brain stopped')
      return this.status()
    }
    // Unblock IPC callers waiting on reindex / index-document before the child exits.
    this.failPendingOp('embedded brain stopped')
    // Must WAIT for exit before clearing this.child — otherwise tray Quit can
    // proceed while a utilityProcess still holds :7862 and NSIS reports "cannot be closed".
    await new Promise<void>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        resolve()
      }

      // Soft escalate: tree-kill (not bare kill) so Windows orphans release :7862 / locks.
      const softTimer = setTimeout(() => {
        forceKillChild(child)
      }, 3_000)

      const hardTimer = setTimeout(() => {
        forceKillChild(child, true)
      }, 5_000)

      // Absolute cap so before-quit cannot hang forever.
      const giveUp = setTimeout(() => {
        forceKillChild(child, true)
        done()
      }, 7_000)

      child.onceExit(() => {
        clearTimeout(softTimer)
        clearTimeout(hardTimer)
        clearTimeout(giveUp)
        done()
      })

      try {
        child.send({ type: 'stop' })
      } catch {
        // IPC already dead — escalate immediately.
        try {
          child.softKill()
        } catch {
          forceKillChild(child)
        }
      }
    })
    this.child = null
    this.url = null
    this.indexing = false
    // Belt-and-suspenders: any leftover ≤0.1.35 helper EXE.
    killLeftoverBrainHelpers(true)
    return this.status()
  }

  /**
   * Send one index request and await its `reindexed` reply.
   *
   * Progress messages re-arm the idle timer, so a vault that legitimately takes
   * hours never trips it. When it does trip, the child is cancelled first —
   * leaving it running is what used to wedge every subsequent attempt.
   */
  private async runIndexOp(req: { type: string; dir?: string; paths?: string[] }, label: string): Promise<unknown> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    if (this.indexing) throw new Error('reindex already running')
    this.indexing = true
    try {
      return await new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const settle = (fn: () => void): void => {
          clearTimeout(timer)
          this.pendingOpReject = null
          child.offMessage(h)
          fn()
        }
        const arm = (): void => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            child.send({ type: 'cancel' })
            settle(() =>
              reject(new Error(`${label} stalled — no progress for ${INDEX_IDLE_TIMEOUT_MS / 1000}s`)),
            )
          }, INDEX_IDLE_TIMEOUT_MS)
        }
        this.pendingOpReject = (err) => settle(() => reject(err))
        const h = (m: ChildMsg): void => {
          if (m.type === 'reindex-progress' || m.type === 'index-progress') {
            arm()
          } else if (m.type === 'reindexed') {
            settle(() => resolve(m.stats))
          } else if (m.type === 'error') {
            settle(() => reject(new Error(m.message ?? `${label} failed`)))
          }
        }
        child.onMessage(h)
        arm()
        child.send(req)
      })
    } finally {
      this.indexing = false
    }
  }

  /**
   * Ask the child to abort the pass in flight. The awaiting `runIndexOp`
   * settles on the child's own `error` reply, so no bookkeeping happens here.
   */
  cancelIndexing(): void {
    if (!this.indexing) return
    this.child?.send({ type: 'cancel' })
  }

  async reindex(dir: string): Promise<unknown> {
    return await this.runIndexOp({ type: 'reindex', dir }, 'reindex')
  }

  /**
   * Embed only the given absolute paths into library.db (no full vault walk).
   * Used after distill for new notes — library.db is SoT; skips localIndex dual-embed.
   */
  async indexFiles(paths: string[]): Promise<unknown> {
    if (!this.child || !this.url) throw new Error('embedded brain is not running')
    if (paths.length === 0) return { files: 0, chunks: 0, empty: 0, prunedFiles: 0, skipped: 0 }
    return await this.runIndexOp({ type: 'index-files', paths }, 'index-files')
  }

  /** Fast COUNT(*) on library.db via child (no sql.js of 200MB). */
  async libraryStats(): Promise<{ files: number; chunks: number }> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    return await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.offMessage(h)
        reject(new Error('library-stats timeout'))
      }, 15_000)
      const h = (m: ChildMsg): void => {
        if (m.type === 'library-stats' && m.stats && typeof m.stats === 'object') {
          clearTimeout(t)
          child.offMessage(h)
          const s = m.stats as { files?: number; chunks?: number }
          resolve({ files: s.files ?? 0, chunks: s.chunks ?? 0 })
        } else if (m.type === 'error') {
          clearTimeout(t)
          child.offMessage(h)
          reject(new Error(m.message ?? 'library-stats failed'))
        }
      }
      child.onMessage(h)
      child.send({ type: 'library-stats' })
    })
  }

  /** Per-path chunk counts for library.cvb ↔ library.db consistency repair. */
  async documentChunkCounts(paths: string[]): Promise<Record<string, number>> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    if (paths.length === 0) return {}
    return await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.offMessage(h)
        reject(new Error('document-chunk-counts timeout'))
      }, 30_000)
      const h = (m: ChildMsg): void => {
        if (m.type === 'document-chunk-counts' && m.counts && typeof m.counts === 'object') {
          clearTimeout(t)
          child.offMessage(h)
          resolve(m.counts)
        } else if (m.type === 'error') {
          clearTimeout(t)
          child.offMessage(h)
          reject(new Error(m.message ?? 'document-chunk-counts failed'))
        }
      }
      child.onMessage(h)
      child.send({ type: 'document-chunk-counts', paths })
    })
  }

  async indexDocument(doc: IndexDocumentPayload): Promise<unknown> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    if (this.indexing) throw new Error('index already running')
    this.indexing = true
    try {
      return await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          this.pendingOpReject = null
          reject(new Error('index-document timeout (10 min)'))
        }, 600_000)
        this.pendingOpReject = (err) => {
          clearTimeout(t)
          child.offMessage(h)
          reject(err)
        }
        const h = (m: ChildMsg): void => {
          if (m.type === 'indexed-document') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.offMessage(h)
            resolve(m.stats)
          } else if (m.type === 'error') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.offMessage(h)
            reject(new Error(m.message ?? 'index-document failed'))
          }
        }
        child.onMessage(h)
        child.send({ type: 'index-document', doc })
      })
    } finally {
      this.indexing = false
    }
  }

  /** Remove chunks for one logical document path from library.db (best-effort). */
  async removeDocument(pdfPath: string): Promise<{ path: string; chunks: number }> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    return await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.offMessage(h)
        reject(new Error('remove-document timeout'))
      }, 30_000)
      const h = (m: ChildMsg): void => {
        if (m.type === 'removed-document') {
          clearTimeout(t)
          child.offMessage(h)
          resolve({ path: m.path ?? pdfPath, chunks: typeof m.chunks === 'number' ? m.chunks : 0 })
        } else if (m.type === 'error') {
          clearTimeout(t)
          child.offMessage(h)
          reject(new Error(m.message ?? 'remove-document failed'))
        }
      }
      child.onMessage(h)
      child.send({ type: 'remove-document', path: pdfPath })
    })
  }

  /** Point MCP list_skills / get_skill at a new root (portable vault sidecar). */
  setSkillsRoot(path: string): void {
    const child = this.child
    if (!child || !this.url) return
    child.send({ type: 'set-skills-root', path })
  }

  /** Point MCP USER.md / sessions (+ reindex target) at portable vault root. */
  setVaultRoot(path: string): void {
    const child = this.child
    if (!child || !this.url) return
    child.send({ type: 'set-vault-root', path })
  }

  /** Update Handshake proof phrase for MCP tool descriptions / profile preamble. */
  setHandshake(opts: { phrase: string; enabled: boolean }): void {
    const child = this.child
    if (!child || !this.url) return
    child.send({
      type: 'set-handshake',
      phrase: opts.phrase,
      enabled: opts.enabled,
    })
  }

  /** Sync Settings autoCheckpointEnabled into running brain-core. */
  setAutoCheckpoint(enabled: boolean): void {
    const child = this.child
    if (!child || !this.url) return
    child.send({ type: 'set-auto-checkpoint', enabled })
  }
}

export const brainCore = new BrainCoreManager()
