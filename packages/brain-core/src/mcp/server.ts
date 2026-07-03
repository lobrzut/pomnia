/**
 * MCP server wrapper.
 *
 * Wraps @modelcontextprotocol/sdk with the specific tools brain exposes:
 * search_library, save_conversation, get_user_profile, memory,
 * list_skills, get_skill, run_skill.
 *
 * MVP: implementation stubs. Full port from Python `dashboard/mcp_rag.py`
 * happens in Phase 1.
 */

import type { BrainConfig } from '../config/index.js'

export interface BrainServerOptions {
  config: BrainConfig
}

export interface BrainServer {
  /** Bind to config.host:config.port and start accepting MCP over HTTP. */
  start(): Promise<void>
  /** Graceful shutdown — flush any in-flight writes, close DB, close server. */
  stop(): Promise<void>
}

export async function createBrainServer(config: BrainConfig): Promise<BrainServer> {
  // Phase 1 will wire this up. Skeleton only for Phase 0.
  const _unused: BrainServerOptions = { config }
  void _unused

  return {
    async start() {
      throw new Error('brain-core Phase 1 not implemented yet — MCP server stub')
    },
    async stop() {
      /* nothing to close yet */
    },
  }
}
