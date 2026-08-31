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
 *   brain-core --distill                # one-shot: process distill-inbox (needs writable)
 *   brain-core --distill --file c.json  # distill explicit conversations JSON
 *   brain-core --distill-dry-run        # probe Ollama generate, no vault writes
 *   brain-core --claim-vault            # take write ownership of the vault, then exit
 *   brain-core --add-token ops --role admin   # issue a machine credential, print it once
 *   brain-core --add-user helluk --role admin # create a panel account (password on stdin)
 *
 * When Pomnia embeds brain-core, it doesn't go through this file — the Electron
 * main process spawns a child via `child_process.fork()` and passes an options
 * object over IPC. This entry point is for the systemd/Docker deploy path.
 */

import process from 'node:process'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { loadConfig, type BrainConfig } from './config/index.js'
import { createBrainServer } from './mcp/server.js'
import {
  createDistillJob,
  DEFAULT_DISTILL_MODEL,
  distillRunnable,
  parseConversation,
  parseConversationsJson,
} from './distill/index.js'
import { embedClientFromConfig, prefetchFastembed } from './rag/embed.js'
import { indexDir } from './rag/indexer.js'
import { openDb } from './storage/db.js'
import { defaultVaultConfig, vaultConfigFromRoot } from './storage/vault.js'
import {
  claimVault,
  describeOwner,
  localWriterIdentity,
  resolveVaultOwnership,
} from './storage/vaultOwner.js'
import { createToken } from './admin/tokens.js'
import { createUser } from './admin/users.js'

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
  const embedder = embedClientFromConfig(config)
  try {
    await embedder.preflight()
  } catch (err) {
    console.error(`[pomnia-core] reindex refused: ${err instanceof Error ? err.message : String(err)}`)
    return
  }
  const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
  const started = Date.now()
  let last = 0
  try {
    const stats = await indexDir(db, embedder, vaultRoot, (p) => {
      if (p.done - last < 250 && p.done !== p.total) return
      last = p.done
      console.error(`[pomnia-core] indexing ${p.done}/${p.total}`)
    })
    const secs = ((Date.now() - started) / 1000).toFixed(0)
    console.error(
      `[pomnia-core] reindex done in ${secs}s — ${stats.files} file(s), ${stats.chunks} chunk(s), ` +
        `${stats.skipped} unchanged, ${stats.prunedFiles} pruned`,
    )
  } catch (err) {
    console.error(`[pomnia-core] reindex failed: ${err instanceof Error ? err.message : String(err)}`)
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
      ? `[pomnia-core] vault ownership taken from ${describeOwner(previous)} by ${describeOwner(owner)}\n` +
          `[pomnia-core] ${describeOwner(previous)} will now refuse writes to this vault — sync it before it saves anything else`
      : `[pomnia-core] vault owned by ${describeOwner(owner)}`,
  )
  process.exit(0)
}

/**
 * One-shot distill (or dry-run). Does not start the HTTP server.
 *
 * Dry-run only needs Ollama. Full distill needs writable vault + inbox JSON
 * under state/distill-inbox/ (or `--file conversations.json`).
 * Does NOT remove `--read-only` / claim production — helluk flips that.
 */
async function distillAndExit(config: BrainConfig, dryRun: boolean): Promise<never> {
  const vaultRoot = config.vaultRoot ?? join(config.dataDir, 'vault')
  let writable = false
  if (!dryRun) {
    const me = await localWriterIdentity(config.dataDir, config.instanceLabel ?? hostname())
    const ownership = await resolveVaultOwnership({
      vaultRoot,
      me,
      forceReadOnly: config.readOnly === true,
    })
    writable = ownership.writable
  }
  const jobCfg = {
    enabled: config.distillEnabled !== false,
    model: config.distillModel || DEFAULT_DISTILL_MODEL,
    ollamaUrl: config.ollamaUrl,
    vaultRoot,
    writable,
    readOnlyFlag: config.readOnly === true,
  }
  const job = createDistillJob(() => jobCfg)

  if (!dryRun) {
    const r = distillRunnable(jobCfg)
    if (!r.ok) {
      console.error(`[pomnia-core] distill refused: ${r.reason}`)
      process.exit(1)
    }
  } else if (!config.ollamaUrl || config.distillEnabled === false) {
    console.error(
      `[pomnia-core] distill dry-run refused: ${
        config.distillEnabled === false ? 'BRAIN_DISTILL=0' : 'no Ollama URL'
      }`,
    )
    process.exit(1)
  }

  const fileIdx = process.argv.indexOf('--file')
  const filePath = fileIdx >= 0 ? process.argv[fileIdx + 1] : undefined
  let conversations: ReturnType<typeof parseConversationsJson> | undefined
  if (filePath && !dryRun) {
    const raw = await readFile(filePath, 'utf8')
    conversations = parseConversationsJson(raw)
      .map((c) => parseConversation(c) ?? c)
      .filter((c) => !!c?.messages?.length)
  }

  const started = job.start({ dryRun, conversations })
  if (!started.started) {
    console.error(`[pomnia-core] distill not started: ${started.reason}`)
    process.exit(1)
  }
  console.error(`[pomnia-core] distill ${dryRun ? 'dry-run' : 'job'} started…`)

  for (;;) {
    await new Promise((r) => setTimeout(r, 500))
    const s = job.status()
    if (s.phase === 'running' || s.phase === 'dry-run') {
      if (s.current) {
        console.error(`[pomnia-core] distill: ${s.current.title} (${s.current.id.slice(0, 8)})`)
      }
      continue
    }
    if (s.last) {
      const L = s.last
      console.error(
        `[pomnia-core] distill done — ok=${L.ok} stub=${L.stubs} garbage=${L.garbage} ` +
          `skip=${L.skipped} fail=${L.failed} written=${L.written}` +
          (L.error ? ` (${L.error})` : ''),
      )
      process.exit(L.error && L.written === 0 && L.ok === 0 ? 1 : 0)
    }
    console.error(`[pomnia-core] distill ${s.phase}: ${s.reason ?? ''}`)
    process.exit(1)
  }
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
    console.error('[pomnia-core] FATAL uncaught exception:', err)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[pomnia-core] FATAL unhandled rejection:', reason)
    setTimeout(() => process.exit(1), 50).unref()
  })
  // Not fatal, but a symptom worth a line: someone forgot to remove a listener.
  process.on('warning', (w) => {
    if (w.name === 'MaxListenersExceededWarning') console.error('[pomnia-core] warning:', w.message)
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
    console.error(`[pomnia-core] ${r.detail}`)
    process.exit(1)
  }
  console.error(`[pomnia-core] ${role} token "${r.summary.name}" written to ${config.auth.tokensFile}`)
  console.error('[pomnia-core] shown once — copy it now:\n')
  // stdout, so `brain-core --add-token x | tee` works and the noise above does not.
  console.log(r.token)
  process.exit(0)
}

/**
 * Read a password without echoing it, and without hand-rolling a raw-mode
 * keystroke loop.
 *
 * `readline` with `terminal: true` gives line editing for free; muting the
 * output stream while the question is open is the standard way to suppress the
 * echo. A pipe (`echo pw | brain-core --add-user …`) takes the same path and
 * simply never renders a prompt, which is what an installer wants.
 */
async function readSecret(prompt: string): Promise<string> {
  const { createInterface } = await import('node:readline')
  const muted = { write: (_c: string) => {}, muted: true }
  const out = process.stdin.isTTY
    ? (Object.assign(Object.create(process.stderr), {
        write(chunk: string) {
          // Let the prompt through once, then swallow the echoed keystrokes.
          if (!muted.muted) process.stderr.write(chunk)
        },
      }) as unknown as NodeJS.WritableStream)
    : undefined

  const rl = createInterface({
    input: process.stdin,
    output: out,
    terminal: process.stdin.isTTY === true,
  })
  if (process.stdin.isTTY) process.stderr.write(prompt)

  return await new Promise<string>((resolve) => {
    rl.question('', (answer) => {
      rl.close()
      if (process.stdin.isTTY) process.stderr.write('\n')
      resolve(answer.replace(/\r?\n$/, ''))
    })
  })
}

/**
 * Create a panel account and exit.
 *
 * The password comes from stdin, not from a flag: an argument lands in shell
 * history and in `ps` output for every user on the box, which is a poor place
 * for the credential that guards the settings.
 *
 *   brain-core --add-user helluk --role admin        # prompts (or reads a pipe)
 *   echo 'long passphrase' | brain-core --add-user helluk --role admin
 */
async function addUserAndExit(config: BrainConfig, argv: string[]): Promise<never> {
  const at = argv.indexOf('--add-user')
  const username = argv[at + 1]
  const roleFlag = argv.indexOf('--role')
  const role = roleFlag >= 0 && argv[roleFlag + 1] === 'admin' ? 'admin' : 'agent'
  if (!username || username.startsWith('--')) {
    console.error('usage: brain-core --add-user <login> [--role admin]   (password on stdin)')
    process.exit(2)
  }

  const password = await readSecret(`Hasło dla „${username}" (min. 12 znaków): `)

  const r = await createUser(config.dataDir, { username, password, role })
  if (!r.ok) {
    console.error(`[pomnia-core] ${r.detail}`)
    process.exit(1)
  }
  console.error(`[pomnia-core] konto „${r.summary.username}" (${r.summary.role}) utworzone`)
  console.error(`[pomnia-core] zaloguj się w panelu: http://${config.host}:${config.port}/`)
  process.exit(0)
}

async function main(): Promise<void> {
  installCrashReporting()
  const config = await loadConfig(process.argv.slice(2), process.env)

  if (process.argv.includes('--add-user')) await addUserAndExit(config, process.argv)
  if (process.argv.includes('--add-token')) await addTokenAndExit(config, process.argv)
  if (process.argv.includes('--claim-vault')) await claimAndExit(config)
  if (process.argv.includes('--distill-dry-run')) await distillAndExit(config, true)
  if (process.argv.includes('--distill')) await distillAndExit(config, false)
  if (process.argv.includes('--prefetch-embed')) {
    console.error(`[pomnia-core] prefetching fastembed into ${config.embedCacheDir}…`)
    await prefetchFastembed(config.embedCacheDir)
    console.error('[pomnia-core] embed cache ready')
    process.exit(0)
  }

  const server = await createBrainServer(config)
  await server.start()

  if (process.argv.includes('--reindex')) {
    console.error('[pomnia-core] --reindex: building index in the background, serving meanwhile')
    void reindexInBackground(config)
  }

  // Say at boot what /healthz would say if anyone asked it. A server that
  // starts cleanly and then answers every search with nothing looks identical
  // to a working one in the log, which is where an operator actually looks.
  void (async () => {
    try {
      const embedder = embedClientFromConfig(config)
      await embedder.preflight()
      const where =
        config.embedBackend === 'fastembed'
          ? `fastembed ${embedder.config.modelId}`
          : `${config.embedModel} via ${config.ollamaUrl}`
      console.error(`[pomnia-core] embeddings ready (${where})`)
    } catch (e) {
      console.error(
        `[pomnia-core] DEGRADED — semantic search will return nothing: ${(e as Error).message}`,
      )
      console.error('[pomnia-core] skills, profile and note reads still work; /healthz reports this')
    }
  })()

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    // A second Ctrl-C used to start a second teardown over a half-closed
    // server; systemd sends SIGTERM again if the first is slow.
    if (shuttingDown) return
    shuttingDown = true
    console.error(`[pomnia-core] received ${signal}, shutting down…`)
    // Never let a hung close hold the unit in `deactivating` until systemd's
    // 90-second default kills it — the operator reads that as a broken service.
    const hard = setTimeout(() => {
      console.error('[pomnia-core] shutdown exceeded 10s — exiting anyway')
      process.exit(0)
    }, 10_000)
    hard.unref()
    try {
      await server.stop()
    } catch (e) {
      console.error('[pomnia-core] stop failed:', (e as Error).message)
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  console.error(`[pomnia-core] listening on ${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('[pomnia-core] fatal:', err)
  process.exit(1)
})
