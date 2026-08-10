// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Config resolution: CLI flags > env vars > config file > defaults.
 *
 * Kept small on purpose — brain-core is Ollama-only for MVP (see
 * brain-in-node-rewrite-plan in project memory). No embed backend switching,
 * no multi-tenant, no cloud API. Add complexity when a real user asks for it.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { validateOllamaUrl } from '../admin/settings.js'

export interface BrainConfig {
  /** Host to bind. `127.0.0.1` when embedded in Pomnia, `0.0.0.0` on server deploys. */
  host: string
  /** MCP HTTP port. 7862 matches the current Python deploy so clients don't have to reconfigure. */
  port: number

  /**
   * Set when the configured Ollama URL was refused. The daemon still starts —
   * see loadConfig — but embeddings are off and this is the reason to show.
   */
  ollamaUrlError?: string

  /** Root data dir. Vault, DB, logs live under here. */
  dataDir: string

  /**
   * Skills filesystem root. When set (Pomnia with open encrypted vault), points at
   * `<encryptedVaultPath>/skills` — plaintext sidecar that travels with the vault folder.
   * Default: `<dataDir>/vault/skills` (legacy / standalone).
   */
  skillsRoot?: string

  /**
   * Plaintext knowledge root (`USER.md`, `distilled/`, `sessions/`).
   * When set (Pomnia with open encrypted vault), equals the vault folder itself
   * so knowledge travels with header.json / skills /. Default: `<dataDir>/vault`.
   * Vectordb (`library.db`) stays under `dataDir` regardless.
   */
  vaultRoot?: string

  /**
   * Handshake proof phrase — agents should open the first reply with this line
   * when Pomnia Brain MCP is connected. Injected into tool descriptions.
   */
  handshakePhrase?: string
  /** When false, omit Handshake greeting hints from MCP tools. Default true. */
  handshakeEnabled?: boolean

  /**
   * When false, checkpoint_session refuses. Default true — agents may
   * auto-checkpoint milestones without „zapisz do Pomnia”.
   */
  autoCheckpointEnabled?: boolean

  /**
   * Serve a replica: refuse save_conversation / checkpoint_session.
   *
   * Set this on every instance that does not own the vault. Two writable brains
   * over one corpus fork the memory silently — the desktop vault and the Linux
   * brain drifted to 99 files present on one side only, and nothing reported it.
   */
  readOnly?: boolean
  /** Named in the refusal so an agent can tell the user where to save instead. */
  authoritativeVaultHint?: string

  /**
   * How this instance names itself when it takes ownership of a vault, e.g.
   * "Pomnia Desktop" or "pomnia-master". Shown to the other side when it is
   * refused, so it must say something a person recognises.
   */
  instanceLabel?: string

  /** Ollama base URL — reachable http endpoint. */
  ollamaUrl: string
  /** Embedding model name known to Ollama (nomic-embed-text-v1.5 → dim 768). */
  embedModel: string

  /**
   * Bearer auth. Skipped when host === 127.0.0.1 (localhost trust, Pomnia-embedded
   * mode); enforced otherwise. Token file path optional — defaults to
   * `<dataDir>/mcp-tokens.json`. Format identical to Python impl.
   */
  auth: {
    tokensFile: string
    /** Rate limit for failed bearer auth attempts (per IP, sliding window). */
    maxFailsPerMinute: number
  }
}

function resolveDataDir(): string {
  if (process.env.BRAIN_DATA_DIR) return process.env.BRAIN_DATA_DIR
  const pomniaDir = join(homedir(), '.pomnia', 'brain')
  const legacyDir = join(homedir(), '.reliqua', 'brain')
  if (existsSync(legacyDir) && !existsSync(pomniaDir)) return legacyDir
  return pomniaDir
}

export function defaultConfig(): BrainConfig {
  const dataDir = resolveDataDir()
  return {
    host: '127.0.0.1',
    port: 7862,
    dataDir,
    ollamaUrl: process.env.OLLAMA_HOST
      ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}`
      : 'http://127.0.0.1:11434',
    embedModel: 'nomic-embed-text',
    auth: {
      tokensFile: join(dataDir, 'mcp-tokens.json'),
      maxFailsPerMinute: 20,
    },
  }
}

/**
 * Parse CLI args + env vars into a full BrainConfig.
 * File-based override (TOML/JSON) intentionally not implemented yet — YAGNI.
 */
/**
 * Every flag the daemon understands, including the ones handled in daemon.ts
 * rather than here — this set decides what counts as a typo, so a flag missing
 * from it would produce a warning about an argument that actually works.
 */
const KNOWN_FLAGS = new Set([
  '--port',
  '--host',
  '--data-dir',
  '--ollama-url',
  '--embed-model',
  '--vault-root',
  '--skills-root',
  '--read-only',
  '--vault-owner',
  '--instance-label',
  '--tokens-file',
  // daemon.ts one-shot modes
  '--add-token',
  '--add-user',
  '--claim-vault',
  '--reindex',
  '--role',
])

/**
 * A port is either a real port or a mistake worth stopping for.
 *
 * `Number('abc')` is NaN and `Number('99999')` is out of range; both reach
 * `listen()` and come back as ERR_SOCKET_BAD_PORT, which names no flag and no
 * value. Since the whole 7862/7865 confusion was about a port nobody could see,
 * this says which input was wrong.
 */
function parsePort(raw: string, source: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${source} must be an integer between 1 and 65535, got ${JSON.stringify(raw)}`)
  }
  return n
}

export async function loadConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<BrainConfig> {
  const cfg = defaultConfig()

  // Env overrides
  if (env.BRAIN_HOST) cfg.host = env.BRAIN_HOST
  if (env.BRAIN_PORT) cfg.port = parsePort(env.BRAIN_PORT, 'BRAIN_PORT')
  if (env.BRAIN_OLLAMA_URL) cfg.ollamaUrl = env.BRAIN_OLLAMA_URL
  if (env.BRAIN_EMBED_MODEL) cfg.embedModel = env.BRAIN_EMBED_MODEL
  if (env.BRAIN_VAULT_ROOT) cfg.vaultRoot = env.BRAIN_VAULT_ROOT
  if (env.BRAIN_SKILLS_ROOT) cfg.skillsRoot = env.BRAIN_SKILLS_ROOT
  if (env.BRAIN_READ_ONLY === '1' || env.BRAIN_READ_ONLY === 'true') cfg.readOnly = true
  if (env.BRAIN_VAULT_OWNER) cfg.authoritativeVaultHint = env.BRAIN_VAULT_OWNER
  if (env.BRAIN_INSTANCE_LABEL) cfg.instanceLabel = env.BRAIN_INSTANCE_LABEL

  // CLI overrides (simple, no getopt dependency)
  const dataDirBefore = cfg.dataDir
  let tokensFileExplicit = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg.startsWith('--') && !KNOWN_FLAGS.has(arg)) {
      // A misspelt flag is silently ignored, which makes it indistinguishable
      // from one you never passed — and the daemon then starts on a default you
      // did not choose. Warn rather than throw: refusing to boot over a stray
      // argument would take the memory server down for a typo.
      console.error(`[brain-core] ignoring unknown argument: ${arg}`)
      continue
    }
    // `next !== undefined`, not `next`: an empty value is a mistake, and the
    // truthiness test quietly turned `--port ""` into "no port given" — which
    // leaves the default in place, which is the outage this whole guard exists
    // to prevent.
    if (arg === '--port' && next !== undefined) cfg.port = parsePort(next, '--port')
    else if (arg === '--host' && next) cfg.host = next
    else if (arg === '--data-dir' && next) cfg.dataDir = next
    else if (arg === '--ollama-url' && next) cfg.ollamaUrl = next
    else if (arg === '--embed-model' && next) cfg.embedModel = next
    // A server deploy usually keeps the vault on its own volume, separate from
    // the data dir holding library.db. Without these the vault could only ever
    // live at <dataDir>/vault.
    else if (arg === '--vault-root' && next) cfg.vaultRoot = next
    else if (arg === '--skills-root' && next) cfg.skillsRoot = next
    else if (arg === '--read-only') cfg.readOnly = true
    else if (arg === '--vault-owner' && next) cfg.authoritativeVaultHint = next
    else if (arg === '--instance-label' && next) cfg.instanceLabel = next
    else if (arg === '--tokens-file' && next) {
      cfg.auth.tokensFile = next
      tokensFileExplicit = true
    }
  }

  // Paths derived from dataDir must follow it. Without this, `--data-dir /srv/x`
  // moved the vault and db but kept reading tokens from ~/.pomnia/brain — a
  // server would look authenticated while consulting a file nobody deployed.
  if (!tokensFileExplicit && cfg.dataDir !== dataDirBefore) {
    cfg.auth.tokensFile = join(cfg.dataDir, 'mcp-tokens.json')
  }

  // Same SSRF gate as the admin panel — refuse link-local / credentialed /
  // non-http Ollama URLs before the daemon ever fetches them.
  //
  // Rejected, not fatal. Throwing here stopped the daemon from starting, and
  // with Restart=on-failure + StartLimitBurst=5 the unit then gave up for good
  // — over one bad URL. The unit file argues the opposite case in its own
  // comments: it deliberately declares no ordering on Ollama because "refusing
  // to start would turn a partial outage into a full one". A bad embedder URL
  // costs semantic search; skills, the profile, note reads and the panel all
  // still work, and /healthz already reports the degradation.
  const ollama = validateOllamaUrl(cfg.ollamaUrl)
  if (ollama.ok) {
    cfg.ollamaUrl = ollama.url
  } else {
    cfg.ollamaUrlError = `${ollama.reason}: ${ollama.detail}`
    // Blank it so nothing can fetch the address we just refused.
    cfg.ollamaUrl = ''
    console.error(
      `[brain-core] REFUSED Ollama URL (${cfg.ollamaUrlError}) — starting without embeddings; ` +
        'semantic search will return nothing until this is fixed',
    )
  }

  return cfg
}
