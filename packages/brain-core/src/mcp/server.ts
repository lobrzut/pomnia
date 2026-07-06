/**
 * MCP HTTP server — the entry point clients (Claude Code, Cursor, Antigravity, …)
 * hit at `POST /mcp` with JSON-RPC 2.0 messages.
 *
 * We use the low-level `Server` class from `@modelcontextprotocol/sdk` (not the
 * high-level `McpServer` wrapper) because our tool catalog is defined as plain
 * JSON schemas — the wrapper's `registerTool` expects Zod shapes, which would
 * force us to duplicate the schemas. Registering two request handlers
 * (ListTools + CallTool) is the same amount of code and keeps `tools/index.ts`
 * as the single source of truth for tool metadata.
 *
 * Transport: `StreamableHTTPServerTransport` (stateful mode). Session IDs come
 * from `randomUUID`; MCP clients thread them through the `mcp-session-id`
 * header. Matches the Python impl's mcp-proxy behavior.
 */

import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { BrainConfig } from '../config/index.js'
import { EmbedClient } from '../rag/embed.js'
import { openDb } from '../storage/db.js'
import { defaultVaultConfig } from '../storage/vault.js'
import { callTool, listTools, type ToolContext } from './tools/index.js'

export interface BrainServerOptions {
  config: BrainConfig
}

export interface BrainServer {
  start(): Promise<void>
  stop(): Promise<void>
  /** Live URL for logging / health checks. */
  readonly url: string
}

/**
 * Assemble a `BrainServer`. Nothing binds/opens until you call `.start()` — so
 * this is safe to call from Reliqua's Electron main and the standalone daemon
 * without spending resources up front.
 */
export async function createBrainServer(config: BrainConfig): Promise<BrainServer> {
  const vault = defaultVaultConfig(config.dataDir)

  // Lazy resources — opened at start(), closed at stop().
  let http: HttpServer | null = null
  let transport: StreamableHTTPServerTransport | null = null
  let mcp: Server | null = null
  let ctx: ToolContext | null = null

  const url = `http://${config.host}:${config.port}/mcp`

  return {
    url,

    async start() {
      // Open storage + embedder first so the MCP server refuses connections
      // if either is broken (fail-fast beats accepting requests we can't serve).
      const db = openDb({ dbPath: `${config.dataDir}/vectordb/library.db` })
      const embedder = new EmbedClient({
        ollamaUrl: config.ollamaUrl,
        embedModel: config.embedModel,
      })
      ctx = {
        db,
        embedder,
        vaultRoot: vault.root,
        userMdPath: vault.userProfilePath,
      }

      mcp = new Server(
        { name: 'brain-core', version: '0.1.0' },
        { capabilities: { tools: {} } },
      )

      // tools/list — advertise our catalog.
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }))

      // tools/call — dispatch to the right handler in `tools/index.ts`.
      mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
        if (!ctx) throw new Error('brain-core: tools called before context ready')
        try {
          const text = await callTool(req.params.name, req.params.arguments ?? {}, ctx)
          return { content: [{ type: 'text', text }] }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // Return the error as tool content — mirrors Python's TextContent("error: ...").
          return {
            content: [{ type: 'text', text: `error: ${msg}` }],
            isError: true,
          }
        }
      })

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      })
      await mcp.connect(transport)

      http = createServer((req: IncomingMessage, res: ServerResponse) => {
        const pathOnly = req.url?.split('?')[0] ?? ''
        if (pathOnly === '/healthz' || pathOnly === '/healthz/') {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true, service: 'brain-core' }))
          return
        }
        // All MCP traffic goes through POST/GET/DELETE on `/mcp`. Anything
        // else gets a 404 — matches Python mcp-proxy behavior + means
        // `/register` / `/.well-known/*` OAuth discovery probes get a proper
        // 404 instead of stalling. See project memory desktop-mcp-remote-fix.
        if (!req.url?.startsWith('/mcp')) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'not_found', hint: 'MCP endpoint is at /mcp' }))
          return
        }
        transport?.handleRequest(req, res).catch((err: unknown) => {
          console.error('[brain-core] transport error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('internal error')
          }
        })
      })

      await new Promise<void>((resolve, reject) => {
        http?.once('error', reject)
        http?.listen(config.port, config.host, () => resolve())
      })
    },

    async stop() {
      // Order matters: close inbound (http) first so no new requests land while
      // we're tearing down the transport / db.
      if (http) {
        await new Promise<void>((resolve) => http?.close(() => resolve()))
        http = null
      }
      if (transport) {
        await transport.close().catch(() => {})
        transport = null
      }
      if (mcp) {
        await mcp.close().catch(() => {})
        mcp = null
      }
      if (ctx?.db) {
        ctx.db.close()
      }
      ctx = null
    },
  }
}
