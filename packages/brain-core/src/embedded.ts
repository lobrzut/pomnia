/**
 * Embedded entry point — the file Pomnia's Electron main forks via
 * `child_process.fork()`. Message-driven, no CLI parsing:
 *
 *   parent → child
 *     { type: 'start', config: Partial<BrainConfig> }
 *     { type: 'reindex', dir: string }        // distilled/sessions/library only (never skills/)
 *     { type: 'index-files', paths: string[] } // embed only these paths (distill new notes)
 *     { type: 'index-document', doc: IndexDocumentInput }
 *     { type: 'set-skills-root', path: string } // portable vault sidecar skills/
 *     { type: 'set-vault-root', path: string }  // portable USER.md/distilled/sessions
 *     { type: 'stop' }
 *
 *   child → parent
 *     { type: 'ready', url: string }
 *     { type: 'reindex-progress', file, done, total }
 *     { type: 'reindexed', stats: IndexStats }
 *     { type: 'error', message: string }      // recoverable op errors
 *     { type: 'stopped' }                      // just before exit
 *
 * Why fork and not in-process: crash isolation (better-sqlite3 is native),
 * and embed/index work never blocks the Electron main loop. The child owns
 * exactly one BrainServer and one DB handle for indexing.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import process from 'node:process'

import { defaultConfig, type BrainConfig } from './config/index.js'
import { EmbedClient } from './rag/embed.js'
import { indexDir, indexDocument, indexFiles, type IndexDocumentInput } from './rag/indexer.js'
import { createBrainServer, type BrainServer } from './mcp/server.js'
import { openDb } from './storage/db.js'

type ParentMsg =
  | { type: 'start'; config?: Partial<BrainConfig> }
  | { type: 'reindex'; dir: string }
  | { type: 'index-files'; paths: string[] }
  | { type: 'index-document'; doc: IndexDocumentInput }
  | { type: 'set-skills-root'; path: string }
  | { type: 'set-vault-root'; path: string }
  | { type: 'set-handshake'; phrase: string; enabled: boolean }
  | { type: 'set-auto-checkpoint'; enabled: boolean }
  | { type: 'library-stats' }
  | { type: 'stop' }

function send(msg: unknown): void {
  process.send?.(msg)
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

let server: BrainServer | null = null
let config: BrainConfig | null = null
let busy = false
/** Cancels in-flight reindex / index-document when parent sends stop. */
let opAbort: AbortController | null = null

async function handleStart(partial?: Partial<BrainConfig>): Promise<void> {
  if (server) {
    send({ type: 'error', message: 'already started' })
    return
  }
  config = { ...defaultConfig(), ...partial, auth: { ...defaultConfig().auth, ...partial?.auth } }
  server = await createBrainServer(config, {
    onMcpQuery: (ev) => send({ type: 'mcp-query', tool: ev.tool, detail: ev.detail }),
  })
  await server.start()
  send({ type: 'ready', url: server.url, adopted: server.adopted })
}

async function handleLibraryStats(): Promise<void> {
  if (!config) {
    send({ type: 'error', message: 'library-stats before start' })
    return
  }
  try {
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const chunks = (db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }).n
      const files = (
        db.prepare('SELECT COUNT(DISTINCT pdf_path) AS n FROM chunks').get() as { n: number }
      ).n
      send({ type: 'library-stats', stats: { files, chunks } })
    } finally {
      db.close()
    }
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function handleReindex(dir: string): Promise<void> {
  if (!config) {
    send({ type: 'error', message: 'reindex before start' })
    return
  }
  if (busy) {
    send({ type: 'error', message: 'reindex already running' })
    return
  }
  busy = true
  const ac = new AbortController()
  opAbort = ac
  try {
    // Separate writable handle — the server's own handle stays untouched.
    // SQLite WAL would be nicer but the Python schema doesn't use it; short
    // per-batch write transactions keep contention negligible at MVP scale.
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
      const stats = await indexDir(db, embedder, dir, (p) => send({ type: 'reindex-progress', ...p }), ac.signal)
      send({ type: 'reindexed', stats })
      // Sidecar: DISTINCT/total counts in DB — not this-run embed counts (incremental).
      try {
        const { writeFileSync, mkdirSync } = await import('node:fs')
        const { join } = await import('node:path')
        const dirOut = join(config.dataDir, 'vectordb')
        mkdirSync(dirOut, { recursive: true })
        const fRow = db.prepare('SELECT COUNT(DISTINCT pdf_path) AS c FROM chunks').get() as {
          c: number | bigint
        }
        const cRow = db.prepare('SELECT COUNT(*) AS c FROM chunks').get() as { c: number | bigint }
        writeFileSync(
          join(dirOut, 'library-stats.json'),
          JSON.stringify(
            {
              files: Number(fRow.c),
              chunks: Number(cRow.c),
              updatedAt: new Date().toISOString(),
              vaultRoot: dir,
            },
            null,
            2,
          ),
          'utf8',
        )
      } catch {
        /* non-fatal */
      }
    } finally {
      db.close()
    }
  } catch (err) {
    if (isAbortError(err)) {
      send({ type: 'error', message: 'reindex aborted' })
    } else {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    busy = false
    if (opAbort === ac) opAbort = null
  }
}

async function handleIndexDocument(doc: IndexDocumentInput): Promise<void> {
  if (!config) {
    send({ type: 'error', message: 'index-document before start' })
    return
  }
  if (busy) {
    send({ type: 'error', message: 'index already running' })
    return
  }
  busy = true
  const ac = new AbortController()
  opAbort = ac
  try {
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
      const stats = await indexDocument(db, embedder, doc, (p) => send({ type: 'index-progress', ...p }), ac.signal)
      send({ type: 'indexed-document', stats })
    } finally {
      db.close()
    }
  } catch (err) {
    if (isAbortError(err)) {
      send({ type: 'error', message: 'index aborted' })
    } else {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    busy = false
    if (opAbort === ac) opAbort = null
  }
}

async function handleIndexFiles(paths: string[]): Promise<void> {
  if (!config) {
    send({ type: 'error', message: 'index-files before start' })
    return
  }
  if (busy) {
    send({ type: 'error', message: 'index already running' })
    return
  }
  busy = true
  const ac = new AbortController()
  opAbort = ac
  try {
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
      const files = paths.map((p) => ({
        path: p,
        name: basename(p),
        text: readFileSync(p, 'utf8'),
      }))
      const stats = await indexFiles(
        db,
        embedder,
        files,
        (p) => send({ type: 'reindex-progress', ...p }),
        ac.signal,
      )
      send({ type: 'reindexed', stats })
    } finally {
      db.close()
    }
  } catch (err) {
    if (isAbortError(err)) {
      send({ type: 'error', message: 'index aborted' })
    } else {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    busy = false
    if (opAbort === ac) opAbort = null
  }
}

async function handleStop(): Promise<void> {
  opAbort?.abort()
  try {
    await server?.stop()
  } finally {
    send({ type: 'stopped' })
    process.exit(0)
  }
}

process.on('message', (msg: ParentMsg) => {
  switch (msg?.type) {
    case 'start':
      void handleStart(msg.config).catch((err) =>
        send({ type: 'error', message: `start failed: ${err instanceof Error ? err.message : String(err)}` }),
      )
      break
    case 'reindex':
      void handleReindex(msg.dir)
      break
    case 'index-files':
      void handleIndexFiles(msg.paths ?? [])
      break
    case 'index-document':
      void handleIndexDocument(msg.doc)
      break
    case 'set-skills-root':
      if (config) config.skillsRoot = msg.path
      server?.setSkillsRoot(msg.path)
      break
    case 'set-vault-root':
      if (config) config.vaultRoot = msg.path
      server?.setVaultRoot(msg.path)
      break
    case 'set-handshake':
      if (config) {
        config.handshakePhrase = msg.phrase
        config.handshakeEnabled = msg.enabled
      }
      server?.setHandshake({ phrase: msg.phrase, enabled: msg.enabled })
      break
    case 'set-auto-checkpoint':
      if (config) config.autoCheckpointEnabled = msg.enabled
      server?.setAutoCheckpoint(msg.enabled)
      break
    case 'library-stats':
      void handleLibraryStats()
      break
    case 'stop':
      void handleStop()
      break
    default:
      send({ type: 'error', message: `unknown message: ${JSON.stringify(msg)}` })
  }
})

// Parent died (IPC channel closed) → don't linger as a zombie.
process.on('disconnect', () => {
  void handleStop()
})
