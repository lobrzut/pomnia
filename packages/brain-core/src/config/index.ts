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

  // CLI overrides (simple, no getopt dependency)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--port' && next) cfg.port = Number(next)
    else if (arg === '--host' && next) cfg.host = next
    else if (arg === '--data-dir' && next) cfg.dataDir = next
    else if (arg === '--ollama-url' && next) cfg.ollamaUrl = next
    else if (arg === '--embed-model' && next) cfg.embedModel = next
  }

  return cfg
}
