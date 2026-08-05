// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The page a human gets when they open the server's root in a browser.
 *
 * Until now that was `{"error":"not_found"}` — correct for a machine, useless
 * for the person who just typed the address to check whether their server is
 * up. The legacy Python dashboard filled that role, but it is a different
 * product generation: it still brands itself BRAIN, still ships the Reliqua
 * purple palette the desktop moved off, and pulls its webfonts from Google on
 * every load — an outbound request on the one machine whose whole promise is
 * that nothing leaves it.
 *
 * So: no external requests of any kind, Pomnia's current tokens, and strictly
 * nothing that /healthz does not already hand out unauthenticated. No counts,
 * no vault path, no token hints. Everything real stays behind /mcp and a
 * bearer token.
 */

export interface StatusPageInfo {
  version: string
  authRequired: boolean
  /** Public origin as the visitor reached it, e.g. http://192.168.1.201:7865 */
  origin: string
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function renderStatusPage(info: StatusPageInfo): string {
  const auth = info.authRequired
    ? { cls: 'ok', text: 'Bearer token required' }
    : { cls: 'warn', text: 'Open — no token required' }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Pomnia brain-core</title>
<style>
  :root {
    --bg: #060a08; --bg-2: #0a110d; --panel: rgba(17, 31, 24, .55);
    --border: rgba(255,255,255,.08);
    --ink: #e9f5ee; --ink-dim: #8fa89a; --ink-faint: #5b7868;
    --mint: #34d399; --iris: #2dd4bf; --amber: #fbbf24;
    --glow: rgba(45, 212, 191, .10);
    --font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f4f8f6; --bg-2: #eaf1ed; --panel: rgba(255,255,255,.7);
      --border: rgba(0,0,0,.08);
      --ink: #10241a; --ink-dim: #46614f; --ink-faint: #6d8577;
      /* The dark build's glow is a navy blob; on a light page it reads as a
         rendering fault rather than depth. */
      --glow: rgba(45, 212, 191, .18);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; font-family: var(--font); color: var(--ink);
    background: radial-gradient(1000px 600px at 20% -10%, var(--glow), transparent),
                linear-gradient(160deg, var(--bg), var(--bg-2));
    display: flex; align-items: center; justify-content: center; padding: 2rem 1.25rem;
  }
  .card {
    width: 100%; max-width: 33rem; padding: 2rem; border-radius: 20px;
    border: 1px solid var(--border); background: var(--panel);
    backdrop-filter: blur(12px);
  }
  h1 {
    margin: 0; font-size: 1.6rem; font-weight: 800; letter-spacing: -.02em;
    background: linear-gradient(120deg, #1a5c3a, var(--mint) 48%, var(--iris));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { margin: .35rem 0 1.75rem; color: var(--ink-dim); font-size: .9rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .6rem 1.25rem; margin: 0; font-size: .875rem; }
  dt { color: var(--ink-faint); }
  dd { margin: 0; font-family: var(--mono); word-break: break-all; }
  .pill {
    display: inline-block; padding: .15rem .6rem; border-radius: 999px;
    font-family: var(--font); font-size: .78rem; font-weight: 600;
  }
  .ok   { background: color-mix(in srgb, var(--mint) 18%, transparent); color: var(--mint); }
  .warn { background: color-mix(in srgb, var(--amber) 18%, transparent); color: var(--amber); }
  footer {
    margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--border);
    color: var(--ink-faint); font-size: .78rem; line-height: 1.6;
  }
  a { color: var(--iris); }
</style>
</head>
<body>
  <main class="card">
    <h1>Pomnia</h1>
    <p class="sub">brain-core is running. This page is all it will tell you without a token.</p>
    <dl>
      <dt>Service</dt><dd>brain-core ${esc(info.version)}</dd>
      <dt>MCP endpoint</dt><dd>${esc(info.origin)}/mcp</dd>
      <dt>Access</dt><dd><span class="pill ${auth.cls}">${auth.text}</span></dd>
      <dt>Liveness</dt><dd>${esc(info.origin)}/healthz</dd>
    </dl>
    <footer>
      Point an MCP-speaking agent at the endpoint above. Memory, search and
      every other tool live behind it — nothing on this page reads the vault.
      <br>AGPL-3.0 · <a href="https://pomnia.ai">pomnia.ai</a>
    </footer>
  </main>
</body>
</html>
`
}
