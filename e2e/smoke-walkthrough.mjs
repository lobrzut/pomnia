/**
 * Phase-2 UI walkthrough: packaged Electron onboarding → nav → locale.
 *
 * Isolation (HARD):
 *   - never opens C:\Vault
 *   - never uses %APPDATA%\pomnia
 *   - disposable --user-data-dir + vault only under %TEMP%\pomnia-e2e-*
 *
 * Prereq: release/win-unpacked/Pomnia.exe (npm run pack:win) + playwright-core
 * Run:    npm run test:e2e:walkthrough
 */

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultExe = join(root, 'release', 'win-unpacked', 'Pomnia.exe')
const exe = process.env.POMNIA_EXE || defaultExe
const artifactsDir = join(root, 'e2e', 'artifacts')
const PASS = 'e2e-test-passphrase-OK-58'
const VAULT_NAME = 'E2E Walkthrough Vault'

const appDataPomnia = join(
  process.env.APPDATA || join(tmpdir(), 'AppData-Roaming-missing'),
  'pomnia',
)

const notes = {
  reached: [],
  skipped: [],
  fails: [],
}

function die(code, msg) {
  console.error(`[e2e-walk] FAIL: ${msg}`)
  process.exit(code)
}

function log(...args) {
  console.log('[e2e-walk]', ...args)
}

if (!existsSync(exe)) {
  die(
    2,
    `missing executable.\n` +
      `  looked for: ${exe}\n` +
      `  Build first: npm run pack:win\n` +
      `  Or set POMNIA_EXE to a packaged Pomnia.exe`,
  )
}

let electron
try {
  ;({ _electron: electron } = await import('playwright-core'))
} catch {
  die(
    2,
    'playwright-core not installed.\n' +
      '  Run: npm i -D playwright-core\n' +
      '  (no browser download needed for Electron)',
  )
}

const runRoot = mkdtempSync(join(tmpdir(), 'pomnia-e2e-'))
const userData = join(runRoot, 'userData')
const vaultDir = join(runRoot, 'vault')
mkdirSync(userData, { recursive: true })
mkdirSync(vaultDir, { recursive: true })
mkdirSync(artifactsDir, { recursive: true })

writeFileSync(
  join(runRoot, 'README.txt'),
  [
    'Disposable Pomnia E2E walkthrough — safe to delete.',
    `userData=${userData}`,
    `vault=${vaultDir}`,
    'Do NOT point this at C:\\Vault or %APPDATA%\\pomnia.',
    '',
  ].join('\n'),
)

for (const [label, p] of [
  ['userData', userData],
  ['vault', vaultDir],
]) {
  if (!p.startsWith(runRoot)) {
    die(3, `isolation broken: ${label} escaped runRoot (${p})`)
  }
  if (p.toLowerCase().startsWith('c:\\vault')) {
    die(3, `refusing to use C:\\Vault as ${label}`)
  }
  if (p.toLowerCase().startsWith(appDataPomnia.toLowerCase())) {
    die(3, `refusing to use %APPDATA%\\pomnia as ${label}`)
  }
}

log('exe:', exe)
log('runRoot:', runRoot)
log('userData:', userData)
log('vault:', vaultDir)

/** Click first visible control matching any of the labels (substring / exact role name). */
async function clickAny(page, labels, { timeout = 12_000, exact = false } = {}) {
  const list = Array.isArray(labels) ? labels : [labels]
  const deadline = Date.now() + timeout
  let lastErr
  while (Date.now() < deadline) {
    for (const label of list) {
      try {
        const btn = page.getByRole('button', { name: label, exact })
        if (await btn.first().isVisible({ timeout: 400 }).catch(() => false)) {
          await btn.first().click({ timeout: 5_000 })
          return label
        }
      } catch (e) {
        lastErr = e
      }
      try {
        const el = page.getByText(label, { exact })
        if (await el.first().isVisible({ timeout: 400 }).catch(() => false)) {
          await el.first().click({ timeout: 5_000 })
          return label
        }
      } catch (e) {
        lastErr = e
      }
    }
    await page.waitForTimeout(250)
  }
  throw new Error(
    `clickAny timed out for: ${list.join(' | ')}` +
      (lastErr instanceof Error ? ` (${lastErr.message})` : ''),
  )
}

async function shot(page, name) {
  const path = join(artifactsDir, `walk-${name}.png`)
  await page.screenshot({ path, fullPage: true })
  log('screenshot:', path)
  return path
}

function listVaultTree(dir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth || !existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    out.push({ path: p, size: st.size, dir: st.isDirectory() })
    if (st.isDirectory()) out.push(...listVaultTree(p, depth + 1, maxDepth))
  }
  return out
}

function assertVaultOnDisk() {
  const required = ['header.json', 'manifest.cvb', 'library.cvb']
  const missing = required.filter((f) => !existsSync(join(vaultDir, f)))
  if (missing.length) {
    throw new Error(`vault files missing on disk: ${missing.join(', ')}`)
  }
  const header = join(vaultDir, 'header.json')
  const size = statSync(header).size
  if (size < 40) throw new Error(`header.json too small (${size})`)
  const tree = listVaultTree(vaultDir)
  log(
    'vault disk OK:',
    tree
      .filter((t) => !t.dir)
      .map((t) => `${t.path.replace(vaultDir, '.')} (${t.size}b)`)
      .join(', '),
  )
  return tree
}

const app = await electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${userData}`],
  env: {
    ...process.env,
    POMNIA_VAULT: vaultDir,
  },
  timeout: 60_000,
})

let ok = false
try {
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('#root', { timeout: 60_000 })

  const title = await page.title()
  if (!/pomnia/i.test(title)) {
    throw new Error(`unexpected window title: ${JSON.stringify(title)}`)
  }
  notes.reached.push('first-window')
  await shot(page, '01-first-window')

  // ── Welcome ────────────────────────────────────────────────────────────
  try {
    const hit = await clickAny(page, ['Zaczynamy', "Let's go", 'Let’s go', 'Konfiguracja w 2 minuty', 'Setup in 2 minutes'], {
      timeout: 25_000,
    })
    notes.reached.push(`welcome:${hit}`)
    await shot(page, '02-welcome-clicked')
  } catch (e) {
    notes.fails.push(`welcome: ${e instanceof Error ? e.message : e}`)
    throw e
  }

  // ── Vault create (type path — avoid native folder dialog) ──────────────
  try {
    await page.waitForTimeout(600)

    const pathBox = page.getByLabel(/Nowy folder vaultu|New vault folder/i)
    await pathBox.waitFor({ state: 'visible', timeout: 15_000 })
    await pathBox.click({ clickCount: 3 })
    await pathBox.fill(vaultDir)
    const pathVal = await pathBox.inputValue()
    if (pathVal !== vaultDir) {
      throw new Error(
        `path field mismatch after fill: got ${JSON.stringify(pathVal)} want ${JSON.stringify(vaultDir)}`,
      )
    }
    if (
      pathVal.toLowerCase().startsWith('c:\\vault') ||
      pathVal.toLowerCase().includes('\\appdata\\roaming\\pomnia')
    ) {
      throw new Error(`refusing create — path escapes isolation: ${pathVal}`)
    }
    if (!pathVal.startsWith(runRoot)) {
      throw new Error(`refusing create — path not under runRoot: ${pathVal}`)
    }

    const nameBox = page.getByLabel(/^Vault$/i)
    if (await nameBox.isVisible().catch(() => false)) {
      await nameBox.click({ clickCount: 3 })
      await nameBox.fill(VAULT_NAME)
    }

    const passBoxes = page.locator('input[type="password"]')
    await passBoxes.nth(0).fill(PASS)
    if ((await passBoxes.count()) >= 2) {
      await passBoxes.nth(1).fill(PASS)
    }

    // Re-read path immediately before submit (guard against stale/wrong field)
    const pathBeforeSubmit = await pathBox.inputValue()
    if (pathBeforeSubmit !== vaultDir) {
      throw new Error(`path drifted before submit: ${JSON.stringify(pathBeforeSubmit)}`)
    }

    await shot(page, '03-vault-form-filled')
    const created = await clickAny(page, ['Utwórz i dalej', 'Create & continue'], { timeout: 15_000 })
    notes.reached.push(`vault-create:${created}`)

    // Wait for every file, not just the first one written.
    //
    // Vault.create writes header.json, then saveManifest(), then saveLibrary().
    // Waiting on header.json alone returns while the other two are still in
    // flight, and the assertion below then reports them missing — which is
    // what this test did: it named manifest.cvb and library.cvb and never
    // header.json, because header.json had always arrived.
    const REQUIRED = ['header.json', 'manifest.cvb', 'library.cvb']
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && !REQUIRED.every((f) => existsSync(join(vaultDir, f)))) {
      await page.waitForTimeout(200)
    }
    assertVaultOnDisk()
    notes.reached.push('vault-disk-assert')
    await shot(page, '04-after-vault-create')
  } catch (e) {
    notes.fails.push(`vault: ${e instanceof Error ? e.message : e}`)
    await shot(page, '03-vault-FAIL').catch(() => {})
    throw e
  }

  // ── Skip optional steps (backup / engine / connect) until Ready ────────
  async function trySkip(stepName, labels) {
    try {
      const hit = await clickAny(page, labels, { timeout: 8_000 })
      notes.reached.push(`${stepName}-skip:${hit}`)
      await shot(page, `05-${stepName}-skipped`)
      return true
    } catch {
      notes.skipped.push(`${stepName}: no skip control (may already be Ready or Ollama UI)`)
      return false
    }
  }

  // Simple mode order: backup → engine → connect → ready
  await page.waitForTimeout(500)
  await trySkip('backup', [
    'Pomiń — backup później z Dashboardu',
    'Skip — backup later from Dashboard',
    'Pomiń na razie',
    'Skip for now',
  ])
  await page.waitForTimeout(400)
  await trySkip('engine', [
    'Pomiń — uruchom później w Brain',
    'Skip — start later in Brain tab',
    'Pomiń — wybierz później w Connect',
    'Skip — pick later in Connect tab',
    'Pomiń na razie',
    'Skip for now',
  ])
  await page.waitForTimeout(400)
  await trySkip('connect', [
    'Pomiń — podepnij klientów później w Connect',
    'Skip — wire clients later from the Connect tab',
    'Pomiń na razie',
    'Skip for now',
  ])

  // If still on a step with primary Continue, try once more with skip
  for (let i = 0; i < 3; i++) {
    const enterVisible = await page
      .getByRole('button', { name: /Wejdź do Pomnia|Enter Pomnia/i })
      .first()
      .isVisible()
      .catch(() => false)
    if (enterVisible) break
    await trySkip(`extra-${i}`, [
      /Pomiń —/,
      /Skip —/,
      'Pomiń na razie',
      'Skip for now',
    ])
    await page.waitForTimeout(350)
  }

  try {
    const enter = await clickAny(page, ['Wejdź do Pomnia', 'Enter Pomnia'], { timeout: 20_000 })
    notes.reached.push(`enter-app:${enter}`)
    await page.waitForTimeout(800)
    await shot(page, '06-main-app')
  } catch (e) {
    notes.fails.push(`enter-app: ${e instanceof Error ? e.message : e}`)
    await shot(page, '06-enter-FAIL').catch(() => {})
    // Continue — maybe already in app
  }

  // ── Main nav tabs ──────────────────────────────────────────────────────
  const navTargets = [
    { id: 'dashboard', labels: ['Dashboard'] },
    { id: 'guide', labels: ['Jak to działa', 'How it works'] },
    { id: 'browse', labels: ['Czaty', 'Chats'] },
    { id: 'import', labels: ['Import'] },
    { id: 'brain', labels: ['Brain'] },
    { id: 'connect', labels: ['Connect'] },
    { id: 'settings', labels: ['Ustawienia', 'Settings'] },
  ]

  for (const nav of navTargets) {
    try {
      // Sidebar buttons often lack role=button; prefer getByText in nav region
      let clicked = false
      for (const label of nav.labels) {
        const loc = page.locator('nav, aside, [class*="sidebar"]').getByText(label, { exact: true }).first()
        if (await loc.isVisible({ timeout: 600 }).catch(() => false)) {
          await loc.click({ timeout: 5_000 })
          clicked = true
          notes.reached.push(`nav:${nav.id}:${label}`)
          break
        }
        // Fallback: any exact text
        const any = page.getByText(label, { exact: true }).first()
        if (await any.isVisible({ timeout: 400 }).catch(() => false)) {
          await any.click({ timeout: 5_000 })
          clicked = true
          notes.reached.push(`nav:${nav.id}:${label}`)
          break
        }
      }
      if (!clicked) {
        notes.skipped.push(`nav:${nav.id} not found`)
        continue
      }
      await page.waitForTimeout(500)
      await shot(page, `07-nav-${nav.id}`)
    } catch (e) {
      notes.skipped.push(`nav:${nav.id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // ── Locale PL ↔ EN in Settings ─────────────────────────────────────────
  try {
    await clickAny(page, ['Ustawienia', 'Settings'], { timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(400)

    // Locale controls are role=radio inside radiogroup (not role=button)
    const enRadio = page.getByRole('radio', { name: 'EN', exact: true })
    const plRadio = page.getByRole('radio', { name: 'PL', exact: true })

    // Settings page may need a scroll to language card
    if (!(await enRadio.first().isVisible({ timeout: 2_000 }).catch(() => false))) {
      await page.getByText(/Język interfejsu|Interface language/i).first().scrollIntoViewIfNeeded().catch(() => {})
    }

    if (await enRadio.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await enRadio.first().click()
      await page.waitForTimeout(700)
      await shot(page, '08-locale-en')
      notes.reached.push('locale:EN')

      const settingsEn = await page.getByText('Settings', { exact: true }).first().isVisible().catch(() => false)
      if (settingsEn) notes.reached.push('locale:EN-verified-Settings')

      if (await plRadio.first().isVisible().catch(() => false)) {
        await plRadio.first().click()
        await page.waitForTimeout(700)
        await shot(page, '09-locale-pl')
        notes.reached.push('locale:PL')
      }
    } else {
      notes.skipped.push('locale: EN/PL radios not found (Settings UI)')
    }
  } catch (e) {
    notes.skipped.push(`locale: ${e instanceof Error ? e.message : e}`)
  }

  // Things we intentionally do NOT reach
  notes.skipped.push('native folder picker (typed path instead)')
  notes.skipped.push('Ollama model pull / remote Brain engine test')
  notes.skipped.push('real MCP client wire (Cursor/Claude)')
  notes.skipped.push('doc import / distill / search with embeddings')
  notes.skipped.push('update-check against private GitHub releases')

  await shot(page, '10-final')
  ok = notes.fails.length === 0 && notes.reached.includes('vault-disk-assert')
  log('reached:', notes.reached.join(' → '))
  log('skipped:', notes.skipped.join(' | '))
  if (notes.fails.length) log('fails:', notes.fails.join(' | '))
  log(ok ? 'OK — walkthrough core path passed' : 'PARTIAL/FAIL — see notes above')
} catch (err) {
  console.error(
    '[e2e-walk] FAIL during walkthrough:',
    err instanceof Error ? err.message : err,
  )
  ok = false
} finally {
  await app
    .evaluate(async ({ app: electronApp }) => {
      electronApp.exit(0)
    })
    .catch(() => {})
  await app.close().catch(() => {})
  try {
    rmSync(runRoot, { recursive: true, force: true })
    log('cleaned temp:', runRoot)
  } catch (err) {
    console.warn(
      '[e2e-walk] temp cleanup failed (safe to delete manually):',
      runRoot,
      err instanceof Error ? err.message : err,
    )
  }
}

process.exit(ok ? 0 : 1)
