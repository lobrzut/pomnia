// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The panel: the few things you must be able to do to a Pomnia server without
 * opening an SSH session.
 *
 * Small on purpose. The rich views — charts, the knowledge graph, browsing —
 * live in Pomnia Desktop, which drives the same `/admin` API. Rebuilding those
 * here would put a login, sessions and a CSRF surface inside the one process
 * that holds the vault, to duplicate work already done elsewhere.
 *
 * Security shape, and every part of it is deliberate:
 *
 *   session cookie  HttpOnly, so script cannot read it and an XSS anywhere on
 *                   this origin cannot steal the session. SameSite=Strict and
 *                   scoped to /admin. Secure only over HTTPS — setting it on a
 *                   plain-HTTP LAN would make the browser drop it and the panel
 *                   would look broken with no explanation.
 *   csrf token      returned in the login response *body*, never in a cookie,
 *                   echoed in a header on every mutation. SameSite already
 *                   stops the cross-site POST; this also covers the
 *                   same-site-but-untrusted case, and costs one header.
 *   no storage      not localStorage, not sessionStorage, never document.cookie
 *                   from script. The only thing the page holds is the CSRF
 *                   token, in a closure, for as long as the tab lives.
 *   inline only     one file, no fetch of anything but this server's own API.
 *                   The CSP the server sends says exactly that, so an edit that
 *                   reaches for a CDN breaks loudly instead of phoning out.
 *
 * One vault, one set of accounts, and no link between them: `vaultRoot` is a
 * property of the process (the systemd unit's --vault-root), not of whoever
 * signed in. Accounts answer "may you in", never "whose memory" — Pomnia is
 * single-user by design, and per-person attribution was considered and
 * deliberately left out while there is one person.
 */

export function renderAdminPage(origin: string): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>Pomnia · panel</title>
<style>
  :root {
    --bg:#060a08; --bg-2:#0a110d; --panel:rgba(17,31,24,.58); --border:rgba(255,255,255,.09);
    --ink:#e9f5ee; --ink-dim:#8fa89a; --ink-faint:#5b7868;
    --mint:#34d399; --iris:#2dd4bf; --amber:#fbbf24; --rose:#fb7185;
    --glow:rgba(45,212,191,.10);
    --font:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:ui-monospace,'Cascadia Mono',Consolas,monospace;
  }
  @media (prefers-color-scheme:light){:root{
    --bg:#f4f8f6;--bg-2:#e8f0eb;--panel:rgba(255,255,255,.74);--border:rgba(0,0,0,.09);
    --ink:#10241a;--ink-dim:#46614f;--ink-faint:#6d8577;--glow:rgba(45,212,191,.18);}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;font-family:var(--font);color:var(--ink);line-height:1.5;
    background:radial-gradient(1100px 620px at 18% -12%,var(--glow),transparent),
               linear-gradient(160deg,var(--bg),var(--bg-2));
    padding:2rem 1.25rem;display:flex;justify-content:center}
  main{width:100%;max-width:46rem}
  h1{margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-.025em;
    background:linear-gradient(120deg,#1a5c3a,var(--mint) 48%,var(--iris));
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .top{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}
  .who{margin-left:auto;font-size:.8rem;color:var(--ink-faint);font-family:var(--mono)}
  .card{border:1px solid var(--border);background:var(--panel);backdrop-filter:blur(14px);
    border-radius:20px;padding:1.5rem;margin-bottom:1rem}
  h2{margin:0 0 .35rem;font-size:1rem;font-weight:700}
  .lead{margin:0 0 1.1rem;font-size:.82rem;color:var(--ink-dim)}
  label{display:block;font-size:.78rem;color:var(--ink-faint);margin:.9rem 0 .3rem}
  input,select{width:100%;padding:.6rem .8rem;border-radius:12px;border:1px solid var(--border);
    background:rgba(0,0,0,.22);color:var(--ink);font-family:var(--mono);font-size:.85rem}
  @media (prefers-color-scheme:light){input,select{background:rgba(255,255,255,.7)}}
  input:focus,select:focus{outline:2px solid color-mix(in srgb,var(--mint) 70%,transparent);outline-offset:1px}
  button{font-family:var(--font);font-size:.83rem;font-weight:600;padding:.55rem 1rem;
    border-radius:12px;border:1px solid var(--border);background:rgba(52,211,153,.14);
    color:var(--mint);cursor:pointer}
  button:hover{background:rgba(52,211,153,.22)}
  button[disabled]{opacity:.5;cursor:not-allowed}
  button.ghost{background:transparent;color:var(--ink-dim)}
  button.danger{background:rgba(251,113,133,.13);color:var(--rose)}
  .row{display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap;margin-top:1rem}
  .row>*{flex:1 1 10rem}
  .row>button{flex:0 0 auto}
  nav{display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap}
  nav button{background:transparent;color:var(--ink-dim);border-color:transparent}
  nav button[aria-current="true"]{background:rgba(52,211,153,.14);color:var(--mint);border-color:var(--border)}
  table{width:100%;border-collapse:collapse;font-size:.83rem}
  th{text-align:left;font-weight:600;color:var(--ink-faint);font-size:.75rem;
    padding:.4rem .5rem;border-bottom:1px solid var(--border)}
  td{padding:.55rem .5rem;border-bottom:1px solid var(--border);vertical-align:middle}
  td.mono,.mono{font-family:var(--mono);font-size:.8rem}
  .tag{display:inline-block;padding:.08rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700}
  .tag.admin{background:color-mix(in srgb,var(--amber) 18%,transparent);color:var(--amber)}
  .tag.agent{background:color-mix(in srgb,var(--iris) 16%,transparent);color:var(--iris)}
  .msg{margin-top:1rem;padding:.75rem 1rem;border-radius:12px;font-size:.82rem;border:1px solid var(--border)}
  .msg.ok{background:color-mix(in srgb,var(--mint) 12%,transparent);color:var(--mint)}
  .msg.err{background:color-mix(in srgb,var(--rose) 12%,transparent);color:var(--rose)}
  .msg.warn{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)}
  .secret{font-family:var(--mono);font-size:.8rem;word-break:break-all;
    background:rgba(0,0,0,.3);padding:.6rem .8rem;border-radius:10px;margin-top:.5rem}
  @media (prefers-color-scheme:light){.secret{background:rgba(0,0,0,.06)}}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.7rem;margin-bottom:1.4rem}
  .tile{border:1px solid var(--border);border-radius:14px;padding:.8rem .9rem}
  .tile .n{font-size:1.45rem;font-weight:800;letter-spacing:-.02em;line-height:1.15}
  .tile .k{font-size:.72rem;color:var(--ink-faint);margin-top:.15rem}
  .tile.warn .n{color:var(--amber)}
  .tile.bad .n{color:var(--rose)}
  .tile.good .n{color:var(--mint)}
  .sub-h{margin:1.5rem 0 .4rem;font-size:.78rem;font-weight:700;color:var(--ink-faint);
    text-transform:uppercase;letter-spacing:.06em}
  .empty{color:var(--ink-faint);font-size:.82rem;padding:.5rem 0}
  .hidden{display:none}
  footer{margin-top:1.5rem;color:var(--ink-faint);font-size:.76rem;text-align:center}
  a{color:var(--iris)}
</style>
</head>
<body>
<main>
  <div class="top">
    <h1>Pomnia</h1>
    <span class="who" id="who"></span>
  </div>

  <!-- ── login ──────────────────────────────────────────────────────────── -->
  <section class="card" id="gate">
    <h2>Logowanie</h2>
    <p class="lead">
      Nie masz jeszcze konta? Na serwerze:
      <code class="mono">brain-core --add-user login --role admin</code>
    </p>
    <form id="login-form" autocomplete="on">
      <label for="user">Login</label>
      <input id="user" name="username" autocomplete="username" spellcheck="false" autocapitalize="off">
      <label for="pass">Hasło</label>
      <input id="pass" name="password" type="password" autocomplete="current-password">
      <div class="row">
        <button type="submit" id="login">Zaloguj</button>
      </div>
    </form>
    <div id="gate-msg"></div>
  </section>

  <!-- ── panel ──────────────────────────────────────────────────────────── -->
  <div id="panel" class="hidden">
    <nav>
      <button data-tab="dash" aria-current="true">Pulpit</button>
      <button data-tab="status">Stan</button>
      <button data-tab="engine">Silnik</button>
      <button data-tab="clients">Klienci</button>
      <button data-tab="users">Konta</button>
      <button data-tab="behaviour">Zachowanie</button>
      <button data-tab="vault">Vault</button>
      <button id="logout" class="ghost" style="margin-left:auto">Wyloguj</button>
    </nav>

    <section class="card" id="tab-dash">
      <h2>Pulpit</h2>
      <p class="lead">Co ten serwer ma i co się z nim dzieje.</p>
      <div class="tiles" id="tiles"></div>
      <h3 class="sub-h">Vault na dysku</h3>
      <table><tbody id="vault-rows"></tbody></table>
      <h3 class="sub-h">Kto pyta (ostatnie 24 h)</h3>
      <table><tbody id="actor-rows"></tbody></table>
      <h3 class="sub-h">Ostatnie zapytania</h3>
      <table><tbody id="act-rows"></tbody></table>
      <div class="row"><button id="dash-refresh" class="ghost">Odśwież</button></div>
      <div id="dash-msg"></div>
    </section>

    <section class="card hidden" id="tab-status">
      <h2>Stan serwera</h2>
      <p class="lead">
        To samo, co <code class="mono">/healthz</code> — z powodami, bo jesteś zalogowany.
      </p>
      <table><tbody id="checks"></tbody></table>
      <div class="row">
        <button id="refresh" class="ghost">Odśwież</button>
      </div>
      <div id="status-msg"></div>
    </section>

    <section class="card hidden" id="tab-engine">
      <h2>Silnik wyszukiwania</h2>
      <p class="lead">
        Gdzie stoi Ollama i jakim modelem liczone są embeddingi. Adres jest
        walidowany — serwer odmówi pobierania z adresów link-local i metadanych
        chmury.
      </p>
      <label for="ollama">Adres Ollamy</label>
      <input id="ollama" type="url" spellcheck="false" placeholder="http://127.0.0.1:11434">
      <label for="model">Model embeddingów</label>
      <input id="model" spellcheck="false" placeholder="nomic-embed-text">
      <div class="row">
        <button id="save-engine">Zapisz</button>
        <button id="reindex" class="ghost">Przebuduj indeks</button>
      </div>
      <div id="engine-msg"></div>
    </section>

    <section class="card hidden" id="tab-clients">
      <h2>Klienci</h2>
      <p class="lead">
        Pomnia jest jednoosobowa — to nie są konta użytkowników, tylko urządzenia
        i agenci, którym wydajesz dostęp. <strong>agent</strong> sięga po MCP
        i replikację; <strong>admin</strong> dodatkowo po ten panel.
      </p>
      <table>
        <thead><tr><th>Nazwa</th><th>Rola</th><th>Ostatnio</th><th></th></tr></thead>
        <tbody id="tokens"></tbody>
      </table>
      <div class="row">
        <div>
          <label for="newname">Nowy klient</label>
          <input id="newname" placeholder="laptop" spellcheck="false">
        </div>
        <div style="flex:0 0 9rem">
          <label for="newrole">Rola</label>
          <select id="newrole"><option value="agent">agent</option><option value="admin">admin</option></select>
        </div>
        <button id="add">Wydaj token</button>
      </div>
      <div id="clients-msg"></div>
    </section>

    <section class="card hidden" id="tab-users">
      <h2>Konta panelu</h2>
      <p class="lead">
        Ludzie logujący się tutaj — to co innego niż tokeny, którymi łączą się
        maszyny. Zmiana hasła natychmiast kończy wszystkie sesje tego konta.
      </p>
      <table>
        <thead><tr><th>Login</th><th>Rola</th><th>Ostatnie logowanie</th><th></th></tr></thead>
        <tbody id="users"></tbody>
      </table>
      <div class="row">
        <div>
          <label for="nu">Nowe konto</label>
          <input id="nu" spellcheck="false" autocapitalize="off" placeholder="login">
        </div>
        <div>
          <label for="np">Hasło (min. 12 znaków)</label>
          <input id="np" type="password" autocomplete="new-password">
        </div>
        <button id="adduser">Utwórz</button>
      </div>
      <div id="users-msg"></div>
    </section>

    <section class="card hidden" id="tab-behaviour">
      <h2>Zachowanie agentów</h2>
      <p class="lead">
        Te ustawienia trafiają do opisów narzędzi, które czyta każdy podłączony
        agent — działają od następnego wywołania, bez restartu.
      </p>
      <label for="phrase">Fraza handshake</label>
      <input id="phrase" spellcheck="false" placeholder="OK to Go Go Go">
      <p class="lead" style="margin:.4rem 0 0">
        Agent otwiera nią pierwszą odpowiedź — to dowód, że Pomnia jest naprawdę podpięta.
      </p>
      <div class="row">
        <label style="display:flex;align-items:center;gap:.5rem;color:var(--ink);font-size:.83rem;margin:0">
          <input id="hs-on" type="checkbox" style="width:auto"> Wymagaj frazy
        </label>
        <label style="display:flex;align-items:center;gap:.5rem;color:var(--ink);font-size:.83rem;margin:0">
          <input id="ac-on" type="checkbox" style="width:auto"> Pozwól na auto-checkpoint
        </label>
      </div>
      <label for="label">Nazwa tej instancji</label>
      <input id="label" spellcheck="false" placeholder="pomnia-server">
      <p class="lead" style="margin:.4rem 0 0">
        Pod tą nazwą serwer przedstawia się, gdy przejmie vault.
      </p>
      <div class="row">
        <button id="save-behaviour">Zapisz</button>
      </div>
      <div id="behaviour-msg"></div>
    </section>

    <section class="card hidden" id="tab-vault">
      <h2>Vault</h2>
      <p class="lead">
        Zapisywać może tylko jedna instancja naraz — inaczej dwie kopie pamięci
        cicho się rozjeżdżają. Przejęcie jest świadome i natychmiast odbiera
        prawo zapisu poprzedniemu właścicielowi.
      </p>
      <table><tbody id="vault-info"></tbody></table>
      <div class="row">
        <button id="claim" class="danger">Przejmij własność</button>
      </div>
      <div id="vault-msg"></div>
    </section>
  </div>

  <footer>brain-core · <a href="${esc(origin)}/">strona statusu</a> · AGPL-3.0</footer>
</main>

<script>
(() => {
  'use strict'
  // The session lives in an HttpOnly cookie the browser attaches for us, which
  // means script cannot read it and an XSS on this origin cannot steal it. What
  // we do hold is the CSRF token — deliberately NOT in a cookie, because the
  // whole point is that a cross-site page cannot read it to replay.
  let csrf = null
  let me = null

  const $ = (id) => document.getElementById(id)
  const text = (el, s) => { el.textContent = s }

  function msg(el, kind, s) {
    if (!el) return
    el.innerHTML = ''
    if (!s) return
    const d = document.createElement('div')
    d.className = 'msg ' + kind
    d.textContent = s
    el.appendChild(d)
    return d
  }

  async function api(method, path, body) {
    const headers = {}
    if (body) headers['content-type'] = 'application/json'
    // Only mutations carry it; a GET changes nothing, so requiring it there
    // would only break the first load after a session is restored.
    if (csrf && method !== 'GET') headers['x-pomnia-csrf'] = csrf
    const r = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      // same-origin, not include: the cookie is scoped to /admin on this host
      // and has no business travelling anywhere else.
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const err = new Error(data.detail || data.hint || data.error || ('HTTP ' + r.status))
      err.status = r.status
      throw err
    }
    return data
  }

  // ── login ───────────────────────────────────────────────────────────────
  async function login(ev) {
    if (ev) ev.preventDefault()
    const btn = $('login')
    btn.disabled = true
    try {
      const r = await api('POST', '/admin/login', {
        username: $('user').value.trim(),
        password: $('pass').value,
      })
      csrf = r.csrf
      me = { username: r.username, role: r.role }
      // Clear the field immediately: a password sitting in a DOM node is a
      // password any injected script can read.
      $('pass').value = ''
      await enter()
    } catch (e) {
      msg($('gate-msg'), 'err', e.message)
      $('pass').value = ''
      $('pass').focus()
    } finally {
      btn.disabled = false
    }
  }

  /** Show the panel and load everything it needs. */
  async function enter() {
    $('gate').classList.add('hidden')
    $('panel').classList.remove('hidden')
    text($('who'), me.username + ' · ' + me.role)
    const s = await api('GET', '/admin/settings')
    fill(s)
    await Promise.all([loadDash(), loadStatus(), loadTokens(), loadUsers(), loadBehaviour(), loadVault()])
  }

  async function logout() {
    try { await api('POST', '/admin/logout') } catch { /* going anyway */ }
    csrf = null
    me = null
    location.reload()
  }

  /**
   * A reload should not demand the password again — the cookie is still valid.
   * If it is not, we simply show the login form, which is the same as before.
   */
  async function restore() {
    try {
      const r = await api('GET', '/admin/me')
      csrf = r.csrf
      me = { username: r.username, role: r.role }
      await enter()
    } catch {
      $('user').focus()
    }
  }

  // ── dashboard ───────────────────────────────────────────────────────────
  const fmt = (n) => Number(n || 0).toLocaleString('pl')

  function bytes(n) {
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' kB'
    return (n / 1024 / 1024).toFixed(1) + ' MB'
  }

  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
    if (s < 60) return s + ' s temu'
    if (s < 3600) return Math.round(s / 60) + ' min temu'
    if (s < 86400) return Math.round(s / 3600) + ' h temu'
    return new Date(ts).toLocaleString('pl')
  }

  function uptime(sec) {
    if (sec < 3600) return Math.round(sec / 60) + ' min'
    if (sec < 86400) return Math.floor(sec / 3600) + ' h ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + ' min'
    return Math.floor(sec / 86400) + ' d ' + String(Math.floor((sec % 86400) / 3600)).padStart(2, '0') + ' h'
  }

  function tile(parent, value, key, cls) {
    const d = document.createElement('div')
    d.className = 'tile' + (cls ? ' ' + cls : '')
    const n = document.createElement('div'); n.className = 'n'; n.textContent = value
    const k = document.createElement('div'); k.className = 'k'; k.textContent = key
    d.append(n, k); parent.appendChild(d)
  }

  function rows(tbody, list, cells, emptyText) {
    tbody.innerHTML = ''
    if (!list.length) {
      const tr = document.createElement('tr')
      const td = document.createElement('td'); td.className = 'empty'; td.colSpan = 3
      td.textContent = emptyText
      tr.appendChild(td); tbody.appendChild(tr)
      return
    }
    for (const item of list) {
      const tr = document.createElement('tr')
      for (const [text, cls] of cells(item)) {
        const td = document.createElement('td')
        if (cls) td.className = cls
        td.textContent = text
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
  }

  async function loadDash() {
    let o
    try { o = await api('GET', '/admin/overview') } catch (e) { msg($('dash-msg'), 'err', e.message); return }
    msg($('dash-msg'), null, null)

    const t = $('tiles'); t.innerHTML = ''
    tile(t, fmt(o.index.files), 'plików w indeksie')
    tile(t, fmt(o.index.chunks), 'fragmentów')
    // The number worth a colour: notes on disk the index has never seen.
    tile(t, fmt(o.unindexed), 'czeka na indeks', o.unindexed > 0 ? 'warn' : 'good')
    tile(t, fmt(o.activity.last24h), 'zapytań / 24 h', o.activity.last24h > 0 ? 'good' : '')
    tile(t, String(o.activity.actors.length), 'aktywnych klientów')
    tile(t, uptime(o.uptimeSec), 'działa')

    rows($('vault-rows'), o.vault,
      (v) => [[v.dir + (v.indexable ? '' : '  · nie indeksowane')], [fmt(v.files) + ' plików', 'mono'], [bytes(v.bytes), 'mono']],
      'Vault jest pusty — nic tu jeszcze nie trafiło.')

    rows($('actor-rows'), o.activity.actors,
      (a) => [[a.name], [fmt(a.calls) + ' zapytań', 'mono'], [ago(a.last), 'mono']],
      'Żaden agent nie odpytywał w ostatniej dobie.')

    rows($('act-rows'), o.activity.recent,
      (e) => [[e.tool], [e.detail || '—', 'mono'], [ago(e.ts), 'mono']],
      'Brak zapytań od startu serwera.')
  }

  // ── status ──────────────────────────────────────────────────────────────
  const STATE_PL = { ok: 'sprawne', degraded: 'ograniczone', down: 'nie działa' }
  const NAMES = { db: 'Baza', index: 'Indeks', vault: 'Vault', ollama: 'Embeddingi (Ollama)' }

  async function loadStatus() {
    const tb = $('checks')
    tb.innerHTML = ''
    let h
    try {
      // /healthz answers 503 precisely when something is wrong — which is the
      // case whose reasons you most want on screen. Treating it as a failed
      // request blanked the tab exactly when it mattered.
      const r = await fetch('/healthz', { credentials: 'same-origin', cache: 'no-store' })
      h = await r.json()
      if (!h || !h.checks) throw new Error('HTTP ' + r.status)
    } catch (e) {
      msg($('status-msg'), 'err', 'Nie udało się odczytać stanu: ' + e.message)
      return
    }
    msg($('status-msg'), null, null)
    const add = (k, v, cls) => {
      const tr = document.createElement('tr')
      const th = document.createElement('td'); th.textContent = k; th.style.color = 'var(--ink-faint)'
      const td = document.createElement('td'); td.textContent = v; td.className = cls || 'mono'
      tr.append(th, td); tb.appendChild(tr)
    }
    add('Ogólnie', STATE_PL[h.status] || h.status)
    add('Wersja', 'brain-core ' + h.version)
    add('Indeks', h.index.files.toLocaleString('pl') + ' plików · ' + h.index.chunks.toLocaleString('pl') + ' fragmentów')
    for (const key of ['db', 'index', 'vault', 'ollama']) {
      const c = h.checks[key]
      add(NAMES[key], STATE_PL[c.state] + (c.detail ? ' — ' + c.detail : ''))
    }
  }

  // ── engine ──────────────────────────────────────────────────────────────
  function fill(s) {
    $('ollama').value = s.effective.ollamaUrl
    $('model').value = s.effective.embedModel
  }

  async function saveEngine() {
    const box = $('engine-msg')
    msg(box, 'ok', 'zapisuję…')
    try {
      const r = await api('PUT', '/admin/settings', {
        ollamaUrl: $('ollama').value.trim(),
        embedModel: $('model').value.trim(),
      })
      fill(r)
      msg(box, r.warning ? 'warn' : 'ok', r.warning || 'Zapisane i zastosowane bez restartu.')
      await loadStatus()
    } catch (e) { msg(box, 'err', e.message) }
  }

  async function reindex() {
    const box = $('engine-msg')
    try {
      const r = await api('POST', '/admin/reindex')
      msg(box, r.started ? 'ok' : 'warn',
        r.started
          ? 'Przebudowa ruszyła w tle. Postęp w dzienniku serwera; liczniki w „Stan" po zakończeniu.'
          : 'Już trwa — nie uruchamiam drugiej.')
    } catch (e) { msg(box, 'err', e.message) }
  }

  // ── clients ─────────────────────────────────────────────────────────────
  async function loadTokens() {
    const tb = $('tokens')
    tb.innerHTML = ''
    const { tokens } = await api('GET', '/admin/tokens')
    for (const t of tokens) {
      const tr = document.createElement('tr')
      const name = document.createElement('td'); name.textContent = t.name
      const role = document.createElement('td')
      const tag = document.createElement('span'); tag.className = 'tag ' + t.role; tag.textContent = t.role
      role.appendChild(tag)
      const seen = document.createElement('td'); seen.className = 'mono'
      seen.textContent = t.lastUsed ? new Date(t.lastUsed).toLocaleString('pl') : '—'
      const act = document.createElement('td'); act.style.textAlign = 'right'
      const b = document.createElement('button'); b.className = 'danger'; b.textContent = 'Odbierz'
      b.onclick = () => revoke(t.name)
      act.appendChild(b)
      tr.append(name, role, seen, act); tb.appendChild(tr)
    }
  }

  async function addToken() {
    const box = $('clients-msg')
    try {
      const r = await api('POST', '/admin/tokens', {
        name: $('newname').value.trim(),
        role: $('newrole').value,
      })
      $('newname').value = ''
      const d = msg(box, 'ok', 'Token wydany. Pokazuję go RAZ — skopiuj teraz, nie da się go odczytać później.')
      const s = document.createElement('div'); s.className = 'secret'; s.textContent = r.token
      d.appendChild(s)
      await loadTokens()
    } catch (e) { msg(box, 'err', e.message) }
  }

  async function revoke(name) {
    if (!window.confirm('Odebrać dostęp dla „' + name + '"? Klient przestanie się łączyć natychmiast.')) return
    try {
      await api('DELETE', '/admin/tokens/' + encodeURIComponent(name))
      msg($('clients-msg'), 'ok', 'Odebrano dostęp: ' + name)
      await loadTokens()
    } catch (e) { msg($('clients-msg'), 'err', e.message) }
  }

  // ── users ───────────────────────────────────────────────────────────────
  async function loadUsers() {
    const tb = $('users')
    tb.innerHTML = ''
    const { users } = await api('GET', '/admin/users')
    for (const u of users) {
      const tr = document.createElement('tr')
      const name = document.createElement('td'); name.textContent = u.username
      const role = document.createElement('td')
      const tag = document.createElement('span'); tag.className = 'tag ' + u.role; tag.textContent = u.role
      role.appendChild(tag)
      const seen = document.createElement('td'); seen.className = 'mono'
      seen.textContent = u.lastLogin ? new Date(u.lastLogin).toLocaleString('pl') : '—'
      const act = document.createElement('td'); act.style.textAlign = 'right'
      const chg = document.createElement('button'); chg.className = 'ghost'; chg.textContent = 'Hasło'
      chg.onclick = () => changePw(u.username)
      const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Usuń'
      del.style.marginLeft = '.4rem'
      del.onclick = () => delUser(u.username)
      act.append(chg, del)
      tr.append(name, role, seen, act); tb.appendChild(tr)
    }
  }

  async function addUser() {
    try {
      await api('POST', '/admin/users', {
        username: $('nu').value.trim(),
        password: $('np').value,
        role: 'admin',
      })
      $('nu').value = ''; $('np').value = ''
      msg($('users-msg'), 'ok', 'Konto utworzone.')
      await loadUsers()
    } catch (e) { msg($('users-msg'), 'err', e.message) }
  }

  async function changePw(username) {
    const pw = window.prompt('Nowe hasło dla „' + username + '" (min. 12 znaków). Wszystkie sesje tego konta zostaną zakończone.')
    if (!pw) return
    try {
      const r = await api('PUT', '/admin/users/' + encodeURIComponent(username) + '/password', { password: pw })
      msg($('users-msg'), 'ok', 'Hasło zmienione. Zakończone sesje: ' + r.sessionsEnded + '.')
      // Including possibly this one.
      if (me && me.username === username) setTimeout(() => location.reload(), 1200)
    } catch (e) { msg($('users-msg'), 'err', e.message) }
  }

  async function delUser(username) {
    if (!window.confirm('Usunąć konto „' + username + '"?')) return
    try {
      await api('DELETE', '/admin/users/' + encodeURIComponent(username))
      msg($('users-msg'), 'ok', 'Konto usunięte: ' + username)
      await loadUsers()
    } catch (e) { msg($('users-msg'), 'err', e.message) }
  }

  // ── behaviour ───────────────────────────────────────────────────────────
  async function loadBehaviour() {
    const b = await api('GET', '/admin/behaviour')
    $('phrase').value = b.handshakePhrase
    $('hs-on').checked = b.handshakeEnabled
    $('ac-on').checked = b.autoCheckpointEnabled
    $('label').value = b.instanceLabel
  }

  async function saveBehaviour() {
    try {
      await api('PUT', '/admin/behaviour', {
        handshakePhrase: $('phrase').value.trim(),
        handshakeEnabled: $('hs-on').checked,
        autoCheckpointEnabled: $('ac-on').checked,
        instanceLabel: $('label').value.trim(),
      })
      msg($('behaviour-msg'), 'ok', 'Zapisane — działa od następnego wywołania narzędzia.')
      await loadBehaviour()
    } catch (e) { msg($('behaviour-msg'), 'err', e.message) }
  }

  // ── vault ───────────────────────────────────────────────────────────────
  async function loadVault() {
    const tb = $('vault-info')
    tb.innerHTML = ''
    const v = await api('GET', '/admin/vault')
    const add = (k, val) => {
      const tr = document.createElement('tr')
      const a = document.createElement('td'); a.textContent = k; a.style.color = 'var(--ink-faint)'
      const b = document.createElement('td'); b.className = 'mono'; b.textContent = val
      tr.append(a, b); tb.appendChild(tr)
    }
    add('Zapis', v.writable ? 'ten serwer jest właścicielem' : 'tylko odczyt (replika)')
    add('Właściciel', v.owner || '—')
    add('Przypięty --read-only', v.readOnlyFlag ? 'tak (w unicie systemd)' : 'nie')
    $('claim').disabled = v.writable || v.readOnlyFlag
  }

  async function claim() {
    if (!window.confirm(
      'Przejąć własność vaultu?\\n\\n' +
      'Dotychczasowy właściciel natychmiast przestanie móc zapisywać. ' +
      'Zsynchronizuj go najpierw, jeśli ma niewysłane notatki.'
    )) return
    try {
      const r = await api('POST', '/admin/vault/claim')
      msg($('vault-msg'), r.warning ? 'warn' : 'ok', r.warning || ('Właściciel: ' + r.owner))
      await loadVault()
    } catch (e) { msg($('vault-msg'), 'err', e.message) }
  }

  // ── tabs ────────────────────────────────────────────────────────────────
  for (const b of document.querySelectorAll('nav button')) {
    b.onclick = () => {
      for (const o of document.querySelectorAll('nav button')) o.setAttribute('aria-current', String(o === b))
      for (const s of ['dash', 'status', 'engine', 'clients', 'users', 'behaviour', 'vault']) {
        $('tab-' + s).classList.toggle('hidden', s !== b.dataset.tab)
      }
    }
  }

  $('login-form').onsubmit = login
  $('logout').onclick = logout
  $('adduser').onclick = addUser
  $('save-behaviour').onclick = saveBehaviour
  $('refresh').onclick = loadStatus
  $('dash-refresh').onclick = loadDash
  $('save-engine').onclick = saveEngine
  $('reindex').onclick = reindex
  $('add').onclick = addToken
  $('claim').onclick = claim
  void restore()
})()
</script>
</body>
</html>
`
}
