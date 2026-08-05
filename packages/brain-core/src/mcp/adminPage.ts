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
 *   no cookies      the token lives in one closure variable and goes out as an
 *                   Authorization header. No cookie means cross-site request
 *                   forgery is not mitigated, it is absent — a hostile page can
 *                   make your browser issue a request, but it cannot make it
 *                   carry a header it does not know.
 *   no storage      not localStorage, not sessionStorage. Closing the tab ends
 *                   the session, and no XSS anywhere on the host can read a
 *                   credential out of a store that was never written to.
 *   no autofill     the field is type=password with autocomplete off, so a
 *                   password manager never learns it and never offers it back
 *                   on a lookalike page.
 *   inline only     one file, no fetch of anything but this server's own API.
 *                   The CSP the server sends says exactly that.
 *
 * The token is typed in, once, per tab. That is a real cost and it is the
 * right trade for a credential that can repoint the embedder and mint more
 * credentials.
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

  <!-- ── unlock ─────────────────────────────────────────────────────────── -->
  <section class="card" id="gate">
    <h2>Token administratora</h2>
    <p class="lead">
      Nie zapisuję go nigdzie — ani w ciasteczku, ani w localStorage. Żyje tylko
      w tej karcie; jej zamknięcie kończy sesję. Nie masz tokena? Na serwerze:
      <code class="mono">brain-core --add-token nazwa --role admin</code>
    </p>
    <label for="tok">Token</label>
    <input id="tok" type="password" autocomplete="off" spellcheck="false" placeholder="btk_…">
    <div class="row">
      <button id="unlock">Odblokuj</button>
    </div>
    <div id="gate-msg"></div>
  </section>

  <!-- ── panel ──────────────────────────────────────────────────────────── -->
  <div id="panel" class="hidden">
    <nav>
      <button data-tab="status" aria-current="true">Stan</button>
      <button data-tab="engine">Silnik</button>
      <button data-tab="clients">Klienci</button>
      <button data-tab="vault">Vault</button>
    </nav>

    <section class="card" id="tab-status">
      <h2>Stan serwera</h2>
      <p class="lead">To samo, co <code class="mono">/healthz</code> — z powodami, bo masz token.</p>
      <table><tbody id="checks"></tbody></table>
      <div class="row">
        <button id="refresh" class="ghost">Odśwież</button>
      </div>
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
  // The only copy of the credential. Not stored, not in a global, not in the
  // DOM — a closure variable that dies with the tab.
  let token = null

  const $ = (id) => document.getElementById(id)
  const text = (el, s) => { el.textContent = s }

  function msg(el, kind, s) {
    el.innerHTML = ''
    if (!s) return
    const d = document.createElement('div')
    d.className = 'msg ' + kind
    d.textContent = s
    el.appendChild(d)
    return d
  }

  async function api(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: Object.assign(
        { 'Authorization': 'Bearer ' + token },
        body ? { 'content-type': 'application/json' } : {},
      ),
      body: body ? JSON.stringify(body) : undefined,
      // No cookies on any request, even same-origin. Nothing here needs them,
      // and not sending them means none can be stolen by a confused deputy.
      credentials: 'omit',
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

  // ── unlock ──────────────────────────────────────────────────────────────
  async function unlock() {
    const input = $('tok')
    const candidate = input.value.trim()
    if (!candidate) return
    token = candidate
    try {
      const s = await api('GET', '/admin/settings')
      // Wipe the field the moment it is no longer needed: a token left in a
      // DOM node is a token any injected script can read.
      input.value = ''
      $('gate').classList.add('hidden')
      $('panel').classList.remove('hidden')
      text($('who'), 'zalogowano · sesja tylko w tej karcie')
      fill(s)
      await Promise.all([loadStatus(), loadTokens(), loadVault()])
    } catch (e) {
      token = null
      msg($('gate-msg'), 'err',
        e.status === 403
          ? 'Ten token działa, ale nie jest administratorem. Panel wymaga roli admin.'
          : e.status === 401
            ? 'Nieprawidłowy token.'
            : e.message)
    }
  }

  // ── status ──────────────────────────────────────────────────────────────
  const STATE_PL = { ok: 'sprawne', degraded: 'ograniczone', down: 'nie działa' }
  const NAMES = { db: 'Baza', index: 'Indeks', vault: 'Vault', ollama: 'Embeddingi (Ollama)' }

  async function loadStatus() {
    const tb = $('checks')
    tb.innerHTML = ''
    let h
    try { h = await api('GET', '/healthz') } catch (e) { msg($('gate-msg'), 'err', e.message); return }
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
      for (const s of ['status', 'engine', 'clients', 'vault']) {
        $('tab-' + s).classList.toggle('hidden', s !== b.dataset.tab)
      }
    }
  }

  $('unlock').onclick = unlock
  $('tok').onkeydown = (e) => { if (e.key === 'Enter') unlock() }
  $('refresh').onclick = loadStatus
  $('save-engine').onclick = saveEngine
  $('reindex').onclick = reindex
  $('add').onclick = addToken
  $('claim').onclick = claim
  $('tok').focus()
})()
</script>
</body>
</html>
`
}
