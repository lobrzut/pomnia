/**
 * Embedded entry point — the file Pomnia's Electron main forks via
 * `child_process.fork()`. Message-driven, no CLI parsing:
 *
 *   parent → child
 *     { type: 'start', config: Partial<BrainConfig> }
 *     { type: 'reindex', dir: string }        // index every .md/.txt under dir
 *     { type: 'index-document', doc: IndexDocumentInput }
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

import process from 'node:process'

import { defaultConfig, type BrainConfig } from './config/index.js'
import { EmbedClient } from './rag/embed.js'
import { indexDir, indexDocument, type IndexDocumentInput } from './rag/indexer.js'
import { createBrainServer, type BrainServer } from './mcp/server.js'
import { openDb } from './storage/db.js'

type ParentMsg =
  | { type: 'start'; config?: Partial<BrainConfig> }
  | { type: 'reindex'; dir: string }
  | { type: 'index-document'; doc: IndexDocumentInput }
  | { type: 'stop' }

function send(msg: unknown): void {
  process.send?.(msg)
}

let server: BrainServer | null = null
let config: BrainConfig | null = null
let busy = false

async function handleStart(partial?: Partial<BrainConfig>): Promise<void> {
  if (server) {
    send({ type: 'error', message: 'already started' })
    return
  }
  config = { ...defaultConfig(), ...partial, auth: { ...defaultConfig().auth, ...partial?.auth } }
  server = await createBrainServer(config)
  await server.start()
  send({ type: 'ready', url: server.url })
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
  try {
    // Separate writable handle — the server's own handle stays untouched.
    // SQLite WAL would be nicer but the Python schema doesn't use it; short
    // per-batch write transactions keep contention negligible at MVP scale.
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
      const stats = await indexDir(db, embedder, dir, (p) => send({ type: 'reindex-progress', ...p }))
      send({ type: 'reindexed', stats })
    } finally {
      db.close()
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy = false
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
  try {
    const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
    try {
      const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
      const stats = await indexDocument(db, embedder, doc, (p) => send({ type: 'index-progress', ...p }))
      send({ type: 'indexed-document', stats })
    } finally {
      db.close()
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy = false
  }
}

async function handleStop(): Promise<void> {
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
    case 'index-document':
      void handleIndexDocument(msg.doc)
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
