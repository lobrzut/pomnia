# Pomnia on Linux

`brain-core` is the whole server: one Node process that speaks MCP over HTTP,
searches a vault, and serves it to any agent that can hold a bearer token. No
web app, no database server, no queue. It is the same engine Pomnia Desktop
embeds — same code, different entry point (`dist/daemon.js` instead of a fork).

Download the server tarball from
[releases](https://github.com/lobrzut/pomnia/releases/latest) — it is built on
Linux with its native modules already compiled, so there is nothing to build.

One shot (POSIX `sh`, so `| sh` is dash-safe on Debian). Resolves
`pomnia-brain-core-*-linux-x64.tar.gz` from `releases/latest`, checks sha256
when that asset exists, then `sudo`s into `deploy/install.sh`.
`POMNIA_BOOTSTRAP_DRY_RUN=1` stops after unpack (no sudo, no unit).

```bash
curl -fsSL https://raw.githubusercontent.com/lobrzut/pomnia/master/packages/brain-core/deploy/bootstrap.sh | sh
```

Or unpack yourself:

```bash
tar -xzf pomnia-brain-core-*-linux-x64.tar.gz
cd pomnia-brain-core
sudo ./deploy/install.sh
```

The `.AppImage` and `.deb` on that page are the **desktop app**, not this. They
are a graphical Pomnia with a brain inside it; this is the headless server.

From source instead, if you would rather read it first:

```bash
git clone https://github.com/lobrzut/pomnia && cd pomnia
npm ci && npm run build:brain-core
sudo ./packages/brain-core/deploy/install.sh
```

The installer creates a system user, writes the unit, starts the service, and
**checks that it answers before telling you it worked**. It prints the first
token once. Re-running upgrades in place and never rotates that token.

Search needs an embedding model, and Ollama is where it comes from. If none is
answering, the installer asks whether to install it and pull `nomic-embed-text`
(~275 MB), then restarts and checks that the server can actually reach it. Say
no and everything else still works — skills, the profile, saved notes — only
meaning-based search is off, and it says so rather than looking broken. Add
`--with-ollama` to answer yes up front on an unattended run.

Already running Ollama somewhere? Skip that and point the unit at it with
`--ollama-url http://host:11434`. It is a shared service by design: one model
serves Pomnia and everything else on the box.

On a fresh install this host claims the empty vault and becomes the writer, so
an agent can save to it straight away — no desktop required. That loop is
covered end to end by `tests/selfHostedLifecycle.test.ts`: empty vault, the
server claims it, an agent token saves over MCP, a file lands on disk, the index
picks it up, and `search_library` returns the words back.

## What it needs

| | |
| --- | --- |
| Node | 22 or newer (tarball native addons are built on GitHub Actions Node 22) |
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
| `/sync/plan`, `/sync/file`, `/sync/reindex` | **admin** on a vault this host owns, any token on a replica | Write intake (push). |
| `/sync/manifest`, `/sync/fetch` | any valid token | Read surface for pull — client runs `planSync` locally. |

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
mid-conversation. `--read-only` pins this host as a replica regardless of the
marker; the shipped unit no longer sets it, because the default topology is
that **this server is the brain** — it owns the vault, indexes it once and
serves every agent, while the desktop authors and pushes here.

Dropping the flag cannot produce two writers: a vault already claimed elsewhere
keeps this host read-only whatever the flag says. It only lets this host claim
a vault nobody holds.

Writing into a vault this host owns needs an **admin** token, because such a
push edits the source of truth:

```bash
sudo -u pomnia node dist/daemon.js --data-dir /var/lib/pomnia \
  --add-token "pomnia-desktop" --role admin
```

An agent token is refused there with `write_needs_admin` — agent tokens go to
every MCP client on the network, and those must be able to read and to save
conversations, not to rewrite the corpus everyone reads from. A replica keeps
the lower bar: any valid token, because a bad push to a copy costs a resync.

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

**First run honesty:** on a fresh install this host claims the empty vault and
becomes the writer, so agents can `save_conversation` against `:7865` straight
away. If you are pointing it at a vault a desktop already owns, it stays
read-only and names the holder — that is the marker doing its job, not a
misconfiguration. Push from Desktop Connect to fill it, and `--claim-vault`
only when you mean to move authority here for good.

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
