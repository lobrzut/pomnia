/**
 * @reliqua/brain-core — public API.
 *
 * Split by concern so both the Reliqua Electron main and the standalone
 * daemon entrypoint (bin/brain-core.js) can pull only what they need.
 */

// MCP server (tool handlers over MCP HTTP transport)
export { createBrainServer } from './mcp/server.js'
export type { BrainServer, BrainServerOptions } from './mcp/server.js'

// RAG core (embed + cosine + chunking)
// Re-exports live here so tools/, tests/ and consumers stay decoupled from the file layout.
export type { RagIndex, SearchHit } from './rag/types.js'

// Storage (sqlite-vec + vault filesystem)
export type { VaultConfig } from './storage/vault.js'

// Config (env + optional TOML/JSON file)
export { loadConfig, defaultConfig } from './config/index.js'
export type { BrainConfig } from './config/index.js'
