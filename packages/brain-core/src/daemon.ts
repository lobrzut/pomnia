#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Standalone daemon entry point.
 *
 * Usage:
 *   brain-core                          # reads config from env / ~/.pomnia/brain-core.toml
 *   brain-core --port 7862 --data-dir ~/.pomnia/brain
 *   brain-core --reindex                # (re)build the index from the vault on start
 *   brain-core --claim-vault            # take write ownership of the vault, then exit
 *   brain-core --add-token ops --role admin   # issue a credential, print it once
 *
 * When Pomnia embeds brain-core, it doesn't go through this file — the Electron
 * main process spawns a child via `child_process.fork()` and passes an options
 * object over IPC. This entry point is for the systemd/Docker deploy path.
 */

import process from 'node:process'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { loadConfig, type BrainConfig } from './config/index.js'
import { createBrainServer } from './mcp/server.js'
import { EmbedClient } from './rag/embed.js'
import { indexDir } from './rag/indexer.js'
import { openDb } from './storage/db.js'
import { defaultVaultConfig, vaultConfigFromRoot } from './storage/vault.js'
import { claimVault, describeOwner, localWriterIdentity } from './storage/vaultOwner.js'
import { createToken } from './admin/tokens.js'

/**
 * Build the index from the vault.
 *
 * Indexing used to reach brain-core only over the fork protocol, which is
 * spoken by Pomnia Desktop and nothing else — so a standalone deployment could
 * serve an index but never create one, and started life answering every query
 * from an empty database. Runs in the background: a first index of a few
 * thousand notes takes minutes, and blocking startup that long trips systemd
 * start timeouts and container health checks.
 */
async function reindexInBackground(config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  const vaultRoot = (
    config.vaultRoot ? vaultConfigFromRoot(config.vaultRoot) : defaultVaultConfig(config.dataDir)
  ).root
  const embedder = new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel })
  try {
    await embedder.preflight()
  } catch (err) {
    console.error(`[brain-core] reindex refused: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
  const started = Date.now()
  let last = 0
  try {
    const stats = await indexDir(db, embedder, vaultRoot, (p) => {
      if (p.done - last < 250 && p.done !== p.total) return
      last = p.done
      console.error(`[brain-core] indexing ${p.done}/${p.total}`)
    })
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    console.error(
      `[brain-core] reindex done in ${secs}s — ${stats.files} file(s), ${stats.chunks} chunk(s), ` +
        `${stats.skipped} unchanged, ${stats.prunedFiles} pruned`,
    )
  } catch (err) {
    console.error(`[brain-core] reindex failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    db.close()
  }
}

/**
 * Take the vault's write ownership for this instance and exit.
 *
 * Separate from starting the server, and not an MCP tool: seizing a corpus
 * another machine is writing has to be something a person did on purpose, not
 * something an agent could talk itself into mid-conversation.
 */
async function claimAndExit(config: BrainConfig): Promise<never> {
  const vaultRoot = config.vaultRoot ?? join(config.dataDir, 'vault')
  const me = await localWriterIdentity(config.dataDir, config.instanceLabel ?? hostname())
  const { previous, owner } = await claimVault({ vaultRoot, me })
  console.error(
    previous && previous.id !== owner.id
      ? `[brain-core] vault ownership taken from ${describeOwner(previous)} by ${describeOwner(owner)}\n` +
          `[brain-core] ${describeOwner(previous)} will now refuse writes to this vault — sync it before it saves anything else`
      : `[brain-core] vault owned by ${describeOwner(owner)}`,
  )
  process.exit(0)
}

/**
 * Say why the process died before it dies.
 *
 * Node terminates on an unhandled rejection, and there was nothing installed
 * to catch one — so a stray rejection anywhere killed the server, systemd
 * restarted it five seconds later, and the only trace was a restart counter
 * nobody reads. Exiting is still right (a process with an unknown broken
 * invariant should not keep serving); exiting *silently* is not.
 *
 * `unhandledRejection` gets a moment to flush before exit, because journald
 * loses the last line often enough to matter when it is the only line.
 */
function installCrashReporting(): void {
  process.on('uncaughtException', (err) => {
    console.error('[brain-core] FATAL uncaught exception:', err)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[brain-core] FATAL unhandled rejection:', reason)
    setTimeout(() => process.exit(1), 50).unref()
  })
  // Not fatal, but a symptom worth a line: someone forgot to remove a listener.
  process.on('warning', (w) => {
    if (w.name === 'MaxListenersExceededWarning') console.error('[brain-core] warning:', w.message)
  })
}

/**
 * Issue a token and exit — how the first admin credential comes into being.
 *
 * There has to be a way in that does not already require a way in. This is it:
 * you have shell on the box, so you can create the credential that the panel
 * then needs. Deliberately not an unauthenticated bootstrap endpoint, which
 * would be a window that is open until someone remembers to close it.
 */
async function addTokenAndExit(config: BrainConfig, argv: string[]): Promise<never> {
  const at = argv.indexOf('--add-token')
  const name = argv[at + 1]
  const roleFlag = argv.indexOf('--role')
  const role = roleFlag >= 0 && argv[roleFlag + 1] === 'admin' ? 'admin' : 'agent'
  if (!name || name.startsWith('--')) {
    console.error('usage: brain-core --add-token <name> [--role admin]')
    process.exit(2)
  }
  const r = await createToken(config.auth.tokensFile, { name, role })
  if (!r.ok) {
    console.error(`[brain-core] ${r.detail}`)
    process.exit(1)
  }
  console.error(`[brain-core] ${role} token "${r.summary.name}" written to ${config.auth.tokensFile}`)
  console.error('[brain-core] shown once — copy it now:\n')
  // stdout, so `brain-core --add-token x | tee` works and the noise above does not.
  console.log(r.token)
  process.exit(0)
}

async function main(): Promise<void> {
  installCrashReporting()
  const config = await loadConfig(process.argv.slice(2), process.env)

  if (process.argv.includes('--add-token')) await addTokenAndExit(config, process.argv)
  if (process.argv.includes('--claim-vault')) await claimAndExit(config)

  const server = await createBrainServer(config)
  await server.start()

  if (process.argv.includes('--reindex')) {
    console.error('[brain-core] --reindex: building index in the background, serving meanwhile')
    void reindexInBackground(config)
  }

  // Say at boot what /healthz would say if anyone asked it. A server that
  // starts cleanly and then answers every search with nothing looks identical
  // to a working one in the log, which is where an operator actually looks.
  void (async () => {
    try {
      await new EmbedClient({ ollamaUrl: config.ollamaUrl, embedModel: config.embedModel }).preflight()
      console.error(`[brain-core] embeddings ready (${config.embedModel} via ${config.ollamaUrl})`)
    } catch (e) {
      console.error(
        `[brain-core] DEGRADED — semantic search will return nothing: ${(e as Error).message}`,
      )
      console.error('[brain-core] skills, profile and note reads still work; /healthz reports this')
    }
  })()

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    // A second Ctrl-C used to start a second teardown over a half-closed
    // server; systemd sends SIGTERM again if the first is slow.
    if (shuttingDown) return
    shuttingDown = true
    console.error(`[brain-core] received ${signal}, shutting down…`)
    // Never let a hung close hold the unit in `deactivating` until systemd's
    // 90-second default kills it — the operator reads that as a broken service.
    const hard = setTimeout(() => {
      console.error('[brain-core] shutdown exceeded 10s — exiting anyway')
      process.exit(0)
    }, 10_000)
    hard.unref()
    try {
      await server.stop()
    } catch (e) {
      console.error('[brain-core] stop failed:', (e as Error).message)
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  console.error(`[brain-core] listening on ${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('[brain-core] fatal:', err)
  process.exit(1)
})
