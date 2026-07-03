/**
 * @reliqua/brain-core — public API.
 *
 * Split by concern so both the Reliqua Electron main and the standalone
 * daemon entrypoint (bin/brain-core.js) can pull only what they need.
 */

// MCP server (tool handlers over MCP HTTP transport)
export { createBrainServer } from './mcp/server.js'
export type { BrainServer, BrainServerOptions } from './mcp/server.js'

// MCP tools — public tool catalog + dispatch. Server wires these to the SDK.
export { listTools, callTool } from './mcp/tools/index.js'
export type { ToolDef, ToolContext } from './mcp/tools/index.js'

// RAG core (embed + cosine + chunking)
// Re-exports live here so tools/, tests/ and consumers stay decoupled from the file layout.
export { EmbedClient, EMBED_DIMS } from './rag/embed.js'
export type { EmbedClientConfig } from './rag/embed.js'
export { chunkText, CHUNK_CHAR, CHUNK_OVERLAP } from './rag/chunk.js'
export { vecToBlob, blobToVec } from './rag/vec.js'
export { search } from './rag/search.js'
export type { SearchOptions, SearchSource } from './rag/search.js'
export type { RagIndex, SearchHit } from './rag/types.js'

// Storage (sqlite-vec + vault filesystem)
export { openDb } from './storage/db.js'
export type { OpenDbOptions, BrainDb } from './storage/db.js'
export { defaultVaultConfig } from './storage/vault.js'
export type { VaultConfig } from './storage/vault.js'

// Config (env + optional TOML/JSON file)
export { loadConfig, defaultConfig } from './config/index.js'
export type { BrainConfig } from './config/index.js'
