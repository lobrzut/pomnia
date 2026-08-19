/**
 * macOS packaged E2E — isolated userData + vault under /tmp only.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const exe = '/Applications/Pomnia.app/Contents/MacOS/Pomnia'
const artifactsDir = '/tmp/pomnia-e2e-artifacts'
const userData = '/tmp/pomnia-e2e-userdata'
const vaultDir = '/tmp/pomnia-e2e-vault'
const PASS = 'e2e-test-passphrase-OK-58'
const OLLAMA = 'http://192.168.1.201:11434'
const notes = { reached: [], skipped: [], fails: [], bodySnippets: [] }

mkdirSync(artifactsDir, { recursive: true })
mkdirSync(userData, { recursive: true })
mkdirSync(vaultDir, { recursive: true })
writeFileSync(
  join(userData, 'app-settings.json'),
  JSON.stringify(
    {
      ollamaUrl: OLLAMA,
      embeddedBrainAutoStart: false,
      uiLocale: 'pl',
    },
    null,
    2,
  ),
)

function log(...a) {
  console.log('[mac-e2e]', ...a)
}
function failNote(s) {
  notes.fails.push(s)
  console.error('[mac-e2e] FAIL:', s)
}

let electron
;({ _electron: electron } = await import('playwright-core'))

async function clickAny(page, labels, { timeout = 12_000 } = {}) {
  const list = Array.isArray(labels) ? labels : [labels]
  const deadline = Date.now() + timeout
  let lastErr
  while (Date.now() < deadline) {
    for (const label of list) {
      try {
        const btn = page.getByRole('button', { name: label })
        if (await btn.first().isVisible({ timeout: 350 }).catch(() => false)) {
          await btn.first().click({ timeout: 5_000 })
          return String(label)
        }
      } catch (e) {
        lastErr = e
      }
      try {
        const el = page.getByText(label, { exact: typeof label === 'string' })
        if (await el.first().isVisible({ timeout: 350 }).catch(() => false)) {
          await el.first().click({ timeout: 5_000 })
          return String(label)
        }
      } catch (e) {
        lastErr = e
      }
    }
    await page.waitForTimeout(200)
  }
  throw new Error(
    `clickAny timed out: ${list.join(' | ')}` +
      (lastErr instanceof Error ? ` (${lastErr.message})` : ''),
  )
}

async function shot(page, name) {
  const path = join(artifactsDir, `${name}.png`)
  await page.screenshot({ path })
  log('shot', path)
  return path
}

async function navTo(page, labels, id) {
  for (const label of labels) {
    const loc = page.locator('nav, aside').getByText(label, { exact: true }).first()
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click()
      notes.reached.push(`nav:${id}:${label}`)
      await page.waitForTimeout(450)
      await shot(page, `nav-${id}`)
      return true
    }
  }
  notes.skipped.push(`nav:${id}`)
  return false
}

function libraryDbPaths() {
  const hits = []
  const walk = (dir, depth = 0) => {
    if (depth > 6 || !existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p, depth + 1)
      else if (name === 'library.db') hits.push({ p, size: st.size })
    }
  }
  walk(userData)
  return hits
}

function grepLogs() {
  const logDir = join(userData, 'logs')
  const out = { files: [], hits: [] }
  if (!existsSync(logDir)) return out
  for (const name of readdirSync(logDir)) {
    if (!name.endsWith('.log')) continue
    const p = join(logDir, name)
    out.files.push(p)
    const t = readFileSync(p, 'utf8')
    for (const re of [
      /NODE_MODULE_VERSION/,
      /mach-o/i,
      /dlopen/,
      /wrong architecture/,
      /Nie znaleziono Ollama/,
      /fetch failed/,
      /sqlite/,
      /tray/,
      /relay/,
    ]) {
      for (const line of t.split('\n')) {
        if (re.test(line)) out.hits.push(line.slice(0, 400))
      }
    }
  }
  return out
}

if (!existsSync(exe)) throw new Error('missing Pomnia binary')

const app = await electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${userData}`],
  timeout: 90_000,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
  },
})

let ok = false
try {
  const page = await app.firstWindow({ timeout: 90_000 })
  await page.waitForSelector('#root', { timeout: 90_000 })
  notes.reached.push('first-window')
  await shot(page, '01-first-window')

  const title = await page.title()
  log('title', title)
  if (!/pomnia/i.test(title)) failNote(`unexpected title ${title}`)

  const body0 = await page.locator('body').innerText()
  notes.bodySnippets.push(`welcome:${body0.slice(0, 400).replace(/\s+/g, ' ')}`)
  if (/Nie znaleziono Ollama/.test(body0)) failNote('Ollama missing on first window')

  // Traffic-light inset: POMNIA in sidebar should not sit at x=0
  const logo = page.getByText('POMNIA', { exact: true }).first()
  if (await logo.isVisible().catch(() => false)) {
    const box = await logo.boundingBox()
    log('POMNIA logo box', box)
    if (box && box.x < 60) failNote(`POMNIA logo too far left (x=${box.x}) — traffic lights overlap risk`)
    else notes.reached.push(`logo-x:${box?.x}`)
  }

  await clickAny(page, ['Zaczynamy', "Let's go", 'Let’s go', 'Konfiguracja w 2 minuty'], {
    timeout: 25_000,
  })
  notes.reached.push('welcome-cta')
  await shot(page, '02-after-welcome')

  const pathBox = page.getByLabel(/Nowy folder vaultu|New vault folder/i)
  await pathBox.waitFor({ state: 'visible', timeout: 20_000 })
  await pathBox.click({ clickCount: 3 })
  await pathBox.fill(vaultDir)
  const passBoxes = page.locator('input[type="password"]')
  await passBoxes.nth(0).fill(PASS)
  if ((await passBoxes.count()) >= 2) await passBoxes.nth(1).fill(PASS)
  await shot(page, '03-vault-form')
  await clickAny(page, ['Utwórz i dalej', 'Create & continue'], { timeout: 15_000 })

  const t0 = Date.now()
  while (Date.now() - t0 < 30_000 && !existsSync(join(vaultDir, 'header.json'))) {
    await page.waitForTimeout(200)
  }
  if (!existsSync(join(vaultDir, 'header.json'))) failNote('vault header.json missing')
  else notes.reached.push('vault-created')
  await shot(page, '04-after-vault')

  async function trySkip(labels) {
    try {
      await clickAny(page, labels, { timeout: 6_000 })
      return true
    } catch {
      return false
    }
  }
  await trySkip([
    'Pomiń — backup później z Dashboardu',
    'Skip — backup later from Dashboard',
  ])
  await page.waitForTimeout(500)
  await shot(page, '05-engine')

  const ollamaField = page.getByLabel(/^URL Ollama$|^Ollama URL$/i)
  if (await ollamaField.isVisible().catch(() => false)) {
    await ollamaField.click({ clickCount: 3 })
    await ollamaField.fill(OLLAMA)
    await ollamaField.blur()
    notes.reached.push('filled-ollama-url')
    await clickAny(page, ['Sprawdź ponownie', 'Re-check'], { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(8_000)
  } else {
    notes.skipped.push('onboarding simple-mode: no Ollama URL (Pamięć / local MCP)')
    await trySkip(['Pomiń — uruchom później w Brain', 'Skip — start later in Brain tab'])
  }
  await shot(page, '06-engine-after-recheck')
  const engineAfter = await page.locator('body').innerText()
  notes.bodySnippets.push(`engine-after:${engineAfter.slice(0, 900).replace(/\s+/g, ' ')}`)
  if (/Nie znaleziono Ollama/.test(engineAfter)) {
    failNote('Nie znaleziono Ollama after LAN URL — banner must not show for 192.168.1.201')
  }
  if (/nomic-embed/i.test(engineAfter)) notes.reached.push('engine-saw-embed-model')
  else notes.skipped.push('engine did not list nomic-embed after recheck')

  const engineContinue = page.getByRole('button', { name: /^Dalej$|^Continue$/i })
  if (await engineContinue.first().isVisible().catch(() => false)) {
    await engineContinue.first().click()
    notes.reached.push('engine-continue')
  } else {
    await trySkip([
      'Pomiń — uruchom później w Brain',
      'Skip — start later in Brain tab',
      'Pomiń — wybierz później w Connect',
      'Skip — pick later in Connect tab',
    ])
    notes.skipped.push('engine skip (no Dalej)')
  }

  await page.waitForTimeout(400)
  await trySkip([
    'Pomiń — podepnij klientów później w Connect',
    'Skip — wire clients later from the Connect tab',
    'Pomiń na razie',
    'Skip for now',
  ])

  for (let i = 0; i < 4; i++) {
    const enterVisible = await page
      .getByRole('button', { name: /Wejdź do Pomnia|Enter Pomnia/i })
      .first()
      .isVisible()
      .catch(() => false)
    if (enterVisible) break
    await trySkip(['Pomiń na razie', 'Skip for now', /Pomiń —/, /Skip —/])
    await page.waitForTimeout(300)
  }

  await clickAny(page, ['Wejdź do Pomnia', 'Enter Pomnia'], { timeout: 20_000 }).catch((e) => {
    notes.skipped.push(`enter: ${e.message}`)
  })
  await page.waitForTimeout(1000)
  await shot(page, '07-main-app')

  await navTo(page, ['Dashboard'], 'dashboard')
  await navTo(page, ['Jak to działa', 'How it works'], 'guide')
  await navTo(page, ['Czaty', 'Chats'], 'browse')
  await navTo(page, ['Import'], 'import')
  await navTo(page, ['Brain'], 'brain')

  const adv = page.getByRole('button', { name: /Zaawansowane|Advanced/i })
  if (await adv.first().isVisible().catch(() => false)) {
    await adv.first().click()
    notes.reached.push('brain-advanced-opened')
    await page.waitForTimeout(400)
  }
  const urlInputs = page.locator('input[placeholder*="11434"], input[value*="11434"]')
  if ((await urlInputs.count()) > 0) {
    await urlInputs.first().click({ clickCount: 3 })
    await urlInputs.first().fill(OLLAMA)
    notes.reached.push('brain-filled-lan-ollama')
  }
  await clickAny(page, ['Recheck', 'Sprawdź ponownie'], { timeout: 6_000 }).catch(() => {})
  await page.waitForTimeout(10_000)
  await shot(page, '07b-brain-recheck')

  const brainText = await page.locator('body').innerText()
  notes.bodySnippets.push(`brain:${brainText.slice(0, 900).replace(/\s+/g, ' ')}`)
  if (/ollamaUrlLooksLocal is not defined/.test(brainText)) {
    failNote('Brain crash: ollamaUrlLooksLocal is not defined')
  }
  if (/Ta strona się wysypała/.test(brainText)) {
    failNote('Brain ErrorBoundary: ' + brainText.match(/Ta strona się wysypała[^\n]{0,80}/)?.[0])
  }
  if (/Nie znaleziono Ollama/.test(brainText)) failNote('Brain page: Nie znaleziono Ollama')

  const startBtn = page.getByRole('button', { name: /^Start$/i })
  if (await startBtn.first().isVisible().catch(() => false)) {
    await startBtn.first().click()
    notes.reached.push('brain-start-clicked')
    await page.waitForTimeout(20_000)
    await shot(page, '08-brain-started')
  } else {
    notes.skipped.push('Brain Start button not visible')
  }

  const searchBox = page.getByPlaceholder(/zapytaj o coś|ask anything/i)
  const dbBefore = libraryDbPaths()
  log('library.db before search', dbBefore)
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill('WireGuard vault memory test')
    await clickAny(page, ['Szukaj', 'Search'], { timeout: 8_000 }).catch(() =>
      searchBox.press('Enter'),
    )
    await page.waitForTimeout(12_000)
    notes.reached.push('brain-search-submitted')
    await shot(page, '08-brain-search')
  } else {
    notes.skipped.push('search box not visible')
  }
  const dbAfter = libraryDbPaths()
  log('library.db after search', dbAfter)
  const maxAfter = dbAfter.reduce((m, x) => Math.max(m, x.size), 0)
  const dbPath = join(userData, 'brain-core-data', 'vectordb', 'library.db')
  const exact = existsSync(dbPath) ? statSync(dbPath).size : 0
  log('exact library.db', dbPath, exact)
  if (maxAfter > 0 || exact > 0) notes.reached.push(`library.db size=${maxAfter || exact}`)
  else failNote('library.db still 0 or missing after search')

  // Distill section — screenshot only (do not distill real chats from empty vault)
  await shot(page, '09-brain-distill')

  await navTo(page, ['Connect'], 'connect')
  const connectText = await page.locator('body').innerText()
  notes.bodySnippets.push(`connect:${connectText.slice(0, 1200).replace(/\s+/g, ' ')}`)
  if (/Claude Desktop/i.test(connectText) && /Brak/.test(connectText)) {
    notes.reached.push('claude-desktop-Brak-visible')
  } else {
    notes.skipped.push('could not confirm Claude Desktop Brak in isolated profile')
  }
  if (/Cursor/i.test(connectText)) notes.reached.push('connect-cursor-row')

  await navTo(page, ['Ustawienia', 'Settings'], 'settings')
  const settingsText = await page.locator('body').innerText()
  notes.bodySnippets.push(`settings:${settingsText.slice(0, 800).replace(/\s+/g, ' ')}`)
  await shot(page, '10-settings')

  const logs = grepLogs()
  writeFileSync(
    join(artifactsDir, 'notes.json'),
    JSON.stringify({ notes, dbBefore, dbAfter, logs: logs.hits.slice(0, 80), logFiles: logs.files }, null, 2),
  )
  log('log hits', logs.hits.slice(0, 30))
  ok = notes.fails.length === 0
} catch (err) {
  failNote(err instanceof Error ? err.message : String(err))
  ok = false
} finally {
  await app
    .evaluate(async ({ app: electronApp }) => {
      electronApp.exit(0)
    })
    .catch(() => {})
  await app.close().catch(() => {})
}

writeFileSync(
  join(artifactsDir, 'summary.txt'),
  [
    `ok=${ok}`,
    `reached=${notes.reached.join(' → ')}`,
    `skipped=${notes.skipped.join(' | ')}`,
    `fails=${notes.fails.join(' | ')}`,
    '',
    ...notes.bodySnippets,
  ].join('\n'),
)
log('SUMMARY', { ok, reached: notes.reached, skipped: notes.skipped, fails: notes.fails })
process.exit(ok ? 0 : 1)
