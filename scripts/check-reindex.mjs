/**
 * Offline health dump for Pomnia brain-core.
 * Run: node scripts/check-reindex.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import initSqlJs from 'sql.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(process.env.TEMP || '/tmp', 'pomnia-health-out.txt')
const lines = []
const dataDir = join(process.env.APPDATA || '', 'Pomnia', 'brain-core-data')
const dbPath = join(dataDir, 'vectordb', 'library.db')
const distilled = join(dataDir, 'vault', 'distilled')

function log(s) {
  lines.push(s)
}

await new Promise((resolve) => {
  const req = http.get('http://127.0.0.1:7862/healthz', { timeout: 4000 }, (res) => {
    let body = ''
    res.on('data', (c) => (body += c))
    res.on('end', () => {
      log(`HEALTH_STATUS=${res.statusCode}`)
      log(`HEALTH_BODY=${body.trim()}`)
      resolve()
    })
  })
  req.on('error', (e) => {
    log(`HEALTH_ERR=${e.message}`)
    resolve()
  })
  req.on('timeout', () => {
    req.destroy()
    log('HEALTH_ERR=timeout')
    resolve()
  })
})

log(`DATA_DIR=${dataDir}`)
log(`DB_EXISTS=${existsSync(dbPath) ? 1 : 0}`)
if (existsSync(dbPath)) {
  const st = statSync(dbPath)
  log(`DB_SIZE=${st.size}`)
  log(`DB_MTIME=${st.mtime.toISOString()}`)
}

if (existsSync(distilled)) {
  const top = readdirSync(distilled).filter((f) => f.endsWith('.md'))
  log(`DISTILLED_TOP=${top.length}`)
}

try {
  const require = createRequire(import.meta.url)
  const wasmPath = join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  })
  if (existsSync(dbPath)) {
    const db = new SQL.Database(readFileSync(dbPath))
    const files = db.exec('SELECT COUNT(DISTINCT pdf_path) AS n FROM chunks')[0]?.values[0]?.[0]
    const chunks = db.exec('SELECT COUNT(*) AS n FROM chunks')[0]?.values[0]?.[0]
    log(`DB_FILES=${files}`)
    log(`DB_CHUNKS=${chunks}`)
    const sampleRows = db.exec('SELECT DISTINCT pdf_name FROM chunks ORDER BY pdf_name LIMIT 8')
    const sample = (sampleRows[0]?.values ?? []).map((r) => r[0])
    log(`DB_SAMPLE=${sample.join('; ')}`)
    const tj =
      db.exec(
        `SELECT COUNT(*) AS n FROM chunks WHERE pdf_name LIKE '%Tajland%' OR pdf_name LIKE '%Tajlandia%' OR text LIKE '%Tajland%'`,
      )[0]?.values[0]?.[0] ?? 0
    log(`DB_TAJLANDIA_CHUNKS=${tj}`)
    const skillish =
      db.exec(
        `SELECT COUNT(DISTINCT pdf_path) AS n FROM chunks WHERE pdf_path LIKE '%skills%' OR pdf_name LIKE '%SKILL%'`,
      )[0]?.values[0]?.[0] ?? 0
    log(`DB_SKILLISH_FILES=${skillish}`)
    db.close()
  }
} catch (e) {
  log(`SQLITE_ERR=${e && e.message ? e.message : String(e)}`)
}

writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
console.log(lines.join('\n'))
console.log(`WROTE ${outPath}`)
