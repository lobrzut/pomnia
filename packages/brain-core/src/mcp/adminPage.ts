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
 *   prefs only     session / CSRF never in localStorage or document.cookie
 *                   from script — CSRF lives in a closure for the tab lifetime.
 *                   UI prefs only (theme / language / density) may use
 *                   localStorage; that is chrome, not auth.
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

import {
  BRAND_HEAD_LINKS,
  brandChromeCss,
  brandSkyHtml,
  brandSkyScript,
  brandWordmarkHtml,
  themeScript,
  themeSwitcherHtml,
} from './brandChrome.js'

export function renderAdminPage(origin: string): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

  return `<!doctype html>
<html lang="pl" data-theme="mint">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
${BRAND_HEAD_LINKS}
<title>Pomnia · panel</title>
<style>
  ${brandChromeCss()}
  :root {
    --font:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:ui-monospace,'Cascadia Mono',Consolas,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;font-family:var(--font);color:var(--ink);line-height:1.5;
    background:var(--bg);padding:2rem 1.25rem;display:flex;justify-content:center}
  main{width:100%;max-width:46rem}
  .top{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}
  .who{margin-left:auto;font-size:.8rem;color:var(--ink-faint);font-family:var(--mono)}
  .card{border:1px solid var(--border);background:var(--panel);backdrop-filter:blur(14px);
    border-radius:20px;padding:1.5rem;margin-bottom:1rem}
  h2{margin:0 0 .35rem;font-size:1rem;font-weight:700}
  .lead{margin:0 0 1.1rem;font-size:.82rem;color:var(--ink-dim)}
  label{display:block;font-size:.78rem;color:var(--ink-faint);margin:.9rem 0 .3rem}
  input,select{width:100%;padding:.6rem .8rem;border-radius:12px;border:1px solid var(--border);
    background:rgba(0,0,0,.22);color:var(--ink);font-family:var(--mono);font-size:.85rem}
  input:focus,select:focus{outline:2px solid color-mix(in srgb,var(--mint) 70%,transparent);outline-offset:1px}
  button{font-family:var(--font);font-size:.83rem;font-weight:600;padding:.55rem 1rem;
    border-radius:12px;border:1px solid var(--border);background:color-mix(in srgb,var(--mint) 14%,transparent);
    color:var(--mint);cursor:pointer}
  button:hover{background:color-mix(in srgb,var(--mint) 22%,transparent)}
  button[disabled]{opacity:.5;cursor:not-allowed}
  button.ghost{background:transparent;color:var(--ink-dim)}
  button.danger{background:rgba(251,113,133,.13);color:var(--rose)}
  .row{display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap;margin-top:1rem}
  .row>*{flex:1 1 10rem}
  .row>button{flex:0 0 auto}
  /* One row when possible; logout stays on the tab row (not a lone wrap line). */
  nav{display:flex;gap:.35rem;margin-bottom:1rem;flex-wrap:nowrap;align-items:center;overflow-x:auto;-webkit-overflow-scrolling:touch}
  nav button{background:transparent;color:var(--ink-dim);border-color:transparent;flex:0 0 auto;white-space:nowrap;padding:.45rem .7rem}
  nav button[aria-current="true"]{background:color-mix(in srgb,var(--mint) 14%,transparent);color:var(--mint);border-color:var(--border)}
  nav #logout{margin-left:auto}
  @media (max-width:520px){
    nav{flex-wrap:wrap}
    nav #logout{margin-left:0}
  }
  table{width:100%;border-collapse:collapse;font-size:.83rem}
  th{text-align:left;font-weight:600;color:var(--ink-faint);font-size:.75rem;
    padding:.4rem .5rem;border-bottom:1px solid var(--border)}
  td{padding:.55rem .5rem;border-bottom:1px solid var(--border);vertical-align:middle}
  td.mono,.mono{font-family:var(--mono);font-size:.8rem}
  td.plain{font-family:var(--font);font-size:.85rem;line-height:1.45}
  details.tech{margin-top:1rem;font-size:.8rem;color:var(--ink-dim)}
  details.tech summary{cursor:pointer;color:var(--ink-faint);user-select:none}
  details.tech summary:hover{color:var(--ink-dim)}
  details.tech .tech-body{margin-top:.55rem;padding:.65rem .8rem;border-radius:12px;
    border:1px solid var(--border);background:rgba(0,0,0,.18);font-family:var(--mono);font-size:.78rem}
  .tag{display:inline-block;padding:.08rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700}
  .tag.admin{background:color-mix(in srgb,var(--amber) 18%,transparent);color:var(--amber)}
  .tag.agent{background:color-mix(in srgb,var(--iris) 16%,transparent);color:var(--iris)}
  .msg{margin-top:1rem;padding:.75rem 1rem;border-radius:12px;font-size:.82rem;border:1px solid var(--border)}
  .msg.ok{background:color-mix(in srgb,var(--mint) 12%,transparent);color:var(--mint)}
  .msg.err{background:color-mix(in srgb,var(--rose) 12%,transparent);color:var(--rose)}
  .msg.warn{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)}
  .banner{margin-bottom:1rem;padding:.85rem 1rem;border-radius:14px;border:1px solid var(--border);
    font-size:.85rem;display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center}
  .banner.ro{background:color-mix(in srgb,var(--amber) 10%,transparent);border-color:color-mix(in srgb,var(--amber) 35%,var(--border))}
  .banner.rw{background:color-mix(in srgb,var(--mint) 10%,transparent);border-color:color-mix(in srgb,var(--mint) 35%,var(--border))}
  .banner .badge{font-weight:800;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;
    padding:.15rem .55rem;border-radius:999px}
  .banner.ro .badge{background:color-mix(in srgb,var(--amber) 22%,transparent);color:var(--amber)}
  .banner.rw .badge{background:color-mix(in srgb,var(--mint) 22%,transparent);color:var(--mint)}
  .banner .detail{color:var(--ink-dim);flex:1 1 12rem}
  .secret{font-family:var(--mono);font-size:.8rem;word-break:break-all;
    background:rgba(0,0,0,.3);padding:.6rem .8rem;border-radius:10px;margin-top:.5rem}
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
  .subnav{display:flex;gap:.35rem;flex-wrap:wrap;margin:0 0 1.1rem}
  .subnav button{font-size:.78rem;padding:.35rem .75rem;border-radius:999px}
  .subnav button[aria-current="true"]{color:var(--mint);background:color-mix(in srgb,var(--mint) 14%,transparent);
    border-color:color-mix(in srgb,var(--mint) 35%,var(--border))}
  .settings-pane.hidden{display:none}
  html[data-density='compact'] .card{padding:1.1rem}
  html[data-density='compact'] .lead{margin-bottom:.75rem}
  html[data-density='compact'] .tile .n{font-size:1.2rem}
  html[data-density='compact'] td{padding:.4rem .45rem}
  .pref-bar{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
  .pref-bar .lbl{font-size:.72rem;color:var(--ink-faint);margin-right:.25rem}
  .pref-bar button{
    font-family:inherit;font-size:.75rem;font-weight:600;padding:.28rem .65rem;border-radius:999px;
    border:1px solid var(--border);background:transparent;color:var(--ink-dim);cursor:pointer;
  }
  .pref-bar button[aria-checked="true"]{
    color:var(--mint);background:color-mix(in srgb,var(--mint) 14%,transparent);
    border-color:color-mix(in srgb,var(--mint) 35%,var(--border));
  }
</style>
</head>
<body>
${brandSkyHtml()}
<main class="page-root">
  <div class="top">
    ${brandWordmarkHtml('h1')}
    <span class="who" id="who"></span>
  </div>

  <!-- ── login ──────────────────────────────────────────────────────────── -->
  <section class="card" id="gate">
    <h2 data-i18n="loginTitle">Logowanie</h2>
    <p class="lead" data-i18n-html="loginLead">
      Konto zakłada administrator serwera.
    </p>
    <form id="login-form" autocomplete="on">
      <label for="user" data-i18n="loginUser">Login</label>
      <input id="user" name="username" autocomplete="username" spellcheck="false" autocapitalize="off">
      <label for="pass" data-i18n="loginPass">Hasło</label>
      <input id="pass" name="password" type="password" autocomplete="current-password">
      <div class="row">
        <button type="submit" id="login" data-i18n="loginBtn">Zaloguj</button>
      </div>
    </form>
    <div id="gate-msg"></div>
  </section>

  <!-- ── panel ──────────────────────────────────────────────────────────── -->
  <div id="panel" class="hidden">
    <div id="vault-banner" class="banner ro" role="status">
      <span class="badge" id="vault-badge">…</span>
      <span class="detail" id="vault-banner-detail">ładowanie stanu vaultu…</span>
    </div>
    <nav id="main-nav">
      <button data-tab="dash" data-i18n="tabDash" aria-current="true">Pulpit</button>
      <button data-tab="status" data-i18n="tabStatus">Stan</button>
      <button data-tab="engine" data-i18n="tabEngine">Silnik</button>
      <button data-tab="clients" data-i18n="tabClients">Klienci</button>
      <button data-tab="users" data-i18n="tabUsers">Konta</button>
      <button data-tab="behaviour" data-i18n="tabBehaviour">Zachowanie</button>
      <button data-tab="settings" data-i18n="tabSettings">Ustawienia</button>
      <button data-tab="vault" data-i18n="tabVault">Sejf</button>
      <button id="logout" class="ghost" data-i18n="logout">Wyloguj</button>
    </nav>

    <section class="card" id="tab-dash">
      <h2 data-i18n="dashTitle">Pulpit</h2>
      <p class="lead" data-i18n="dashLead">Zdrowie search-appliance: indeks, klienci, uptime — nie przeglądarka pamięci (to Desktop).</p>
      <div class="tiles" id="tiles"></div>
      <h3 class="sub-h" data-i18n="dashDisk">Katalogi na dysku (luka indeksu)</h3>
      <table><tbody id="vault-rows"></tbody></table>
      <h3 class="sub-h" data-i18n="dashActors">Kto pyta (ostatnie 24 h)</h3>
      <table><tbody id="actor-rows"></tbody></table>
      <h3 class="sub-h" data-i18n="dashRecent">Ostatnie zapytania</h3>
      <table><tbody id="act-rows"></tbody></table>
      <div class="row"><button id="dash-refresh" class="ghost" data-i18n="refresh">Odśwież</button></div>
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
        Embeddingi: <strong>fastembed</strong> (ONNX nomic w procesie — domyślne na KVM,
        bez Ollamy) albo <strong>ollama</strong> (HTTP). Adres Ollamy jest używany
        tylko w trybie ollama i jest walidowany (odmowa link-local / metadata cloud).
      </p>
      <div id="embed-status" class="msg" style="margin:0 0 1rem"></div>
      <label for="ollama">Adres Ollamy <span class="mono" style="color:var(--ink-faint)">(tylko backend ollama)</span></label>
      <input id="ollama" type="url" spellcheck="false" placeholder="http://127.0.0.1:11434">
      <label for="model">Model embeddingów (Ollama tag)</label>
      <input id="model" spellcheck="false" placeholder="nomic-embed-text">
      <div class="row">
        <button id="save-engine">Zapisz</button>
        <button id="probe-ollama" class="ghost">Sprawdź embedder</button>
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

    <section class="card hidden" id="tab-settings">
      <h2 data-i18n="settingsTitle">Ustawienia</h2>
      <p class="lead" data-i18n="settingsLead">
        Preferencje panelu w tej przeglądarce — jak Desktop → Ustawienia (kolorystyka / język).
        Zachowanie agentów, Silnik i Sejf zostają osobnymi zakładkami operacyjnymi.
      </p>
      <div class="subnav" id="settings-subnav" role="tablist" aria-label="Ustawienia">
        <button type="button" data-settings="appearance" aria-current="true" data-i18n="setAppearance">Wygląd</button>
        <button type="button" data-settings="language" data-i18n="setLanguage">Język</button>
        <button type="button" data-settings="interface" data-i18n="setInterface">Interfejs</button>
      </div>

      <div class="settings-pane" id="settings-appearance">
        <h3 class="sub-h" data-i18n="setAppearance">Wygląd</h3>
        <p class="lead" data-i18n="appearanceLead">
          Te same schematy kolorów co w Pomnia Desktop (Ustawienia → Kolorystyka).
          Zapis w przeglądarce (<code class="mono">localStorage</code>) — bez round-tripu na serwer.
          Logo pomarańczowe/mieniące zostaje; zmieniają się tła i akcenty.
        </p>
        ${themeSwitcherHtml()}
        <p class="lead" style="margin-top:1rem" data-i18n="appearanceBrand">
          Favicon i ikona = assety z <a href="https://pomnia.ai">pomnia.ai</a>.
          Tło: lekka galaktyka neuronów (pauza gdy karta w tle).
        </p>
      </div>

      <div class="settings-pane hidden" id="settings-language">
        <h3 class="sub-h" data-i18n="setLanguage">Język</h3>
        <p class="lead" data-i18n="languageLead">
          Język chrome panelu (nawigacja, etykiety). Wiedza w vaultcie zostaje bilingwalna PL+EN —
          jak w Desktop. Persist: <code class="mono">localStorage</code> klucz <code class="mono">pomnia-ui-locale</code>.
        </p>
        <div class="pref-bar" id="locale-bar" role="radiogroup" aria-label="Język">
          <span class="lbl" data-i18n="languageLabel">Interfejs</span>
          <button type="button" role="radio" data-locale="pl" aria-checked="true">PL</button>
          <button type="button" role="radio" data-locale="en" aria-checked="false">EN</button>
        </div>
      </div>

      <div class="settings-pane hidden" id="settings-interface">
        <h3 class="sub-h" data-i18n="setInterface">Interfejs</h3>
        <p class="lead" data-i18n="densityLead">
          Gęstość układu panelu. Tray / autostart / floating monitor z Desktop nie mają tu sensu
          (to nie Electron). Persist: <code class="mono">pomnia-ui-density</code>.
        </p>
        <div class="pref-bar" id="density-bar" role="radiogroup" aria-label="Gęstość">
          <span class="lbl" data-i18n="densityLabel">Gęstość</span>
          <button type="button" role="radio" data-density="comfortable" aria-checked="true" data-i18n="densityComfortable">Wygodna</button>
          <button type="button" role="radio" data-density="compact" aria-checked="false" data-i18n="densityCompact">Zwarta</button>
        </div>
        <p class="lead" style="margin-top:1rem" data-i18n="timezoneNote">
          Strefa czasu: przeglądarka hosta (daty „temu” / last-used). Osobny wybór regionu na serwerze — nie teraz.
        </p>
      </div>
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
      <h2 data-i18n="tabVault">Sejf</h2>
      <p class="lead" data-i18n-html="vaultLead">
        Tu widać <em>skąd</em> ten serwer bierze pamięć — po ludzku, nie tylko
        ścieżkami Dockera. Zapisywać może tylko jedna instancja naraz; przejęcie
        natychmiast odbiera prawo zapisu poprzedniemu właścicielowi.
      </p>
      <table><tbody id="vault-info"></tbody></table>
      <div id="vault-tech"></div>
      <div class="row">
        <button id="claim" class="danger" data-i18n="claimBtn" title="">Przejmij własność</button>
      </div>
      <div id="vault-msg"></div>
    </section>
  </div>

  <footer>Pomnia · <a href="${esc(origin)}/">strona statusu</a> · AGPL-3.0</footer>
</main>

<script>
(() => {
  'use strict'
  // Session lives in an HttpOnly cookie. CSRF is NOT in a cookie. UI prefs
  // (theme / locale / density) may use localStorage — chrome only, not auth.
  let csrf = null
  let me = null

  const $ = (id) => document.getElementById(id)
  const text = (el, s) => { el.textContent = s }

  const I18N = {
    pl: {
      loginTitle: 'Logowanie',
      loginLead: 'Konto zakłada administrator serwera.',
      loginUser: 'Login', loginPass: 'Hasło', loginBtn: 'Zaloguj', logout: 'Wyloguj',
      tabDash: 'Pulpit', tabStatus: 'Stan', tabEngine: 'Silnik', tabClients: 'Klienci',
      tabUsers: 'Konta', tabBehaviour: 'Zachowanie', tabSettings: 'Ustawienia', tabVault: 'Sejf',
      dashTitle: 'Pulpit',
      dashLead: 'Zdrowie search-appliance: indeks, klienci, uptime — nie przeglądarka pamięci (to Desktop).',
      dashDisk: 'Katalogi na dysku (luka indeksu)', dashActors: 'Kto pyta (ostatnie 24 h)',
      dashRecent: 'Ostatnie zapytania', refresh: 'Odśwież',
      settingsTitle: 'Ustawienia',
      settingsLead: 'Preferencje panelu w tej przeglądarce — jak Desktop → Ustawienia (kolorystyka / język). Zachowanie agentów, Silnik i Sejf zostają osobnymi zakładkami operacyjnymi.',
      setAppearance: 'Wygląd', setLanguage: 'Język', setInterface: 'Interfejs',
      appearanceLead: 'Te same schematy kolorów co w Pomnia Desktop (Ustawienia → Kolorystyka). Zapis w przeglądarce (<code class="mono">localStorage</code>) — bez round-tripu na serwer. Logo pomarańczowe/mieniące zostaje; zmieniają się tła i akcenty.',
      appearanceBrand: 'Favicon i ikona = assety z <a href="https://pomnia.ai">pomnia.ai</a>. Tło: lekka galaktyka neuronów (pauza gdy karta w tle).',
      languageLead: 'Język chrome panelu (nawigacja, etykiety). Wiedza w vaultcie zostaje bilingwalna PL+EN — jak w Desktop. Persist: <code class="mono">localStorage</code> klucz <code class="mono">pomnia-ui-locale</code>.',
      languageLabel: 'Interfejs',
      densityLead: 'Gęstość układu panelu. Tray / autostart / floating monitor z Desktop nie mają tu sensu (to nie Electron). Persist: <code class="mono">pomnia-ui-density</code>.',
      densityLabel: 'Gęstość', densityComfortable: 'Wygodna', densityCompact: 'Zwarta',
      timezoneNote: 'Strefa czasu: przeglądarka hosta (daty „temu” / last-used). Osobny wybór regionu na serwerze — nie teraz.',
      claimBtn: 'Przejmij własność',
      claimOwned: 'Ten serwer już jest właścicielem sejfu.',
      claimPinned: 'Przypięty --read-only w unicie — nie da się przejąć z panelu.',
      claimReady: 'Przejmij zapis od innego właściciela (zsynchronizuj go najpierw).',
      vaultLead: 'Tu widać <em>skąd</em> ten serwer bierze pamięć — po ludzku, nie tylko ścieżkami Dockera. Zapisywać może tylko jedna instancja naraz; przejęcie natychmiast odbiera prawo zapisu poprzedniemu właścicielowi.',
      tileFiles: 'plików w indeksie', tileChunks: 'fragmentów', tileWait: 'czeka na indeks',
      tileReq: 'zapytań / 24 h', tileClients: 'aktywnych klientów', tileUp: 'działa',
    },
    en: {
      loginTitle: 'Sign in',
      loginLead: 'Accounts are created by the server administrator.',
      loginUser: 'Username', loginPass: 'Password', loginBtn: 'Sign in', logout: 'Sign out',
      tabDash: 'Dashboard', tabStatus: 'Status', tabEngine: 'Engine', tabClients: 'Clients',
      tabUsers: 'Accounts', tabBehaviour: 'Behaviour', tabSettings: 'Settings', tabVault: 'Vault',
      dashTitle: 'Dashboard',
      dashLead: 'Search-appliance health: index, clients, uptime — not a memory browser (that is Desktop).',
      dashDisk: 'On-disk dirs (index gap)', dashActors: 'Who asked (last 24 h)',
      dashRecent: 'Recent calls', refresh: 'Refresh',
      settingsTitle: 'Settings',
      settingsLead: 'Panel prefs in this browser — like Desktop → Settings (colors / language). Agent behaviour, Engine and Vault stay as operational tabs.',
      setAppearance: 'Appearance', setLanguage: 'Language', setInterface: 'Interface',
      appearanceLead: 'Same color schemes as Pomnia Desktop (Settings → Colors). Stored in the browser (<code class="mono">localStorage</code>) — no server round-trip. Orange/shimmer logo stays; backgrounds and accents change.',
      appearanceBrand: 'Favicon and icon = assets from <a href="https://pomnia.ai">pomnia.ai</a>. Background: light neuron field (pauses when the tab is hidden).',
      languageLead: 'Panel chrome language (nav, labels). Vault knowledge stays bilingual PL+EN — same as Desktop. Persist: <code class="mono">localStorage</code> key <code class="mono">pomnia-ui-locale</code>.',
      languageLabel: 'Interface',
      densityLead: 'Panel layout density. Tray / autostart / floating monitor from Desktop do not apply here (not Electron). Persist: <code class="mono">pomnia-ui-density</code>.',
      densityLabel: 'Density', densityComfortable: 'Comfortable', densityCompact: 'Compact',
      timezoneNote: 'Time zone: this browser (relative dates / last-used). Server region picker — not now.',
      claimBtn: 'Take ownership',
      claimOwned: 'This server already owns the vault.',
      claimPinned: 'Pinned --read-only in the unit — cannot claim from the panel.',
      claimReady: 'Take write ownership from the other writer (sync it first).',
      vaultLead: 'Shows <em>where</em> this server reads memory — in plain language, not only Docker paths. Only one instance may write at a time; claiming immediately revokes the previous owner.',
      tileFiles: 'files in index', tileChunks: 'chunks', tileWait: 'waiting to index',
      tileReq: 'requests / 24 h', tileClients: 'active clients', tileUp: 'uptime',
    },
  }
  let locale = 'pl'
  try { locale = localStorage.getItem('pomnia-ui-locale') === 'en' ? 'en' : 'pl' } catch (e) {}
  const t = (k) => (I18N[locale] && I18N[locale][k]) || I18N.pl[k] || k

  function applyLocale(next) {
    locale = next === 'en' ? 'en' : 'pl'
    try { localStorage.setItem('pomnia-ui-locale', locale) } catch (e) {}
    document.documentElement.setAttribute('lang', locale)
    for (const el of document.querySelectorAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n')
      if (key && I18N.pl[key] !== undefined) el.textContent = t(key)
    }
    for (const el of document.querySelectorAll('[data-i18n-html]')) {
      const key = el.getAttribute('data-i18n-html')
      if (key && I18N.pl[key] !== undefined) el.innerHTML = t(key)
    }
    const bar = $('locale-bar')
    if (bar) {
      for (const b of bar.querySelectorAll('[data-locale]')) {
        b.setAttribute('aria-checked', String(b.getAttribute('data-locale') === locale))
      }
    }
    // Shared chrome defaults to English (public status page); retitle for PL admin.
    const themes = $('theme-bar')
    if (themes) {
      const colors = locale === 'en' ? 'Colors' : 'Kolorystyka'
      themes.setAttribute('aria-label', colors)
      const lbl = themes.querySelector('.lbl')
      if (lbl) lbl.textContent = colors
      const glass = themes.querySelector('[data-theme-opt="glass"]')
      if (glass) glass.textContent = locale === 'en' ? 'Glass' : 'Szkło'
    }
    const claim = $('claim')
    if (claim && claim.dataset.claimState) paintClaimTitle(claim.dataset.claimState)
  }

  function applyDensity(d) {
    const density = d === 'compact' ? 'compact' : 'comfortable'
    document.documentElement.setAttribute('data-density', density)
    try { localStorage.setItem('pomnia-ui-density', density) } catch (e) {}
    const bar = $('density-bar')
    if (!bar) return
    for (const b of bar.querySelectorAll('[data-density]')) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-density') === density))
    }
  }

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

    const tEl = $('tiles'); tEl.innerHTML = ''
    tile(tEl, fmt(o.index.files), t('tileFiles'))
    tile(tEl, fmt(o.index.chunks), t('tileChunks'))
    // The number worth a colour: notes on disk the index has never seen.
    tile(tEl, fmt(o.unindexed), t('tileWait'), o.unindexed > 0 ? 'warn' : 'good')
    tile(tEl, fmt(o.activity.last24h), t('tileReq'), o.activity.last24h > 0 ? 'good' : '')
    tile(tEl, String(o.activity.actors.length), t('tileClients'))
    tile(tEl, uptime(o.uptimeSec), t('tileUp'))

    rows($('vault-rows'), o.vault,
      (v) => [[v.dir + (v.indexable ? '' : '  · nie indeksowane')], [fmt(v.files) + ' plików', 'mono'], [bytes(v.bytes), 'mono']],
      'Sejf jest pusty — nic tu jeszcze nie trafiło.')

    rows($('actor-rows'), o.activity.actors,
      (a) => [[a.name], [fmt(a.calls) + ' zapytań', 'mono'], [ago(a.last), 'mono']],
      'Żaden agent nie odpytywał w ostatniej dobie.')

    rows($('act-rows'), o.activity.recent,
      (e) => [[e.tool], [e.detail || '—', 'mono'], [ago(e.ts), 'mono']],
      'Brak zapytań od startu serwera.')
  }

  // ── status ──────────────────────────────────────────────────────────────
  const STATE_PL = { ok: 'sprawne', degraded: 'ograniczone', down: 'nie działa' }
  const NAMES = { db: 'Baza', index: 'Indeks', vault: 'Sejf', disk: 'Dysk / zapis' }

  async function loadStatus() {
    const tb = $('checks')
    tb.innerHTML = ''
    let h
    try {
      // Session cookie ≠ Bearer. Public /healthz redacts counts and reasons,
      // so the Stan tab must use the authed admin route — otherwise it shows
      // the same misleading empty index the anonymous probe used to.
      h = await api('GET', '/admin/health')
      if (!h || !h.checks) throw new Error('brak checks w odpowiedzi')
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
    add('Wersja', 'Pomnia ' + h.version)
    add('Zapis', h.writable ? 'ten serwer jest właścicielem' : 'tylko odczyt (replika)')
    add('Właściciel vaultu', h.vaultOwner || '—')
    const backend = h.embed?.backend || 'ollama'
    add('Embed backend', backend + (h.embed?.ready === false ? ' · niegotowy' : h.embed?.ready ? ' · gotowy' : ''))
    if (h.embed?.model) add('Model embed', h.embed.model)
    if (h.index && typeof h.index.files === 'number') {
      add('Indeks', h.index.files.toLocaleString('pl') + ' plików · ' + h.index.chunks.toLocaleString('pl') + ' fragmentów')
    } else {
      add('Indeks', 'liczniki niedostępne')
    }
    for (const key of ['db', 'index', 'vault', 'disk']) {
      const c = h.checks[key]
      add(NAMES[key], STATE_PL[c.state] + (c.detail ? ' — ' + c.detail : ''))
    }
    const emb = h.checks.ollama
    const embName = backend === 'fastembed' ? 'Embeddingi (fastembed / ONNX)' : 'Embeddingi (Ollama)'
    add(embName, STATE_PL[emb.state] + (emb.detail ? ' — ' + emb.detail : ''))
    paintEmbedStatus(h)
  }

  function paintEmbedStatus(h) {
    const box = $('embed-status')
    if (!box || !h?.checks?.ollama) return
    const c = h.checks.ollama
    const backend = h.embed?.backend || 'ollama'
    const kind = c.state === 'ok' ? 'ok' : c.state === 'degraded' ? 'warn' : 'err'
    let label
    if (c.state === 'ok') {
      label = backend === 'fastembed'
        ? 'fastembed OK — ONNX nomic w procesie (Ollama nie jest wymagana)'
        : 'Ollama OK — embeddingi dostępne'
    } else {
      label = (STATE_PL[c.state] || c.state) + (c.detail ? ' — ' + c.detail : '')
    }
    msg(box, kind, label)
  }

  async function probeOllama() {
    const box = $('engine-msg')
    msg(box, 'ok', 'sprawdzam…')
    try {
      const h = await api('GET', '/admin/health')
      paintEmbedStatus(h)
      const c = h.checks?.ollama
      const backend = h.embed?.backend || 'ollama'
      msg(box, c?.state === 'ok' ? 'ok' : 'warn',
        c?.state === 'ok'
          ? (backend === 'fastembed'
            ? 'Embedder lokalny (fastembed) gotowy — search bez Ollamy.'
            : 'Ollama odpowiada; model embed gotowy.')
          : (c?.detail || 'Embedder niedostępny — search semantyczny będzie pusty.'))
    } catch (e) { msg(box, 'err', e.message) }
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
  function paintVaultBanner(v) {
    const ban = $('vault-banner')
    const badge = $('vault-badge')
    const detail = $('vault-banner-detail')
    if (!ban || !badge || !detail) return
    if (v.writable) {
      ban.className = 'banner rw'
      badge.textContent = 'Zapis'
      detail.textContent = 'Ten serwer jest właścicielem vaultu' +
        (v.owner ? ' (' + v.owner + ').' : '.')
    } else {
      ban.className = 'banner ro'
      badge.textContent = 'Tylko odczyt'
      const pin = v.readOnlyFlag ? ' · przypięty --read-only w systemd' : ''
      detail.textContent = (v.owner
        ? 'Replika — właściciel: ' + v.owner
        : 'Replika — właściciel nieznany') + pin +
        '. Push z Desktop (Connect) aktualizuje kopię; ten host nie zapisuje notatek agentów.'
    }
  }

  async function loadVault() {
    const tb = $('vault-info')
    const tech = $('vault-tech')
    tb.innerHTML = ''
    if (tech) tech.innerHTML = ''
    const v = await api('GET', '/admin/vault')
    paintVaultBanner(v)
    const add = (k, val, plain) => {
      const tr = document.createElement('tr')
      const a = document.createElement('td'); a.textContent = k; a.style.color = 'var(--ink-faint)'
      const b = document.createElement('td')
      b.className = plain ? 'plain' : 'mono'
      b.textContent = val
      tr.append(a, b); tb.appendChild(tr)
    }
    const where = v.where || (v.label ? ('Lokalizacja: ' + v.label + '.') : null)
    if (where) add('Gdzie jest Twoja pamięć (vault)', where, true)
    else if (v.label) add('Etykieta', v.label, true)
    if (v.smbPath) add('Dla Ciebie (Windows)', v.smbPath, false)
    if (v.hostPath) add('Na serwerze', v.hostPath, false)
    add('Zapis', v.writable ? 'ten serwer jest właścicielem' : 'tylko odczyt (replika)', true)
    add('Właściciel', v.owner || '—', false)
    add('Przypięty --read-only', v.readOnlyFlag ? 'tak (w unicie systemd)' : 'nie', true)
    if (tech && v.path) {
      const d = document.createElement('details')
      d.className = 'tech'
      const s = document.createElement('summary')
      s.textContent = 'Szczegóły techniczne'
      const body = document.createElement('div')
      body.className = 'tech-body'
      body.textContent = 'W kontenerze: ' + v.path
      d.append(s, body)
      tech.appendChild(d)
    }
    $('claim').disabled = v.writable || v.readOnlyFlag
    const state = v.readOnlyFlag ? 'pinned' : v.writable ? 'owned' : 'ready'
    $('claim').dataset.claimState = state
    paintClaimTitle(state)
  }

  function paintClaimTitle(state) {
    const btn = $('claim')
    if (!btn) return
    btn.title = state === 'pinned' ? t('claimPinned')
      : state === 'owned' ? t('claimOwned')
      : t('claimReady')
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

  // ── tabs + settings subnav ──────────────────────────────────────────────
  const MAIN_TABS = ['dash', 'status', 'engine', 'clients', 'users', 'behaviour', 'settings', 'vault']
  for (const b of document.querySelectorAll('#main-nav button[data-tab]')) {
    b.onclick = (ev) => {
      const btn = ev.currentTarget
      const tab = btn.getAttribute('data-tab')
      for (const o of document.querySelectorAll('#main-nav button[data-tab]')) {
        if (o === btn) o.setAttribute('aria-current', 'true')
        else o.removeAttribute('aria-current')
      }
      for (const s of MAIN_TABS) {
        $('tab-' + s).classList.toggle('hidden', s !== tab)
      }
    }
  }
  for (const b of document.querySelectorAll('#settings-subnav button[data-settings]')) {
    b.onclick = (ev) => {
      const btn = ev.currentTarget
      const id = btn.getAttribute('data-settings')
      for (const o of document.querySelectorAll('#settings-subnav button[data-settings]')) {
        if (o === btn) o.setAttribute('aria-current', 'true')
        else o.removeAttribute('aria-current')
      }
      for (const pane of ['appearance', 'language', 'interface']) {
        $('settings-' + pane).classList.toggle('hidden', pane !== id)
      }
    }
  }
  const localeBar = $('locale-bar')
  if (localeBar) {
    localeBar.addEventListener('click', (ev) => {
      const opt = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-locale')
      if (opt) applyLocale(opt)
    })
  }
  const densityBar = $('density-bar')
  if (densityBar) {
    densityBar.addEventListener('click', (ev) => {
      const opt = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-density')
      if (opt) applyDensity(opt)
    })
  }

  $('login-form').onsubmit = login
  $('logout').onclick = logout
  $('adduser').onclick = addUser
  $('save-behaviour').onclick = saveBehaviour
  $('refresh').onclick = loadStatus
  $('dash-refresh').onclick = loadDash
  $('save-engine').onclick = saveEngine
  $('probe-ollama').onclick = probeOllama
  $('reindex').onclick = reindex
  $('add').onclick = addToken
  $('claim').onclick = claim

  try {
    applyDensity(localStorage.getItem('pomnia-ui-density') || 'comfortable')
  } catch (e) { applyDensity('comfortable') }
  applyLocale(locale)
  void restore()
})()
</script>
<script>${themeScript()}${brandSkyScript()}</script>
</body>
</html>
`
}
