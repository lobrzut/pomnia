/**
 * BrainCoreManager — lifecycle of the embedded brain-core child process.
 *
 * Pomnia forks `packages/brain-core/dist/embedded.js` and talks to it over
 * the fork IPC channel (see brain-core/src/embedded.ts for the protocol).
 * One child max; crash puts us back in `stopped` with lastError set.
 *
 * ABI note: better-sqlite3 is a native module. A fork from Electron main runs
 * Electron-as-node (ELECTRON_RUN_AS_NODE), which needs the binding compiled
 * for Electron's ABI — `electron-builder install-app-deps` handles that for
 * packaged builds. In dev we prefer the system `node` binary (matches the
 * prebuild that `npm install` fetched); POMNIA_NODE_BIN overrides.
 */

import { fork, spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/** Cold start under AV scan can exceed 20s; IPC ready usually lands in 1–4s when healthy. */
const START_TIMEOUT_MS = 45_000

/** Force-kill a child (+ Windows process tree). Packaged brain-core is Pomnia.exe. */
function forceKillChild(child: ChildProcess, sync = false): void {
  const pid = child.pid
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      // /T kills the tree — avoids orphan Pomnia.exe holding :7862 / fooling NSIS.
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
    child.kill('SIGKILL')
  } catch {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
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
  file?: string
  done?: number
  total?: number
  tool?: string
  detail?: string
}

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
  if (app.isPackaged) return undefined // packaged: dedicated helper or Electron-as-node
  for (const p of ['C:/Program Files/nodejs/node.exe', '/usr/local/bin/node', '/usr/bin/node']) {
    if (existsSync(p)) return p
  }
  return undefined
}

/**
 * Packaged helper binary (copy of Electron, renamed). Prefer this over forking
 * Pomnia.exe again — two identical app EXEs trip Defender / NSIS "cannot close".
 */
function resolvePackagedBrainExec(): string | undefined {
  if (!app.isPackaged) return undefined
  const name = process.platform === 'win32' ? 'pomnia-brain.exe' : 'pomnia-brain'
  const p = join(process.resourcesPath, 'brain-core', name)
  return existsSync(p) ? p : undefined
}

/** Electron-as-node when exec is Electron / pomnia-brain, or when fork defaults to app EXE. */
function needsElectronRunAsNode(execPath: string | undefined): boolean {
  if (!execPath) return app.isPackaged
  return /(?:^|[\\/])(electron|pomnia-brain)(\.exe)?$/i.test(execPath)
}

function entryPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'brain-core', 'embedded.js')
    : join(app.getAppPath(), 'packages', 'brain-core', 'dist', 'embedded.js')
}

function entryDir(): string {
  return dirname(entryPath())
}

/** Packaged Win helper needs Electron sidecars beside the EXE (ICU/DLL), not only pomnia-brain.exe. */
function assertPackagedBrainRuntime(): void {
  if (!app.isPackaged || process.platform !== 'win32') return
  const dir = join(process.resourcesPath, 'brain-core')
  const required = ['pomnia-brain.exe', 'icudtl.dat', 'embedded.js', 'ffmpeg.dll']
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
    if (body?.ok === true && body?.service === 'brain-core') {
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

/** Kill leftover helper after stop (does NOT kill Pomnia.exe — that would be us). */
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

export class BrainCoreManager {
  private child: ChildProcess | null = null
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
      const execPath = resolveNodeBin() ?? resolvePackagedBrainExec()
      if (app.isPackaged && !execPath && process.platform === 'win32') {
        throw new Error(
          'pomnia-brain.exe missing under resources/brain-core — reinstall Pomnia (helper is required).',
        )
      }
      const child = fork(entry, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        cwd: entryDir(),
        env: {
          ...process.env,
          // Electron / pomnia-brain.exe must run as Node, not open a second GUI.
          ...(needsElectronRunAsNode(execPath) ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        ...(execPath ? { execPath } : {}),
      })
      child.stderr?.on('data', (d: Buffer) => {
        const line = d.toString()
        stderrBuf += line
        if (stderrBuf.length > 8_000) stderrBuf = stderrBuf.slice(-4_000)
        console.error('[brain-core]', line.trimEnd())
      })
      child.on('exit', (code) => {
        if (this.child === child) {
          this.child = null
          this.url = null
          this.failPendingOp('embedded brain stopped')
          if (code && code !== 0) this.lastError = `brain-core exited with code ${code}`
          this.onEvent?.({ type: 'exited', message: String(code ?? 0) })
        }
      })
      child.on('message', (m: ChildMsg) => {
        if (m.type === 'reindex-progress' || m.type === 'index-progress' || m.type === 'mcp-query') {
          this.onEvent?.(m)
        }
      })
      this.child = child

      // Wait briefly for spawn so send() is not racing a still-creating pipe.
      await new Promise<void>((resolve) => {
        if (child.spawnfile) {
          resolve()
          return
        }
        const t = setTimeout(resolve, 500)
        child.once('spawn', () => {
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
          child.off('message', h)
          child.off('exit', onEarlyExit)
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
                `pomnia-brain exited before ready (code ${u})` +
                  (hint ? ` — ${hint}` : '') +
                  '. Usually incomplete brain-core runtime (ICU/DLLs) or process kill — reinstall / rebuild; exclusions are not the product fix.',
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

        child.on('message', h)
        child.once('exit', onEarlyExit)

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
    // proceed while a packaged Pomnia.exe (ELECTRON_RUN_AS_NODE) still holds :7862
    // and NSIS reports "cannot be closed".
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

      child.once('exit', () => {
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
          child.kill()
        } catch {
          forceKillChild(child)
        }
      }
    })
    this.child = null
    this.url = null
    this.indexing = false
    // Belt-and-suspenders: any orphaned helper left after exit.
    killLeftoverBrainHelpers(true)
    return this.status()
  }

  async reindex(dir: string): Promise<unknown> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    if (this.indexing) throw new Error('reindex already running')
    this.indexing = true
    try {
      return await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          this.pendingOpReject = null
          reject(new Error('reindex timeout (10 min)'))
        }, 600_000)
        this.pendingOpReject = (err) => {
          clearTimeout(t)
          child.off('message', h)
          reject(err)
        }
        const h = (m: ChildMsg): void => {
          if (m.type === 'reindexed') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.off('message', h)
            resolve(m.stats)
          } else if (m.type === 'error') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.off('message', h)
            reject(new Error(m.message ?? 'reindex failed'))
          }
        }
        child.on('message', h)
        child.send({ type: 'reindex', dir })
      })
    } finally {
      this.indexing = false
    }
  }

  /** Fast COUNT(*) on library.db via child (no sql.js of 200MB). */
  async libraryStats(): Promise<{ files: number; chunks: number }> {
    const child = this.child
    if (!child || !this.url) throw new Error('embedded brain is not running')
    return await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.off('message', h)
        reject(new Error('library-stats timeout'))
      }, 15_000)
      const h = (m: ChildMsg): void => {
        if (m.type === 'library-stats' && m.stats && typeof m.stats === 'object') {
          clearTimeout(t)
          child.off('message', h)
          const s = m.stats as { files?: number; chunks?: number }
          resolve({ files: s.files ?? 0, chunks: s.chunks ?? 0 })
        } else if (m.type === 'error') {
          clearTimeout(t)
          child.off('message', h)
          reject(new Error(m.message ?? 'library-stats failed'))
        }
      }
      child.on('message', h)
      child.send({ type: 'library-stats' })
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
          child.off('message', h)
          reject(err)
        }
        const h = (m: ChildMsg): void => {
          if (m.type === 'indexed-document') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.off('message', h)
            resolve(m.stats)
          } else if (m.type === 'error') {
            clearTimeout(t)
            this.pendingOpReject = null
            child.off('message', h)
            reject(new Error(m.message ?? 'index-document failed'))
          }
        }
        child.on('message', h)
        child.send({ type: 'index-document', doc })
      })
    } finally {
      this.indexing = false
    }
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
