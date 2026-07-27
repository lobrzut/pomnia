# Pomnia landing page

Static site for [pomnia.ai](https://pomnia.ai). No build step — plain HTML.

- `index.html` — the page
- `privacy.html` — privacy notice
- `index-classic.html` — the earlier waitlist/beta page, kept for reference.
  Not linked from anywhere; do not deploy it as `index.html`.
- **Deploy:** see [`docs/LANDING-DEPLOY.md`](../docs/LANDING-DEPLOY.md)

## Before publishing — must be filled in

`index.html` carries two placeholders that are deliberately invalid, so the page
cannot go live half-wired:

| Placeholder | Replace with |
|---|---|
| `GITHUB_RELEASES_URL` | direct link to the Windows installer on GitHub Releases |
| `GITHUB_REPO_URL` | the public repository |

Publishing is on hold until the Windows build **and** the packaged server are both
ready. macOS is out of scope for now — the footer badge says `Windows` only, and
the closing section says macOS and the server are next. Update both when that
changes; a badge is a promise.

## Ground rules for this page

- **No data collection.** No form, no analytics, no cookies. `privacy.html` invites
  the reader to verify this in the Network tab, so it has to stay true. If anything
  is ever added that makes a request, that page changes in the same commit.
- **No external requests.** The only outbound links are to GitHub and (from the
  privacy page) to UODO — links, not loads. No CDN, no web fonts.
- **Claims must match the product.** Copy was audited against `src/core/adapters`:
  conversations come from Claude Code, Cursor and Antigravity; Claude Desktop yields
  only its JSONL agent sessions; VS Code / Windsurf / Continue are config snapshots
  and are *not* searchable memory. Snapshot restore is not implemented, and the page
  says so.
- `prefers-reduced-motion` disables the background animation entirely.
