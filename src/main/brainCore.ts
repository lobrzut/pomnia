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

import { fork, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

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
}

function resolveNodeBin(): string | undefined {
  if (process.env.POMNIA_NODE_BIN) return process.env.POMNIA_NODE_BIN
  if (process.env.RELIQUA_NODE_BIN) return process.env.RELIQUA_NODE_BIN
  if (app.isPackaged) return undefined // packaged: Electron-as-node + electron-ABI binding
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

export class BrainCoreManager {
  private child: ChildProcess | null = null
  private url: string | null = null
  private starting = false
  private indexing = false
  private lastError: string | null = null
  private dataDir = ''
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
    if (this.child) return this.status()
    this.starting = true
    this.lastError = null
    this.dataDir = opts.dataDir
    try {
      const entry = entryPath()
      if (!existsSync(entry)) {
        throw new Error(`brain-core build missing: ${entry} — run \`npm run build -w @pomnia/brain-core\``)
      }
      const execPath = resolveNodeBin()
      const child = fork(entry, [], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        cwd: entryDir(),
        env: {
          ...process.env,
          // Packaged: Pomnia.exe must run as Node, not spawn a second GUI window.
          ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        ...(execPath ? { execPath } : {}),
      })
      child.stderr?.on('data', (d: Buffer) => console.error('[brain-core]', d.toString().trimEnd()))
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

      const ready = await new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('brain-core start timeout (20s)')), 20_000)
        const h = (m: ChildMsg): void => {
          if (m.type === 'ready' && m.url) {
            clearTimeout(t)
            child.off('message', h)
            resolve(m.url)
          } else if (m.type === 'error') {
            clearTimeout(t)
            child.off('message', h)
            reject(new Error(m.message ?? 'unknown brain-core error'))
          }
        }
        child.on('message', h)
        child.send({
          type: 'start',
          config: {
            dataDir: opts.dataDir,
            ollamaUrl: opts.ollamaUrl,
            port: opts.port ?? 7862,
            host: '127.0.0.1',
            ...(opts.skillsRoot ? { skillsRoot: opts.skillsRoot } : {}),
            ...(opts.vaultRoot ? { vaultRoot: opts.vaultRoot } : {}),
          },
        })
      })
      this.url = ready
      return this.status()
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.child?.kill()
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
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        child.kill()
        resolve()
      }, 5_000)
      child.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
      try {
        child.send({ type: 'stop' })
      } catch {
        child.kill()
        clearTimeout(t)
        resolve()
      }
    })
    this.child = null
    this.url = null
    this.indexing = false
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
}

export const brainCore = new BrainCoreManager()
