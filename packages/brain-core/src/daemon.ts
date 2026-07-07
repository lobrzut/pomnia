#!/usr/bin/env node
/**
 * Standalone daemon entry point.
 *
 * Usage:
 *   brain-core                          # reads config from env / ~/.pomnia/brain-core.toml
 *   brain-core --port 7862 --data-dir ~/.pomnia/brain
 *   brain-core --config /etc/brain.toml
 *
 * When Pomnia embeds brain-core, it doesn't go through this file — the Electron
 * main process spawns a child via `child_process.fork()` and passes an options
 * object over IPC. This entry point is for the systemd/Docker deploy path.
 */

import process from 'node:process'
import { loadConfig } from './config/index.js'
import { createBrainServer } from './mcp/server.js'

async function main(): Promise<void> {
  const config = await loadConfig(process.argv.slice(2), process.env)

  const server = await createBrainServer(config)
  await server.start()

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
