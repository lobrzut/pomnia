> **This release does not re-chunk your vault.** The chunker is unchanged since 0.1.69, so the upgrade is a code swap. Two things are worth a reindex afterwards: `sprawy/` is now indexed, and if your vault lives on an SMB share you may be missing files you do not know about — see below.

## Six clients, one wrong character

Connecting an agent writes the Pomnia block into up to six config files at once. That generator appended `/mcp` to whatever was in the URL field, and the panel it sits behind is served at `/admin` — which is the URL a person copies out of their browser. The result was `/admin/mcp`: a real route, gated on an admin role, answering `403` with a hint telling the user to mint an admin token they never needed. One paste, six broken clients, each failing the next time it started.

The URL is now normalised (`/admin`, `/mcp` and `/status` are stripped before the endpoint is appended), and — more to the point — **the endpoint is asked whether it is there before anything is written**. The probe is the same `initialize` request the agent will send, so passing it means the agent connects. When it fails, yesterday's working config is left alone.

The `403` itself now leads somewhere useful. It said "this endpoint needs an admin token"; it now says agents connect to `/mcp` and that a URL ending in `/admin/mcp` should lose the `/admin`.

## Claude Desktop on Windows could not work at all

Two independent faults in the same generated entry, both invisible until the log was read:

- `command: "npx"` is resolved through `where`, which returns `C:\Program Files\nodejs\npx` — handed to `cmd.exe` unquoted, so it fails on the space with `'C:\Program' is not recognized`.
- `--header "Authorization: Bearer <token>"` is split by `cmd.exe` on its space. The server received an **empty** Authorization header, answered `401`, and `mcp-remote` fell into OAuth registration and died with `Invalid OAuth error response ... [object Response]` — an error naming none of the above.

Windows entries now run through `cmd /c npx` (a path with no spaces, quoted by `cmd` itself) and pass the token in an environment variable, with no space to split on.

## Notes that were on disk and not in the index

`/healthz` reported `ok` for a server whose vault was partly unreadable. It only ever checked whether the index was *empty*; a partial one looked identical to a complete one.

On the appliance that produced this release, 206 of 3573 files could be listed and not opened — a CIFS mount without `iocharset=utf8` decodes non-ASCII filenames into names that survive `readdir` and fail `open`. `ls` showed them, the indexer skipped them, `rsync` called it `file has vanished` and quietly wrote short backups. Searches simply never returned those notes, and nothing anywhere said why.

`checks.index` now compares what is on disk with what is indexed and goes `degraded` when they diverge, naming the mount as a suspect because a reindex alone will not fix that case. It walks with the indexer's own skip rules, so quarantined notes in `_review/` are not reported as missing.

If your vault is on a network share, check your mount options.

## `sprawy/` is now indexed

Hand-written case files — filings, deadlines, the kind of note that opens with "this is the only source of the current state" — sat in the vault invisible to search. The one place you would look for them was the one place that could not find them.

## Distillation moves to `llama3.1:8b`

The default was `qwen2.5:14b`, on the assumption that the larger model writes the better note. Measured against the gate that decides whether a note reaches retrieval at all, the assumption does not hold:

| 30 conversations, 2 passes | `qwen2.5:14b` | `llama3.1:8b` |
|---|---|---|
| mean score | 5.838 | **6.853** |
| passes the quality gate | 73% | **87%** |
| `attempts_failed` per note | 1.03 | **1.87** |
| median seconds per conversation | 18.5 | **9.2** |

Better on 23 of 30, deterministic per host, replicated on a second machine with a different GPU, and confirmed on a held-out set the numbers never steered — read by hand before the change was made.

The `attempts_failed` row matters more than the mean. That section is the one an agent needs most and the corpus had least of.

This was measured on one corpus (Polish and English, homelab and development work), so it is a better default rather than a proof about every vault. The rig that produced these numbers is public in [`pomnia-lab`](https://github.com/lobrzut/pomnia-lab) — point it at your own notes if yours look different. Set `BRAIN_DISTILL_MODEL` to keep the old one.

Two supporting changes: distillation now asks Ollama for an 8192-token context (the default 4096 has to hold a 12 000-character transcript *and* the note it produces), and retries once when a model returns nothing usable — an 8B model loses roughly one note in thirty to a repetition loop, which one retry covers.

## Two vaults, drifting, with nothing saying so

Pointing Brain at a server does not move this machine's vault. The desktop keeps distilling into its own, agents read the server's, and neither side is wrong by itself — only the pair is. On the install behind this release the local vault sat 78 sessions behind 589 for weeks, and it surfaced by counting files.

Both halves of that answer were already in settings, so the app now says it.

## The replica push borrowed a token that cannot write

"Send changes to server" used the Connect token, which is minted for agents: reads passed, writes were refused, and the server's hint suggested reissuing the Connect token as an admin — which would hand admin write access to every MCP client on the machine. The purpose-built `replicaToken` existed and was wired everywhere except the point of use.

The push now prefers it, the panel says which credential it will use, and when there is none it says so plainly.

## "The local search engine did not start" is not always an error

With Brain pointed at a server, the embedded engine has no job — agents read the remote index, and a local one would fill a database nobody queries. That was reported as an error. A red cross on correct behaviour is not a warning; it is training to ignore warnings.
