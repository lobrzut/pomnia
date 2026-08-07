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
export async function loadConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
): Promise<BrainConfig> {
  const cfg = defaultConfig()

  // Env overrides
  if (env.BRAIN_HOST) cfg.host = env.BRAIN_HOST
  if (env.BRAIN_PORT) cfg.port = Number(env.BRAIN_PORT)
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
    if (arg === '--port' && next) cfg.port = Number(next)
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
  const ollama = validateOllamaUrl(cfg.ollamaUrl)
  if (!ollama.ok) {
    throw new Error(`invalid Ollama URL (${ollama.reason}): ${ollama.detail}`)
  }
  cfg.ollamaUrl = ollama.url

  return cfg
}
