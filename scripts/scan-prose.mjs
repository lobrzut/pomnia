/**
 * Find hardcoded user-facing prose in the renderer that likely bypasses uiLabels().
 * Complements diacritic scanners (which miss ASCII Polish and English-only stubs
 * that break the PL locale — and miss missing EN keys entirely).
 *
 * Run: node scripts/scan-prose.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..', 'src', 'renderer', 'src')
const SKIP = (rel) =>
  rel === 'lib/labels.ts' ||
  rel === 'lib/api.ts' ||
  rel.endsWith('.test.ts') ||
  rel.endsWith('.test.tsx') ||
  rel.startsWith('lib/activityReplay')

const TOAST_TITLE =
  /\btoast\(\s*\{[^}]{0,500}?\btitle:\s*(['"`])((?:(?!\1)[^\\]|\\.)+)\1/gs

const PL_HINT =
  /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(Skopiowano|Przeładuj|Eksport|Zsynchroniz|Wyeksport|nieudany|wysypała|Osobna|czatów|plików|indeksów)\b/
const EN_STUB =
  /\b(Vault created|Unlock failed|Vault unlocked|Vault locked|Could not create vault|Unexpected error|Could not check status|Your MCP clients|detecting clients|No MCP clients|Embedding model \(shared\)|Dashboard URL|Distilled folder)\b/

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}

const hits = []
for (const file of walk(root)) {
  const rel = relative(root, file).replace(/\\/g, '/')
  if (SKIP(rel)) continue
  const text = readFileSync(file, 'utf8')
  // Normalize CRLF so comment filters and regexes see LF-only lines.
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    if (/^\s*import\s|^\s*from\s/.test(line)) continue

    const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n')
    if (PL_HINT.test(line) || EN_STUB.test(line)) {
      // Already bilingual inline — the Polish half of a working pair
      // (same class as vaultHealth titlePl/titleEn — do not “fix”).
      if (
        /\ben\s*\?/.test(window) ||
        /\bif\s*\(\s*en\s*\)/.test(window) ||
        /getUiLocale\(\)/.test(window) ||
        /const en =/.test(window)
      ) {
        continue
      }
      // Skip label lookups and templates that only interpolate labels.
      if (/labels\.\w+/.test(line) && !/['"`][^'"`]*[ąćęłńóśźż]/.test(line) && !EN_STUB.test(line)) {
        continue
      }
      if (/uiLabels\(/.test(line)) continue
      hits.push({ file: rel, line: i + 1, text: trimmed.slice(0, 160), kind: PL_HINT.test(line) ? 'pl' : 'en-stub' })
    }
  }

  let m
  TOAST_TITLE.lastIndex = 0
  const src = text.replace(/\r\n/g, '\n')
  while ((m = TOAST_TITLE.exec(src))) {
    const title = m[2]
    if (/^\$\{/.test(title) || title.length < 3) continue
    const before = src.slice(0, m.index)
    const line = before.split('\n').length
    const already = hits.some((h) => h.file === rel && h.line === line)
    if (!already) hits.push({ file: rel, line, text: `toast title: ${title}`, kind: 'toast-literal' })
  }
}

hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
for (const h of hits) {
  console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`)
}
console.log(`\n--- ${hits.length} hit(s) ---`)
process.exit(hits.length ? 1 : 0)
