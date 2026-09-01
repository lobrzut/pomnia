> **No re-chunk, no reindex required.** This is a code swap. One thing is worth a reindex afterwards, and 0.1.74 will now tell you when: see *Recall could quote a note you deleted*.

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
| "Nowy token" mints again | ✅ | — |
| Legacy hub toggle removed | ✅ | — |
| File beats cache for the connect token | ✅ | — |
| Cards not clipped on entry | ✅ | — |
| Recall withholds deleted notes | — | ✅ |
| Conflicts recorded once, not per sync | ✅ | ✅ |
| Titles no longer taken from the timestamp | ✅ | — |
| Max profile removed | ✅ | — |
| `/healthz` reports orphaned index entries | — | ✅ |
| Reminder when the vault has gone quiet | — | ✅ |

If your agents connect to a brain-core on another machine, the anti-drift fixes arrive when you update **that** server, not when you install this app. The conflict fix is the exception: both sides write conflict copies, so it has to be on both to end the multiplication.

## Verifying the download

Compare the SHA256 of the installer against this value before running it:

```
326b0393e82a50748d74ae83a6f222e0cb5ea2fa6c5f3b968c0702200f5509c4
```

```powershell
Get-FileHash -Algorithm SHA256 .\Pomnia-0.1.74-setup.exe
```

The build is unsigned, so Windows SmartScreen will warn. "More info" → "Run anyway" is the expected path; the hash is what actually tells you the file is the one that was built.
