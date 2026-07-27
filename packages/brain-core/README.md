# @pomnia/brain-core

MCP server + RAG for Pomnia desktop (embedded sidecar) and standalone deploy (homelab
daemon, later enterprise Docker).

## What this replaces

Python codebase in [`lobrzut/reliqua-brain-hub`](https://github.com/lobrzut/reliqua-brain-hub),
frozen at git tag `python-final`:

- `dashboard/mcp_rag.py` — MCP tools (search_library, save_conversation, memory,
  get_user_profile, run_skill, list_skills, get_skill)
- `pipeline/rag.py` — embedding + chunking + sqlite-vec search
- `pipeline/mcp_auth_proxy.py` — Bearer auth + rate limit + audit log

The Python codebase stays live on `192.168.x.x` until this package reaches parity
and gets migrated (Phase 5 of the rewrite plan).

## Architecture (MVP: Ollama-only)

```
┌─ MCP client (Claude Code, Cursor, Antigravity, …) ─┐
│                                                     │
│  MCP HTTP transport                                 │
│         │                                           │
│         ▼                                           │
│  ┌────────────────────────────────────────────┐    │
│  │  brain-core daemon (this package)          │    │
│  │                                             │    │
│  │  src/mcp/     — MCP server + tool handlers │    │
│  │  src/rag/     — chunk + embed + cosine     │    │
│  │  src/storage/ — sqlite-vec + vault files   │    │
│  │  src/auth/    — Bearer (skip on localhost) │    │
│  │  src/config/  — env + config file loader   │    │
│  │                                             │    │
│  └──────────┬─────────────────────────────────┘    │
│             │                                       │
│             ▼                                       │
│  Ollama (embed + optional distill)                  │
│  SQLite (library.db with vec extension)             │
│  Filesystem (~/.pomnia/vault/*.md)                 │
└─────────────────────────────────────────────────────┘
```

## Deploy targets

| Target                     | How                                                                |
| -------------------------- | ------------------------------------------------------------------ |
| **Home non-tech**          | Bundled inside Pomnia Electron via `child_process.fork()`         |
| **Home tech** (homelab)     | systemd service on the master, replaces Python `brain-*.service`   |
| **Enterprise** (future)    | Docker image `pomnia/brain-enterprise` with admin panel addon     |

## Status

`0.1.0-dev` — Phase 0 scaffolding only. No implementation yet. See project memory
[`brain-in-node-rewrite-plan`](file:) for the full 6-phase plan.

## Development

```bash
npm install --workspace=@pomnia/brain-core
npm run build --workspace=@pomnia/brain-core
npm test --workspace=@pomnia/brain-core
```

Or, from `packages/brain-core/`:

```bash
npm test
npm run dev  # tsc --watch
```
