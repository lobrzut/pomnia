> **Everything since 0.1.76 in one release.** 0.1.77 through 0.1.81 were built and superseded in the same stretch of work; nothing was published under those numbers, so this is the only upgrade to take. Two things in here are worth knowing before you upgrade: the server and the desktop must move together, because the apps now ask the server questions 0.1.76 cannot answer; and re-indexing is worth doing once, because the indexer now embeds the note's date with every chunk.

## Pomnia Mini

A second build of the same codebase, for the half of a self-hosted pair that holds no vault. It wires MCP into your agents and does nothing else: no brain, no Ollama, no distiller, no local index. The memory lives on the server the agents already query, and a second copy on the laptop would only be a second thing to disagree with it.

It ships as a portable `.exe` and a `.zip`. Take the zip: the portable extracts 127 MB on every launch and takes about a minute to show a window, measured, and no packaging option changes that by much. Unpack the zip once and every start after that is an ordinary one.

Mini has Connect, Settings, Skills, Prompts and an import screen. Everything it does, it does over the server's admin API with an admin token that stays in the main process and never reaches a window.

## A prompt library

`vault/prompts/*.md` — reusable texts with named arguments, served two ways.

Through MCP `prompts/list` and `prompts/get`, which is the door for picking one in your client. And through `list_prompts` / `get_prompt` tools, which is the door for an agent, so "use my bug-report prompt" is now a sentence something can act on. The same pairing skills have had.

A prompt is one file:

```markdown
---
description: Turn loose symptoms into a filed bug
arguments:
  - name: symptom
    required: true
  - name: repro
---
Saw: {{symptom}}
Steps: {{repro}}
```

With no `arguments:` block the `{{placeholders}}` in the body are the signature. `prompts/get` refuses to render without a required argument, which is right when a person is filling in a form. The tool does not: it renders with the placeholder visible and names what is missing, because an agent holding the conversation the value is in should ask rather than guess.

`prompts/` replicates like `skills/` and is not indexed — a template in your search results is noise.

## 1244 skills were invisible to the code that shipped

The cli skills were sorted into eight category folders, so they live at `cli/<category>/<name>/SKILL.md`. The source only ever read `cli/<name>/SKILL.md` and found none of them.

The running server kept working for one reason: the compiled file inside the container had been edited by hand. Root-owned, stale source map, absent from git. The next `compose up --force-recreate` would have deleted that edit and taken all 1244 skills with it, silently, with no error anywhere. Both layouts are now read by shipped code, and a test holds the line. The desktop app had the same blind spot in its own scanner, so its Skills page and dashboard count reported zero imported skills beside a full directory.

## `list_skills` returned about a hundred thousand tokens

Serialised whole, the catalogue is 1259 entries and 388 kB. Any agent that called it lost most of its context window to a table of contents before doing anything — which is why skills were unusable at this size rather than merely numerous.

It now answers with your own skills in full and the cli half as categories with counts: **4229 characters against the real vault**, down from 388706. Pass `category` or `query` to get the skills themselves, paged. `get_skill` takes `category/name` and refuses an ambiguous bare name instead of picking one.

## Listing skills took 59.6 seconds

Mini drew its skills list from `/sync/manifest` — the replication endpoint. Measured on a real vault that is 59.6 seconds, 15327 entries and 2.8 MB, because a manifest is a sha256 of every file in the vault and all that was wanted was a list of names. It also reported 8044 rows under `skills/` where there are 1259 skills: backups and `.bak` files belong in a replication manifest by design.

`/admin/skills` answers the question directly, in 3084 characters, using the same code the MCP tools use — so what a window shows and what an agent sees cannot drift apart. `/admin/prompts` does the same for prompts. Both are admin-gated; a path that climbs out of the skills root is refused, never normalised.

## A revoked token said nothing

The apps reported "admin token in hand" from a flag that records that a token was *saved*, and stays true after it is revoked. Every call would then be refused and no screen said why.

Three changes. Connect asks the server whether the stored token is still accepted, on open and after a paste, and distinguishes accepted, refused, unreachable and absent. A 401 anywhere in the app now arrives as "the server refused the token" with a route to Settings, not as "the server did not answer". And a watcher runs on its own timer whether or not a window is open — the only poller in the app was gated on window focus, so it stopped checking at exactly the moment nobody was looking — reporting through a system notification and the tray tooltip.

It is built to stay quiet: transitions only, never states; a persisting fault says nothing after the first time; one unreachable probe is not an outage, because laptops suspend and containers restart and a tray that cries wolf is a tray nobody reads. A refused token alarms immediately — the server gave a definite answer about the credential, and a second opinion only delays the fix.

## OCR

A scanned PDF produced nothing, and said so in a way that read like an empty book.

Three faults, in order of discovery. The renderer never ran: pdf.js API 4.10.38 against worker 5.6.205, plus a duplicate copy of pdfjs inside the package. Then OCR was opt-in and sampled — Desktop read three pages of a book and called it the book. Then the pages it did read were scored whole, so a page with two paragraphs around a chess diagram lost the paragraphs along with the diagram.

Now: OCR runs by default on any PDF with no text layer, over the whole document, and filtering is per block rather than per page — which recovered 15 pages of 147 in the book this was measured on. A file that yields zero characters is refused rather than stored as an empty note. Re-importing a book replaces its note instead of leaving a third copy.

Tesseract 5 via tesseract.js, `tessdata_fast` for English and Polish. `tessdata_best` was measured and rejected: three diacritics better out of 474 words, for 1.85x the time.

## The date now travels with every chunk

Notes carry their date once, in the header, and chunking splits at about 1500 characters — so every chunk after the first had no date in it at all, and "when did X happen" had nothing to match on.

Measured on LoCoMo, 495 questions with evidence over 70 sessions:

```
date in the header only    recall@5 69.9%
date on every chunk        recall@5 77.4%
```

The indexer now embeds `noteDate` with each chunk and stores the chunk bare, so the keyword lane cannot match a date the reader never sees. **Re-index once after upgrading** to get this on existing notes.

## Connect

One token field instead of two. Pasting a token asks the server what it is — `GET /admin/tokens` answers 200 only for an admin token — and an agent token is minted from an admin one in the same step, because that is the only reason the screen needs one. Asking a person to classify a secret by eye is how the wrong one gets pasted; the app itself made that mistake in code.

Config repair rewrites a client's entry on a defect and never on a difference, and checks each client with the token that client would actually send. Skills sync and the dashboard deploy target were removed after every endpoint behind them was verified to 404 — 553 lines that led nowhere.


## The full app was behind Mini on three things

Audited before this release rather than after. A scan imported into the full app was **never read**: it parsed, saw the text was sparse, stored the document with no text, indexed that, and offered an OCR button you had to notice. The same book through the same product became either knowledge or an empty document depending on which build opened it — and the empty one was indexed and answering. Import now OCRs a sparse PDF before it stores anything.

Skills could not be deleted in the full app, only in Mini. And the token check was gated on the Mini build, though the full app can point at a remote server too, where a revoked token fails exactly as silently.

Verified on real files: a PDF with a text layer extracts 76601 characters over 20 pages with no OCR; an image-only PDF — generated for the test, so a pass cannot be explained by an accidental text layer — comes back through `unpdf+tesseract` with the Polish intact, at 3.0 s for the page.

## Upgrading

The desktop apps and the server move together: 0.1.82 apps ask for routes that 0.1.76 does not serve, and will say "the server does not know this route" rather than failing obscurely.

```
docker compose pull && docker compose up -d --force-recreate
```

Then re-index once, for the date change.
