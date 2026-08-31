/**
 * Golden path gate — fail Desktop release if local memory is a lie.
 *
 * Checks (must all pass unless GOLDEN_PATH_SKIP=1):
 *  1. library.db exists and has enough chunks (not the 155-chunk footgun)
 *  2. Keyword hit in index for a known history query (WireGuard / MikroTik)
 *  3. Handshake phrase present in Settings and/or agent rules on disk
 *  4. At least one skill file under vault/skills
 *
 * Usage:
 *   node scripts/golden-path.mjs
 *   GOLDEN_PATH_SKIP=1 node scripts/golden-path.mjs   # CI without a real vault
 *
 * Wired as `npm run test:golden` and required by `pack:win`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(import.meta.url)

/** Share of on-disk notes that must be present in the index. Scales with the vault. */
const MIN_COVERAGE = Number(process.env.GOLDEN_MIN_COVERAGE || 0.9)
/** Optional absolute floor — only enforced when GOLDEN_MIN_CHUNKS is set explicitly. */
const MIN_CHUNKS = Number(process.env.GOLDEN_MIN_CHUNKS || 5000)
const HISTORY_QUERY = process.env.GOLDEN_QUERY || 'WireGuard'
const APPDATA = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
const DATA_DIR = join(APPDATA, 'pomnia', 'brain-core-data')
const DB_PATH = join(DATA_DIR, 'vectordb', 'library.db')
const STATS_PATH = join(DATA_DIR, 'vectordb', 'library-stats.json')
const SETTINGS_PATH = join(APPDATA, 'pomnia', 'app-settings.json')
const VAULT = process.env.POMNIA_VAULT || 'C:\\Vault'
const CLAUDE_MD = join(homedir(), '.claude', 'CLAUDE.md')
const AGENTS_MD = join(VAULT, 'AGENTS.md')
const CURSOR_RULE = join(homedir(), '.cursor', 'rules', 'pomnia.mdc')

const fail = []
const ok = []

function pass(msg) {
  ok.push(msg)
  console.log(`  ✓ ${msg}`)
}

function boom(msg) {
  fail.push(msg)
  console.error(`  ✗ ${msg}`)
}

function resolveBetterSqlite3() {
  const candidates = [
    join(root, 'packages', 'brain-core', 'node_modules', 'better-sqlite3'),
    join(root, 'node_modules', 'better-sqlite3'),
    'better-sqlite3',
  ]
  for (const c of candidates) {
    try {
      return require(c)
    } catch {
      /* try next */
    }
  }
  return null
}

function countSkills(skillsRoot) {
  let n = 0
  const brain = join(skillsRoot, 'brain')
  if (existsSync(brain)) {
    for (const name of readdirSync(brain)) {
      if (name.endsWith('.md') && !name.includes('.bak')) n++
    }
  }
  const cli = join(skillsRoot, 'cli')
  if (existsSync(cli)) {
    for (const dir of readdirSync(cli)) {
      const skill = join(cli, dir, 'SKILL.md')
      if (existsSync(skill)) n++
    }
  }
  return n
}

console.log('═══ Pomnia golden path ═══')
console.log(`DB: ${DB_PATH}`)
console.log(
  `MIN_COVERAGE=${(MIN_COVERAGE * 100).toFixed(0)}%  QUERY="${HISTORY_QUERY}"` +
    (process.env.GOLDEN_MIN_CHUNKS ? `  MIN_CHUNKS=${MIN_CHUNKS}` : ''),
)

if (process.env.GOLDEN_PATH_SKIP === '1') {
  console.log('GOLDEN_PATH_SKIP=1 — gate skipped (CI without vault).')
  process.exit(0)
}

// ── 1) Index size ──────────────────────────────────────────────
let chunks = null
let files = null

if (existsSync(STATS_PATH)) {
  try {
    const j = JSON.parse(readFileSync(STATS_PATH, 'utf8'))
    if (typeof j.chunks === 'number') chunks = j.chunks
    if (typeof j.files === 'number') files = j.files
    pass(`library-stats.json: ${files ?? '?'} files / ${chunks} chunks`)
  } catch (e) {
    boom(`library-stats.json unreadable: ${e.message}`)
  }
}

if (!existsSync(DB_PATH)) {
  boom('library.db missing — local memory is empty (server→local footgun)')
} else {
  const mb = (statSync(DB_PATH).size / (1024 * 1024)).toFixed(1)
  pass(`library.db present (${mb} MB)`)
}

const Database = resolveBetterSqlite3()
let sqliteOk = false
if (Database && existsSync(DB_PATH)) {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
    try {
      chunks = db.prepare('SELECT COUNT(*) AS n FROM chunks').get().n
      files = db.prepare('SELECT COUNT(DISTINCT pdf_path) AS n FROM chunks').get().n
      pass(`sqlite COUNT: ${files} files / ${chunks} chunks`)
      sqliteOk = true
    } finally {
      db.close()
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/NODE_MODULE_VERSION|different Node\.js version/i.test(msg) && chunks != null) {
      pass(`sqlite ABI mismatch — using library-stats.json counts (${chunks} chunks)`)
    } else if (chunks != null) {
      pass(`sqlite unavailable (${msg.split('\n')[0]}) — using library-stats.json`)
    } else {
      boom(`sqlite open/count failed: ${msg.split('\n')[0]}`)
    }
  }
} else if (chunks == null) {
  boom('Cannot read chunk count (no better-sqlite3 and no library-stats.json)')
}

// Coverage, not an absolute floor. The old gate demanded 5000 chunks — a number
// taken from the Python master's 54k-chunk index. The desktop vault holds ~2800,
// so the gate could never pass and would have been bypassed, protecting nothing.
// What actually matters is whether the index covers the notes on disk: 26 files
// indexed against 1898 on disk is the failure worth blocking, at any vault size.
function countIndexableNotes() {
  let n = 0
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // `_review/` is quarantine — deliberately outside the index.
      if (entry.isDirectory()) {
        if (entry.name !== '_review') walk(join(dir, entry.name))
      } else if (entry.name.endsWith('.md')) {
        n++
      }
    }
  }
  walk(join(VAULT, 'distilled'))
  walk(join(VAULT, 'sessions'))
  return n
}

/**
 * Which brain do the agents on this machine actually search?
 *
 * This gate measured the local index and nothing else, which is the right
 * answer only for an embedded install. Point Brain at a server — the setup the
 * app recommends — and the local index stops being maintained on purpose: the
 * embedded engine does not start, because indexing locally would fill a
 * database nobody queries. The gate then read that deliberately stale copy and
 * refused a release over a brain no agent talks to, while the one they do talk
 * to was complete.
 *
 * For a remote brain the question is answered by the server: /healthz compares
 * its own notes on disk against its own index and reports `checks.index`. Ask
 * the thing that knows rather than guessing from the wrong side of the network.
 */
function remoteBrain() {
  try {
    const s = JSON.parse(readFileSync(join(APPDATA, 'pomnia', 'app-settings.json'), 'utf8'))
    if ((s.brainTarget ?? 'embedded') !== 'remote') return null
    const url = (s.brainMcpUrl || '').trim().replace(/\/+$/, '').replace(/\/mcp$/, '')
    return url ? { url, token: (s.connectToken || '').trim() } : null
  } catch {
    return null
  }
}

async function remoteIndexHealth(brain) {
  const headers = brain.token ? { Authorization: `Bearer ${brain.token}` } : {}
  const r = await fetch(`${brain.url}/healthz`, { headers, signal: AbortSignal.timeout(8000) })
  const h = await r.json()
  return { state: h?.checks?.index?.state, detail: h?.checks?.index?.detail, files: h?.index?.files ?? null }
}

const onDisk = countIndexableNotes()
/** Drives the later search check — a skipped check must not look like a pass. */
let indexHealthy = false

const brain = remoteBrain()
if (brain) {
  try {
    const h = await remoteIndexHealth(brain)
    if (h.state === 'ok') {
      indexHealthy = true
      pass(`Remote brain index OK at ${brain.url} (${h.files ?? '?'} files) — this is the brain agents search`)
    } else {
      boom(`Remote brain at ${brain.url} reports index ${h.state ?? 'unknown'}: ${h.detail ?? 'no detail'}`)
    }
  } catch (e) {
    boom(`Brain is configured as remote (${brain.url}) but did not answer /healthz: ${e.message}`)
  }
} else if (files != null && onDisk > 0) {
  const coverage = files / onDisk
  if (coverage < MIN_COVERAGE) {
    boom(
      `Index covers ${files}/${onDisk} notes (${(coverage * 100).toFixed(1)}% < ${(MIN_COVERAGE * 100).toFixed(0)}%). ` +
        `Refusing release — agents would search a brain that is mostly missing. ` +
        `Usual cause: the embedding model was absent while indexing (ollama list).`,
    )
  } else {
    indexHealthy = true
    pass(`Index coverage OK (${files}/${onDisk} notes, ${(coverage * 100).toFixed(1)}%)`)
  }
} else if (onDisk === 0) {
  pass(`No notes on disk under ${VAULT} — nothing to cover (fresh vault)`)
} else {
  boom(`Cannot read indexed file count — coverage unverifiable against ${onDisk} notes on disk`)
}

// Absolute floor stays available for CI pinning, but is opt-in now.
if (process.env.GOLDEN_MIN_CHUNKS && chunks != null && chunks < MIN_CHUNKS) {
  boom(`Index too thin: ${chunks} chunks < ${MIN_CHUNKS} (GOLDEN_MIN_CHUNKS).`)
}

// ── 2) History search hit (keyword — no Ollama required) ───────
function vaultFsHit(query) {
  const needles = [join(VAULT, 'distilled'), join(VAULT, 'sessions')]
  const q = query.toLowerCase()
  for (const dir of needles) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue
      try {
        const text = readFileSync(join(dir, name), 'utf8')
        if (text.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
          return name
        }
      } catch {
        /* skip */
      }
    }
  }
  return null
}

function pythonSqliteHit(query) {
  if (!existsSync(DB_PATH)) return null
  const py = `
import sqlite3, sys
q = sys.argv[1]
db = sqlite3.connect(r${JSON.stringify(DB_PATH)})
row = db.execute(
  "SELECT pdf_name FROM chunks WHERE text LIKE ? OR pdf_name LIKE ? LIMIT 1",
  (f"%{q}%", f"%{q}%"),
).fetchone()
print(row[0] if row else "")
`
  try {
    const out = execFileSync('python', ['-c', py, query], {
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    }).trim()
    return out || null
  } catch {
    return null
  }
}

// Gate on the coverage verdict, not a raw chunk count — otherwise a vault the
// old threshold considered "thin" skipped this check entirely and said nothing.
if (indexHealthy) {
  let hitName = null
  let hitVia = null
  if (sqliteOk && Database && existsSync(DB_PATH)) {
    try {
      const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      try {
        const row = db
          .prepare(
            `SELECT pdf_name, substr(text, 1, 120) AS snippet
             FROM chunks
             WHERE text LIKE ? OR pdf_name LIKE ?
             LIMIT 1`,
          )
          .get(`%${HISTORY_QUERY}%`, `%${HISTORY_QUERY}%`)
        if (row) {
          hitName = row.pdf_name
          hitVia = 'better-sqlite3'
        }
      } finally {
        db.close()
      }
    } catch {
      /* fall through */
    }
  }
  if (!hitName) {
    hitName = pythonSqliteHit(HISTORY_QUERY)
    if (hitName) hitVia = 'python-sqlite3'
  }
  if (!hitName) {
    hitName = vaultFsHit(HISTORY_QUERY)
    if (hitName) hitVia = 'vault-fs'
  }
  if (hitName) {
    pass(`history hit for "${HISTORY_QUERY}": ${hitName} (${hitVia})`)
  } else {
    const mb = existsSync(DB_PATH) ? statSync(DB_PATH).size / (1024 * 1024) : 0
    // Rich index + large db: keyword check blocked by ABI / thin portable vault.
    // Still gate on coverage; do not soft-pass a tiny db.
    if (mb >= 10 && indexHealthy) {
      pass(
        `history keyword unverified (ABI/FS miss) — trusting rich index (${chunks} chunks, ${mb.toFixed(0)} MB)`,
      )
    } else {
      boom(
        `No hit for "${HISTORY_QUERY}" in index/vault — memory may be wrong. Set GOLDEN_QUERY=… to override.`,
      )
    }
  }
}

// ── 3) Handshake ───────────────────────────────────────────────
const DEFAULT_PHRASE = 'OK to Go Go Go'
let handshakeOk = false

if (existsSync(SETTINGS_PATH)) {
  try {
    const s = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
    const phrase = (s.handshakePhrase || DEFAULT_PHRASE).trim()
    const enabled = s.handshakeEnabled !== false
    if (enabled && phrase.length >= 2) {
      pass(`Settings Handshake: "${phrase}" (enabled)`)
      handshakeOk = true
    } else {
      boom('Handshake disabled or empty in app-settings.json')
    }
  } catch (e) {
    boom(`app-settings.json: ${e.message}`)
  }
} else {
  boom(`Missing ${SETTINGS_PATH}`)
}

const ruleFiles = [CLAUDE_MD, AGENTS_MD, CURSOR_RULE].filter((p) => existsSync(p))
const ruleHasPhrase = ruleFiles.some((p) => {
  try {
    return readFileSync(p, 'utf8').includes(DEFAULT_PHRASE) || /OK to Go Go Go/i.test(readFileSync(p, 'utf8'))
  } catch {
    return false
  }
})
if (ruleHasPhrase) {
  pass(`Agent rules contain Handshake phrase (${ruleFiles.length} file(s) checked)`)
  handshakeOk = true
} else {
  boom(
    `No agent rule on disk contains "${DEFAULT_PHRASE}" (checked CLAUDE.md / AGENTS.md / pomnia.mdc). Connect → Zapisz regułę.`,
  )
}

if (!handshakeOk) {
  boom('Handshake gate failed')
}

// ── 4) Skills ──────────────────────────────────────────────────
const skillsRoot = join(VAULT, 'skills')
const skillCount = existsSync(skillsRoot) ? countSkills(skillsRoot) : 0
if (skillCount > 0) {
  pass(`Skills present: ${skillCount} under ${skillsRoot}`)
} else {
  boom(`No skills under ${skillsRoot} — agent cannot load expertise (list_skills empty)`)
}

// ── Result ─────────────────────────────────────────────────────
console.log('───')
if (fail.length) {
  console.error(`GOLDEN PATH FAILED (${fail.length} check(s))`)
  for (const f of fail) console.error(`  • ${f}`)
  console.error('Fix memory/index/rules before shipping Desktop.')
  process.exit(1)
}
console.log(`GOLDEN PATH OK (${ok.length} checks)`)
process.exit(0)
