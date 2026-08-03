# Deploying brain-core

brain-core is the same engine Pomnia Desktop embeds. Running it on a server is
not a port — it is the same code with a different entry point (`dist/daemon.js`
instead of a forked child).

## What it needs

- **Node 20+** and an **Ollama** reachable over HTTP with the embedding model
  pulled (`ollama pull nomic-embed-text`). Without it the daemon starts but
  every index and every search fails — deliberately and loudly.
- A **vault directory**: `distilled/`, `sessions/`, `USER.md`, optional
  `skills/`. This is the plaintext knowledge root, the same folder Pomnia opens.
- A writable **data dir** for `vectordb/library.db` and `mcp-tokens.json`.

## Auth

Binding to anything other than loopback turns Bearer auth on. Tokens live in
`<data-dir>/mcp-tokens.json`:

```json
[{ "name": "claude-code-laptop", "token": "btk_…", "created": "2026-08-03T12:00:00Z" }]
```

The file is re-read when it changes, so adding or revoking a token takes effect
without a restart. **A missing, empty or malformed file refuses every request.**
That is the intended behaviour: a typo in the path must not read as "auth off".
The startup line tells you which file was loaded and how many tokens it holds —
read it, do not assume.

`/healthz` stays public so systemd and Docker can probe before any token exists.
Everything under `/mcp`, including `/mcp/activity`, requires a token.

A valid token is never rate-limited. Repeated failures from one address are.

## systemd

```bash
sudo useradd --system --create-home pomnia
sudo mkdir -p /opt/pomnia/brain-core /var/lib/pomnia
sudo rsync -a packages/brain-core/dist packages/brain-core/node_modules /opt/pomnia/brain-core/
sudo cp packages/brain-core/deploy/brain-core.service /etc/systemd/system/
sudo chown -R pomnia:pomnia /opt/pomnia /var/lib/pomnia
sudo systemctl daemon-reload && sudo systemctl enable --now brain-core
journalctl -u brain-core -f
```

## Docker

Build from the repository root — the Dockerfile expects that context:

```bash
docker build -f packages/brain-core/deploy/Dockerfile -t pomnia/brain-core .
docker run -d --name brain-core -p 7862:7862 \
  -v /srv/pomnia:/var/lib/pomnia \
  --add-host host.docker.internal:host-gateway \
  pomnia/brain-core --host 0.0.0.0 --data-dir /var/lib/pomnia \
                    --vault-root /var/lib/pomnia/vault \
                    --ollama-url http://host.docker.internal:11434
```

`better-sqlite3` is compiled inside the image. Copying `node_modules` from a
host with a different Node version yields a binary for the wrong
`NODE_MODULE_VERSION` and fails on the first query rather than at startup.

## Options

| Flag | Env | Default |
| --- | --- | --- |
| `--host` | `BRAIN_HOST` | `127.0.0.1` |
| `--port` | `BRAIN_PORT` | `7862` |
| `--data-dir` | `BRAIN_DATA_DIR` | `~/.pomnia/brain` |
| `--vault-root` | `BRAIN_VAULT_ROOT` | `<data-dir>/vault` |
| `--skills-root` | `BRAIN_SKILLS_ROOT` | `<vault-root>/skills` |
| `--ollama-url` | `BRAIN_OLLAMA_URL` | `http://127.0.0.1:11434` |
| `--embed-model` | `BRAIN_EMBED_MODEL` | `nomic-embed-text` |
| `--tokens-file` | — | `<data-dir>/mcp-tokens.json` |

## Sharing an index with Pomnia Desktop

Chunking is byte-identical to the desktop build and to the Python brain
(verified across a 1886-note vault), and both apply the nomic
`search_document:` / `search_query:` prefixes. A `library.db` built by one is
therefore usable by the other — as long as both run the same embedding model.

Changing `--embed-model` invalidates the index. Rebuilding it is not optional
and **an incremental reindex will not do it**: file contents have not changed,
so the indexer skips every file and reports success. Delete `library.db` first.

## Not implemented here

`run_skill`, `search_code` and `code_status` are registered but return a
"not implemented" message. They exist in the Python brain
(`pipeline/codeindex.py`). Distillation is deliberately absent: the LLM stage
belongs on the client, the server only embeds and serves.
