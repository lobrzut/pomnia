# Pomnia on Linux

`brain-core` is the whole server: one Node process that speaks MCP over HTTP,
searches a vault, and serves it to any agent that can hold a bearer token. No
web app, no database server, no queue. It is the same engine Pomnia Desktop
embeds — same code, different entry point (`dist/daemon.js` instead of a fork).

```bash
git clone https://github.com/lobrzut/pomnia && cd pomnia/packages/brain-core
npm ci && npm run build
sudo ./deploy/install.sh
```

The installer creates a system user, writes the unit, starts the service, and
**checks that it answers before telling you it worked**. It prints the first
token once. Re-running upgrades in place and never rotates that token.

## What it needs

| | |
| --- | --- |
| Node | 20 or newer |
| Ollama | for embeddings — `ollama pull nomic-embed-text` |
| Disk | the vault, plus roughly half its size again for the index |
| RAM | ~200 MB serving; indexing peaks higher, capped at 2 GB by the unit |

Ollama is `Wants=`, not `Requires=`. Without it the server still starts and
still serves skills, profile and note reads; only semantic search stops, and
`/healthz` reports `degraded` instead of pretending. Refusing to start would
turn a partial outage into a full one.

**Embeddings honesty:** this Node daemon talks to Ollama only
(`POST /api/embed`). The zero-Ollama ONNX/fastembed path lives in the older
Python Brain hub Docker image (`BRAIN_EMBED_BACKEND=fastembed`) — see
`docs/BRAIN-SERVER-EMBEDDED-MODEL.md`. The Dockerfile in this folder does
**not** bake an ONNX model; do not expect `docker run` of brain-core to search
without a reachable Ollama (or a future Node ONNX backend).

Public `/healthz` without a Bearer token redacts index counts (`index: null`)
and check *reasons*. The overall `status` stays public. Full numbers: Bearer
on `/healthz`, or the panel at `/admin` (Stan / Silnik).

## Endpoints

| Path | Auth | What it is |
| --- | --- | --- |
| `/` | optional | Status page. Adds per-check detail when the request carries a token. |
| `/healthz` | optional | Health. Verdict public; reasons and counts need a token. |
| `/mcp` | **required** | The MCP endpoint. Point agents here. |
| `/mcp/activity` | **required** | Last tool call — echoes query text, so it is gated. |
| `/sync/plan`, `/sync/file`, `/sync/reindex` | **required** | Replication intake. Replicas only. |

Everything else 404s, including `/.well-known/*` and `/register` — some MCP
clients probe those for OAuth and stall on anything but a clean 404.

`/healthz` answers **503** when the server cannot actually serve: an empty
index, an unreadable vault, a database that will not open. It is not a liveness
probe. A process that is up but returns nothing for every search is precisely
the state this reports, because it used to be the state that looked healthy.

```json
{"ok":true,"status":"degraded","checks":{"ollama":{"state":"degraded"}}}
```

## Who may write

The vault records its own writer in `state/vault-writer.json`. An instance that
is not the recorded writer serves read-only and names who holds it, so two
writable servers over one corpus cannot happen by accident — that already
happened once between this server and the desktop and cost 99 files' worth of
divergence that nothing reported for months.

```bash
# take ownership deliberately; the previous holder starts refusing
sudo -u pomnia node dist/daemon.js --data-dir /var/lib/pomnia \
  --vault-root /var/lib/pomnia/vault --claim-vault
```

Not an MCP tool, on purpose: an agent must not be able to seize a corpus
mid-conversation. `--read-only` in the unit pins this host as a replica
regardless of the marker — leave it on unless this server owns the vault.

## Getting a vault onto it

From Pomnia Desktop: **Connect → push changes to the server**. It sends only
what changed and triggers a reindex afterwards; nothing is ever deleted on the
replica — files missing on the desktop are reported, not removed.

Or build an index from a vault already on disk:

```bash
sudo -u pomnia node dist/daemon.js --data-dir /var/lib/pomnia \
  --vault-root /var/lib/pomnia/vault --reindex
```

## Accounts and tokens

Two kinds of credential, because they are stolen and revoked differently:

| | for | how |
| --- | --- | --- |
| **Account** | a person at the panel | login + password, session cookie |
| **Token** | an agent or a script | `Authorization: Bearer …`, no expiry |

The installer creates one account with a **random** password and prints it
once. There is no `admin/changeme`: a default that is meant to be changed is a
default that stays. Change it after the first login anyway — it was on a
terminal.

```bash
# another person, or a replacement if you lose the first
sudo -u pomnia node dist/daemon.js --data-dir /var/lib/pomnia \
  --add-user someone --role admin
```

The password is read from stdin, never from a flag: an argument lands in shell
history and in `ps` output for every user on the box.

Accounts are always admins — login refuses anything else, so a non-admin
account would be one that can never sign in. For machines, issue a token.

Sessions live in memory: a restart logs everyone out, and a stolen session file
is not a thing that exists. The cookie is `HttpOnly` (script cannot read it, so
an XSS on this origin cannot steal the session), `SameSite=Strict`, scoped to
`/admin`, and `Secure` only over HTTPS — setting it on plain HTTP would make
the browser drop it and the panel would look broken with no explanation.
Mutations additionally carry a CSRF token returned in the login body and never
in a cookie, so a cross-site page cannot read it to replay.

Changing a password ends every session for that account, including the one
doing the changing.

Ten failed logins per quarter hour per address. A password is guessable in a
way a 256-bit token is not, so it does not share the bearer budget.

## Tokens

`/var/lib/pomnia/mcp-tokens.json`, mode 600, owned by `pomnia`:

```json
[{ "name": "claude-code-laptop", "token": "btk_…", "created": "2026-08-03T12:00:00Z" }]
```

Re-read when it changes, so adding or revoking takes effect without a restart.
**A missing, empty or malformed file refuses every request** — a typo in the
path must not read as "auth off". The startup line says which file was loaded
and how many tokens it holds; read it rather than assuming.

A **valid token bypasses the rate limiter** on purpose: the limit exists to
make guessing pointless, and refusing a correct token because someone behind
the same address burned the budget is a self-inflicted outage — by far the
likelier event.

## Exposing it

The unit binds `0.0.0.0`. On a LAN that is the point. Beyond one:

- Terminate TLS in front of it (Caddy, nginx). brain-core speaks plain HTTP by
  design and does not manage certificates.
- Forward `X-Forwarded-Proto` so the status page prints `https://` URLs.
- Do not open 7865 to the internet directly.

## When something is wrong

```bash
systemctl status pomnia-brain-core
journalctl -u pomnia-brain-core -f
curl -H "Authorization: Bearer $TOKEN" http://localhost:7865/healthz | jq
```

Authenticated health names the reason for every failing check — which path,
which model, which URL. Read that first. Without a Bearer token, `/healthz`
still returns the verdict (`ok` / `degraded` / `down`) but sets `index` to
`null` and strips check reasons — zeroes used to look like an empty index
while `checks.index` said `ok`. Panel **Stan** uses `/admin/health` (session)
for the full numbers.

**First run honesty:** this host is usually a read-only replica (`--read-only`
in the unit). Desktop owns the vault (SoT); agents that `save_conversation`
against `:7865` will be refused with *held by …*. Push from Desktop Connect
to refresh the copy; do not `--claim-vault` unless you mean to steal ownership.

A crash loop stops after five restarts in a minute and leaves the unit
`failed`, deliberately: a stopped service someone notices beats a restart
counter nobody reads.

## Docker

Build from the repository root — the Dockerfile expects that context:

```bash
docker build -f packages/brain-core/deploy/Dockerfile -t pomnia/brain-core .
docker run -d --name brain-core -p 7865:7865 \
  -v /srv/pomnia:/var/lib/pomnia \
  --add-host host.docker.internal:host-gateway \
  pomnia/brain-core --host 0.0.0.0 --port 7865 --data-dir /var/lib/pomnia \
                    --vault-root /var/lib/pomnia/vault \
                    --ollama-url http://host.docker.internal:11434
```

`--port` is spelled out because arguments after the image name replace `CMD`
entirely. Leaving it off used to hand the daemon its own default (7862) while
`-p` published 7865, so the container listened on a port nobody had mapped —
and the healthcheck, probing from inside, called it healthy throughout. The
image now also sets `BRAIN_PORT=7865`, which survives a `CMD` override, so the
default is right even when the flag is forgotten. Check the first log line:

```bash
docker logs brain-core | head -1     # [brain-core] listening on http://0.0.0.0:7865 …
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
| `--instance-label` | `BRAIN_INSTANCE_LABEL` | hostname |
| `--vault-owner` | `BRAIN_VAULT_OWNER` | — |
| `--tokens-file` | — | `<data-dir>/mcp-tokens.json` |
| `--read-only` | `BRAIN_READ_ONLY` | off |
| `--reindex` | — | build the index on start, serving meanwhile |
| `--claim-vault` | — | take write ownership, then exit |

## Sharing an index with Pomnia Desktop

Chunking is byte-identical to the desktop build and to the old Python brain
(verified across an 1886-note vault), and both apply the nomic
`search_document:` / `search_query:` prefixes. A `library.db` built by one is
usable by the other — as long as both run the same embedding model.

Changing `--embed-model` invalidates the index. Rebuilding is not optional and
**an incremental reindex will not do it**: file contents have not changed, so
the indexer skips every file and reports success. Delete `library.db` first.

## Not implemented here

`run_skill`, `search_code` and `code_status` are registered but return a
"not implemented" message. Distillation is deliberately absent: the LLM stage
belongs on the client, the server only embeds and serves.
