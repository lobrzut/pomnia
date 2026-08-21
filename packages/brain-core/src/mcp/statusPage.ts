// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The page a human gets at `/status` (public health summary).
 *
 * Homepage `/` is the panel login gate — not this page. Before that split,
 * opening the server address dumped status to anyone; operators asked for
 * login first. Status stays reachable without credentials at `/status`.
 *
 * Two audiences, one page, and the split is deliberate:
 *
 *   without a token   the same four facts /healthz gives out unauthenticated —
 *                     service, version, endpoint, whether a token is needed
 *   with a token      the operator's console: what is healthy, what is not,
 *                     and the reason, so a broken server explains itself where
 *                     the person is already looking
 *
 * The token is never entered here and never leaves the browser: the page asks
 * the same `/healthz` the operator can curl, and the detailed fields are only
 * present in that response when the request carried a valid bearer token.
 * There is no form, no storage, nothing to phish.
 *
 * Zero external requests — inlined CSS, no fonts, no scripts from anywhere.
 * Brand chrome (shimmer mark, neuron sky, themes) matches pomnia.ai / Desktop.
 * The CSP header the server sends says so, so a future edit that reaches for a
 * CDN breaks loudly instead of quietly phoning out.
 */

import {
  BRAND_HEAD_LINKS,
  brandChromeCss,
  brandSkyHtml,
  brandSkyScript,
  brandWordmarkHtml,
  themeScript,
  themeSwitcherHtml,
} from './brandChrome.js'

export type PageState = 'ok' | 'degraded' | 'down'

export interface StatusPageInfo {
  version: string
  authRequired: boolean
  /** Public origin as the visitor reached it, e.g. http://192.168.1.201:7865 */
  origin: string
  /** Overall verdict from the health check. */
  state: PageState
  writable: boolean
  vaultOwner: string | null
  uptimeSec: number
  /** Per-check detail. Only rendered for a request that carried a token. */
  checks?: Array<{ name: string; state: PageState; detail?: string }>
  /** Absent or null when redacted — never fake `{files:0,chunks:0}`. */
  index?: { files: number; chunks: number } | null
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const STATE_LABEL: Record<PageState, string> = {
  ok: 'Operational',
  degraded: 'Degraded',
  down: 'Not serving',
}

/** "3 d 04 h" — precision nobody needs is precision nobody reads. */
export function formatUptime(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.floor(sec))}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${String(h % 24).padStart(2, '0')} h`
}

function row(name: string, state: PageState, detail?: string): string {
  return `<li class="chk ${state}">
      <span class="dot"></span>
      <span class="chk-name">${esc(name)}</span>
      <span class="chk-state">${STATE_LABEL[state]}</span>
      ${detail ? `<p class="chk-detail">${esc(detail)}</p>` : ''}
    </li>`
}

export function renderStatusPage(info: StatusPageInfo): string {
  const access = info.authRequired
    ? { cls: 'ok', text: 'Bearer token required' }
    : { cls: 'degraded', text: 'Open — no token required' }

  const detailed = !!info.checks?.length

  return `<!doctype html>
<html lang="en" data-theme="mint">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
${BRAND_HEAD_LINKS}
<title>Pomnia</title>
<style>
  ${brandChromeCss()}
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: var(--ink);
    background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    padding: 2.5rem 1.25rem; line-height: 1.5;
  }
  .card {
    width: 100%; max-width: 38rem; padding: 2rem; border-radius: 22px;
    border: 1px solid var(--border); background: var(--panel);
    backdrop-filter: blur(14px);
  }
  header { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .status {
    margin-left: auto; display: inline-flex; align-items: center; gap: .5rem;
    padding: .3rem .8rem; border-radius: 999px; font-size: .8rem; font-weight: 700;
    white-space: nowrap;
  }
  .status .dot { width: .55rem; height: .55rem; border-radius: 999px; }
  .ok    { color: var(--mint);  background: color-mix(in srgb, var(--mint) 15%, transparent); }
  .ok    .dot { background: var(--mint); }
  .degraded { color: var(--amber); background: color-mix(in srgb, var(--amber) 15%, transparent); }
  .degraded .dot { background: var(--amber); }
  .down  { color: var(--rose);  background: color-mix(in srgb, var(--rose) 15%, transparent); }
  .down  .dot { background: var(--rose); }
  .sub { margin: .4rem 0 1.2rem; color: var(--ink-dim); font-size: .9rem; width: 100%; }
  .theme-wrap { width: 100%; margin: 0 0 1.1rem; }
  dl {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .6rem 1.25rem;
    margin: 0; font-size: .875rem;
  }
  dt { color: var(--ink-faint); }
  dd { margin: 0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; overflow-wrap: anywhere; }
  .pill {
    display: inline-block; padding: .12rem .6rem; border-radius: 999px;
    font-family: inherit; font-size: .78rem; font-weight: 600;
  }
  ul.checks { list-style: none; margin: 1.6rem 0 0; padding: 1.25rem 0 0; border-top: 1px solid var(--border); }
  .chk {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center;
    gap: .6rem; padding: .5rem 0; font-size: .875rem;
    background: none;
  }
  .chk .dot { width: .5rem; height: .5rem; border-radius: 999px; }
  .chk.ok .dot { background: var(--mint); }
  .chk.degraded .dot { background: var(--amber); }
  .chk.down .dot { background: var(--rose); }
  .chk-name { color: var(--ink); }
  .chk-state { font-size: .78rem; font-weight: 600; }
  .chk.ok .chk-state { color: var(--mint); }
  .chk.degraded .chk-state { color: var(--amber); }
  .chk.down .chk-state { color: var(--rose); }
  .chk-detail {
    grid-column: 2 / -1; margin: .15rem 0 0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: .78rem; color: var(--ink-dim); overflow-wrap: anywhere;
  }
  .hint {
    margin: 1.6rem 0 0; padding: .85rem 1rem; border-radius: 14px;
    border: 1px solid var(--border); font-size: .8rem; color: var(--ink-dim);
  }
  .hint code { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; color: var(--ink); overflow-wrap: anywhere; }
  footer {
    margin-top: 1.6rem; padding-top: 1.2rem; border-top: 1px solid var(--border);
    color: var(--ink-faint); font-size: .78rem;
  }
  a { color: var(--iris); }
  @media (max-width: 30rem) {
    .card { padding: 1.5rem; }
    dl { grid-template-columns: 1fr; gap: .2rem; }
    dt { margin-top: .6rem; }
    .status { margin-left: 0; }
  }
</style>
</head>
<body>
  ${brandSkyHtml()}
  <div class="page-root">
  <main class="card">
    <header>
      ${brandWordmarkHtml('h1')}
      <span class="status ${info.state}"><span class="dot"></span>${STATE_LABEL[info.state]}</span>
      <p class="sub">${
        detailed
          ? 'Pomnia — operator view. Everything below is status; nothing here reads the vault.'
          : 'Pomnia is running. This is everything it will tell you without a token.'
      }</p>
      <div class="theme-wrap">${themeSwitcherHtml()}</div>
    </header>

    <dl>
      <dt>Service</dt><dd>Pomnia ${esc(info.version)}</dd>
      <dt>MCP endpoint</dt><dd>${esc(info.origin)}/mcp</dd>
      <dt>Access</dt><dd><span class="pill ${access.cls}">${access.text}</span></dd>
      <dt>Vault</dt><dd>${
        info.writable
          ? 'writable — this server owns it'
          : `read-only replica${info.vaultOwner ? ` · owned by ${esc(info.vaultOwner)}` : ''}`
      }</dd>
      ${detailed ? `<dt>Uptime</dt><dd>${formatUptime(info.uptimeSec)}</dd>` : ''}
      ${
        detailed && info.index
          ? `<dt>Index</dt><dd>${info.index.files.toLocaleString('en-US')} files · ${info.index.chunks.toLocaleString('en-US')} chunks</dd>`
          : ''
      }
    </dl>

    ${
      detailed
        ? `<ul class="checks">${info.checks!.map((c) => row(c.name, c.state, c.detail)).join('')}</ul>`
        : `<div class="hint">
             Health detail is behind the same bearer token the agents use:
             <br><code>curl -H "Authorization: Bearer &lt;token&gt;" ${esc(info.origin)}/healthz</code>
             <br>Open this page with that header — or from a client that sends it — to see per-check status.
           </div>`
    }

    <footer>
      Point an MCP-speaking agent at the endpoint above. Memory, search and
      every other tool live behind it.
      <br>Panel login: <a href="${esc(info.origin)}/">${esc(info.origin)}/</a>
      <br>AGPL-3.0 · <a href="https://pomnia.ai">pomnia.ai</a>
    </footer>
  </main>
  </div>
<script>${themeScript()}${brandSkyScript()}</script>
</body>
</html>
`
}
