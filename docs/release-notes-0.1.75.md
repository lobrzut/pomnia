> **Everything since 0.1.70 in one release.** 0.1.71 through 0.1.74 were built and superseded the same week; nothing was published under those numbers, so this is the only upgrade to take. No re-chunk and no reindex is required — the chunker has not changed since 0.1.69. Two things are worth a reindex afterwards: `sprawy/` is now indexed, and if your vault lives on an SMB share you may be missing files you do not know about — see *Notes that were on disk and not in the index*.

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

## Replication stopped fighting itself

Three faults, all found by pushing a real vault between a Windows desktop and a
Linux server rather than by reading the code.

**A conflict on `USER.md` could never heal.** When both sides change a file the
receiver keeps its copy and writes the incoming one beside it as `USER-2.md` —
which then has to pass the same path validator, and `USER-2.md` is not itself on
the list of files allowed at the vault root. So it was refused, and refused again
on every later push, while the notes around it replicated normally. `USER.md` is
the profile every agent reads at the start of every session, which made it the
worst possible file to be the one that cannot reconcile.

**CRLF counted as a change.** A Windows desktop writes CRLF and a Linux server
writes LF; the text is identical and the byte hashes are not. Every file either
side had rewritten therefore came back a conflict — and conflicts accumulate:
the same note as `-2`, `-3`, `-4`, one more on every sync. One vault reached 36
copies, 24 of them byte-identical to the file they were "conflicting" with, and
each copy also entered the index, so a search returned the same note several
times. The comparison now ignores CR, and only to decide whether this is a
conflict: what lands on disk is still exactly what the sender wrote.

**`sprawy/` could not travel.** It became indexable in this release and was not
replicable — a directory searchable on one machine and unreachable from the next.

## Two controls that could never have worked

**"Nowy token"** called `window.prompt()`. Chromium disables that inside Electron, so every click answered `prompt() is not supported` and no token was ever minted. Not a regression and not specific to one machine — the button had never worked for anyone, on any platform this ships to, since it was written. It now mints under a name derived from the host and the date. The name only has to be recognisable when you revoke it later, and a name typed into a box that does not exist is worth less than a token that appears.

**The "Legacy Python hub" toggle** generated MCP blocks for the retired three-SSE architecture. Flipping it produced configs pointing at ports that stopped answering, which presents to the user as "Pomnia will not connect". It is gone, and the remote hub is pinned to brain-core — so a setting saved back when the hub still existed cannot keep writing dead configs on your behalf.

## The token in the file now outranks the token in the cache

Pomnia keeps the connect token in two places: `app-settings.json`, and a cache in the window. Every setting hydrated cache-first, which is right for a preference you set in the app — and wrong for a token.

A token is minted on a server that can revoke or rotate it, and the file is the copy the app itself, the installer, and anything scripted against it will write. The cache has no way to hear about any of that. So a stale token survived every restart, *and was written back over the good value in the file on each start*. The app then reported that it could not connect — with the working token sitting on disk, being overwritten once per launch.

The file now wins. The cache cannot legitimately be ahead: entering a token in the UI writes both copies in the same call. If a rotated token has left your app unable to connect, this release fixes it without you touching anything.

## Recall could quote a note you deleted

The index is not rebuilt every time a note is removed, renamed or merged, so its chunks stay behind — and search kept returning them. Real text, a real-looking path, a real date, ranked among genuine results. Nothing in the answer marked it as gone.

This is the worst shape a wrong answer can take here, because it does not come from the model. The agent quotes the passage faithfully and cites a file that does not exist. The existing grounding labels cannot catch it either: the chunk really was about the topic, back when it was true.

Measured on a live vault during an audit: **2688 rows indexed against 2666 notes on disk** — twenty-two quotable passages with nothing behind them.

`search_library` now checks that each result's file is still there and withholds the dead ones, reporting how many it withheld so the caller knows something was removed rather than silently seeing fewer results. The cost is one filesystem check per returned row — typically five — against an answer nobody can verify. A file that fails to open for any *other* reason is kept: refusing to answer because a network share is briefly unhappy would be a worse failure than the one this guards against.

`/healthz` gains the matching direction. It already went `degraded` when notes were missing from the index; it now also reports an index holding entries with no note behind them, and says so in different words, because a reindex is the whole fix — pointing at the mount would send you to check something that is working.

## Pomnia now tells the agent when nothing has been saved

Pomnia cannot force a save before an agent's context window ends. It is an MCP server: it sees tool calls, not the agent's remaining context, and when a window ends the agent is simply gone — there is no shutdown, no last call, nothing to hook. A session can spend an hour making decisions and end with the vault untouched, because saving depends on the agent remembering to.

What it can do is state the fact in the one channel that reliably reaches an agent mid-session: the text it is already reading. After 12 tool calls and 25 minutes with nothing written to the vault, the reminder is appended to the result of whatever the agent called anyway — no new tool to discover, no client support required, identical in Cursor, Claude, Gemini and anything else on the wire. Ten-minute cooldown, so a long session is reminded rather than hounded.

It stays silent when you have turned auto-checkpoint off. That setting is an instruction, not a preference to argue with.

## Sync conflicts stopped multiplying

Recording a conflict does not resolve it. Both sides keep their own copy of the file, so the next sync saw the same disagreement and wrote another numbered copy — `-3`, then `-4`, one more on every run, for as long as nobody merged the two by hand.

On a live vault two checkpoints reached `-9` in a day and a half. Five of those copies appeared overnight while nothing was being edited at all: the two sides simply disagreed, and every sync said so again in a new file. Each copy also enters the index, so one note answers a search several times. Deleting them achieved nothing, because the next sync put them back — which from the outside looks like a vault that will not stay tidy.

A disagreement is now recorded once. Before writing a new copy, Pomnia looks for one that already holds exactly the incoming bytes; if it is there, nothing is written. Line endings are ignored in that comparison, for the same reason the conflict test itself ignores them.

If your vault already carries `-2`…`-9` copies from the old behaviour, the first sync after upgrading will **not** add another one on top. Those existing copies are yours to delete — check them first, since some may hold content the base file does not.

## Conversations were being titled with the clock

A conversation's title is its first user message, and clients wrap that message in metadata before the person's actual words — `<timestamp>Sunday, Aug 30, 2026, 9:52 PM (UTC+2)</timestamp>`. Taking the first 80 characters therefore titled the conversation with the time it happened, and that title becomes the note's filename.

On a live vault this had reached **417 of 2192 distilled notes — 19%**, named after when they happened rather than what they were about. Search embeddings come from the note body, so those notes stayed findable by meaning; but the filename is what keyword scoring matches against, at the highest keyword weight there is. They carried a strong signal for the word "timestamp" and none at all for their subject. It showed in the UI too, as a raw tag in the distillation progress line.

Leading metadata blocks are now stripped before the title is taken, and only for the title — a question with markup in the middle is still distilled intact. When nothing usable remains, the conversation id is used instead: an id is merely opaque, while a date dressed up as a subject looks like it means something.

This fixes new imports. Notes already named this way keep their filenames; their real subject is in the body, and a rename is a decision about your own vault rather than something an upgrade should do to it.

## The Max profile is gone

It offered a 32B model at 20 GB on the assumption that a bigger model writes a better note — the same assumption the measurement one size class down had already refuted: `llama3.1:8b` scored 6.853 against the 14B's 5.838 and ran about twice as fast.

Nothing had ever tested the 32B, and on the hardware here it cannot be: a 32B has to be split across two 12 GB cards, which makes the throughput figure a measurement of PCIe rather than of the model. Its other claim — the longest context — answers a problem nobody has, with prompts measuring around 4062 tokens against a window of 8192.

A tier that promises quality, cannot be measured, and carries small print admitting so is the same failure the rest of this work has been removing: a confident label with nothing behind it. With a 24 GB card, run Standard and keep the card free.

**Lite stays**, described as what it is — not the bottom of a quality ladder, but the only model that runs on a 4–6 GB card.

## Cards no longer get sliced while they arrive

The source cards on the dashboard animate in from 6px below, inside a scrolling column that had 4px of room underneath. The bottom row was clipped for the ~280ms of its own entrance, and its glow stayed clipped afterwards.

## Which half of this you are upgrading

Pomnia is two programs that update independently. Installing the desktop app does not update a brain-core you run elsewhere, and vice versa.

| Fix | Desktop installer | brain-core |
|---|---|---|
| Six MCP clients written with a working URL | ✅ | — |
| Claude Desktop on Windows connects at all | ✅ | — |
| Endpoint probed before configs are written | ✅ | — |
| `403` explains itself | — | ✅ |
| `/healthz` sees notes missing from the index | — | ✅ |
| `/healthz` sees orphaned index entries | — | ✅ |
| `sprawy/` indexed and replicated | — | ✅ |
| Distillation defaults to `llama3.1:8b` | ✅ | — |
| Vault drift is reported | ✅ | — |
| Replica push uses a token that can write | ✅ | — |
| Recall withholds deleted notes | — | ✅ |
| Reminder when the vault has gone quiet | — | ✅ |
| Conflicts recorded once, not per sync | ✅ | ✅ |
| Generated skills index never replicates | ✅ | ✅ |
| "Nowy token" mints again | ✅ | — |
| Legacy hub toggle removed | ✅ | — |
| File beats cache for the connect token | ✅ | — |
| Titles no longer taken from the timestamp | ✅ | — |
| Max profile removed | ✅ | — |
| Cards not clipped on entry | ✅ | — |

If your agents connect to a brain-core on another machine, the server-side fixes arrive when you update **that** server, not when you install this app. The two conflict fixes are the exception: both sides write conflict copies, so they have to be on both to end the multiplication.

## Verifying the download

Compare the SHA256 of the installer against this value before running it:

```
bdc5ad038ca9c7a386f727109df2b2fef8e26ff287563f2aef3679d5f7808c2b
```

```powershell
Get-FileHash -Algorithm SHA256 .\Pomnia-0.1.75-setup.exe
```

The build is unsigned, so Windows SmartScreen will warn. "More info" → "Run anyway" is the expected path; the hash is what actually tells you the file is the one that was built.
