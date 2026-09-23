# @pomnia/brain-core

The memory server behind Pomnia: one Node process that answers **MCP**, serves the
**admin panel** and reports **health**, over a vault of markdown notes and a local
search index (`library.db`, SQLite + sqlite-vec).

It runs in two places:

| Where | How | Address | Auth |
| ----- | --- | ------- | ---- |
| **Pomnia Desktop** | forked by the app, on this machine | `http://127.0.0.1:7862/mcp` | none (loopback) |
| **Server** (homelab, VPS) | Linux tarball from each release, or the Docker image | `http://<host>:7865/mcp` | Bearer token |

The code default port is `7862`; the server image and install set `BRAIN_PORT=7865`,
so a remote brain and a desktop brain never fight over one port.

## MCP tools

| Tool | What it does |
| ---- | ------------ |
| `search_library` | Hybrid semantic + keyword search over distilled notes, sessions and the document library. **Compact by default**: path, date, score and a one-line snippet, at most one hit per note. `compact: false` returns full passages. |
| `read_note` | Full text of a search hit, by path. Read-only, confined to the vault, reads only what the cap can return. |
| `get_user_profile` | `USER.md` (≤ 2200 chars) plus a preview of `AGENTS.md`; the session-start read. |
| `memory` | Add, replace or remove durable entries in `USER.md`. |
| `save_conversation` | Save the session as a structured note in `vault/sessions/` — on the user's phrase only. |
| `checkpoint_session` | Milestone note in `vault/sessions/checkpoints/`, when auto-checkpoint is on. |
| `library_status` | Index counts and a sample of files. |
| `list_skills` / `get_skill` / `list_cli_skills` | The user's skills and the CLI skill catalogue. |
| `list_prompts` / `get_prompt` | The user's reusable prompts, with arguments filled in. |

## HTTP endpoints

- `/mcp` — MCP over streamable HTTP. Stateless: a new server per request.
- `/healthz` — no auth; version, vault, index, disk and embedder state.
- `/admin` — panel for tokens, accounts, settings, skills and prompts (login required).

## Embeddings and distillation

- **Embeddings:** `BRAIN_EMBED_BACKEND=ollama` (desktop default, `nomic-embed-text`) or
  `fastembed` (built-in ONNX embedder — the server and Docker default, so search works
  with no Ollama on the box). Changing the backend or model means a full reindex.
- **Distillation** (chat → note) uses an Ollama chat model, `llama3.1:8b` by default,
  and is optional on a server (`BRAIN_DISTILL`).

## Running a server

```bash
# Docker — build from the repository root, not from this directory
docker build -f packages/brain-core/deploy/Dockerfile -t pomnia/brain-core .
docker run -d --cpus 1.5 --memory 3g -p 7865:7865 \
  -v /srv/pomnia:/var/lib/pomnia pomnia/brain-core

# First credentials — the image's entrypoint is the daemon, so arguments go straight to it
docker run --rm -v /srv/pomnia:/var/lib/pomnia pomnia/brain-core --add-token laptop       # agent token, printed once
docker run --rm -i -v /srv/pomnia:/var/lib/pomnia pomnia/brain-core --add-user me --role admin  # panel account, password on stdin

# Tarball install: the same flags on the `brain-core` command
brain-core --add-token laptop
```

With `--host 0.0.0.0` Bearer auth is on and every request needs a token; with no
tokens at all, every request is refused by design. Configuration is by flag or
`BRAIN_*` environment variable — `--data-dir`, `--vault-root`, `--port`, `--host`,
`--embed-backend`, `--ollama-url`, `--read-only`, `--tokens-file` and others; see
`src/config/index.ts`.

## Layout

```
src/mcp/      MCP server, auth gate, tool handlers (src/mcp/tools/)
src/rag/      chunking, embeddings, hybrid search, rerank
src/storage/  library.db (sqlite-vec), vault ownership
src/admin/    tokens, accounts, settings API behind /admin
src/sync/     vault replication between instances
src/distill/  chat → note via Ollama
src/daemon.ts CLI entry (server, --reindex, --add-token, --add-user, …)
```

This package replaced the original Python hub (frozen at tag `python-final`). Its
version follows the Pomnia app.

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
