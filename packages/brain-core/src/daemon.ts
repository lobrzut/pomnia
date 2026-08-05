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

async function main(): Promise<void> {
  const config = await loadConfig(process.argv.slice(2), process.env)

  if (process.argv.includes('--claim-vault')) await claimAndExit(config)

  const server = await createBrainServer(config)
  await server.start()

  if (process.argv.includes('--reindex')) {
    console.error('[brain-core] --reindex: building index in the background, serving meanwhile')
    void reindexInBackground(config)
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[brain-core] received ${signal}, shutting down…`)
    await server.stop()
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
